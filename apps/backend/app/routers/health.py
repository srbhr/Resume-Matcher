"""Health check and status endpoints."""

from fastapi import APIRouter

from app.database import db
from app.llm import check_llm_health, get_llm_config
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Liveness and readiness check.

    Calls the LLM provider to verify connectivity. Returns 'degraded' if the
    LLM is unreachable or misconfigured, 'healthy' otherwise.
    """
    config = get_llm_config()
    llm_status = await check_llm_health(config)
    status = "healthy" if llm_status["healthy"] else "degraded"
    return HealthResponse(status=status)


@router.get("/status", response_model=StatusResponse)
async def get_status() -> StatusResponse:
    """Get comprehensive application status.

    Returns:
        - LLM configuration status
        - Master resume existence
        - Database statistics
    """
    config = get_llm_config()
    llm_status = await check_llm_health(config)
    db_stats = db.get_stats()

    return StatusResponse(
        status="ready" if llm_status["healthy"] and db_stats["has_master_resume"] else "setup_required",
        llm_configured=bool(config.api_key) or config.provider == "ollama",
        llm_healthy=llm_status["healthy"],
        has_master_resume=db_stats["has_master_resume"],
        database_stats=db_stats,
    )
