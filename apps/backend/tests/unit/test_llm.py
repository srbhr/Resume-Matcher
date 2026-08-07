"""Unit tests for LLM capability helpers in app.llm."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm import (
    LLMConfig,
    _appears_truncated,
    _azure_foundry_api_version,
    _get_retry_temperature,
    _normalize_api_base,
    _supports_temperature,
    get_llm_config,
    get_model_name,
    resolve_api_key,
)


# ---------------------------------------------------------------------------
# Provider configuration helpers
# ---------------------------------------------------------------------------


class TestProviderConfiguration:
    """Tests for provider-specific model and key mapping."""

    def test_azure_foundry_model_uses_litellm_azure_ai_prefix(self):
        """Azure AI Foundry routes through LiteLLM's azure_ai provider."""
        config = LLMConfig(
            provider="azure_foundry",
            model="mistral-large-latest",
            api_key="foundry-key",
            api_base="https://example.services.ai.azure.com/models",
        )

        assert get_model_name(config) == "azure_ai/mistral-large-latest"

    def test_azure_foundry_model_preserves_existing_prefix(self):
        """Already-prefixed Azure AI models are not double-prefixed."""
        config = LLMConfig(
            provider="azure_foundry",
            model="azure_ai/command-r-plus",
            api_key="foundry-key",
        )

        assert get_model_name(config) == "azure_ai/command-r-plus"

    def test_azure_foundry_openai_endpoint_preserves_azure_ai_prefix(self):
        """Azure OpenAI-style Foundry endpoints do not rewrite azure_ai models."""
        config = LLMConfig(
            provider="azure_foundry",
            model="azure_ai/command-r-plus",
            api_key="foundry-key",
            api_base="https://example.services.ai.azure.com/openai/v1/responses",
        )

        assert get_model_name(config) == "azure_ai/command-r-plus"

    def test_azure_foundry_service_root_routes_gpt5_via_azure(self):
        """Foundry service-root GPT deployments route via the bare azure/ prefix.

        Previously this asserted an ``azure/gpt5_series/`` segment. That string
        is absent from LiteLLM's model registry, so every capability lookup in
        app.llm silently degraded (max_tokens 128k -> 4096, JSON mode off).
        LiteLLM already selects its GPT-5 config from the bare deployment name.
        """
        config = LLMConfig(
            provider="azure_foundry",
            model="gpt-5.4-mini",
            api_key="foundry-key",
            api_base="https://example.services.ai.azure.com",
        )

        assert get_model_name(config) == "azure/gpt-5.4-mini"
        assert _azure_foundry_api_version(config) == "v1"

    def test_azure_foundry_service_root_keeps_non_gpt_on_azure_ai(self):
        """Non-GPT Foundry service-root models keep Azure AI Inference routing."""
        config = LLMConfig(
            provider="azure_foundry",
            model="mistral-large-latest",
            api_key="foundry-key",
            api_base="https://example.services.ai.azure.com",
        )

        assert get_model_name(config) == "azure_ai/mistral-large-latest"

    def test_azure_foundry_openai_endpoint_routes_gpt5_via_azure(self):
        """Foundry Azure OpenAI endpoints route via the bare azure/ prefix.

        See the service-root test above for why the gpt5_series/ segment was
        removed.
        """
        config = LLMConfig(
            provider="azure_foundry",
            model="gpt-5.4-mini",
            api_key="foundry-key",
            api_base="https://example.services.ai.azure.com/openai/v1/responses",
        )

        assert get_model_name(config) == "azure/gpt-5.4-mini"

    def test_azure_foundry_openai_endpoint_normalizes_to_resource_root(self):
        """LiteLLM appends /openai/v1 itself for Azure v1 API calls."""
        assert (
            _normalize_api_base(
                "azure_foundry",
                "https://example.services.ai.azure.com/openai/v1/responses",
            )
            == "https://example.services.ai.azure.com"
        )

    def test_azure_foundry_key_resolves_from_provider_store(self):
        """Azure AI Foundry uses its own encrypted key-store slot."""
        stored = {"api_keys": {"azure_foundry": "foundry-key"}}

        assert resolve_api_key(stored, "azure_foundry") == "foundry-key"


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

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_empty_json_retry_lowers_reasoning_effort(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """Reasoning-heavy JSON attempts can return no visible content.

        Retrying with minimal effort gives GPT-5-family models enough budget to
        produce the requested JSON instead of repeating an empty response.
        """
        mock_supports_json.return_value = False
        mock_get_name.return_value = "azure/gpt5_series/gpt-5.4-mini"

        empty_choice = MagicMock()
        empty_choice.message.content = ""
        empty_response = MagicMock()
        empty_response.choices = [empty_choice]

        good_choice = MagicMock()
        good_choice.message.content = '{"required_skills": [], "preferred_skills": [], "keywords": []}'
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[empty_response, good_response])
        config = MagicMock()
        config.provider = "azure_foundry"
        config.reasoning_effort = "high"
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(prompt="Extract keywords", schema_type="keywords", retries=2)

        assert result == {"required_skills": [], "preferred_skills": [], "keywords": []}
        calls = router.acompletion.call_args_list
        assert calls[0].kwargs["reasoning_effort"] == "high"
        assert calls[1].kwargs["reasoning_effort"] == "minimal"

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_retry_keeps_reasoning_effort_for_non_azure_providers(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """The minimal-effort retry downgrade is Azure Foundry specific.

        Other providers keep the effort the user configured on every attempt;
        silently lowering it would change output quality for OpenAI GPT-5,
        Anthropic and DeepSeek reasoning models.
        """
        mock_supports_json.return_value = False
        mock_get_name.return_value = "gpt-5-nano-2025-08-07"

        empty_choice = MagicMock()
        empty_choice.message.content = ""
        empty_response = MagicMock()
        empty_response.choices = [empty_choice]

        good_choice = MagicMock()
        good_choice.message.content = (
            '{"required_skills": [], "preferred_skills": [], "keywords": []}'
        )
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[empty_response, good_response])
        config = MagicMock()
        config.provider = "openai"
        config.reasoning_effort = "high"
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            prompt="Extract keywords", schema_type="keywords", retries=2
        )

        assert result == {"required_skills": [], "preferred_skills": [], "keywords": []}
        calls = router.acompletion.call_args_list
        assert calls[0].kwargs["reasoning_effort"] == "high"
        assert calls[1].kwargs["reasoning_effort"] == "high"

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_json_mode_fallback_on_response_format_rejection(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """Issue #857: an OpenAI-compatible server (e.g. LM Studio) rejects
        ``response_format={"type": "json_object"}`` with a 400.

        First call: JSON mode enabled → server raises ``BadRequestError``
          ("'response_format.type' must be 'json_schema' or 'text'").
        Second call: JSON mode disabled → returns valid JSON → success.

        Before the fix the 400 was re-raised immediately (the existing fallback
        only handled malformed JSON, not rejection of the parameter itself),
        so the wizard turn failed with a 500.
        """
        import litellm

        mock_supports_json.return_value = True
        mock_get_name.return_value = "openai/gemma-4-e2b"

        # First call raises the exact LM Studio rejection over the wire.
        rejection = litellm.BadRequestError(
            "OpenAIException - Error code: 400 - "
            "{'error': \"'response_format.type' must be 'json_schema' or 'text'\"}",
            model="openai/gemma-4-e2b",
            llm_provider="openai",
        )

        good_choice = MagicMock()
        good_choice.message.content = '{"answer": "ok"}'
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[rejection, good_response])
        config = MagicMock()
        config.provider = "openai_compatible"
        config.reasoning_effort = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            prompt="Test prompt",
            schema_type="resume",
            retries=2,
        )

        assert result == {"answer": "ok"}
        # JSON mode was sent on the first (rejected) call, dropped on the retry.
        calls = router.acompletion.call_args_list
        assert calls[0].kwargs.get("response_format") == {"type": "json_object"}
        assert "response_format" not in calls[1].kwargs

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_json_mode_fallback_on_varied_rejection_wording(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """The fallback must trigger across provider wording, not just LM Studio's.

        Guards against narrowing the heuristic so much that a genuine
        response_format rejection phrased as "not supported" is missed (which
        would re-introduce issue #857 for that provider).
        """
        import litellm

        mock_supports_json.return_value = True
        mock_get_name.return_value = "openai/some-local-model"

        rejection = litellm.BadRequestError(
            "OpenAIException - Error code: 400 - "
            "{'error': 'response_format json_object is not supported by this model'}",
            model="openai/some-local-model",
            llm_provider="openai",
        )

        good_choice = MagicMock()
        good_choice.message.content = '{"answer": "ok"}'
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[rejection, good_response])
        config = MagicMock()
        config.provider = "openai_compatible"
        config.reasoning_effort = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            prompt="Test prompt", schema_type="resume", retries=2
        )

        assert result == {"answer": "ok"}
        assert "response_format" not in router.acompletion.call_args_list[1].kwargs

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_unrelated_bad_request_is_not_swallowed(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """A 400 unrelated to response_format must still propagate, not retry.

        Uses a context-length error that *also names* response_format — the
        false-positive case raised in review (cubic/Kilo). Dropping JSON mode
        would not help, so the fallback must NOT fire and the error must surface.
        """
        import litellm

        mock_supports_json.return_value = True
        mock_get_name.return_value = "openai/gpt-4o"

        rejection = litellm.BadRequestError(
            "OpenAIException - Error code: 400 - {'error': 'maximum context "
            "length exceeded while using response_format=json_object'}",
            model="openai/gpt-4o",
            llm_provider="openai",
        )

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=rejection)
        config = MagicMock()
        config.provider = "openai"
        config.reasoning_effort = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        with pytest.raises(litellm.BadRequestError):
            await complete_json(prompt="Test prompt", schema_type="resume", retries=2)

        # No retry: an unrelated 400 fails fast (Router already handles retries).
        assert router.acompletion.await_count == 1


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
        mock_get_router.return_value = (router, config)

        from app.llm import complete

        await complete(prompt="Hi", max_tokens=8192)

        mock_calc_timeout.assert_called_once_with("completion", 8192, "deepseek")
        router.acompletion.assert_awaited_once()
        assert router.acompletion.call_args.kwargs["timeout"] == 180


class TestScrubSecrets:
    """M-08: the redaction patterns must cover the providers we support."""

    def test_redacts_azure_style_api_key_header(self):
        from app.llm import _scrub_secrets

        leaked = "abcdEFGH1234567890abcdEFGH1234567890"
        text = f"AuthenticationError: request failed (api-key: {leaked})"

        out = _scrub_secrets(text)

        assert leaked not in out
        assert "<redacted>" in out

    def test_still_redacts_the_existing_patterns(self):
        from app.llm import _scrub_secrets

        assert "sk-abcd1234efgh5678" not in _scrub_secrets("key sk-abcd1234efgh5678 failed")
        assert "AIzaSyABCDEFGHIJ" not in _scrub_secrets("key AIzaSyABCDEFGHIJ failed")
        assert "tok_secret" not in _scrub_secrets("Authorization: Bearer tok_secret")


class TestGetLlmConfigApiBase:
    """Present-but-null api_base must fall back to the env default (issue #909 #3).

    ``stored.get("api_base", default)`` returns None when the key is present
    with a null value — which is exactly what an explicit "clear the Base URL"
    writes. The router's ``_effective_api_base`` already handles this; the
    runtime path in llm.py must agree so a cleared Base URL falls back to
    LLM_API_BASE instead of reaching LiteLLM as None.
    """

    def test_present_null_api_base_falls_back_to_env_default(self, monkeypatch):
        from app.llm import get_llm_config

        class FakeSettings:
            llm_provider = "openai"
            llm_model = "gpt-4o"
            llm_api_key = "env-key"
            llm_api_base = "https://env-default.example/v1"
            reasoning_effort = None

        monkeypatch.setattr("app.llm.load_config_file", lambda: {"api_base": None})
        monkeypatch.setattr("app.llm.settings", FakeSettings())

        config = get_llm_config()

        assert config.api_base == "https://env-default.example/v1"

    def test_explicit_stored_api_base_wins_over_env_default(self, monkeypatch):
        from app.llm import get_llm_config

        class FakeSettings:
            llm_provider = "openai"
            llm_model = "gpt-4o"
            llm_api_key = "env-key"
            llm_api_base = "https://env-default.example/v1"
            reasoning_effort = None

        monkeypatch.setattr(
            "app.llm.load_config_file", lambda: {"api_base": "https://stored.example/v1"}
        )
        monkeypatch.setattr("app.llm.settings", FakeSettings())

        config = get_llm_config()

        assert config.api_base == "https://stored.example/v1"

    def test_absent_api_base_key_uses_env_default(self, monkeypatch):
        from app.llm import get_llm_config

        class FakeSettings:
            llm_provider = "openai"
            llm_model = "gpt-4o"
            llm_api_key = "env-key"
            llm_api_base = "https://env-default.example/v1"
            reasoning_effort = None

        monkeypatch.setattr("app.llm.load_config_file", lambda: {})
        monkeypatch.setattr("app.llm.settings", FakeSettings())

        config = get_llm_config()

        assert config.api_base == "https://env-default.example/v1"
