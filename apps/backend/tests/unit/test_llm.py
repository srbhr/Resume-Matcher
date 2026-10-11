"""Unit tests for LLM capability helpers in app.llm."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm import (
    JSON_MODE_VERIFIED_HOSTS,
    OPENCODE_ZEN_HY3_MODELS,
    LLMConfig,
    _appears_truncated,
    _azure_foundry_api_version,
    _extract_choice_primary_text,
    _get_retry_temperature,
    _normalize_api_base,
    _openai_compatible_supports_json_mode,
    _supports_temperature,
    _uses_opencode_zen_hy3,
    get_model_name,
    get_safe_max_tokens,
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

    def test_recognizes_only_opencode_zen_hy3(self):
        assert _uses_opencode_zen_hy3(
            LLMConfig(
                provider="openai_compatible",
                model="hy3-free",
                api_key="",
                api_base="https://opencode.ai/zen/v1",
            )
        )
        assert not _uses_opencode_zen_hy3(
            LLMConfig(
                provider="openai_compatible",
                model="hy3-free",
                api_key="",
                api_base="https://example.com/v1",
            )
        )

    def test_recognizes_opencode_zen_without_a_trailing_path_segment(self):
        config = LLMConfig(
            provider="openai_compatible",
            model="hy3-free",
            api_key="",
            api_base="https://opencode.ai/zen",
        )
        assert _uses_opencode_zen_hy3(config)
        assert _openai_compatible_supports_json_mode(config)

    @patch("app.llm.litellm.get_model_info", side_effect=Exception("unknown model"))
    def test_unknown_models_keep_conservative_token_fallback(self, _mock_model_info):
        assert get_safe_max_tokens("openai/custom-model") == 4096

    @patch("app.llm.litellm.get_model_info", side_effect=Exception("unknown model"))
    def test_opencode_hy3_gets_full_json_budget_when_unknown(self, _mock_model_info):
        config = LLMConfig(
            provider="openai_compatible",
            model="hy3-free",
            api_key="",
            api_base="https://opencode.ai/zen/v1",
        )
        assert get_safe_max_tokens("openai/hy3-free", config=config) == 8192


def test_primary_text_reads_typed_block_value_attribute():
    choice = SimpleNamespace(
        message=SimpleNamespace(
            content=[
                SimpleNamespace(
                    type="output_text",
                    value='{"required_skills": ["Python"]}',
                )
            ]
        )
    )

    assert _extract_choice_primary_text(choice) == '{"required_skills": ["Python"]}'


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
        mock_get_model_info.return_value = {"supported_openai_params": ["max_tokens"]}
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
    def test_gpt5_only_allows_default(self, mock_get_model_info: MagicMock) -> None:
        """Reasoning models without a none mode accept only default temperature."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": False,
        }
        assert _supports_temperature("gpt-5.6-terra", 0.1) is False
        assert _supports_temperature("openai/gpt-5-nano-2025-08-07", 0.7) is False
        assert _supports_temperature("azure/gpt-5.6-terra", 0.1) is False
        assert _supports_temperature("gpt-5.6-terra", 1.0) is True

    @patch("app.llm.litellm.get_model_info")
    def test_gpt51_and_gpt52_allow_sampling_with_reasoning_omitted(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """Models defaulting to no reasoning preserve non-default sampling."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": True,
            "default_reasoning_effort": "none",
        }

        assert _supports_temperature("gpt-5.1", 0.7) is True
        assert _supports_temperature("openai/gpt-5.2", 0.1) is True

    @patch("app.llm.litellm.get_model_info")
    def test_gpt51_and_gpt52_omit_sampling_with_reasoning_enabled(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """Explicit reasoning keeps non-default sampling out of the request."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": True,
            "default_reasoning_effort": "none",
        }

        assert _supports_temperature("gpt-5.1", 0.7, "medium") is False
        assert _supports_temperature("openai/gpt-5.2", 0.1, "minimal") is False
        assert _supports_temperature("gpt-5.1", 1.0, "medium") is True

    @patch("app.llm.litellm.get_model_info")
    def test_gpt5_supporting_none_but_defaulting_to_reasoning_omits_sampling(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """Supporting a none mode is not defaulting to it (gpt-5.5 shape)."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": True,
        }
        assert _supports_temperature("openai/gpt-5.5", 0.7) is False
        assert _supports_temperature("openai/gpt-5.5", 1.0) is True

        mock_get_model_info.return_value["default_reasoning_effort"] = "medium"
        assert _supports_temperature("openai/gpt-5.5", 0.7) is False

    @patch("app.llm.litellm.get_model_info")
    def test_gpt5_chat_latest_without_none_mode_omits_sampling(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """Versioned chat aliases that declare no none mode stay restricted."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
        }
        assert _supports_temperature("openai/gpt-5.1-chat-latest", 0.7) is False
        assert _supports_temperature("openai/gpt-5.1-chat-latest", 1.0) is True

    def test_ollama_gpt5_name_unaffected(self) -> None:
        """An Ollama model merely named gpt-5-* is local, not real gpt-5.

        The ollama early return fires before the carve-out. Pinned so a
        reordering does not start stripping temperature from local models.
        """
        assert _supports_temperature("ollama_chat/gpt-5.6-terra", 0.1) is True
        assert _supports_temperature("ollama/gpt-5-whatever", 0.7) is True

    @patch("app.llm.litellm.get_model_info")
    def test_unregistered_gpt5_name_already_skipped(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """A self-hosted server's own gpt-5-named model is not in the registry.

        It returns False from the registry-miss path above, before the
        carve-out, so the carve-out does not change behaviour for it.
        """
        mock_get_model_info.side_effect = Exception("model not found")
        assert _supports_temperature("openai/gpt-5-local-llama", 0.7) is False

    @patch("app.llm.litellm.get_model_info")
    def test_model_not_in_registry(self, mock_get_model_info):
        """Unknown model not in registry — be conservative, skip temperature."""
        mock_get_model_info.side_effect = Exception("model not found")
        assert _supports_temperature("unknown-vendor/model", 0.7) is False

    @patch("app.llm.litellm.get_model_info")
    def test_case_insensitive_model_name(self, mock_get_model_info: MagicMock) -> None:
        """Provider-specific checks are case-insensitive."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": False,
        }
        assert _supports_temperature("Anthropic/Claude-Opus-4-7", 0.7) is False
        assert _supports_temperature("OPENAI/KIMI-K2.6", 0.7) is False
        assert _supports_temperature("openai/KIMI-K2.6", 1.0) is True
        assert _supports_temperature("OpenAI/GPT-5.6-Terra", 0.1) is False


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
    def test_gpt5_returns_none(self, mock_get_model_info: MagicMock) -> None:
        """Restricted reasoning models omit non-default retry temperatures."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": False,
        }
        assert _get_retry_temperature("openai/gpt-5-nano-2025-08-07", 0) is None
        assert _get_retry_temperature("gpt-5.6-terra", 2) is None

    @patch("app.llm.litellm.get_model_info")
    def test_gpt51_retry_sampling_depends_on_reasoning_mode(
        self, mock_get_model_info: MagicMock
    ) -> None:
        """Content retries vary sampling only when no reasoning is configured."""
        mock_get_model_info.return_value = {
            "supported_openai_params": ["temperature", "max_tokens"],
            "supports_reasoning": True,
            "supports_none_reasoning_effort": True,
            "default_reasoning_effort": "none",
        }

        assert _get_retry_temperature("openai/gpt-5.1", 0) == 0.1
        assert _get_retry_temperature("openai/gpt-5.1", 1) == 0.3
        assert (
            _get_retry_temperature("openai/gpt-5.1", 0, reasoning_effort="medium")
            is None
        )

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

    def test_resume_empty_work_experience(self) -> None:
        """A candidate can legitimately have no work experience."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [],
            "education": [{"degree": "BS"}],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is False

    def test_resume_empty_education(self) -> None:
        """A candidate can legitimately omit education entries."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is False

    def test_resume_empty_skills(self) -> None:
        """An empty optional skill list is schema-valid."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [{"degree": "BS"}],
            "skills": [],
        }
        assert _appears_truncated(data, schema_type="resume") is False

    def test_resume_valid(self) -> None:
        """Well-formed resume with all sections present is not truncated."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            "education": [{"degree": "BS"}],
            "skills": ["Python"],
        }
        assert _appears_truncated(data, schema_type="resume") is False

    def test_resume_missing_fields_not_empty(self) -> None:
        """Missing fields are not the same as empty arrays — not flagged."""
        data = {
            "personalInfo": {"name": "John"},
            "workExperience": [{"title": "Dev"}],
            # education and skills omitted
        }
        assert _appears_truncated(data, schema_type="resume") is False

    # --- enrichment schema ---

    def test_enrichment_missing_keys(self) -> None:
        """Missing required keys in enrichment output is suspicious."""
        data = {"analysis_summary": "Good resume"}
        assert _appears_truncated(data, schema_type="enrichment") is True

    def test_enrichment_empty_arrays(self) -> None:
        """Empty items_to_enrich and questions are valid (resume already strong)."""
        data = {
            "items_to_enrich": [],
            "questions": [],
            "analysis_summary": "Already strong",
        }
        assert _appears_truncated(data, schema_type="enrichment") is False

    def test_enrichment_populated(self) -> None:
        """Populated enrichment output is not truncated."""
        data = {
            "items_to_enrich": [{"item_id": "exp_0"}],
            "questions": [{"question_id": "q_0"}],
            "analysis_summary": "Needs work",
        }
        assert _appears_truncated(data, schema_type="enrichment") is False

    # --- diff schema ---

    def test_diff_empty_changes(self) -> None:
        """Empty changes array in diff output is valid (no changes needed)."""
        data = {"changes": [], "strategy_notes": "No changes needed"}
        assert _appears_truncated(data, schema_type="diff") is False

    def test_diff_populated(self) -> None:
        """Populated diff output is not truncated."""
        data = {"changes": [{"path": "summary", "action": "replace"}]}
        assert _appears_truncated(data, schema_type="diff") is False

    # --- keywords schema ---

    def test_keywords_empty(self) -> None:
        """Empty keyword lists are valid (sparse job description)."""
        data = {"required_skills": [], "preferred_skills": [], "keywords": []}
        assert _appears_truncated(data, schema_type="keywords") is False

    # --- default / unknown schema ---

    def test_default_schema_acts_like_resume(self) -> None:
        """Default resume handling leaves usefulness to its caller validator."""
        data = {"workExperience": [], "education": [{"degree": "BS"}]}
        assert _appears_truncated(data) is False

    def test_unknown_schema_no_heuristics(self) -> None:
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
    async def test_known_compatible_endpoint_uses_json_mode(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """Verified compatible endpoints can opt into JSON mode."""
        mock_supports_json.return_value = False
        mock_get_name.return_value = "openai/hy3-free"

        choice = MagicMock()
        choice.message.content = '{"required_skills": ["Python"]}'
        response = MagicMock()
        response.choices = [choice]
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=response)
        config = LLMConfig(
            provider="openai_compatible",
            model="hy3-free",
            api_key="",
            api_base="https://opencode.ai/zen/v1",
        )
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(prompt="Extract keywords", schema_type="keywords")

        assert result == {"required_skills": ["Python"]}
        assert router.acompletion.call_args.kwargs["response_format"] == {
            "type": "json_object"
        }

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_reasoning_only_response_is_not_parsed_as_json(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        """A reasoning trace without final content must retry, not be parsed."""
        mock_supports_json.return_value = False
        mock_get_name.return_value = "openai/reasoning-model"

        reasoning_only = MagicMock()
        reasoning_only.message.content = None
        reasoning_only.message.reasoning_content = '{"required_skills": ["incorrect"]}'
        completed = MagicMock()
        completed.message.content = '{"required_skills": ["Python"]}'
        router = MagicMock()
        router.acompletion = AsyncMock(
            side_effect=[
                MagicMock(choices=[reasoning_only]),
                MagicMock(choices=[completed]),
            ]
        )
        config = MagicMock()
        config.provider = "openai_compatible"
        config.reasoning_effort = None
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            "Extract keywords", retries=1, schema_type="keywords"
        )

        assert result == {"required_skills": ["Python"]}
        assert router.acompletion.await_count == 2

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_typed_reasoning_block_is_excluded_from_final_json(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        mock_supports_json.return_value = False
        mock_get_name.return_value = "openai/hy3-free"
        choice = MagicMock()
        choice.message.content = [
            {"type": "reasoning", "text": '{"required_skills": ["incorrect"]}'},
            {"type": "output_text", "text": '{"required_skills": ["Python"]}'},
        ]
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=MagicMock(choices=[choice]))
        config = LLMConfig(
            provider="openai_compatible",
            model="hy3-free",
            api_key="",
            api_base="https://opencode.ai/zen/v1",
        )
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json("Extract keywords", schema_type="keywords")

        assert result == {"required_skills": ["Python"]}

    @pytest.mark.asyncio
    @patch("app.llm.get_router")
    @patch("app.llm.get_model_name")
    @patch("app.llm._supports_json_mode")
    async def test_opencode_hy3_json_request_disables_reasoning(
        self, mock_supports_json, mock_get_name, mock_get_router
    ):
        mock_supports_json.return_value = False
        mock_get_name.return_value = "openai/hy3-free"
        choice = MagicMock()
        choice.message.content = '{"required_skills": ["Python"]}'
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=MagicMock(choices=[choice]))
        config = LLMConfig(
            provider="openai_compatible",
            model="hy3-free",
            api_key="",
            api_base="https://opencode.ai/zen/v1",
        )
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        await complete_json("Extract keywords", schema_type="keywords")

        assert router.acompletion.call_args.kwargs["extra_body"] == {
            "reasoning_effort": "no_think"
        }

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
        good_choice.message.content = (
            '{"items_to_enrich": [], "questions": [], "analysis_summary": "ok"}'
        )
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
        good_choice.message.content = (
            '{"required_skills": [], "preferred_skills": [], "keywords": []}'
        )
        good_response = MagicMock()
        good_response.choices = [good_choice]

        router = MagicMock()
        router.acompletion = AsyncMock(side_effect=[empty_response, good_response])
        config = MagicMock()
        config.provider = "azure_foundry"
        config.reasoning_effort = "high"
        mock_get_router.return_value = (router, config)

        from app.llm import complete_json

        result = await complete_json(
            prompt="Extract keywords", schema_type="keywords", retries=2
        )

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

        assert "sk-abcd1234efgh5678" not in _scrub_secrets(
            "key sk-abcd1234efgh5678 failed"
        )
        assert "AIzaSyABCDEFGHIJ" not in _scrub_secrets("key AIzaSyABCDEFGHIJ failed")
        assert "tok_secret" not in _scrub_secrets("Authorization: Bearer tok_secret")


# ---------------------------------------------------------------------------
# OpenAI-compatible endpoint allowlists
# ---------------------------------------------------------------------------


def _compatible(
    model: str = "hy3-free", api_base: str | None = "https://opencode.ai/zen/v1"
):
    """Build an ``openai_compatible`` config for allowlist assertions."""
    return LLMConfig(
        provider="openai_compatible",
        model=model,
        api_key="",
        api_base=api_base,
    )


class TestOpenCodeZenHy3Route:
    """The Zen HY3 route must match its gateway exactly and nothing else."""

    @pytest.mark.parametrize("model", sorted(OPENCODE_ZEN_HY3_MODELS))
    def test_every_allowlisted_model_matches(self, model):
        assert _uses_opencode_zen_hy3(_compatible(model=model))

    @pytest.mark.parametrize("model", ["HY3-Free", "  hy3  ", "Hy3"])
    def test_model_matching_ignores_case_and_surrounding_space(self, model):
        assert _uses_opencode_zen_hy3(_compatible(model=model))

    @pytest.mark.parametrize(
        "api_base",
        [
            "https://opencode.ai/zen",
            "https://opencode.ai/zen/",
            "https://opencode.ai/zen/v1",
            "https://opencode.ai/zen/v1/",
            "  https://opencode.ai/zen/v1  ",
            "https://OpenCode.AI/zen/v1",
        ],
    )
    def test_gateway_path_forms_match(self, api_base):
        assert _uses_opencode_zen_hy3(_compatible(api_base=api_base))

    def test_bare_zen_path_without_trailing_segment_matches(self):
        """Regression: ``/zen`` with no trailing segment is the Zen gateway.

        A review note claimed this form was mishandled. ``path.rstrip("/")``
        normalises ``/zen`` and ``/zen/`` to ``/zen``, which the equality arm
        accepts, so both the HY3 workaround and JSON mode engage.
        """
        config = _compatible(api_base="https://opencode.ai/zen")
        assert _uses_opencode_zen_hy3(config)
        assert _openai_compatible_supports_json_mode(config)

    @pytest.mark.parametrize(
        "api_base",
        [
            "https://evil-opencode.ai/zen/v1",  # lookalike registrable domain
            "https://opencode.ai.evil.com/zen/v1",  # host as a left-hand label
            "https://zen.opencode.ai/zen/v1",  # subdomain, not the exact host
            "https://opencode.ai/zenith/v1",  # prefixed but different path
            "https://opencode.ai/v1",  # right host, not the Zen gateway
            "https://opencode.ai",  # right host, no path at all
            "https://example.com/zen/v1",  # unrelated host
        ],
    )
    def test_lookalike_hosts_and_paths_do_not_match(self, api_base):
        config = _compatible(api_base=api_base)
        assert not _uses_opencode_zen_hy3(config)
        assert not _openai_compatible_supports_json_mode(config)

    @pytest.mark.parametrize("model", ["gpt-4o", "hy3-turbo", "qwen2.5"])
    def test_other_models_on_the_zen_gateway_do_not_match(self, model):
        config = _compatible(model=model)
        assert not _uses_opencode_zen_hy3(config)
        # opencode.ai is not itself a JSON-mode-verified host: only the HY3
        # route on it is allowlisted.
        assert not _openai_compatible_supports_json_mode(config)

    def test_other_providers_never_match(self):
        assert not _uses_opencode_zen_hy3(
            LLMConfig(
                provider="openai",
                model="hy3-free",
                api_key="k",
                api_base="https://opencode.ai/zen/v1",
            )
        )

    def test_missing_api_base_does_not_match(self):
        assert not _uses_opencode_zen_hy3(_compatible(api_base=None))

    def test_route_reads_the_model_allowlist_constant(self):
        """Matching must come from the constant, not an inlined literal."""
        with patch("app.llm.OPENCODE_ZEN_HY3_MODELS", frozenset({"hy4"})):
            assert not _uses_opencode_zen_hy3(_compatible(model="hy3-free"))
            assert _uses_opencode_zen_hy3(_compatible(model="hy4"))

    def test_route_reads_the_host_constant(self):
        with patch("app.llm.OPENCODE_ZEN_HOST", "zen.example.com"):
            assert not _uses_opencode_zen_hy3(_compatible())
            assert _uses_opencode_zen_hy3(
                _compatible(api_base="https://zen.example.com/zen/v1")
            )


class TestJsonModeVerifiedHosts:
    """JSON mode is opt-in: only verified hosts (and Zen HY3) get it."""

    @pytest.mark.parametrize("host", sorted(JSON_MODE_VERIFIED_HOSTS))
    def test_every_verified_host_gets_json_mode(self, host):
        assert _openai_compatible_supports_json_mode(
            _compatible(model="step-2", api_base=f"https://{host}/v1")
        )

    def test_stepfun_gets_json_mode(self):
        assert _openai_compatible_supports_json_mode(
            _compatible(model="step-2-16k", api_base="https://api.stepfun.com/v1")
        )

    @pytest.mark.parametrize(
        "api_base",
        [
            "https://llm.internal.example.com/v1",
            "http://localhost:11434/v1",
            "https://api.stepfun.com.evil.com/v1",  # verified host as a prefix label
            "https://not-api.stepfun.com/v1",  # lookalike registrable domain
            None,
        ],
    )
    def test_unknown_endpoints_do_not_get_json_mode(self, api_base):
        assert not _openai_compatible_supports_json_mode(
            _compatible(model="some-model", api_base=api_base)
        )

    def test_non_compatible_providers_do_not_use_the_allowlist(self):
        assert not _openai_compatible_supports_json_mode(
            LLMConfig(
                provider="openai",
                model="gpt-4o",
                api_key="k",
                api_base="https://api.stepfun.com/v1",
            )
        )

    def test_json_mode_reads_the_verified_hosts_constant(self):
        """Matching must come from the constant, not an inlined literal."""
        with patch("app.llm.JSON_MODE_VERIFIED_HOSTS", frozenset({"api.example.com"})):
            assert not _openai_compatible_supports_json_mode(
                _compatible(model="step-2", api_base="https://api.stepfun.com/v1")
            )
            assert _openai_compatible_supports_json_mode(
                _compatible(model="step-2", api_base="https://api.example.com/v1")
            )


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
            "app.llm.load_config_file",
            lambda: {"api_base": "https://stored.example/v1"},
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


# ---------------------------------------------------------------------------
# Output-token parameter name (issue #1030)
# ---------------------------------------------------------------------------

MAX_TOKENS_REJECTION = (
    "OpenAIException - Unsupported parameter: 'max_tokens' is not supported "
    "with this model. Use 'max_completion_tokens' instead."
)


def _text_response(text: str = "pong") -> MagicMock:
    choice = MagicMock()
    choice.message.content = text
    response = MagicMock()
    response.choices = [choice]
    return response


def _bad_request(message: str, provider: str = "openai") -> Exception:
    import litellm

    return litellm.BadRequestError(message, model="some-model", llm_provider=provider)


class TestOutputTokenParameter:
    """LiteLLM only remaps ``max_tokens`` -> ``max_completion_tokens`` for model
    names it recognises, so an unknown or new OpenAI model got the raw
    ``max_tokens`` and OpenAI rejected it (issue #1030). The native OpenAI
    provider now always sends ``max_completion_tokens``.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "model", ["gpt-4o", "gpt-6.1-sol", "o5-mini", "gpt-5-chat-latest"]
    )
    async def test_health_check_openai_sends_max_completion_tokens(self, model):
        from app.llm import check_llm_health

        config = LLMConfig(provider="openai", model=model, api_key="sk-test")
        acompletion = AsyncMock(return_value=_text_response())

        with patch("app.llm.litellm.acompletion", acompletion):
            result = await check_llm_health(config)

        assert result["healthy"] is True
        kwargs = acompletion.call_args.kwargs
        assert kwargs["max_completion_tokens"] == 64
        assert "max_tokens" not in kwargs

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("provider", "model", "api_base"),
        [
            ("anthropic", "claude-sonnet-4-5", None),
            ("gemini", "gemini-2.5-flash", None),
            ("deepseek", "deepseek-chat", None),
            ("openrouter", "openai/gpt-5", None),
            ("openai_compatible", "local-model", "http://localhost:8080/v1"),
            # A custom endpoint behind the openai provider (llama.cpp, vLLM,
            # an older compatible server) keeps the portable max_tokens.
            ("openai", "local-model", "http://localhost:8080/v1"),
        ],
    )
    async def test_health_check_other_providers_keep_max_tokens(
        self, provider, model, api_base
    ):
        from app.llm import check_llm_health

        config = LLMConfig(
            provider=provider, model=model, api_key="key", api_base=api_base
        )
        acompletion = AsyncMock(return_value=_text_response())

        with patch("app.llm.litellm.acompletion", acompletion):
            await check_llm_health(config)

        kwargs = acompletion.call_args.kwargs
        assert kwargs["max_tokens"] == 64
        assert "max_completion_tokens" not in kwargs

    @pytest.mark.asyncio
    async def test_health_check_openai_with_explicit_openai_base(self):
        from app.llm import check_llm_health

        config = LLMConfig(
            provider="openai",
            model="o5-mini",
            api_key="sk-test",
            api_base="https://api.openai.com/v1",
        )
        acompletion = AsyncMock(return_value=_text_response())

        with patch("app.llm.litellm.acompletion", acompletion):
            await check_llm_health(config)

        kwargs = acompletion.call_args.kwargs
        assert kwargs["max_completion_tokens"] == 64
        assert "max_tokens" not in kwargs

    @pytest.mark.asyncio
    @patch("app.llm._supports_temperature", return_value=True)
    @patch("app.llm.get_router")
    async def test_complete_keeps_the_clamped_value_under_the_new_key(
        self, mock_get_router, _mock_supports_temp
    ):
        from app.llm import complete

        config = LLMConfig(provider="openai", model="o5-mini", api_key="sk-test")
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=_text_response("Hello"))
        mock_get_router.return_value = (router, config)

        with patch("app.llm._calculate_timeout", return_value=90) as calc_timeout:
            await complete(prompt="Hi", max_tokens=2048)

        kwargs = router.acompletion.call_args.kwargs
        assert kwargs["max_completion_tokens"] == 2048
        assert "max_tokens" not in kwargs
        # The timeout scaling still sees the plain token budget.
        calc_timeout.assert_called_once_with("completion", 2048, "openai")

    @pytest.mark.asyncio
    @patch("app.llm._supports_json_mode", return_value=False)
    @patch("app.llm.get_router")
    async def test_complete_json_openai_sends_max_completion_tokens(
        self, mock_get_router, _mock_supports_json
    ):
        from app.llm import complete_json

        config = LLMConfig(provider="openai", model="o5-mini", api_key="sk-test")
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=_text_response('{"ok": true}'))
        mock_get_router.return_value = (router, config)

        result = await complete_json(
            prompt="Extract", max_tokens=3000, schema_type="keywords"
        )

        assert result == {"ok": True}
        kwargs = router.acompletion.call_args.kwargs
        assert kwargs["max_completion_tokens"] == 3000
        assert "max_tokens" not in kwargs

    @pytest.mark.asyncio
    @pytest.mark.parametrize("provider", ["anthropic", "gemini"])
    @patch("app.llm._supports_temperature", return_value=True)
    @patch("app.llm.get_router")
    async def test_complete_other_providers_keep_max_tokens(
        self, mock_get_router, _mock_supports_temp, provider
    ):
        from app.llm import complete

        config = LLMConfig(provider=provider, model="some-model", api_key="key")
        router = MagicMock()
        router.acompletion = AsyncMock(return_value=_text_response("Hello"))
        mock_get_router.return_value = (router, config)

        await complete(prompt="Hi", max_tokens=2048)

        kwargs = router.acompletion.call_args.kwargs
        assert kwargs["max_tokens"] == 2048
        assert "max_completion_tokens" not in kwargs

    def test_litellm_passes_max_completion_tokens_through_for_openai(self):
        """Pin the LiteLLM behaviour the fix relies on: known and unknown models
        alike keep ``max_completion_tokens`` for the openai provider."""
        from litellm.utils import get_optional_params

        for model in ("gpt-4o", "gpt-4.1", "gpt-5", "o5-mini", "gpt-5-chat-latest"):
            params = get_optional_params(
                model=model, custom_llm_provider="openai", max_completion_tokens=64
            )
            assert params["max_completion_tokens"] == 64, model
            assert "max_tokens" not in params, model


class TestMaxTokensRejectionFallback:
    """Azure, OpenRouter and compatible servers that front a reasoning model
    reject ``max_tokens`` with a 400 that names ``max_completion_tokens``. The
    call is retried exactly once with the kwarg swapped (issue #1030)."""

    @staticmethod
    def _config(provider: str) -> LLMConfig:
        return LLMConfig(provider=provider, model="some-model", api_key="key")

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "provider", ["azure_foundry", "openai_compatible", "openrouter", "openai"]
    )
    async def test_retries_once_with_max_completion_tokens(self, provider):
        from app.llm import _route_acompletion

        response = _text_response()
        transport = MagicMock()
        transport.acompletion = AsyncMock(
            side_effect=[_bad_request(MAX_TOKENS_REJECTION), response]
        )

        result = await _route_acompletion(
            self._config(provider),
            transport,
            model="primary",
            messages=[],
            max_tokens=4096,
            timeout=30,
        )

        assert result is response
        assert transport.acompletion.await_count == 2
        first, second = (c.kwargs for c in transport.acompletion.call_args_list)
        assert first["max_tokens"] == 4096
        assert "max_completion_tokens" not in first
        assert second["max_completion_tokens"] == 4096
        assert "max_tokens" not in second
        # Everything else is passed through untouched.
        assert second["model"] == "primary"
        assert second["timeout"] == 30

    @pytest.mark.asyncio
    async def test_other_bad_requests_are_reraised_without_retry(self):
        from app.llm import _route_acompletion

        error = _bad_request(
            "OpenAIException - This model's maximum context length is 8192 "
            "tokens. However, you requested 9000 tokens (max_tokens)."
        )
        transport = MagicMock()
        transport.acompletion = AsyncMock(side_effect=error)

        with pytest.raises(type(error)) as exc_info:
            await _route_acompletion(
                self._config("azure_foundry"), transport, max_tokens=4096
            )

        assert exc_info.value is error
        assert transport.acompletion.await_count == 1

    @pytest.mark.asyncio
    async def test_reverse_rejection_is_not_retried(self):
        """A server that rejects ``max_completion_tokens`` and asks for
        ``max_tokens`` must not be answered with another swap."""
        from app.llm import _route_acompletion

        error = _bad_request(
            "Unsupported parameter: 'max_completion_tokens' is not supported "
            "with this model. Use 'max_tokens' instead."
        )
        transport = MagicMock()
        transport.acompletion = AsyncMock(side_effect=error)

        with pytest.raises(type(error)):
            await _route_acompletion(
                self._config("openai_compatible"),
                transport,
                max_completion_tokens=4096,
            )

        assert transport.acompletion.await_count == 1

    @pytest.mark.asyncio
    async def test_no_retry_when_max_tokens_was_not_sent(self):
        from app.llm import _route_acompletion

        error = _bad_request(MAX_TOKENS_REJECTION)
        transport = MagicMock()
        transport.acompletion = AsyncMock(side_effect=error)

        with pytest.raises(type(error)):
            await _route_acompletion(
                self._config("openai_compatible"),
                transport,
                max_completion_tokens=4096,
            )

        assert transport.acompletion.await_count == 1

    @pytest.mark.asyncio
    async def test_retries_only_once(self):
        from app.llm import _route_acompletion

        second = _bad_request(MAX_TOKENS_REJECTION)
        transport = MagicMock()
        transport.acompletion = AsyncMock(
            side_effect=[_bad_request(MAX_TOKENS_REJECTION), second]
        )

        with pytest.raises(type(second)) as exc_info:
            await _route_acompletion(
                self._config("azure_foundry"), transport, max_tokens=4096
            )

        assert exc_info.value is second
        assert transport.acompletion.await_count == 2

    @pytest.mark.asyncio
    async def test_non_bad_request_errors_are_not_retried(self):
        from app.llm import _route_acompletion

        transport = MagicMock()
        transport.acompletion = AsyncMock(side_effect=ValueError(MAX_TOKENS_REJECTION))

        with pytest.raises(ValueError):
            await _route_acompletion(
                self._config("azure_foundry"), transport, max_tokens=4096
            )

        assert transport.acompletion.await_count == 1

    @pytest.mark.asyncio
    async def test_health_check_recovers_for_openai_compatible(self):
        from app.llm import check_llm_health

        config = LLMConfig(
            provider="openai_compatible",
            model="reasoning-model",
            api_key="key",
            api_base="https://compat.example/v1",
        )
        acompletion = AsyncMock(
            side_effect=[_bad_request(MAX_TOKENS_REJECTION), _text_response()]
        )

        with patch("app.llm.litellm.acompletion", acompletion):
            result = await check_llm_health(config)

        assert result["healthy"] is True
        assert acompletion.await_count == 2
        assert acompletion.call_args.kwargs["max_completion_tokens"] == 64

    @pytest.mark.asyncio
    @patch("app.llm._supports_temperature", return_value=True)
    @patch("app.llm.get_router")
    async def test_complete_recovers_for_azure(
        self, mock_get_router, _mock_supports_temp
    ):
        from app.llm import complete

        config = self._config("azure_foundry")
        router = MagicMock()
        router.acompletion = AsyncMock(
            side_effect=[_bad_request(MAX_TOKENS_REJECTION), _text_response("Hello")]
        )
        mock_get_router.return_value = (router, config)

        result = await complete(prompt="Hi", max_tokens=2048)

        assert result == "Hello"
        assert router.acompletion.await_count == 2
        assert router.acompletion.call_args.kwargs["max_completion_tokens"] == 2048
