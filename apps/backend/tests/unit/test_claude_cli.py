"""Tests for the local Claude Code CLI provider (``claude_cli``).

Nothing here launches the real ``claude`` binary: routing is checked with
``app.llm.claude_acompletion`` replaced, and the subprocess layer is checked
against a fake ``asyncio.create_subprocess_exec``.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.llm import LLMConfig, complete, complete_json, get_router


@pytest.fixture(autouse=True)
def _fresh_router_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """A cached Router would hide a missing short-circuit; start each test cold."""
    monkeypatch.setattr("app.llm._router", None)
    monkeypatch.setattr("app.llm._router_config_key", "")


def _cli_config() -> LLMConfig:
    return LLMConfig(provider="claude_cli", model="claude_cli", api_key="")


def _shaped(content: str) -> SimpleNamespace:
    message = SimpleNamespace(content=content, reasoning_content=None, thinking=None)
    choice = SimpleNamespace(message=message, finish_reason="stop")
    return SimpleNamespace(choices=[choice], model="claude-cli", usage=None)


class TestRouterIsSkipped:
    """LiteLLM's Router cannot be built for the bare ``claude_cli`` model."""

    def test_get_router_returns_no_router_for_claude_cli(self):
        config = _cli_config()

        with patch("app.llm._build_router") as build_router:
            router, resolved = get_router(config)

        assert router is None
        assert resolved is config
        build_router.assert_not_called()

    async def test_complete_uses_the_cli_without_building_a_router(self):
        cli = AsyncMock(return_value=_shaped("Hello from the CLI"))

        with (
            patch("app.llm.claude_acompletion", cli),
            patch("app.llm._build_router") as build_router,
        ):
            result = await complete("Say hello", config=_cli_config())

        assert result == "Hello from the CLI"
        build_router.assert_not_called()
        cli.assert_awaited_once()

    async def test_complete_json_uses_the_cli_without_building_a_router(self):
        cli = AsyncMock(return_value=_shaped('{"required_skills": ["Python"]}'))

        with (
            patch("app.llm.claude_acompletion", cli),
            patch("app.llm._build_router") as build_router,
        ):
            result = await complete_json(
                prompt="Extract keywords",
                schema_type="keywords",
                config=_cli_config(),
            )

        assert result == {"required_skills": ["Python"]}
        build_router.assert_not_called()
        cli.assert_awaited_once()
