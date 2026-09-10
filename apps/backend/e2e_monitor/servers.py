"""Owned monitor servers with explicit, isolated settings and credentials."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from e2e_monitor.bundle import Bundle

_REPO_BACKEND = Path(__file__).resolve().parents[1]
_REPO_ROOT = _REPO_BACKEND.parents[1]

# Only settings consumed by the flow are copied. Credentials are resolved once,
# re-encrypted for this run, and removed when the owned processes stop.
_RUN_SETTINGS = frozenset(
    {
        "content_language",
        "ui_language",
        "enable_cover_letter",
        "enable_outreach_message",
        "enable_interview_prep",
        "default_prompt_id",
    }
)


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


@dataclass
class Servers:
    bundle: Bundle
    backend_port: int = 8000
    frontend_port: int = 3000
    procs: list[subprocess.Popen[bytes]] = field(default_factory=list)
    log_files: list[Any] = field(default_factory=list)
    frontend_up: bool = False
    _credentials_prepared: bool = False

    @property
    def api_base(self) -> str:
        return f"http://127.0.0.1:{self.backend_port}/api/v1"

    @property
    def frontend_url(self) -> str:
        return f"http://127.0.0.1:{self.frontend_port}"

    def _wait(self, url: str, timeout_s: float) -> bool:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if any(proc.poll() is not None for proc in self.procs):
                return False
            try:
                if httpx.get(url, timeout=2.0).status_code == 200:
                    return True
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        return False

    def _prepare_environment(self) -> dict[str, str]:
        from cryptography.fernet import Fernet
        from app.config import load_config_file
        from app.crypto import _write_secret
        from app.database import Database
        from app.llm import _PROVIDER_KEY_MAP, get_llm_config

        selected = get_llm_config()
        stored = load_config_file()
        config = {key: stored[key] for key in _RUN_SETTINGS if key in stored}
        config.update(selected.model_dump(exclude={"api_key"}))
        self.bundle.data_dir.mkdir(parents=True, exist_ok=True)
        (self.bundle.data_dir / "config.json").write_text(
            json.dumps(config), encoding="utf-8"
        )
        db = Database(db_path=self.bundle.data_dir / "resume_matcher.db")
        self._credentials_prepared = True
        try:
            db.clear_api_keys()
            if selected.api_key:
                secret = Fernet.generate_key()
                _write_secret(self.bundle.data_dir / ".secret_key", secret)
                key_provider = _PROVIDER_KEY_MAP.get(
                    selected.provider, selected.provider
                )
                db.set_api_key_ciphertext(
                    key_provider,
                    Fernet(secret).encrypt(selected.api_key.encode()).decode(),
                )
        finally:
            asyncio.run(db.close())
        # Do not inherit provider credentials or dotenv overrides. The child
        # reads explicit non-secret config and this run's selected key store.
        env = {
            key: os.environ[key]
            for key in (
                "PATH",
                "HOME",
                "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
                "http_proxy", "https_proxy", "all_proxy",
                "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
                "CURL_CA_BUNDLE", "NODE_EXTRA_CA_CERTS",
                "SYSTEMROOT",
                "TMPDIR",
                "LANG",
                "LITELLM_LOCAL_MODEL_COST_MAP",
            )
            if key in os.environ
        }
        env.update(
            {
                "DATA_DIR": str(self.bundle.data_dir),
                "LLM_API_KEY": "",
                "LLM_PROVIDER": selected.provider,
                "LLM_MODEL": selected.model,
                "LLM_API_BASE": selected.api_base or "",
                "REASONING_EFFORT": selected.reasoning_effort or "",
                "FRONTEND_BASE_URL": self.frontend_url,
                "NO_PROXY": ",".join(filter(None, [os.environ.get("NO_PROXY", os.environ.get("no_proxy", "")), "127.0.0.1", "localhost"])),
            }
        )
        return env

    def _open_process_log(self, name: str) -> Any:
        path = self.bundle.logs_dir / name
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.fchmod(descriptor, 0o600)
            return os.fdopen(descriptor, "w")
        except BaseException:
            os.close(descriptor)
            raise

    def boot(self, *, with_frontend: bool = True) -> dict[str, bool]:
        try:
            if not _port_is_free(self.backend_port):
                raise RuntimeError(
                    f"Backend port {self.backend_port} is already in use; monitor requires its own port."
                )
            env = self._prepare_environment()
            be_log = self._open_process_log("backend.log")
            self.log_files.append(be_log)
            self.procs.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "app.main:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(self.backend_port),
                    ],
                    cwd=_REPO_BACKEND,
                    stdout=be_log,
                    stderr=subprocess.STDOUT,
                    env=env,
                    start_new_session=os.name != "nt",
                )
            )
            if not self._wait(f"{self.api_base}/health", timeout_s=60):
                raise RuntimeError("Isolated backend did not become healthy.")
            if with_frontend and shutil.which("node") and shutil.which("npm"):
                # An existing frontend may proxy another database. Never reuse it.
                if not _port_is_free(self.frontend_port):
                    raise RuntimeError(
                        f"Frontend port {self.frontend_port} is already in use; monitor requires its own port."
                    )
                fe_log = self._open_process_log("frontend.log")
                self.log_files.append(fe_log)
                frontend_env = {
                    **env,
                    "NEXT_PUBLIC_API_URL": self.api_base.removesuffix("/api/v1"),
                    "BACKEND_ORIGIN": self.api_base.removesuffix("/api/v1"),
                }
                self.procs.append(
                    subprocess.Popen(
                        ["npm", "run", "dev", "--", "--port", str(self.frontend_port)],
                        cwd=_REPO_ROOT / "apps" / "frontend",
                        stdout=fe_log,
                        stderr=subprocess.STDOUT,
                        env=frontend_env,
                        start_new_session=os.name != "nt",
                    )
                )
                self.frontend_up = self._wait(self.frontend_url, timeout_s=120)
                if not self.frontend_up:
                    raise RuntimeError("Isolated frontend did not become healthy.")
            return {"frontend_up": self.frontend_up}
        except BaseException:
            self.teardown()
            raise

    def teardown(self) -> None:
        for proc in reversed(self.procs):
            if os.name != "nt" and isinstance(proc.pid, int):
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            elif os.name == "nt" and isinstance(proc.pid, int):
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, check=False)
            elif proc.poll() is None:
                proc.terminate()
        for proc in reversed(self.procs):
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)
            finally:
                # npm may exit before its Next descendant. Reap the whole
                # owned session, including children that ignored SIGTERM.
                if os.name != "nt" and isinstance(proc.pid, int):
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
        self.procs.clear()
        for log in self.log_files:
            log.close()
        self.log_files.clear()
        self.frontend_up = False
        if self._credentials_prepared:
            from app.database import Database

            db = Database(db_path=self.bundle.data_dir / "resume_matcher.db")
            try:
                db.clear_api_keys()
            finally:
                asyncio.run(db.close())
                (self.bundle.data_dir / ".secret_key").unlink(missing_ok=True)
                self._credentials_prepared = False
