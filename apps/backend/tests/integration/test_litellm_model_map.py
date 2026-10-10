"""The app pins LiteLLM's bundled model registry instead of fetching it live."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).parents[2]

# Records and blocks every socket lookup/connect. OSError makes LiteLLM's
# fetch fall back to the bundled map, so a regression fails the assertion
# below without the test ever reaching the network.
_IMPORT_PROBE = """
import json, os, sys

attempts: list[str] = []


def block_network(event: str, args: tuple[object, ...]) -> None:
    if event in {"socket.getaddrinfo", "socket.connect"}:
        attempts.append(event)
        raise OSError("network blocked by model-map test")


sys.addaudithook(block_network)
import app.llm  # noqa: E402,F401

print(json.dumps({
    "env": os.environ.get("LITELLM_LOCAL_MODEL_COST_MAP"),
    "attempts": attempts,
}))
"""


def _run_isolated(
    code: str, tmp_path: Path, extra_env: dict[str, str] | None = None
) -> dict[str, Any]:
    """Run code in a fresh interpreter without the parent's LiteLLM setting."""
    environment = {
        key: value
        for key, value in os.environ.items()
        if key != "LITELLM_LOCAL_MODEL_COST_MAP"
    }
    environment.update(
        {
            "DATA_DIR": str(tmp_path / "data"),
            "CONFIG_FILE_PATH": str(tmp_path / "config.json"),
            "LITELLM_TELEMETRY": "False",
            "PYTHONPATH": str(BACKEND_ROOT),
            **(extra_env or {}),
        }
    )
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    return json.loads(completed.stdout.strip().splitlines()[-1])


def test_importing_the_app_uses_the_bundled_model_registry(tmp_path: Path) -> None:
    """Importing the LLM layer selects the local map and makes no network call."""
    result = _run_isolated(_IMPORT_PROBE, tmp_path)
    assert result["env"] == "True"
    assert result["attempts"] == []


def test_explicit_live_registry_opt_out_is_respected(tmp_path: Path) -> None:
    """An operator-set value is never overridden by the package default."""
    result = _run_isolated(
        "import json, os, app\n"
        "print(json.dumps({'env': os.environ.get('LITELLM_LOCAL_MODEL_COST_MAP')}))",
        tmp_path,
        {"LITELLM_LOCAL_MODEL_COST_MAP": "False"},
    )
    assert result["env"] == "False"
