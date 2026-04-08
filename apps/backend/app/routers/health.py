"""Health check and status endpoints."""

import asyncio
import logging
import time
from fastapi import APIRouter

logger = logging.getLogger(__name__)

from app.database import db
from app.llm import check_llm_health, get_llm_config, LLMConfig
from app.schemas import HealthResponse, StatusResponse

router = APIRouter(tags=["Health"])

# Cache for LLM health check result to avoid hammering Ollama on every /status poll
# Keyed by "provider:model" so config changes invalidate the cache automatically.
_health_cache: dict[str, dict] = {}
_health_inflight: dict[str, "asyncio.Task[dict]"] = {}
_health_cache_lock = asyncio.Lock()
_HEALTH_CACHE_TTL = 30  # seconds


async def _run_health_check(cache_key: str, config: LLMConfig) -> dict:
    """Execute a health check, store the result, and remove the in-flight marker."""
    try:
        result = await asyncio.wait_for(check_llm_health(config), timeout=60.0)
    except Exception as e:
        logger.warning("LLM health check failed: %s", e)
        result = {"healthy": False, "error": "health check timed out or failed"}
    async with _health_cache_lock:
        _health_cache[cache_key] = {"result": result, "ts": time.monotonic()}
        _health_inflight.pop(cache_key, None)
    return result


async def _get_cached_llm_health(config: LLMConfig) -> dict:
    """Return cached health result if fresh; otherwise coalesce concurrent callers
    onto a single in-flight asyncio.Task (single-flight pattern).

    - Lock held only for fast dict reads/writes, never across I/O.
    - Concurrent requests that arrive while a check is in progress all await
      the same Task, so exactly one health check runs at a time per config key.
    """
    cache_key = f"{config.provider}:{config.model}"
    async with _health_cache_lock:
        now = time.monotonic()
        cached = _health_cache.get(cache_key)
        if cached is not None and (now - cached["ts"]) < _HEALTH_CACHE_TTL:
            return cached["result"]
        # Coalesce: reuse an in-flight task if one already exists.
        task = _health_inflight.get(cache_key)
        if task is None:
            task = asyncio.ensure_future(_run_health_check(cache_key, config))
            _health_inflight[cache_key] = task
    return await task


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
