from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models import LLMCache, Resume
from app.core.config import settings
from app.agent import cache_utils
from app.metrics import counters

metrics_router = APIRouter(tags=["metrics"])

@metrics_router.get("/llm", summary="LLM cache & token metrics")
async def get_llm_metrics(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
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
        func.coalesce(func.count(LLMCache.cache_key), 0),
    )
    avg_ttl_stmt = select(func.avg(LLMCache.ttl_seconds))
    total_resumes_stmt = select(func.count(Resume.id))
    distinct_hash_stmt = select(func.count(func.distinct(Resume.content_hash)))

    total_rows = (await db.execute(total_rows_stmt)).scalar_one()
    tokens_in_sum, tokens_out_sum, calls_sum = (await db.execute(token_sums_stmt)).one()
    avg_ttl = (await db.execute(avg_ttl_stmt)).scalar()
    total_resumes = (await db.execute(total_resumes_stmt)).scalar_one()
    distinct_hashes = (await db.execute(distinct_hash_stmt)).scalar_one()
    duplicates_reused = counters.DUPLICATE_RESUME_REUSES
    duplicate_ratio = None
    if total_resumes and distinct_hashes is not None and total_resumes > 0:
        # (total - unique)/total = fraction of stored rows that are duplicates (observed)
        duplicate_ratio = (
            (total_resumes - distinct_hashes) / total_resumes if total_resumes else None
        )

    total_requests = cache_utils.CACHE_HITS + cache_utils.CACHE_MISSES
    hit_ratio = (cache_utils.CACHE_HITS / total_requests) if total_requests else None
    # Cost estimates (LLM generation only + embeddings estimates)
    llm_in_cost = (float(tokens_in_sum or 0) / 1000.0) * settings.LLM_PRICE_IN_PER_1K
    llm_out_cost = (float(tokens_out_sum or 0) / 1000.0) * settings.LLM_PRICE_OUT_PER_1K
    llm_total_cost = llm_in_cost + llm_out_cost
    # Embedding costs: prefer exact counted tokens; else use estimated tokens
    embedding_tokens = int(counters.EMBEDDING_PROMPT_TOKENS) if counters.EMBEDDING_PROMPT_TOKENS else int(counters.EMBEDDING_PROMPT_TOKENS_ESTIMATED)
    embedding_cost = (embedding_tokens / 1000.0) * settings.EMBEDDING_PRICE_PER_1K

    # Note: Embedding costs are not stored in LLMCache. Optional: estimate via calls_sum as proxy if needed.
    # For exact embedding costs, we would persist embedding token counts similarly; left out to avoid schema changes here.

    payload = {
        "cache": {
            "entries": total_rows,
            "avg_ttl_seconds": float(avg_ttl) if avg_ttl is not None else None,
            "hits": cache_utils.CACHE_HITS,
            "misses": cache_utils.CACHE_MISSES,
            "expired": cache_utils.CACHE_EXPIRED,
            "hit_ratio": hit_ratio,
        },
        "tokens": {
            "prompt_total": int(tokens_in_sum or 0),
            "completion_total": int(tokens_out_sum or 0),
            "total": int((tokens_in_sum or 0) + (tokens_out_sum or 0)),
            "calls": int(calls_sum or 0),
        },
        "embeddings": {
            "calls": int(counters.EMBEDDING_CALLS),
            "prompt_tokens_exact": int(counters.EMBEDDING_PROMPT_TOKENS),
            "prompt_tokens_estimated": int(counters.EMBEDDING_PROMPT_TOKENS_ESTIMATED),
        },
        "cost_usd": {
            "llm_input": round(llm_in_cost, 6),
            "llm_output": round(llm_out_cost, 6),
            "llm_total": round(llm_total_cost, 6),
            "embeddings": round(embedding_cost, 6),
            "grand_total": round(llm_total_cost + embedding_cost, 6),
            "notes": [
                "Embedding tokens: prefer exact if available; else estimated by chars/4.",
                "Prices from settings: LLM_IN_PER_1K, LLM_OUT_PER_1K, EMBEDDING_PER_1K.",
            ],
        },
        "duplicates": {
            "resumes_total": total_resumes,
            "distinct_content": distinct_hashes,
            "duplicates_reused": counters.DUPLICATE_RESUME_REUSES,
            "duplicate_ratio": duplicate_ratio,
        },
        "invalidation": {
            "deleted": counters.INVALIDATION_DELETES,
            "last_at": counters.LAST_INVALIDATION_AT,
        },
        "notes": [],
    }

    request_id = getattr(request.state, "request_id", None)
    headers = {"X-Request-ID": request_id} if request_id else None
    # Expose metrics payload as top-level JSON for easy access in tests (metrics["invalidation"]) while
    # still attaching X-Request-ID header for traceability.
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=payload,
        headers=headers,
    )
