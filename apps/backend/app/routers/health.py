"""Health check and status endpoints."""

import asyncio
import logging
import time
from fastapi import APIRouter

logger = logging.getLogger(__name__)

from app.database import db
from app.llm import check_llm_health, get_llm_config
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])

# Cache for LLM health check result to avoid hammering Ollama on every /status poll
_health_cache: dict = {"result": None, "ts": 0.0}
_HEALTH_CACHE_TTL = 30  # seconds


async def _get_cached_llm_health(config) -> dict:  # type: ignore[no-untyped-def]
    """Return cached health result if fresh, otherwise run a new check."""
    now = time.monotonic()
    if _health_cache["result"] is not None and (now - _health_cache["ts"]) < _HEALTH_CACHE_TTL:
        return _health_cache["result"]
    try:
        result = await asyncio.wait_for(check_llm_health(config), timeout=60.0)
    except Exception as e:
        logger.warning("LLM health check failed: %s", e)
        result = {"healthy": False, "error": "health check timed out or failed"}
    _health_cache["result"] = result
    _health_cache["ts"] = now
    return result


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Basic health check endpoint."""
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
    llm_status = await _get_cached_llm_health(config)
    db_stats = db.get_stats()

    return StatusResponse(
        status="ready" if llm_status["healthy"] and db_stats["has_master_resume"] else "setup_required",
        llm_configured=bool(config.api_key) or config.provider == "ollama",
        llm_healthy=llm_status["healthy"],
        has_master_resume=db_stats["has_master_resume"],
        database_stats=db_stats,
    )
