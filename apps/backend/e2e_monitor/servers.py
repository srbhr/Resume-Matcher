"""Boot/teardown the backend (+ optional frontend) for a run.

The backend is spawned with DATA_DIR pointed at the bundle's ``data/`` dir, so
the dev's real database.json and uploads are never touched, and the DATA_DIR-
aware reads (feature flags / content language, via ``config_cache``) use the
bundle's copied ``config.json``.

The LLM key/provider is resolved separately, via ``app.config.load_config_file``
which reads the repo's real ``apps/backend/data/config.json`` (a hardcoded path,
NOT the bundle copy). That is intentional: the run uses the dev's configured
provider, and the opt-in gate (``e2e_monitor.gate``) has already verified that
real config carries a usable key before any move runs.

Process stdout/stderr stream into the bundle's log files — a durable log trail
with no change to app/ logging.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from e2e_monitor import API_BASE
from e2e_monitor.bundle import Bundle

BACKEND_HEALTH = f"{API_BASE}/health"
FRONTEND_URL = "http://127.0.0.1:3000/"


def _port_is_free(port: int) -> bool:
    """True if nothing is listening on 127.0.0.1:<port>."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex(("127.0.0.1", port)) != 0


_REPO_BACKEND = Path(__file__).resolve().parents[1]  # apps/backend
_REPO_ROOT = _REPO_BACKEND.parents[1]               # repo root
_REAL_CONFIG = _REPO_BACKEND / "data" / "config.json"


@dataclass
class Servers:
    bundle: Bundle
    procs: list[subprocess.Popen] = field(default_factory=list)
    log_files: list[Any] = field(default_factory=list)
    frontend_up: bool = False

    def _wait(self, url: str, timeout_s: float) -> bool:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            try:
                if httpx.get(url, timeout=2.0).status_code < 500:
                    return True
            except httpx.HTTPError:
                pass
            time.sleep(1.0)
        return False

    def boot(self, *, with_frontend: bool = True) -> dict[str, bool]:
        self.bundle.data_dir.mkdir(parents=True, exist_ok=True)
        if _REAL_CONFIG.exists():
            shutil.copy2(_REAL_CONFIG, self.bundle.data_dir / "config.json")

        if not _port_is_free(8000):
            raise RuntimeError(
                "port 8000 is already in use — stop any running backend so the "
                "monitor can bind its own isolated instance (DATA_DIR isolation "
                "depends on owning the port)."
            )

        be_log = (self.bundle.logs_dir / "backend.log").open("w")
        self.log_files.append(be_log)
        env = {
            "DATA_DIR": str(self.bundle.data_dir),
            "PORT": "8000",
            "HOST": "127.0.0.1",
            "RELOAD": "false",
            "FRONTEND_BASE_URL": FRONTEND_URL.rstrip("/"),
        }
        self.procs.append(subprocess.Popen(
            ["uv", "run", "app"],
            cwd=_REPO_BACKEND,
            stdout=be_log,
            stderr=subprocess.STDOUT,
            env={**os.environ, **env},
        ))
        if not self._wait(BACKEND_HEALTH, timeout_s=60):
            raise RuntimeError("backend did not become healthy on :8000")

        if with_frontend and shutil.which("node") and shutil.which("npm"):
            if not _port_is_free(3000):
                # Something is on :3000 — require a 200 from the root before trusting
                # it as the frontend (it proxies to our :8000). _wait() accepts any
                # <500 (incl. 404), so an unrelated HTTP service squatting the port
                # would be mistaken for a frontend; demand 200. Any failure leaves
                # frontend_up False and renders just skip.
                try:
                    self.frontend_up = httpx.get(FRONTEND_URL, timeout=5.0).status_code == 200
                except httpx.HTTPError:
                    self.frontend_up = False
            else:
                fe_log = (self.bundle.logs_dir / "frontend.log").open("w")
                self.log_files.append(fe_log)
                self.procs.append(subprocess.Popen(
                    ["npm", "run", "dev"], cwd=_REPO_ROOT / "apps" / "frontend",
                    stdout=fe_log, stderr=subprocess.STDOUT, env={**os.environ},
                ))
                self.frontend_up = self._wait(FRONTEND_URL, timeout_s=120)
        return {"frontend_up": self.frontend_up}

    def teardown(self) -> None:
        for p in reversed(self.procs):
            p.terminate()
        for p in reversed(self.procs):
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
        self.procs.clear()
        for f in self.log_files:
            try:
                f.close()
            except Exception:
                pass
        self.log_files.clear()
