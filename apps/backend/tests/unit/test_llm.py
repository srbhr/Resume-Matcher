"""Unit tests for LLM capability helpers in app.llm."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm import _appears_truncated, _calculate_timeout, _get_retry_temperature, _supports_temperature


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


# ---------------------------------------------------------------------------
# _appears_truncated
# ---------------------------------------------------------------------------


class TestAppearsTruncated:
    """Tests for _appears_truncated() with schema_type awareness."""

    # --- resume schema ---

    def test_resume_empty_work_experience(self):
        """Empty workExperience array in resume structure is suspicious."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [],
            "education": [{"degree": "BS"}],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is True

    def test_resume_empty_education(self):
        """Empty education array in resume structure is suspicious."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is True

    def test_resume_empty_skills(self):
        """Empty skills array in resume structure is suspicious."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [{"degree": "BS"}],
            "skills": [],
        }
        assert _appears_truncated(data, schema_type="resume") is True

    def test_resume_valid(self):
        """Well-formed resume with all sections present is not truncated."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [{"degree": "BS"}],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is False

    def test_resume_missing_fields_not_empty(self):
        """Missing fields are not the same as empty arrays — not flagged."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            # education and skills omitted
        }
        assert _appears_truncated(data, schema_type="resume") is False

    # --- enrichment schema ---

    def test_enrichment_missing_keys(self):
        """Missing required keys in enrichment output is suspicious."""
        data = {"analysis_summary": "Good resume"}
        assert _appears_truncated(data, schema_type="enrichment") is True

    def test_enrichment_empty_arrays(self):
        """Empty items_to_enrich and questions are valid (resume already strong)."""
        data = {
            "items_to_enrich": [],
            "questions": [],
            "analysis_summary": "Already strong",
        }
        assert _appears_truncated(data, schema_type="enrichment") is False

    def test_enrichment_populated(self):
        """Populated enrichment output is not truncated."""
        data = {
            "items_to_enrich": [{"item_id": "exp_0"}],
            "questions": [{"question_id": "q_0"}],
            "analysis_summary": "Needs work",
        }
        assert _appears_truncated(data, schema_type="enrichment") is False

    # --- diff schema ---

    def test_diff_empty_changes(self):
        """Empty changes array in diff output is valid (no changes needed)."""
        data = {"changes": [], "strategy_notes": "No changes needed"}
        assert _appears_truncated(data, schema_type="diff") is False

    def test_diff_populated(self):
        """Populated diff output is not truncated."""
        data = {"changes": [{"path": "summary", "action": "replace"}]}
        assert _appears_truncated(data, schema_type="diff") is False

    # --- keywords schema ---

    def test_keywords_empty(self):
        """Empty keyword lists are valid (sparse job description)."""
        data = {"required_skills": [], "preferred_skills": [], "keywords": []}
        assert _appears_truncated(data, schema_type="keywords") is False

    # --- default / unknown schema ---

    def test_default_schema_acts_like_resume(self):
        """Default schema_type behaves like 'resume' for backwards compatibility."""
        data = {"workExperience": [], "education": [{"degree": "BS"}]}
        assert _appears_truncated(data) is True

    def test_unknown_schema_no_heuristics(self):
        """Unknown schema types have no truncation heuristics."""
        data = {"anything": []}
        assert _appears_truncated(data, schema_type="custom") is False


# ---------------------------------------------------------------------------
# complete_json JSON mode fallback
# ---------------------------------------------------------------------------


class TestCompleteJsonFallback:
    """Tests for JSON mode fallback in complete_json()."""

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_json_mode_fallback_on_parse_error(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """When JSON mode returns invalid JSON, fallback to prompt-only mode.

        First call: JSON mode enabled → returns malformed JSON (trailing comma)
          → _extract_json succeeds → json.loads fails → JSONDecodeError
        Second call: JSON mode disabled → returns valid JSON → success
        """
        mock_supports_json.return_value = True
        mock_get_name.return_value = "openrouter/openai/gpt-5.4"

        # First response: balanced braces but trailing comma → json.loads fails
        bad_choice = MagicMock()
        bad_choice.message.content = '{"items_to_enrich": [], "questions": [],}'
        bad_response = MagicMock()
        bad_response.choices = [bad_choice]

        # Second response: valid JSON without JSON mode
        good_choice = MagicMock()
        good_choice.message.content = '{"items_to_enrich": [], "questions": [], "analysis_summary": "ok"}'
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[bad_response, good_response])
        config = MagicMock()
        config.provider = "openrouter"
        config.reasoning_effort = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            prompt="Test prompt",
            schema_type="enrichment",
            retries=2,
        )

        assert result == {
            "items_to_enrich": [],
            "questions": [],
            "analysis_summary": "ok",
        }
        # Verify JSON mode was used on first call but not second
        calls = router.acompletion.call_args_list
        assert calls[0].kwargs.get("response_format") == {"type": "json_object"}
        assert "response_format" not in calls[1].kwargs


# ---------------------------------------------------------------------------
# complete() dynamic timeout
# ---------------------------------------------------------------------------


class TestCompleteDynamicTimeout:
    """Tests for complete() using _calculate_timeout()."""

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._calculate_timeout")
    @patch("app.llm._supports_temperature")
    async def test_uses_calculate_timeout(
        self, mock_supports_temp, mock_calc_timeout, mock_get_name, mock_get_router
    ):
        """complete() passes provider and max_tokens to _calculate_timeout."""
        mock_supports_temp.return_value = True
        mock_calc_timeout.return_value = 180
        mock_get_name.return_value = "deepseek/deepseek-chat"

        choice = MagicMock()
        choice.message.content = "Hello"
        response = MagicMock()
        response.choices = [choice]

        router = MagicMock()
        router.acompletion = AsyncMock(return_value=response)
        config = MagicMock()
        config.provider = "deepseek"
        config.timeout_seconds = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete

        await complete(prompt="Hi", max_tokens=8192)

        mock_calc_timeout.assert_called_once_with("completion", 8192, "deepseek", None)
        router.acompletion.assert_awaited_once()
        assert router.acompletion.call_args.kwargs["timeout"] == 180


# ---------------------------------------------------------------------------
# _calculate_timeout with base_timeout_override
# ---------------------------------------------------------------------------


class TestCalculateTimeoutOverride:
    """Tests for _calculate_timeout() with user-configured timeout override."""

    def test_override_applies_to_completion(self):
        """When base_timeout_override is set, completion uses it instead of default."""
        # Default completion = 120s; with 300s override → 300 * 1.0 * 1.0 = 300
        assert _calculate_timeout("completion", 4096, "openai", 300) == 300

    def test_override_applies_to_json(self):
        """When base_timeout_override is set, json uses it instead of default."""
        # Default json = 180s; with 300s override → 300 * 1.0 * 1.0 = 300
        assert _calculate_timeout("json", 4096, "openai", 300) == 300

    def test_override_does_not_affect_health_check(self):
        """Health check always uses its hard-coded 30s regardless of override."""
        assert _calculate_timeout("health_check", 4096, "openai", 300) == 30

    def test_override_with_token_scaling(self):
        """Override base is still scaled by token_factor."""
        # 300s override, 8192 tokens (2x) → 300 * 2.0 = 600
        assert _calculate_timeout("completion", 8192, "openai", 300) == 600

    def test_override_with_provider_factor(self):
        """Override base is still scaled by provider_factor."""
        # 300s override, ollama (2.0x) → 300 * 2.0 = 600
        assert _calculate_timeout("completion", 4096, "ollama", 300) == 600

    def test_override_with_both_factors(self):
        """Override base is scaled by both token and provider factors."""
        # 300s override, 8192 tokens (2.0x), ollama (2.0x) → 300 * 2.0 * 2.0 = 1200
        assert _calculate_timeout("completion", 8192, "ollama", 300) == 1200

    def test_no_override_uses_default(self):
        """When override is None, uses hard-coded defaults."""
        assert _calculate_timeout("completion", 4096, "openai", None) == 120
        assert _calculate_timeout("json", 4096, "openai", None) == 180
        assert _calculate_timeout("health_check", 4096, "openai", None) == 30

    def test_override_minimum_value(self):
        """Override with minimum valid value (30s)."""
        assert _calculate_timeout("completion", 4096, "openai", 30) == 30

    def test_override_maximum_value(self):
        """Override with maximum valid value (600s)."""
        assert _calculate_timeout("completion", 4096, "openai", 600) == 600
