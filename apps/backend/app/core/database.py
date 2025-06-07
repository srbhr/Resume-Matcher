from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import AsyncGenerator, Generator, Optional, TypeVar, Type

from sqlalchemy import event, create_engine, pool, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker, Query
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, QueuePool

from .config import settings
from ..models.base import Base

logger = logging.getLogger(__name__)

T = TypeVar("T")


class DatabaseConfig:
    """Database configuration with production-ready defaults."""
    
    def __init__(self):
        # Set default SQLite URLs if not provided
        self.SYNC_DATABASE_URL: str = settings.SYNC_DATABASE_URL or "sqlite:///./resume_matcher.db"
        self.ASYNC_DATABASE_URL: str = settings.ASYNC_DATABASE_URL or "sqlite+aiosqlite:///./resume_matcher.db"
        self.DB_ECHO: bool = settings.DB_ECHO
        
        # Determine if we're using SQLite
        self.is_sqlite = self.SYNC_DATABASE_URL.startswith("sqlite")
        
        # Connection pool configuration
        if self.is_sqlite:
            # SQLite doesn't benefit from connection pooling
            self.pool_class = NullPool
            self.pool_size = None
            self.max_overflow = None
            self.pool_recycle = None
            self.connect_args = {"check_same_thread": False}
        else:
            # Production-ready pooling for PostgreSQL/MySQL
            self.pool_class = QueuePool
            self.pool_size = settings.DB_POOL_SIZE
            self.max_overflow = settings.DB_MAX_OVERFLOW
            self.pool_recycle = settings.DB_POOL_RECYCLE
            self.connect_args = {
                "connect_timeout": settings.DB_CONNECT_TIMEOUT,
                "server_settings": {
                    "jit": "off",  # Disable JIT for more predictable performance
                    "application_name": settings.PROJECT_NAME,
                },
            }


db_config = DatabaseConfig()


def _configure_sqlite(engine: Engine) -> None:
    """
    Configure SQLite for production use:
    
    * WAL mode for better concurrency
    * Foreign key enforcement
    * Optimized cache and page sizes
    * Memory-mapped I/O for better performance
    """
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        
        # Performance optimizations
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA cache_size=10000;")
        cursor.execute("PRAGMA page_size=4096;")
        cursor.execute("PRAGMA mmap_size=268435456;")  # 256MB
        cursor.execute("PRAGMA temp_store=MEMORY;")
        
        # Integrity
        cursor.execute("PRAGMA foreign_keys=ON;")
        
        cursor.close()


def _configure_postgresql(engine: Engine) -> None:
    """Configure PostgreSQL specific optimizations."""
    if engine.dialect.name != "postgresql":
        return
    
    @event.listens_for(engine, "connect")
    def _set_postgresql_search_path(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("SET search_path TO public;")
        cursor.close()


@lru_cache(maxsize=1)
def _make_sync_engine() -> Engine:
    """Create the global synchronous Engine with production settings."""
    # Build engine kwargs, excluding None values for SQLite
    engine_kwargs = {
        "echo": db_config.DB_ECHO,
        "poolclass": db_config.pool_class,
        "connect_args": db_config.connect_args,
        "future": True,
        "query_cache_size": 1200,  # Cache parsed SQL statements
    }
    
    # Only add pool settings for non-SQLite databases
    if not db_config.is_sqlite:
        engine_kwargs.update({
            "pool_pre_ping": settings.DB_POOL_PRE_PING,
            "pool_size": db_config.pool_size,
            "max_overflow": db_config.max_overflow,
            "pool_recycle": db_config.pool_recycle,
            "execution_options": {
                "isolation_level": "READ COMMITTED",
            },
        })
    
    engine = create_engine(db_config.SYNC_DATABASE_URL, **engine_kwargs)
    
    _configure_sqlite(engine)
    _configure_postgresql(engine)
    
    # Log slow queries in development
    if settings.ENV != "production":
        @event.listens_for(engine, "before_cursor_execute")
        def _log_query(conn, cursor, statement, parameters, context, executemany):
            conn.info.setdefault("query_start_time", []).append(asyncio.get_event_loop().time())
        
        @event.listens_for(engine, "after_cursor_execute")
        def _log_query_time(conn, cursor, statement, parameters, context, executemany):
            total = asyncio.get_event_loop().time() - conn.info["query_start_time"].pop(-1)
            if total > settings.SLOW_QUERY_THRESHOLD:
                logger.warning(f"Slow query ({total:.3f}s): {statement[:100]}...")
    
    return engine


@lru_cache(maxsize=1)
def _make_async_engine() -> AsyncEngine:
    """Create the global asynchronous Engine with production settings."""
    # Build engine kwargs, excluding None values for SQLite
    engine_kwargs = {
        "echo": db_config.DB_ECHO,
        "poolclass": db_config.pool_class,
        "connect_args": db_config.connect_args,
        "future": True,
        "query_cache_size": 1200,
    }
    
    # Only add pool settings for non-SQLite databases
    if not db_config.is_sqlite:
        engine_kwargs.update({
            "pool_pre_ping": settings.DB_POOL_PRE_PING,
            "pool_size": db_config.pool_size,
            "max_overflow": db_config.max_overflow,
            "pool_recycle": db_config.pool_recycle,
        })
    
    engine = create_async_engine(db_config.ASYNC_DATABASE_URL, **engine_kwargs)
    
    # Apply SQLite pragmas to the sync engine within async engine
    if db_config.is_sqlite:
        _configure_sqlite(engine.sync_engine)
    
    return engine


# ──────────────────────────────────────────────────────────────────────────────
# Global engines and session factories
# ──────────────────────────────────────────────────────────────────────────────

sync_engine: Engine = _make_sync_engine()
async_engine: AsyncEngine = _make_async_engine()

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=sync_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=async_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=AsyncSession,
)


# ──────────────────────────────────────────────────────────────────────────────
# Session management
# ──────────────────────────────────────────────────────────────────────────────

def get_sync_db_session() -> Generator[Session, None, None]:
    """
    Yield a transactional synchronous Session with proper cleanup.
    
    Features:
    * Automatic commit on success
    * Automatic rollback on exception
    * Proper connection cleanup
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


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield a transactional asynchronous Session with proper cleanup.
    
    Features:
    * Automatic commit on success
    * Automatic rollback on exception
    * Proper connection cleanup
    * Request-scoped session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions."""
    async with get_db_session() as session:
        yield session


# ──────────────────────────────────────────────────────────────────────────────
# Database utilities
# ──────────────────────────────────────────────────────────────────────────────

async def init_models(base: Type[Base] = Base) -> None:
    """Initialize database tables."""
    async with async_engine.begin() as conn:
        await conn.run_sync(base.metadata.create_all)


async def check_database_connection() -> bool:
    """Check if database is accessible."""
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return False


async def get_database_stats() -> dict:
    """Get database connection pool statistics."""
    pool = async_engine.pool
    return {
        "size": pool.size() if hasattr(pool, "size") else 0,
        "checked_in": pool.checked_in_connections if hasattr(pool, "checked_in_connections") else 0,
        "overflow": pool.overflow() if hasattr(pool, "overflow") else 0,
        "total": pool.size() + pool.overflow() if hasattr(pool, "size") and hasattr(pool, "overflow") else 0,
    }


class OptimizedQuery:
    """Query optimization utilities."""
    
    @staticmethod
    def paginate(query: Query, page: int = 1, per_page: int = 20) -> Query:
        """Add efficient pagination to a query."""
        return query.offset((page - 1) * per_page).limit(per_page)
    
    @staticmethod
    def batch_fetch(query: Query, batch_size: int = 1000):
        """Yield results in memory-efficient batches."""
        offset = 0
        while True:
            batch = query.offset(offset).limit(batch_size).all()
            if not batch:
                break
            yield from batch
            offset += batch_size
