"""Boot/teardown the backend (+ optional frontend) for a run.

Backend is spawned with DATA_DIR pointed at the bundle's ``data/`` dir so the
dev's real database.json is never touched; the real config.json is COPIED into
that dir so the provider/key still resolve regardless of which path the app
reads config from. Process stdout/stderr stream into the bundle's log files —
a durable log trail with no change to app/ logging.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from e2e_monitor.bundle import Bundle

BACKEND_HEALTH = "http://127.0.0.1:8000/api/v1/health"
FRONTEND_URL = "http://127.0.0.1:3000/"
_REPO_BACKEND = Path(__file__).resolve().parents[1]  # apps/backend
_REPO_ROOT = _REPO_BACKEND.parents[1]               # repo root
_REAL_CONFIG = _REPO_BACKEND / "data" / "config.json"


@dataclass
class Servers:
    bundle: Bundle
    procs: list[subprocess.Popen] = field(default_factory=list)
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

        be_log = (self.bundle.logs_dir / "backend.log").open("w")
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
            fe_log = (self.bundle.logs_dir / "frontend.log").open("w")
            self.procs.append(subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=_REPO_ROOT / "apps" / "frontend",
                stdout=fe_log,
                stderr=subprocess.STDOUT,
                env={**os.environ},
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
