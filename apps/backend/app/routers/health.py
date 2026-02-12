"""Health check and status endpoints."""

from pathlib import Path

from fastapi import APIRouter

from app.database import db
from app.llm import check_llm_health, get_llm_config
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])


def _check_github_copilot_status(config) -> dict:
    """Check GitHub Copilot auth status by inspecting the token file.
    
    This avoids triggering the OAuth device flow — it only checks
    whether LiteLLM has already cached a valid access-token on disk.
    """
    token_file = Path.home() / ".config" / "litellm" / "github_copilot" / "access-token"
    authenticated = token_file.exists()
    return {
        "healthy": authenticated,
        "provider": config.provider,
        "model": config.model,
        **({} if authenticated else {"error_code": "not_authenticated"}),
    }


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check endpoint.
    
    Checks provider-specific health without triggering OAuth flows:
    - github_copilot: checks token file on disk
    - ollama: lightweight connectivity probe (no auth)
    - others: standard LLM test call
    """
    config = get_llm_config()
    
    if config.provider == "github_copilot":
        llm_status = _check_github_copilot_status(config)
    elif config.provider == "ollama":
        llm_status = await check_llm_health()
    else:
        llm_status = await check_llm_health()

    return HealthResponse(
        status="healthy" if llm_status["healthy"] else "degraded",
        llm=llm_status,
    )


@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Get comprehensive application status.

    Returns:
        - LLM configuration status
        - Master resume existence
        - Database statistics
    """
    config = get_llm_config()

    if config.provider == "github_copilot":
        # Check token file without triggering OAuth device flow
        llm_status = _check_github_copilot_status(config)
    elif config.provider == "ollama":
        # Ollama has no auth — safe to do a real health check
        llm_status = await check_llm_health(config)
    else:
        llm_status = await check_llm_health(config)

    db_stats = db.get_stats()

    return StatusResponse(
        status="ready" if llm_status["healthy"] and db_stats["has_master_resume"] else "setup_required",
        llm_configured=bool(config.api_key) or config.provider in ("ollama", "github_copilot"),
        llm_healthy=llm_status["healthy"],
        has_master_resume=db_stats["has_master_resume"],
        database_stats=db_stats,
    )
