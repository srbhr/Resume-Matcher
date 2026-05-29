"""Unit tests for provider routing & key resolution in app.llm.

These are the pure functions where local-LLM (Ollama / openai_compatible) bugs
live, and they pin behavior we recently shipped:
  - get_model_name        — LiteLLM provider prefixing (Ollama, OpenRouter nesting)
  - _normalize_api_base   — the /v1/v1 duplicate-path fix (issue #751) + Ollama suffixes
  - resolve_api_key       — the security rule that local providers do NOT inherit
                            the env LLM_API_KEY (so a paid key can't leak to a
                            self-hosted server)
  - _effective_api_key    — blank-key sentinel for openai_compatible
  - _strip_thinking_tags  — deepseek-r1 / qwq <think> stripping
"""

import pytest

from app.llm import (
    LLMConfig,
    _effective_api_key,
    _normalize_api_base,
    _strip_thinking_tags,
    get_model_name,
    resolve_api_key,
)


def _cfg(provider: str, model: str) -> LLMConfig:
    return LLMConfig(provider=provider, model=model, api_key="")


# ---------------------------------------------------------------------------
# get_model_name — provider prefixing
# ---------------------------------------------------------------------------


class TestGetModelName:
    def test_openai_no_prefix(self):
        assert get_model_name(_cfg("openai", "gpt-4")) == "gpt-4"

    def test_ollama_uses_ollama_chat_prefix(self):
        # ollama_chat/ routes to /api/chat (messages array) — the working path.
        assert get_model_name(_cfg("ollama", "llama3")) == "ollama_chat/llama3"

    def test_ollama_does_not_double_prefix(self):
        assert get_model_name(_cfg("ollama", "ollama_chat/llama3")) == "ollama_chat/llama3"
        assert get_model_name(_cfg("ollama", "ollama/llama3")) == "ollama/llama3"

    def test_openai_compatible_uses_openai_prefix(self):
        # llama.cpp / vLLM / LM Studio served via the OpenAI client.
        assert get_model_name(_cfg("openai_compatible", "llama-3.1-8b")) == "openai/llama-3.1-8b"

    def test_openrouter_nested_prefix(self):
        assert (
            get_model_name(_cfg("openrouter", "anthropic/claude-3.5-sonnet"))
            == "openrouter/anthropic/claude-3.5-sonnet"
        )

    def test_openrouter_does_not_double_prefix(self):
        assert (
            get_model_name(_cfg("openrouter", "openrouter/anthropic/claude-3.5-sonnet"))
            == "openrouter/anthropic/claude-3.5-sonnet"
        )

    def test_anthropic_prefix(self):
        assert get_model_name(_cfg("anthropic", "claude-3-opus")) == "anthropic/claude-3-opus"

    def test_gemini_prefix(self):
        assert get_model_name(_cfg("gemini", "gemini-1.5-pro")) == "gemini/gemini-1.5-pro"

    def test_deepseek_prefix(self):
        assert get_model_name(_cfg("deepseek", "deepseek-chat")) == "deepseek/deepseek-chat"

    def test_groq_prefix(self):
        assert get_model_name(_cfg("groq", "llama-3.1-70b")) == "groq/llama-3.1-70b"

    def test_existing_known_prefix_is_preserved(self):
        # Model already carries a known prefix → don't add the provider's.
        assert get_model_name(_cfg("anthropic", "anthropic/claude-3-opus")) == "anthropic/claude-3-opus"


# ---------------------------------------------------------------------------
# _normalize_api_base — the /v1/v1 duplicate-path fix (issue #751)
# ---------------------------------------------------------------------------


class TestNormalizeApiBase:
    def test_none_and_blank(self):
        assert _normalize_api_base("openai", None) is None
        assert _normalize_api_base("openai", "") is None
        assert _normalize_api_base("openai", "   ") is None

    def test_openai_preserves_v1_as_is(self):
        # #751: the OpenAI client resolves /v1 correctly; local llama.cpp etc.
        # MUST keep the /v1 the user pasted, otherwise requests 404.
        assert _normalize_api_base("openai", "http://localhost:8080/v1") == "http://localhost:8080/v1"
        assert (
            _normalize_api_base("openai_compatible", "http://localhost:8080/v1")
            == "http://localhost:8080/v1"
        )

    def test_openai_strips_only_trailing_slash(self):
        assert _normalize_api_base("openai_compatible", "http://localhost:8080/v1/") == "http://localhost:8080/v1"

    def test_anthropic_strips_v1(self):
        # Anthropic handler appends /v1/messages → avoid /v1/v1/messages.
        assert _normalize_api_base("anthropic", "https://api.anthropic.com/v1") == "https://api.anthropic.com"

    def test_gemini_strips_v1(self):
        assert _normalize_api_base("gemini", "https://host/v1") == "https://host"

    def test_openrouter_strips_v1(self):
        assert _normalize_api_base("openrouter", "https://openrouter.ai/api/v1") == "https://openrouter.ai/api"

    @pytest.mark.parametrize(
        "pasted",
        [
            "http://localhost:11434/v1",
            "http://localhost:11434/api/chat",
            "http://localhost:11434/api/generate",
            "http://localhost:11434/api",
        ],
    )
    def test_ollama_strips_known_suffixes(self, pasted):
        assert _normalize_api_base("ollama", pasted) == "http://localhost:11434"

    def test_ollama_bare_host_unchanged(self):
        assert _normalize_api_base("ollama", "http://localhost:11434") == "http://localhost:11434"


# ---------------------------------------------------------------------------
# resolve_api_key — local providers must NOT inherit the env key
# ---------------------------------------------------------------------------


class TestResolveApiKey:
    def test_top_level_key_wins(self):
        assert resolve_api_key({"api_key": "sk-top"}, "openai") == "sk-top"

    def test_falls_back_to_provider_keymap(self):
        # gemini → "google" in the api_keys dict.
        assert resolve_api_key({"api_keys": {"google": "g-key"}}, "gemini") == "g-key"

    def test_ollama_does_not_inherit_env_key(self, monkeypatch):
        # SECURITY: a paid key in LLM_API_KEY must never leak to a local server.
        monkeypatch.setattr("app.llm.settings.llm_api_key", "sk-paid-secret")
        assert resolve_api_key({}, "ollama") == ""

    def test_openai_compatible_does_not_inherit_env_key(self, monkeypatch):
        monkeypatch.setattr("app.llm.settings.llm_api_key", "sk-paid-secret")
        assert resolve_api_key({}, "openai_compatible") == ""

    def test_cloud_provider_does_inherit_env_key(self, monkeypatch):
        monkeypatch.setattr("app.llm.settings.llm_api_key", "sk-paid-secret")
        assert resolve_api_key({}, "openai") == "sk-paid-secret"


# ---------------------------------------------------------------------------
# _effective_api_key — blank-key sentinel for openai_compatible
# ---------------------------------------------------------------------------


class TestEffectiveApiKey:
    def test_openai_compatible_blank_gets_sentinel(self):
        # The OpenAI client rejects empty strings; local servers ignore the value.
        assert _effective_api_key("openai_compatible", "") == "sk-no-key"

    def test_openai_compatible_real_key_passthrough(self):
        assert _effective_api_key("openai_compatible", "local-key") == "local-key"

    def test_ollama_blank_passthrough(self):
        # Ollama goes through a different client path; no sentinel needed.
        assert _effective_api_key("ollama", "") == ""

    def test_openai_passthrough(self):
        assert _effective_api_key("openai", "sk-real") == "sk-real"


# ---------------------------------------------------------------------------
# _strip_thinking_tags — deepseek-r1 / qwq reasoning models
# ---------------------------------------------------------------------------


class TestStripThinkingTags:
    def test_strips_closed_block(self):
        assert _strip_thinking_tags("<think>weighing options</think>final answer") == "final answer"

    def test_strips_multiline_block(self):
        content = "<think>\nline 1\nline 2\n</think>\nthe answer"
        assert _strip_thinking_tags(content) == "the answer"

    def test_strips_unclosed_block(self):
        # Model still "thinking" at the token limit — drop the trailing tag.
        assert _strip_thinking_tags("<think>still reasoning with no close") == ""

    def test_no_tags_unchanged(self):
        assert _strip_thinking_tags("plain output") == "plain output"
