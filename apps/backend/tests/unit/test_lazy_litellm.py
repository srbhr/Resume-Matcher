"""LiteLLM loads on the first model call, not at import.

Importing it takes about 1 s and 160 MB. Agent mode makes no model calls, yet
every ``resume-matcher`` CLI run used to pay that cost. Each check runs in a
fresh interpreter, so modules other tests imported can't hide a regression.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]


def _run(code: str, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=BACKEND,
        env=env,
        check=True,
    )
    return result.stdout.strip().splitlines()[-1]


@pytest.mark.parametrize("module", ["app.mcp_server.cli", "app.main"])
def test_importing_does_not_load_litellm(module: str) -> None:
    assert _run(f"import sys, {module}; print('litellm' in sys.modules)") == "False"


def test_agent_mode_server_never_loads_litellm(tmp_path: Path) -> None:
    (tmp_path / "config.json").write_text(
        json.dumps({"provider": "agent", "model": ""})
    )
    code = (
        "import sys\n"
        "from fastapi.testclient import TestClient\n"
        "from app.main import app\n"
        "with TestClient(app, base_url='http://localhost') as client:\n"
        "    assert client.get('/api/v1/status').json()['agent_mode'] is True\n"
        "print('litellm' in sys.modules)"
    )
    assert _run(code, env={**os.environ, "DATA_DIR": str(tmp_path)}) == "False"


def test_building_the_router_loads_and_configures_litellm() -> None:
    code = (
        "import sys\n"
        "from app.llm import LLMConfig, _build_router\n"
        "_build_router(LLMConfig(provider='openai', model='gpt-4o', api_key='synthetic'))\n"
        "loaded = 'litellm' in sys.modules\n"
        "import litellm\n"
        "print(loaded, litellm.drop_params, litellm.modify_params)"
    )
    assert _run(code) == "True True True"
