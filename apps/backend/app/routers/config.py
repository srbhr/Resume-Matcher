"""LLM configuration endpoints."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.llm import check_llm_health, LLMConfig
from app.schemas import (
    LLMConfigRequest,
    LLMConfigResponse,
    FeatureConfigRequest,
    FeatureConfigResponse,
    LanguageConfigRequest,
    LanguageConfigResponse,
)

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
    """Save config to file."""
    path = _get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))


def _mask_api_key(key: str) -> str:
    """Mask API key for display."""
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


@router.get("/llm-api-key", response_model=LLMConfigResponse)
async def get_llm_config_endpoint() -> LLMConfigResponse:
    """Get current LLM configuration (API key masked)."""
    stored = _load_config()

    return LLMConfigResponse(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=_mask_api_key(stored.get("api_key", settings.llm_api_key)),
        api_base=stored.get("api_base", settings.llm_api_base),
    )


@router.put("/llm-api-key", response_model=LLMConfigResponse)
async def update_llm_config(request: LLMConfigRequest) -> LLMConfigResponse:
    """Update LLM configuration.

    Validates the new configuration before saving.
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

    # Validate the new configuration
    test_config = LLMConfig(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=stored.get("api_key", settings.llm_api_key),
        api_base=stored.get("api_base", settings.llm_api_base),
    )

    health = await check_llm_health(test_config)
    if not health["healthy"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid LLM configuration: {health.get('error', 'Unknown error')}",
        )

    # Save validated config
    _save_config(stored)

    return LLMConfigResponse(
        provider=test_config.provider,
        model=test_config.model,
        api_key=_mask_api_key(test_config.api_key),
        api_base=test_config.api_base,
    )


@router.post("/llm-test")
async def test_llm_connection() -> dict:
    """Test current LLM connection."""
    stored = _load_config()

    config = LLMConfig(
        provider=stored.get("provider", settings.llm_provider),
        model=stored.get("model", settings.llm_model),
        api_key=stored.get("api_key", settings.llm_api_key),
        api_base=stored.get("api_base", settings.llm_api_base),
    )

    return await check_llm_health(config)


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
SUPPORTED_LANGUAGES = ["en", "es", "zh", "ja"]


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
async def update_language_config(request: LanguageConfigRequest) -> LanguageConfigResponse:
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
