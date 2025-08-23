from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LLMCache, LLMCacheIndex

logger = logging.getLogger(__name__)

# Simple in-process counters (reset on process restart). For multi-process
# deployment you'd move this to Redis or a metrics backend.
CACHE_HITS = 0
CACHE_MISSES = 0
CACHE_EXPIRED = 0


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def fetch_or_cache(
    *,
    db: AsyncSession,
    model: str,
    strategy: str,
    prompt: str,
    runner: Callable[[], Awaitable[dict[str, Any]]],
    ttl_seconds: int = 86400,
    index_entities: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Return cached LLM JSON response or execute runner and persist.

    Key = sha256(model + strategy + prompt_hash)
    """
    prompt_hash = sha256_text(prompt)
    raw_key_material = f"{model}:{strategy}:{prompt_hash}"
    cache_key = sha256_text(raw_key_material)

    stmt = select(LLMCache).where(LLMCache.cache_key == cache_key)
    global CACHE_HITS, CACHE_MISSES, CACHE_EXPIRED
    row = (await db.execute(stmt)).scalars().first()
    if row:
        # TTL enforcement
        if row.created_at is not None:
            now = datetime.now(timezone.utc)
            # Some SQLite drivers may return naive UTC datetimes; normalize
            created = row.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            age = (now - created).total_seconds()
            if age <= row.ttl_seconds:
                logger.debug(
                    f"LLM cache hit model={model} strategy={strategy} key={cache_key} age={age:.1f}s ttl={row.ttl_seconds}s"
                )
                CACHE_HITS += 1
                return row.as_dict()
            # Expired -> delete and regenerate
            logger.debug(
                f"LLM cache expired model={model} strategy={strategy} key={cache_key} age={age:.1f}s ttl={row.ttl_seconds}s; refreshing"
            )
            CACHE_EXPIRED += 1
            await db.delete(row)
            await db.flush()
        else:
            # No created_at; treat as hit (legacy rows)
            CACHE_HITS += 1
            return row.as_dict()

    logger.debug(
        f"LLM cache miss model={model} strategy={strategy} key={cache_key}; executing provider"
    )
    CACHE_MISSES += 1
    result = await runner()
    # Extract token usage if present via JSONWrapper convention (_usage)
    tokens_in = tokens_out = None
    if isinstance(result, dict):
        usage = result.get("_usage")
        if isinstance(usage, dict):
            tokens_in = usage.get("prompt_tokens")
            tokens_out = usage.get("completion_tokens")
    # Strategy may be a wrapper instance; persist its class name for readability
    strategy_name = strategy if isinstance(strategy, str) else getattr(strategy, "__class__", type(strategy)).__name__
    # Insert only if still absent (race-safe double check)
    existing_after = (await db.execute(stmt)).scalars().first()
    if existing_after is None:
        # Attempt insert; another concurrent coroutine/process might have inserted
        # between our second existence check and the flush. Rely on the unique
        # constraint at DB level and fall back to reading the existing row.
        try:
            cache = LLMCache(
                cache_key=cache_key,
                model=model,
                strategy=strategy_name,
                prompt_hash=prompt_hash,
                response_json=json.dumps(result),
                ttl_seconds=ttl_seconds,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
            )
            db.add(cache)
            await db.flush()
        except IntegrityError:  # pragma: no cover - race window
            await db.rollback()
            logger.debug(
                "LLM cache insert race detected; reusing existing entry key=%s", cache_key
            )
            row = (await db.execute(stmt)).scalars().first()
            if row:
                return row.as_dict()
    # Index entities for invalidation if provided
    if index_entities and (existing_after is None):  # only index on first creation
        for etype, eid in index_entities.items():
            if not eid:
                continue
            db.add(
                LLMCacheIndex(
                    cache_key=cache_key, entity_type=etype, entity_id=str(eid)
                )
            )
        await db.flush()
    return result
