from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models import LLMCache, Resume
from app.agent.cache_utils import CACHE_HITS, CACHE_MISSES, CACHE_EXPIRED
from app.metrics.counters import (
    DUPLICATE_RESUME_REUSES,
    INVALIDATION_DELETES,
    LAST_INVALIDATION_AT,
)

metrics_router = APIRouter(tags=["metrics"])

@metrics_router.get("/llm", summary="LLM cache & token metrics")
async def get_llm_metrics(db: AsyncSession = Depends(get_db_session)):
    """Return basic aggregated metrics about LLM usage & cache.

    This is a lightweight JSON (not Prometheus text) endpoint intended for
    internal dashboards or quick health checks. Prometheus exposition can be
    layered later if needed.
    """
    # Aggregations
    total_rows_stmt = select(func.count(LLMCache.cache_key))
    token_sums_stmt = select(
        func.coalesce(func.sum(LLMCache.tokens_in), 0),
        func.coalesce(func.sum(LLMCache.tokens_out), 0),
    )
    avg_ttl_stmt = select(func.avg(LLMCache.ttl_seconds))
    total_resumes_stmt = select(func.count(Resume.id))
    distinct_hash_stmt = select(func.count(func.distinct(Resume.content_hash)))

    total_rows = (await db.execute(total_rows_stmt)).scalar_one()
    tokens_in_sum, tokens_out_sum = (await db.execute(token_sums_stmt)).one()
    avg_ttl = (await db.execute(avg_ttl_stmt)).scalar()
    total_resumes = (await db.execute(total_resumes_stmt)).scalar_one()
    distinct_hashes = (await db.execute(distinct_hash_stmt)).scalar_one()
    duplicates_reused = DUPLICATE_RESUME_REUSES
    duplicate_ratio = None
    if total_resumes and distinct_hashes is not None and total_resumes > 0:
        # (total - unique)/total = fraction of stored rows that are duplicates (observed)
        duplicate_ratio = (
            (total_resumes - distinct_hashes) / total_resumes if total_resumes else None
        )

    total_requests = CACHE_HITS + CACHE_MISSES
    hit_ratio = (CACHE_HITS / total_requests) if total_requests else None
    return {
        "cache": {
            "entries": total_rows,
            "avg_ttl_seconds": float(avg_ttl) if avg_ttl is not None else None,
            "hits": CACHE_HITS,
            "misses": CACHE_MISSES,
            "expired": CACHE_EXPIRED,
            "hit_ratio": hit_ratio,
        },
        "tokens": {
            "prompt_total": int(tokens_in_sum or 0),
            "completion_total": int(tokens_out_sum or 0),
            "total": int((tokens_in_sum or 0) + (tokens_out_sum or 0)),
        },
        "duplicates": {
            "resumes_total": total_resumes,
            "distinct_content": distinct_hashes,
            "duplicates_reused": duplicates_reused,
            "duplicate_ratio": duplicate_ratio,
        },
        "invalidation": {
            "deleted": INVALIDATION_DELETES,
            "last_at": LAST_INVALIDATION_AT,
        },
        "notes": [],
    }
