import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.pydantic import LLMApiKeyResponse, LLMApiKeyUpdate


config_router = APIRouter(prefix="/config", tags=["config"])

ENV_PATH = Path(__file__).resolve().parents[4] / ".env"


def _write_env_value(key: str, value: str) -> None:
    value = value or ""
    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    updated = False
    new_lines: list[str] = []
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        new_lines.append(f"{key}={value}")

    text = "\n".join(new_lines) + "\n"
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENV_PATH.write_text(text, encoding="utf-8")


@config_router.get("/llm-api-key", response_model=LLMApiKeyResponse)
async def get_llm_api_key() -> LLMApiKeyResponse:
    current = settings.LLM_API_KEY or os.getenv("LLM_API_KEY", "")
    return LLMApiKeyResponse(api_key=current or "")


# Default OpenAI embedding model for automatic configuration
_DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"


@config_router.put("/llm-api-key", response_model=LLMApiKeyResponse)
async def update_llm_api_key(payload: LLMApiKeyUpdate) -> LLMApiKeyResponse:
    """
    Update the LLM API key.
    
    When an OpenAI API key is provided, this endpoint automatically configures
    the full embedding pipeline to ensure the "Improve Resume" feature works
    out of the box:
    
    - LLM_API_KEY: Set to the provided key
    - LLM_PROVIDER: Set to "openai" (if key looks like an OpenAI key)
    - EMBEDDING_API_KEY: Synced to the same key
    - EMBEDDING_PROVIDER: Set to "openai"
    - EMBEDDING_MODEL: Set to a sensible default (text-embedding-3-small)
    
    Users who need different configurations can still override these values
    manually in the .env file.
    """
    try:
        clean_value = payload.api_key or ""
        
        # Update LLM_API_KEY
        _write_env_value("LLM_API_KEY", clean_value)
        settings.LLM_API_KEY = clean_value  # type: ignore[attr-defined]
        os.environ["LLM_API_KEY"] = clean_value
        
        # Sync EMBEDDING_API_KEY so embeddings work out of the box
        _write_env_value("EMBEDDING_API_KEY", clean_value)
        settings.EMBEDDING_API_KEY = clean_value  # type: ignore[attr-defined]
        os.environ["EMBEDDING_API_KEY"] = clean_value
        
        # If this looks like an OpenAI key, configure the full OpenAI pipeline
        # OpenAI keys typically start with "sk-" (standard) or "sk-proj-" (project)
        if clean_value.startswith("sk-"):
            # Set LLM provider to OpenAI
            _write_env_value("LLM_PROVIDER", "openai")
            settings.LLM_PROVIDER = "openai"  # type: ignore[attr-defined]
            os.environ["LLM_PROVIDER"] = "openai"
            
            # Set embedding provider to OpenAI
            _write_env_value("EMBEDDING_PROVIDER", "openai")
            settings.EMBEDDING_PROVIDER = "openai"  # type: ignore[attr-defined]
            os.environ["EMBEDDING_PROVIDER"] = "openai"
            
            # Set a sensible default embedding model if not already configured for OpenAI
            current_model = settings.EMBEDDING_MODEL or ""
            is_ollama_model = (
                not current_model 
                or ":" in current_model  # Ollama models use "name:tag" format
                or current_model.startswith("dengcao/")  # Default Ollama model
            )
            if is_ollama_model:
                _write_env_value("EMBEDDING_MODEL", _DEFAULT_OPENAI_EMBEDDING_MODEL)
                settings.EMBEDDING_MODEL = _DEFAULT_OPENAI_EMBEDDING_MODEL  # type: ignore[attr-defined]
                os.environ["EMBEDDING_MODEL"] = _DEFAULT_OPENAI_EMBEDDING_MODEL
        
        return LLMApiKeyResponse(api_key=clean_value)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist API key.",
        ) from exc
