"""In Docker, a model server on "localhost" is the container itself: say so."""

from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.llm import LLMConfig, check_llm_health

REFUSED = ConnectionError("Cannot connect to host localhost:11434")


async def _error_code(
    monkeypatch: pytest.MonkeyPatch, in_container: bool, config: LLMConfig
) -> str:
    monkeypatch.setattr(settings, "in_container", in_container)
    with patch("app.llm.litellm.acompletion", AsyncMock(side_effect=REFUSED)):
        result = await check_llm_health(config)
    assert result["healthy"] is False
    return result["error_code"]


@pytest.mark.parametrize(
    ("provider", "api_base"),
    [
        ("ollama", "http://localhost:11434"),
        ("ollama", None),  # LiteLLM's Ollama default is localhost:11434
        ("ollama", "http://127.0.0.1:11434"),
        ("openai_compatible", "http://[::1]:1234/v1"),
    ],
)
async def test_loopback_base_in_a_container_explains_host_docker_internal(
    monkeypatch: pytest.MonkeyPatch, provider: str, api_base: str | None
) -> None:
    config = LLMConfig(provider=provider, model="llama3", api_key="", api_base=api_base)
    assert await _error_code(monkeypatch, True, config) == "loopback_in_container"


async def test_loopback_base_outside_a_container_is_a_plain_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = LLMConfig(
        provider="ollama", model="llama3", api_key="", api_base="http://localhost:11434"
    )
    assert await _error_code(monkeypatch, False, config) == "health_check_failed"


async def test_host_docker_internal_in_a_container_is_a_plain_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = LLMConfig(
        provider="ollama",
        model="llama3",
        api_key="",
        api_base="http://host.docker.internal:11434",
    )
    assert await _error_code(monkeypatch, True, config) == "health_check_failed"


async def test_malformed_base_in_a_container_is_a_plain_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = LLMConfig(
        provider="ollama", model="llama3", api_key="", api_base="http://[::1"
    )
    assert await _error_code(monkeypatch, True, config) == "health_check_failed"
