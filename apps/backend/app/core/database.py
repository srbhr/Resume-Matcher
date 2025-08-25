from __future__ import annotations

from functools import lru_cache
from typing import AsyncGenerator, Generator, Optional

from sqlalchemy import event, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from .config import settings as app_settings
from ..models.base import Base


class _DatabaseSettings:
    """Pulled from environment once at import-time."""

    SYNC_DATABASE_URL: str = app_settings.SYNC_DATABASE_URL
    ASYNC_DATABASE_URL: str = app_settings.ASYNC_DATABASE_URL
    DB_ECHO: bool = app_settings.DB_ECHO
    DB_POOL_SIZE: Optional[int] = app_settings.DB_POOL_SIZE
    DB_MAX_OVERFLOW: Optional[int] = app_settings.DB_MAX_OVERFLOW
    DB_POOL_TIMEOUT: Optional[int] = app_settings.DB_POOL_TIMEOUT

    DB_CONNECT_ARGS = (
        {"check_same_thread": False}
        if SYNC_DATABASE_URL.startswith("sqlite")
        else {}
    )


settings = _DatabaseSettings()


def _configure_sqlite(engine: Engine) -> None:
    """
    For SQLite:

    * Enable WAL mode (better concurrent writes).
    * Enforce foreign-key constraints.
    * Safe noop for non-SQLite engines.
    """
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect", once=True)
    def _set_sqlite_pragma(dbapi_conn, _) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


@lru_cache(maxsize=1)
def _make_sync_engine() -> Engine:
    """Create (or return) the global synchronous Engine.

    Neon/Postgres is the only supported backend. SQLite fallbacks have been
    removed to ensure consistent behavior across environments.
    """
    sync_url: str = settings.SYNC_DATABASE_URL
    # Enforce psycopg driver for sync Postgres
    if not sync_url.startswith('postgresql+psycopg://'):
        raise RuntimeError(
            "Only Postgres/Neon is supported for SYNC_DATABASE_URL and it must use the 'postgresql+psycopg://' scheme."
        )
    create_kwargs = {
        "echo": settings.DB_ECHO,
        "pool_pre_ping": True,
        "connect_args": {},
        "future": True,
    }
    # Pool tuning for Postgres
    if settings.DB_POOL_SIZE is not None:
        create_kwargs["pool_size"] = settings.DB_POOL_SIZE
    if settings.DB_MAX_OVERFLOW is not None:
        create_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    if settings.DB_POOL_TIMEOUT is not None:
        create_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT
    engine = create_engine(sync_url, **create_kwargs)
    _configure_sqlite(engine)
    return engine


@lru_cache(maxsize=1)
def _make_async_engine() -> AsyncEngine:
    """Create (or return) the global asynchronous Engine.

    Neon/Postgres is the only supported backend. SQLite fallbacks have been
    removed to ensure consistent behavior across environments.
    """
    async_url: str = settings.ASYNC_DATABASE_URL
    # Enforce asyncpg driver for async Postgres
    if not async_url.startswith('postgresql+asyncpg://'):
        raise RuntimeError(
            "Only Postgres/Neon is supported for ASYNC_DATABASE_URL and it must use the 'postgresql+asyncpg://' scheme."
        )
    create_kwargs = {
        "echo": settings.DB_ECHO,
        # Use NullPool to avoid cross-event-loop reuse in tests and TestClient.
        # This prevents asyncpg connections from being attached to a different loop.
        "poolclass": NullPool,
        "pool_pre_ping": True,
        "connect_args": {},
        "future": True,
    }
    if settings.DB_POOL_SIZE is not None:
        create_kwargs["pool_size"] = settings.DB_POOL_SIZE
    if settings.DB_MAX_OVERFLOW is not None:
        create_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    if settings.DB_POOL_TIMEOUT is not None:
        create_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT
    engine = create_async_engine(async_url, **create_kwargs)
    _configure_sqlite(engine.sync_engine)
    return engine


# ──────────────────────────────────────────────────────────────────────────────
# Session factories
# ──────────────────────────────────────────────────────────────────────────────

sync_engine: Engine = _make_sync_engine()
async_engine: AsyncEngine = _make_async_engine()

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=sync_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    expire_on_commit=False,
)


def get_sync_db_session() -> Generator[Session, None, None]:
    """
    Yield a *transactional* synchronous ``Session``.

    Commits if no exception was raised, otherwise rolls back. Always closes.
    Useful for CLI scripts or rare sync paths.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            try:
                await session.commit()
            except Exception:
                # Ensure the transaction is not left in a broken state
                try:
                    await session.rollback()
                except Exception:
                    pass
                raise
        except Exception:
            try:
                await session.rollback()
            except Exception:
                pass
            raise


async def init_models(Base: Base) -> None:
    """Create tables for provided Base metadata (primarily test harness)."""
    async with async_engine.begin() as conn:  # pragma: no cover - simple delegation
        await conn.run_sync(Base.metadata.create_all)


def get_engine_sync() -> Engine:
    """Return the configured synchronous engine.

    Provided for auxiliary scripts (schema drift detection) that need a bound
    Engine without importing the async stack or constructing duplicate engines.
    """
    return sync_engine
