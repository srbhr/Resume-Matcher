"""Final serialized-request regressions for GPT-5 temperature handling."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest


@pytest.fixture(scope="module")
def serialized_cases(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    """Run the isolated SDK probe once and index its synthetic request bodies."""
    isolated_root = tmp_path_factory.mktemp("temperature-request-contract")
    output_path = isolated_root / "requests.json"
    probe_path = Path(__file__).with_name("_temperature_request_probe.py")
    environment = os.environ.copy()
    backend_root = Path(__file__).parents[2]
    environment.update(
        {
            "DATA_DIR": str(isolated_root / "data"),
            "CONFIG_FILE_PATH": str(isolated_root / "config.json"),
            "LITELLM_LOCAL_MODEL_COST_MAP": "True",
            "LITELLM_TELEMETRY": "False",
            "DO_NOT_TRACK": "1",
            "PYTHONPATH": os.pathsep.join(
                (str(backend_root), environment.get("PYTHONPATH", ""))
            ),
        }
    )
    completed = subprocess.run(
        [sys.executable, str(probe_path), str(output_path)],
        cwd=backend_root,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
    cases = json.loads(output_path.read_text())
    return {
        "|".join(
            (
                case["provider"],
                case["model"],
                str(case["reasoning_effort"]),
                str(case["requested_temperature"]),
            )
        ): case
        for case in cases
    }


def test_gpt51_and_gpt52_preserve_serialized_sampling_when_reasoning_is_cleared(
    serialized_cases: dict[str, Any],
) -> None:
    """Cleared reasoning keeps complete and content-retry temperatures."""
    for model in ("gpt-5.1", "gpt-5.2"):
        case = serialized_cases[f"openai|{model}|None|0.7"]
        assert case["complete"]["temperature"] == 0.7
        assert [body["temperature"] for body in case["json"]] == [0.1, 0.3, 0.5]
        assert "reasoning_effort" not in case["complete"]
        assert all("reasoning_effort" not in body for body in case["json"])


def test_registered_compatible_alias_preserves_sampling_only_without_reasoning(
    serialized_cases: dict[str, Any],
) -> None:
    """Compatible GPT-5.1 aliases follow the same model/mode capability."""
    cleared = serialized_cases["openai_compatible|gpt-5.1|None|0.7"]
    enabled = serialized_cases["openai_compatible|gpt-5.1|medium|0.7"]

    assert cleared["complete"]["temperature"] == 0.7
    assert [body["temperature"] for body in cleared["json"]] == [0.1, 0.3, 0.5]
    assert "temperature" not in enabled["complete"]
    assert all("temperature" not in body for body in enabled["json"])


def test_regular_gpt5_chat_variant_preserves_serialized_sampling(
    serialized_cases: dict[str, Any],
) -> None:
    """The regular gpt-5-chat family stays outside reasoning restrictions."""
    case = serialized_cases["openai|gpt-5-chat-latest|None|0.7"]

    assert case["complete"]["temperature"] == 0.7
    assert [body["temperature"] for body in case["json"]] == [0.1, 0.3, 0.5]


def test_restricted_and_unknown_models_omit_serialized_sampling(
    serialized_cases: dict[str, Any],
) -> None:
    """Nano, explicit reasoning, and registry misses remain conservative."""
    keys = (
        "openai|gpt-5.1|medium|0.7",
        "openai|gpt-5-nano-2025-08-07|minimal|0.7",
        "openai_compatible|gpt-5-local-llama|None|0.7",
    )
    for key in keys:
        case = serialized_cases[key]
        assert "temperature" not in case["complete"]
        assert all("temperature" not in body for body in case["json"])


def test_explicit_default_temperature_survives_reasoning_mode(
    serialized_cases: dict[str, Any],
) -> None:
    """The supported explicit GPT-5 default remains serialized as 1.0."""
    case = serialized_cases["openai|gpt-5.1|medium|1.0"]
    assert case["complete"]["temperature"] == 1.0


def test_versioned_chat_aliases_follow_the_installed_transport_capabilities(
    serialized_cases: dict[str, Any],
) -> None:
    supported = serialized_cases["openai|gpt-5.1-chat-latest|None|0.7"]
    restricted = serialized_cases["openai|gpt-5.2-chat-latest|None|0.7"]
    assert supported["complete"]["temperature"] == 0.7
    assert [body["temperature"] for body in supported["json"]] == [0.1, 0.3, 0.5]
    assert "temperature" not in restricted["complete"]
    assert all("temperature" not in body for body in restricted["json"])
