import os
import contextlib
import warnings

# Suppress noisy pydub ffmpeg availability warning globally (not relevant for core API tests)
warnings.filterwarnings(
    "ignore",
    message="Couldn't find ffmpeg or avconv",
    category=RuntimeWarning,
)

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .api import health_check, v1_router, RequestIDMiddleware
from .api.body_limit import BodySizeLimitMiddleware
from .api.rate_limit import RateLimitMiddleware
from .core import (
    settings,
    async_engine,
    setup_logging,
    custom_http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from app.core.redaction import redact
from sqlalchemy import delete, text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
import logging
from .models import LLMCache
from .core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
from .models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Enforce Neon/Postgres-only at runtime for consistent behavior across environments
    if async_engine.dialect.name != 'postgresql':
        raise RuntimeError(
            "Unsupported database dialect. This deployment is configured for Neon/PostgreSQL only."
        )
    # Sanity: ensure metadata is in place and DB reachable (logs only)
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(sql_text("SELECT 1"))
            logger.info("Database check OK during startup")
        except Exception as e:  # pragma: no cover - log-only
            logger.error(f"Database check FAILED during startup: {e}")
    stop_event = asyncio.Event()

    async def _cache_cleanup_loop():
        interval = settings.LLM_CACHE_CLEAN_INTERVAL_SECONDS
        max_batch = settings.LLM_CACHE_MAX_DELETE_BATCH
        while not stop_event.is_set():
            try:
                async with AsyncSessionLocal() as session:  # type: ignore
                    dialect = async_engine.dialect.name
                    if dialect == 'sqlite':
                        # Collect expired keys with LIMIT using strftime epoch math
                        select_sql = sql_text(
                            """
                            SELECT cache_key FROM llm_cache
                            WHERE (strftime('%s','now') - strftime('%s', created_at)) > ttl_seconds
                            LIMIT :batch
                            """
                        )
                        keys = await session.execute(select_sql, {"batch": max_batch})
                        key_list = [r[0] for r in keys.fetchall()]
                        if key_list:
                            in_clause = ",".join([f"'{k}'" for k in key_list])
                            await session.execute(sql_text(f"DELETE FROM llm_cache WHERE cache_key IN ({in_clause})"))
                            await session.commit()
                    elif dialect == 'postgresql':
                        # Use CTE to limit deletions atomically
                        delete_sql = sql_text(
                            """
                            WITH expired AS (
                                SELECT cache_key FROM llm_cache
                                WHERE EXTRACT(EPOCH FROM (NOW() - created_at)) > ttl_seconds
                                LIMIT :batch
                            )
                            DELETE FROM llm_cache c
                            USING expired e
                            WHERE c.cache_key = e.cache_key;
                            """
                        )
                        await session.execute(delete_sql, {"batch": max_batch})
                        await session.commit()
                    else:  # generic fallback (no LIMIT, other dialects)
                        delete_all = sql_text(
                            "DELETE FROM llm_cache WHERE (strftime('%s','now') - strftime('%s', created_at)) > ttl_seconds"
                            if dialect == 'sqlite' else
                            "DELETE FROM llm_cache WHERE EXTRACT(EPOCH FROM (NOW() - created_at)) > ttl_seconds"
                        )
                        await session.execute(delete_all)
                        await session.commit()
            except asyncio.CancelledError:  # pragma: no cover
                break
            except Exception as e:  # pragma: no cover
                logger.warning(f"Cache cleanup loop error: {e}")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=interval)
            except asyncio.TimeoutError:
                continue

    task = asyncio.create_task(_cache_cleanup_loop())
    yield
    stop_event.set()
    task.cancel()
    with contextlib.suppress(Exception):  # pragma: no cover
        await task
    # Under pytest we avoid disposing the global engine to prevent asyncpg tasks
    # scheduling on a closed loop; the test process teardown will clean resources.
    import os
    if 'PYTEST_CURRENT_TEST' not in os.environ:
        await async_engine.dispose()


def create_app() -> FastAPI:
    """
    configure and create the FastAPI application instance.
    """
    setup_logging()
    # Attach a lightweight redaction filter to the root logger (idempotent)
    class _RedactionFilter(logging.Filter):  # pragma: no cover - simple integration
        def filter(self, record: logging.LogRecord) -> bool:  # type: ignore[override]
            if isinstance(record.msg, str):
                record.msg = redact(record.msg)
            # Also redact common attributes if present
            for attr in ("email", "phone", "user"):
                if hasattr(record, attr):
                    try:
                        setattr(record, attr, redact(str(getattr(record, attr))))
                    except Exception:
                        pass
            return True
    root_logger = logging.getLogger()
    if not any(isinstance(f, _RedactionFilter) for f in root_logger.filters):
        root_logger.addFilter(_RedactionFilter())

    app = FastAPI(
        title=settings.PROJECT_NAME,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # Early body size limiter (must precede others reading body)
    app.add_middleware(BodySizeLimitMiddleware)

    app.add_middleware(
        SessionMiddleware, secret_key=settings.SESSION_SECRET_KEY, same_site="lax"
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(RateLimitMiddleware)

    app.add_exception_handler(HTTPException, custom_http_exception_handler)
    # Override default pydantic validation to unified envelope
    async def unified_validation_handler(request, exc: RequestValidationError):  # type: ignore[override]
        request_id = getattr(request.state, "request_id", "validation:" )
        return JSONResponse(
            status_code=422,
            content={
                "request_id": request_id,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid request",
                    "detail": exc.errors(),
                },
            },
        )
    app.add_exception_handler(RequestValidationError, unified_validation_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    if os.path.exists(settings.FRONTEND_PATH):
        app.mount(
            "/app",
            StaticFiles(directory=settings.FRONTEND_PATH, html=True),
            name=settings.PROJECT_NAME,
        )

    app.include_router(health_check)
    app.include_router(v1_router)

    return app
