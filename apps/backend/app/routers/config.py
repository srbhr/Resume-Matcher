"""LLM configuration endpoints."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.config import settings
from app.llm import check_llm_health, LLMConfig, resolve_api_key
from app.schemas import (
    LLMConfigRequest,
    LLMConfigResponse,
    FeatureConfigRequest,
    FeatureConfigResponse,
    FeaturePromptsRequest,
    FeaturePromptsResponse,
    LanguageConfigRequest,
    LanguageConfigResponse,
    PromptConfigRequest,
    PromptConfigResponse,
    PromptOption,
    ApiKeyProviderStatus,
    ApiKeyStatusResponse,
    ApiKeysUpdateRequest,
    ApiKeysUpdateResponse,
    ResetDatabaseRequest,
)
from app.prompts import (
    DEFAULT_IMPROVE_PROMPT_ID,
    IMPROVE_PROMPT_OPTIONS,
    validate_prompt_placeholders,
)
from app.prompts.templates import COVER_LETTER_PROMPT, OUTREACH_MESSAGE_PROMPT
from app.config import (
    get_api_keys_from_config,
    save_api_keys_to_config,
    delete_api_key_from_config,
    clear_all_api_keys,
)
from app.config_cache import invalidate_config_cache
from app.database import db

router = APIRouter(prefix="/config", tags=["Configuration"])


def _get_config_path() -> Path:
    """Get path to config storage file."""
    return settings.config_path


def _load_config() -> dict:
    """Load config from file."""
    path = _get_config_path()
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_config(config: dict) -> None:
    """Save config to file and invalidate the resume router's cache."""
    path = _get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))
    invalidate_config_cache()


def _mask_api_key(key: str) -> str:
    """Mask API key for display."""
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def _get_prompt_options() -> list[PromptOption]:
    """Return available prompt options for resume tailoring."""
    return [PromptOption(**option) for option in IMPROVE_PROMPT_OPTIONS]


async def _log_llm_health_check(config: LLMConfig) -> None:
    """Run a best-effort health check and log outcome without affecting API responses."""
    try:
        health = await check_llm_health(config)
        if not health.get("healthy", False):
            logging.warning(
                "LLM config saved but health check failed",
                extra={"provider": config.provider, "model": config.model},
            )
    except Exception:
        logging.exception(
            "LLM config saved but health check raised exception",
            extra={"provider": config.provider, "model": config.model},
        )


@router.get("/llm-api-key", response_model=LLMConfigResponse)
async def get_llm_config_endpoint() -> LLMConfigResponse:
    """Get current LLM configuration (API key masked)."""
    stored = _load_config()

    provider = stored.get("provider", settings.llm_provider)
    reasoning_effort = stored.get("reasoning_effort", settings.reasoning_effort)
    return LLMConfigResponse(
        provider=provider,
        model=stored.get("model", settings.llm_model),
        api_key=_mask_api_key(resolve_api_key(stored, provider)),
        api_base=stored.get("api_base", settings.llm_api_base),
        reasoning_effort=reasoning_effort or None,
    )


@router.put("/llm-api-key", response_model=LLMConfigResponse)
async def update_llm_config(
    request: LLMConfigRequest,
    background_tasks: BackgroundTasks,
) -> LLMConfigResponse:
    """Update LLM configuration.

    Saves the configuration and returns it (API key masked).

    Note: We intentionally do NOT hard-fail the update based on a live health check.
    Users may configure proxies/aggregators or temporarily unavailable endpoints and
    still need to persist the configuration. Connectivity can be verified via
    `/config/llm-test` and the System Status panel.
    """
    stored = _load_config()

    # Update only provided fields
    if request.provider is not None:
        stored["provider"] = request.provider
    if request.model is not None:
        stored["model"] = request.model
    if request.api_key is not None:
        stored["api_key"] = request.api_key
    if request.api_base is not None:
        stored["api_base"] = request.api_base
    if request.reasoning_effort is not None:
        # Persist empty string on clear so the gpt-5 auto-migration doesn't
        # re-fire on next get_llm_config() call.
        stored["reasoning_effort"] = request.reasoning_effort

    # Build normalized config for response and background health check
    resolved_provider = stored.get("provider", settings.llm_provider)
    raw_re = stored.get("reasoning_effort", settings.reasoning_effort)
    resolved_reasoning_effort = raw_re if raw_re else None
    test_config = LLMConfig(
        provider=resolved_provider,
        model=stored.get("model", settings.llm_model),
        api_key=resolve_api_key(stored, resolved_provider),
        api_base=stored.get("api_base", settings.llm_api_base),
        reasoning_effort=resolved_reasoning_effort,
    )

    # Save config regardless of health check outcome (see docstring).
    _save_config(stored)

    # Best-effort health check for server-side logs/diagnostics (do not block response).
    background_tasks.add_task(_log_llm_health_check, test_config)

    return LLMConfigResponse(
        provider=test_config.provider,
        model=test_config.model,
        api_key=_mask_api_key(test_config.api_key),
        api_base=test_config.api_base,
        reasoning_effort=test_config.reasoning_effort,
    )


@router.post("/llm-test")
async def test_llm_connection(request: LLMConfigRequest | None = None) -> dict:
    """Test LLM connection with provided or stored configuration.

    If request body is provided, tests with those values (for pre-save testing).
    Otherwise, tests with the currently saved configuration.
    """
    stored = _load_config()

    # Build config: use request values if provided, otherwise fall back to stored/default
    test_provider = (
        request.provider
        if request and request.provider
        else stored.get("provider", settings.llm_provider)
    )
    config = LLMConfig(
        provider=test_provider,
        model=(
            request.model
            if request and request.model
            else stored.get("model", settings.llm_model)
        ),
        api_key=(
            request.api_key
            if request and request.api_key
            else resolve_api_key(stored, test_provider)
        ),
        api_base=(
            request.api_base
            if request and request.api_base is not None
            else stored.get("api_base", settings.llm_api_base)
        ),
        reasoning_effort=(
            (request.reasoning_effort or None)
            if request and request.reasoning_effort is not None
            else (stored.get("reasoning_effort") or settings.reasoning_effort) or None
        ),
    )

    test_prompt = "Hi"
    return await check_llm_health(config, include_details=True, test_prompt=test_prompt)


@router.get("/features", response_model=FeatureConfigResponse)
async def get_feature_config() -> FeatureConfigResponse:
    """Get current feature configuration."""
    stored = _load_config()

    return FeatureConfigResponse(
        enable_cover_letter=stored.get("enable_cover_letter", False),
        enable_outreach_message=stored.get("enable_outreach_message", False),
    )


@router.put("/features", response_model=FeatureConfigResponse)
async def update_feature_config(request: FeatureConfigRequest) -> FeatureConfigResponse:
    """Update feature configuration."""
    stored = _load_config()

    # Update only provided fields
    if request.enable_cover_letter is not None:
        stored["enable_cover_letter"] = request.enable_cover_letter
    if request.enable_outreach_message is not None:
        stored["enable_outreach_message"] = request.enable_outreach_message

    # Save config
    _save_config(stored)

    return FeatureConfigResponse(
        enable_cover_letter=stored.get("enable_cover_letter", False),
        enable_outreach_message=stored.get("enable_outreach_message", False),
    )


# Supported languages for i18n
SUPPORTED_LANGUAGES = ["en", "es", "zh", "ja", "pt"]


@router.get("/language", response_model=LanguageConfigResponse)
async def get_language_config() -> LanguageConfigResponse:
    """Get current language configuration."""
    stored = _load_config()

    # Support legacy single 'language' field migration
    legacy_language = stored.get("language", "en")

    return LanguageConfigResponse(
        ui_language=stored.get("ui_language", legacy_language),
        content_language=stored.get("content_language", legacy_language),
        supported_languages=SUPPORTED_LANGUAGES,
    )


@router.put("/language", response_model=LanguageConfigResponse)
async def update_language_config(
    request: LanguageConfigRequest,
) -> LanguageConfigResponse:
    """Update language configuration."""
    stored = _load_config()

    # Validate and update UI language
    if request.ui_language is not None:
        if request.ui_language not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported UI language: {request.ui_language}. Supported: {SUPPORTED_LANGUAGES}",
            )
        stored["ui_language"] = request.ui_language

    # Validate and update content language
    if request.content_language is not None:
        if request.content_language not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported content language: {request.content_language}. Supported: {SUPPORTED_LANGUAGES}",
            )
        stored["content_language"] = request.content_language

    # Save config
    _save_config(stored)

    # Support legacy single 'language' field migration
    legacy_language = stored.get("language", "en")

    return LanguageConfigResponse(
        ui_language=stored.get("ui_language", legacy_language),
        content_language=stored.get("content_language", legacy_language),
        supported_languages=SUPPORTED_LANGUAGES,
    )


@router.get("/prompts", response_model=PromptConfigResponse)
async def get_prompt_config() -> PromptConfigResponse:
    """Get current prompt configuration for resume tailoring."""
    stored = _load_config()
    options = _get_prompt_options()
    option_ids = {option.id for option in options}
    default_prompt_id = stored.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    if default_prompt_id not in option_ids:
        default_prompt_id = DEFAULT_IMPROVE_PROMPT_ID

    return PromptConfigResponse(
        default_prompt_id=default_prompt_id,
        prompt_options=options,
    )


@router.put("/prompts", response_model=PromptConfigResponse)
async def update_prompt_config(
    request: PromptConfigRequest,
) -> PromptConfigResponse:
    """Update prompt configuration for resume tailoring."""
    stored = _load_config()
    options = _get_prompt_options()
    option_ids = {option.id for option in options}

    if request.default_prompt_id is not None:
        if request.default_prompt_id not in option_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported prompt id: "
                    f"{request.default_prompt_id}. Supported: {sorted(option_ids)}"
                ),
            )
        stored["default_prompt_id"] = request.default_prompt_id

    _save_config(stored)

    default_prompt_id = stored.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    if default_prompt_id not in option_ids:
        default_prompt_id = DEFAULT_IMPROVE_PROMPT_ID

    return PromptConfigResponse(
        default_prompt_id=default_prompt_id,
        prompt_options=options,
    )


@router.get("/feature-prompts", response_model=FeaturePromptsResponse)
async def get_feature_prompts() -> FeaturePromptsResponse:
    """Get custom feature prompts (cover letter, outreach message).

    Empty strings mean "use default". The ``*_default`` fields expose the
    built-in prompts so the UI can show them as placeholder text without
    duplicating the content client-side.
    """
    stored = _load_config()
    return FeaturePromptsResponse(
        cover_letter_prompt=stored.get("cover_letter_prompt", "") or "",
        outreach_message_prompt=stored.get("outreach_message_prompt", "") or "",
        cover_letter_default=COVER_LETTER_PROMPT,
        outreach_message_default=OUTREACH_MESSAGE_PROMPT,
    )


@router.put("/feature-prompts", response_model=FeaturePromptsResponse)
async def update_feature_prompts(
    request: FeaturePromptsRequest,
) -> FeaturePromptsResponse:
    """Update custom feature prompts.

    Non-empty prompts are validated for the three required placeholders
    (``{job_description}``, ``{resume_data}``, ``{output_language}``).
    Missing placeholders return a 422 with a structured detail so the UI
    can list exactly which ones are absent. Empty strings clear the
    override — persisted as ``""`` so runtime resolution falls back to the
    built-in default.
    """
    stored = _load_config()

    if request.cover_letter_prompt is not None:
        prompt = request.cover_letter_prompt.strip()
        if prompt:
            missing = validate_prompt_placeholders(prompt)
            if missing:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "missing_placeholders",
                        "field": "cover_letter_prompt",
                        "missing": missing,
                    },
                )
        stored["cover_letter_prompt"] = prompt

    if request.outreach_message_prompt is not None:
        prompt = request.outreach_message_prompt.strip()
        if prompt:
            missing = validate_prompt_placeholders(prompt)
            if missing:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "missing_placeholders",
                        "field": "outreach_message_prompt",
                        "missing": missing,
                    },
                )
        stored["outreach_message_prompt"] = prompt

    _save_config(stored)

    return FeaturePromptsResponse(
        cover_letter_prompt=stored.get("cover_letter_prompt", "") or "",
        outreach_message_prompt=stored.get("outreach_message_prompt", "") or "",
        cover_letter_default=COVER_LETTER_PROMPT,
        outreach_message_default=OUTREACH_MESSAGE_PROMPT,
    )


# Supported API key providers
SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "openrouter", "deepseek"]


def _mask_key_short(key: str | None) -> str | None:
    """Mask API key showing only last 4 characters."""
    if not key:
        return None
    if len(key) <= 4:
        return "*" * len(key)
    return "..." + key[-4:]


@router.get("/api-keys", response_model=ApiKeyStatusResponse)
async def get_api_keys_status() -> ApiKeyStatusResponse:
    """Get status of all configured API keys (masked).

    Returns the configuration status for each supported provider.
    API keys are masked to show only the last 4 characters.
    """
    stored_keys = get_api_keys_from_config()

    providers = []
    for provider in SUPPORTED_PROVIDERS:
        key = stored_keys.get(provider)
        providers.append(
            ApiKeyProviderStatus(
                provider=provider,
                configured=bool(key),
                masked_key=_mask_key_short(key),
            )
        )

    return ApiKeyStatusResponse(providers=providers)


@router.post("/api-keys", response_model=ApiKeysUpdateResponse)
async def update_api_keys(request: ApiKeysUpdateRequest) -> ApiKeysUpdateResponse:
    """Update API keys for one or more providers.

    Only updates the providers that are explicitly set in the request.
    Empty strings will clear the key for that provider.
    """
    stored_keys = get_api_keys_from_config()
    updated = []

    # Update each provider if provided in request
    if request.openai is not None:
        if request.openai:
            stored_keys["openai"] = request.openai
        elif "openai" in stored_keys:
            del stored_keys["openai"]
        updated.append("openai")

    if request.anthropic is not None:
        if request.anthropic:
            stored_keys["anthropic"] = request.anthropic
        elif "anthropic" in stored_keys:
            del stored_keys["anthropic"]
        updated.append("anthropic")

    if request.google is not None:
        if request.google:
            stored_keys["google"] = request.google
        elif "google" in stored_keys:
            del stored_keys["google"]
        updated.append("google")

    if request.openrouter is not None:
        if request.openrouter:
            stored_keys["openrouter"] = request.openrouter
        elif "openrouter" in stored_keys:
            del stored_keys["openrouter"]
        updated.append("openrouter")

    if request.deepseek is not None:
        if request.deepseek:
            stored_keys["deepseek"] = request.deepseek
        elif "deepseek" in stored_keys:
            del stored_keys["deepseek"]
        updated.append("deepseek")

    save_api_keys_to_config(stored_keys)
    invalidate_config_cache()

    return ApiKeysUpdateResponse(
        message=f"Updated {len(updated)} API key(s)",
        updated_providers=updated,
    )


@router.delete("/api-keys")
async def delete_all_api_keys(confirm: str | None = None) -> dict:
    """Clear all configured API keys.

    This is a destructive operation. Requires confirmation token.

    Args:
        confirm: Must be "CLEAR_ALL_KEYS" to execute

    Returns:
        Success message

    Note:
        This is a local-only endpoint for single-user deployments.
        In production/multi-user scenarios, add proper authentication.
    """
    if confirm != "CLEAR_ALL_KEYS":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Pass confirm=CLEAR_ALL_KEYS query parameter.",
        )
    clear_all_api_keys()
    invalidate_config_cache()
    return {"message": "All API keys have been cleared"}


@router.delete("/api-keys/{provider}")
async def delete_api_key(provider: str) -> dict:
    """Delete API key for a specific provider.

    Args:
        provider: The provider name (openai, anthropic, google, openrouter, deepseek)

    Returns:
        Success message
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider: {provider}. Supported: {SUPPORTED_PROVIDERS}",
        )

    delete_api_key_from_config(provider)
    invalidate_config_cache()

    return {"message": f"API key for {provider} has been removed"}


@router.post("/reset")
async def reset_database_endpoint(request: ResetDatabaseRequest) -> dict:
    """Reset the database and clear all data.

    WARNING: This action is irreversible. It will:
    1. Truncate all database tables (resumes, jobs, improvements)
    2. Delete all uploaded files

    Requires confirmation token for safety.

    Args:
        request: Request body containing confirmation token

    Returns:
        Success message

    Note:
        This is a local-only endpoint for single-user deployments.
        In production/multi-user scenarios, add proper authentication.
    """
    if request.confirm != "RESET_ALL_DATA":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Pass confirm=RESET_ALL_DATA in request body.",
        )
    db.reset_database()
    return {"message": "Database and all data have been reset successfully"}
