"""Unit tests for LLM capability helpers in app.llm."""

from unittest.mock import patch

import pytest

from app.llm import _get_retry_temperature, _supports_temperature


# ---------------------------------------------------------------------------
# _supports_temperature
# ---------------------------------------------------------------------------


class TestSupportsTemperature:
    """Tests for _supports_temperature()."""

    def test_none_temperature_returns_true(self):
        """When temperature is None, the caller isn't setting a value — allow."""
        assert _supports_temperature("gpt-4", None) is True

    def test_ollama_always_true(self):
        """Ollama models support temperature even when not in registry."""
        assert _supports_temperature("ollama/llama3", 0.7) is True
        assert _supports_temperature("ollama_chat/llama3", 0.7) is True

    @patch("app.llm.litellm.get_model_info")
    def test_openai_gpt4_supports_temperature(self, mock_get_model_info):
        """GPT-4 has temperature in supported_openai_params."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens", "top_p"]
        }
        assert _supports_temperature("gpt-4", 0.7) is True

    @patch("app.llm.litellm.get_model_info")
    def test_model_without_temperature_param(self, mock_get_model_info):
        """Model registry omits temperature → not supported."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["max_tokens"]
        }
        assert _supports_temperature("some-model", 0.7) is False

    @patch("app.llm.litellm.get_model_info")
    def test_opus4_deprecated_temperature(self, mock_get_model_info):
        """Anthropic Opus 4.x deprecated temperature entirely."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _supports_temperature("anthropic/claude-opus-4-7", 0.7) is False
        # Also check with temperature=1 — still deprecated
        assert _supports_temperature("anthropic/claude-opus-4-7", 1.0) is False

    @patch("app.llm.litellm.get_model_info")
    def test_kimi_k26_only_allows_one(self, mock_get_model_info):
        """Moonshot kimi-k2.6 only allows temperature=1."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _supports_temperature("openai/kimi-k2.6", 0.7) is False
        assert _supports_temperature("openai/kimi-k2.6", 1.0) is True

    @patch("app.llm.litellm.get_model_info")
    def test_model_not_in_registry(self, mock_get_model_info):
        """Unknown model not in registry — be conservative, skip temperature."""
        mock_get_model_info.side_effect = Exception("model not found")
        assert _supports_temperature("unknown-vendor/model", 0.7) is False

    @patch("app.llm.litellm.get_model_info")
    def test_case_insensitive_model_name(self, mock_get_model_info):
        """Provider-specific checks are case-insensitive."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _supports_temperature("Anthropic/Claude-Opus-4-7", 0.7) is False
        assert _supports_temperature("OPENAI/KIMI-K2.6", 0.7) is False
        assert _supports_temperature("openai/KIMI-K2.6", 1.0) is True


# ---------------------------------------------------------------------------
# _get_retry_temperature
# ---------------------------------------------------------------------------


class TestGetRetryTemperature:
    """Tests for _get_retry_temperature()."""

    @patch("app.llm.litellm.get_model_info")
    def test_openai_progression(self, mock_get_model_info):
        """Standard retry temperature progression for supported models."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _get_retry_temperature("gpt-4", 0) == 0.1
        assert _get_retry_temperature("gpt-4", 1) == 0.3
        assert _get_retry_temperature("gpt-4", 2) == 0.5
        assert _get_retry_temperature("gpt-4", 3) == 0.7
        assert _get_retry_temperature("gpt-4", 10) == 0.7  # clamped

    @patch("app.llm.litellm.get_model_info")
    def test_opus4_returns_none(self, mock_get_model_info):
        """Opus 4 doesn't support temperature → None on all retries."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _get_retry_temperature("anthropic/claude-opus-4-7", 0) is None
        assert _get_retry_temperature("anthropic/claude-opus-4-7", 3) is None

    @patch("app.llm.litellm.get_model_info")
    def test_kimi_k26_returns_one(self, mock_get_model_info):
        """Kimi K2.6 only allows temperature=1 → always 1.0."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _get_retry_temperature("openai/kimi-k2.6", 0) == 1.0
        assert _get_retry_temperature("openai/kimi-k2.6", 1) == 1.0
        assert _get_retry_temperature("openai/kimi-k2.6", 5) == 1.0

    @patch("app.llm.litellm.get_model_info")
    def test_custom_base_temp(self, mock_get_model_info):
        """Custom base_temp is respected for supported models."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"]
        }
        assert _get_retry_temperature("gpt-4", 0, base_temp=0.2) == 0.2
        assert _get_retry_temperature("gpt-4", 1, base_temp=0.2) == 0.3
