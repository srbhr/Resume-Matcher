"""Unit tests for the local Claude Code CLI provider."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.llm import LOCAL_NO_KEY_PROVIDERS, LLMConfig, complete, resolve_api_key
from app.providers.claude_cli import (
    ClaudeCLIError,
    _stdin_payload,
    build_claude_cli_args,
    resolve_claude_binary,
)


class TestBuildClaudeCliArgs:
    def test_includes_print_bare_and_no_tools(self):
        args, system_on_argv = build_claude_cli_args(
            system_prompt="sys",
            model="sonnet",
        )
        assert args[0] == "-p"
        assert "--bare" not in args
        assert "--safe-mode" in args
        assert args[args.index("--tools") + 1] == ""
        assert args[args.index("--output-format") + 1] == "text"
        assert args[args.index("--model") + 1] == "sonnet"
        assert args[args.index("--system-prompt") + 1] == "sys"
        assert system_on_argv == "sys"
        # Prompt goes on stdin, never argv.
        assert "hello" not in args

    def test_omits_system_prompt_when_absent(self):
        args, system_on_argv = build_claude_cli_args(system_prompt=None, model="haiku")
        assert "--system-prompt" not in args
        assert system_on_argv is None

    def test_folds_large_system_prompt_into_stdin(self):
        huge = "x" * 5000
        args, system_on_argv = build_claude_cli_args(system_prompt=huge, model="sonnet")
        assert "--system-prompt" not in args
        assert system_on_argv is None
        payload = _stdin_payload("user-text", huge, system_on_argv=False)
        assert payload.startswith("[System]\n")
        assert "user-text" in payload


class TestResolveClaudeBinary:
    def test_uses_path_override(self, monkeypatch, tmp_path):
        binary = tmp_path / "claude"
        binary.write_text("#!/bin/sh\n")
        binary.chmod(0o755)
        monkeypatch.setenv("CLAUDE_CLI_PATH", str(binary))
        assert resolve_claude_binary() == str(binary)

    def test_missing_override_raises(self, monkeypatch, tmp_path):
        monkeypatch.setenv("CLAUDE_CLI_PATH", str(tmp_path / "missing"))
        with pytest.raises(ClaudeCLIError, match="CLAUDE_CLI_PATH"):
            resolve_claude_binary()


class TestLocalNoKeyProviders:
    def test_claude_cli_is_keyless(self):
        assert "claude_cli" in LOCAL_NO_KEY_PROVIDERS

    def test_claude_cli_does_not_inherit_env_key(self, monkeypatch):
        monkeypatch.setattr("app.llm.settings.llm_api_key", "sk-paid-secret")
        assert resolve_api_key({}, "claude_cli") == ""


@pytest.mark.asyncio
async def test_complete_routes_to_claude_cli():
    cfg = LLMConfig(provider="claude_cli", model="sonnet", api_key="")
    with patch(
        "app.llm.complete_claude_cli",
        new=AsyncMock(return_value='{"ok": true}'),
    ) as mock_cli:
        out = await complete("prompt", system_prompt="sys", config=cfg)
    assert out == '{"ok": true}'
    mock_cli.assert_awaited_once()
    kwargs = mock_cli.await_args.kwargs
    assert kwargs["model"] == "sonnet"
    assert kwargs["system_prompt"] == "sys"
