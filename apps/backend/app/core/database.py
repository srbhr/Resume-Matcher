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

from .config import settings
from ..models.base import Base


class _DatabaseSettings:
    """Pulled from environment once at import-time."""

    def __init__(self):
        self.SYNC_DATABASE_URL: str = settings.SYNC_DATABASE_URL
        self.ASYNC_DATABASE_URL: str = settings.ASYNC_DATABASE_URL
        self.DB_ECHO: bool = settings.DB_ECHO
        
        self.DB_CONNECT_ARGS = (
            {"check_same_thread": False} if self.SYNC_DATABASE_URL.startswith("sqlite") else {}
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
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


@lru_cache(maxsize=1)
def _make_sync_engine() -> Engine:
    """Create (or return) the global synchronous Engine."""
    engine = create_engine(
        settings.SYNC_DATABASE_URL,
        echo=settings.DB_ECHO,
        pool_pre_ping=True,
        connect_args=settings.DB_CONNECT_ARGS,
        future=True,
    )
    _configure_sqlite(engine)
    return engine


@lru_cache(maxsize=1)
def _make_async_engine() -> AsyncEngine:
    """Create (or return) the global asynchronous Engine."""
    engine = create_async_engine(
        settings.ASYNC_DATABASE_URL,
        echo=settings.DB_ECHO,
        pool_pre_ping=True,
        connect_args=settings.DB_CONNECT_ARGS,
        future=True,
    )
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
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_models(Base: Base) -> None:
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
