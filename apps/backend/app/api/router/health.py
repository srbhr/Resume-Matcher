from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, status, Depends
import asyncio
from typing import Any, Dict

from app.agent import AgentManager, EmbeddingManager
from app.core import settings

from app.core import get_db_session

health_check = APIRouter()


@health_check.get("/ping", tags=["Health check"], status_code=status.HTTP_200_OK)
async def ping(db: AsyncSession = Depends(get_db_session)):
    """
    health check endpoint
    """
    try:
        result = await db.execute(text("SELECT 1"))
        db_status = "reachable" if result.fetchone() is not None else "not reachable"
    except Exception as e:
        import logging
        logging.error("Database health check failed", exc_info=True)
        db_status = "unreachable"
    return {"message": "pong", "database": db_status}


@health_check.get("/healthz", tags=["Health check"], status_code=status.HTTP_200_OK)
async def healthz(db: AsyncSession = Depends(get_db_session)):
    """
    K8s/Railway style liveness endpoint.
    Returns minimal JSON and verifies DB connectivity.
    """
    try:
        result = await db.execute(text("SELECT 1"))
        db_ok = result.scalar() == 1
    except Exception:
        db_ok = False
    return {"status": "ok", "database": "ok" if db_ok else "degraded"}


@health_check.get("/ai", tags=["Health check"], status_code=status.HTTP_200_OK)
async def ai_health() -> Dict[str, Any]:
    """Deep health check for AI providers (LLM & Embeddings).

    - Does a minimal LLM call (non-PII, tiny prompt)
    - Does a minimal Embedding call
    Returns provider, model and ok/error for each.
    """
    llm = {
        "provider": getattr(settings, "LLM_PROVIDER", None),
        "model": getattr(settings, "LL_MODEL", None),
        "ok": False,
        "error": None,
    }
    emb = {
        "provider": getattr(settings, "EMBEDDING_PROVIDER", None),
        "model": getattr(settings, "EMBEDDING_MODEL", None),
        "ok": False,
        "error": None,
    }

    # LLM check
    try:
        agent = AgentManager()  # default JSON/text capable agent
        async def _llm():
            out = await agent.run("Reply with OK")
            return str(out)
        llm_out = await asyncio.wait_for(_llm(), timeout=12)
        if "OK" in llm_out.upper():
            llm["ok"] = True
        else:
            llm["error"] = f"unexpected_output: {llm_out[:80]}" if llm_out else "empty_output"
    except asyncio.TimeoutError:
        llm["error"] = "timeout"
    except Exception as e:  # pragma: no cover - defensive health probe
        llm["error"] = str(e)

    # Embedding check
    try:
        embedder = EmbeddingManager()
        async def _emb():
            return await embedder.embed("ok")
        vec = await asyncio.wait_for(_emb(), timeout=12)
        if vec is not None:
            try:
                length = len(vec)  # type: ignore[arg-type]
            except Exception:
                length = None
            emb["ok"] = True if (length is None or length > 0) else False
            if length is not None:
                emb["dims"] = length
        else:
            emb["error"] = "none"
    except asyncio.TimeoutError:
        emb["error"] = "timeout"
    except Exception as e:  # pragma: no cover - defensive health probe
        emb["error"] = str(e)

    return {"llm": llm, "embedding": emb}
