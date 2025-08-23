from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models import LLMCacheIndex, LLMCache
from app.metrics import counters as metrics_counters

cache_router = APIRouter(tags=["cache"], prefix="/cache")

@cache_router.delete("/entity/{entity_type}/{entity_id}", summary="Invalidate cache entries linked to an entity")
async def invalidate_entity_cache(entity_type: str, entity_id: str, db: AsyncSession = Depends(get_db_session)):
    if not entity_type or not entity_id:
        raise HTTPException(status_code=400, detail="entity_type and entity_id required")
    idx_stmt = select(LLMCacheIndex.cache_key).where(
        LLMCacheIndex.entity_type == entity_type,
        LLMCacheIndex.entity_id == entity_id,
    )
    rows = (await db.execute(idx_stmt)).scalars().all()
    if not rows:
        return {"deleted": 0, "cache_keys": [], "message": "no entries"}
    del_idx_stmt = delete(LLMCacheIndex).where(LLMCacheIndex.cache_key.in_(rows))
    await db.execute(del_idx_stmt)
    del_cache_stmt = delete(LLMCache).where(LLMCache.cache_key.in_(rows))
    result = await db.execute(del_cache_stmt)
    await db.commit()
    # Update in-process counters
    metrics_counters.INVALIDATION_DELETES += (result.rowcount or 0)
    metrics_counters.LAST_INVALIDATION_AT = datetime.now(timezone.utc).isoformat()
    return {"deleted": result.rowcount or 0, "cache_keys": rows}

@cache_router.delete("/key/{cache_key}", summary="Invalidate explicit cache key")
async def invalidate_cache_key(cache_key: str, db: AsyncSession = Depends(get_db_session)):
    stmt = delete(LLMCache).where(LLMCache.cache_key == cache_key)
    result = await db.execute(stmt)
    await db.commit()
    metrics_counters.INVALIDATION_DELETES += (result.rowcount or 0)
    metrics_counters.LAST_INVALIDATION_AT = datetime.now(timezone.utc).isoformat()
    return {"deleted": result.rowcount or 0, "cache_key": cache_key}

__all__ = ["cache_router"]
