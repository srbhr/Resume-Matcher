"""SQLite engine/session plumbing for the SQLAlchemy data layer.

Every ``Database`` instance owns its own engines (one async for the document
tables, one sync for the encrypted ``api_keys`` table read on the synchronous
LLM hot path) built from these factories. Keeping construction here lets tests
spin up fully isolated engines against a temp-file database.
"""

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.models import Base

__all__ = ["Base", "make_async_engine", "make_sync_engine", "init_models_sync"]


def _apply_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    """Set per-connection SQLite PRAGMAs.

    WAL improves concurrent read/write between the async (doc tables) and sync
    (api_keys) engines pointed at the same file; ``busy_timeout`` rides out the
    brief lock contention that creates; ``foreign_keys`` enforces relational
    integrity (off by default in SQLite).
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def _url(path: Path, *, driver: str) -> str:
    """Build a SQLite URL. Absolute paths yield the required four slashes."""
    return f"sqlite+{driver}:///{path}" if driver else f"sqlite:///{path}"


def make_async_engine(path: Path) -> AsyncEngine:
    """Create the async engine (``aiosqlite``) for the document tables."""
    engine = create_async_engine(_url(path, driver="aiosqlite"), future=True)
    event.listen(engine.sync_engine, "connect", _apply_sqlite_pragmas)
    return engine


def make_sync_engine(path: Path) -> Engine:
    """Create the sync engine used for the encrypted api_keys table.

    Key reads happen synchronously (``get_llm_config`` → ``load_config_file`` →
    ``resolve_api_key``), so a sync engine avoids threading async through
    ``llm.py``. It points at the same file as the async engine.
    """
    engine = create_engine(_url(path, driver=""), future=True)
    event.listen(engine, "connect", _apply_sqlite_pragmas)
    return engine


def init_models_sync(engine: Engine) -> None:
    """Create all tables (idempotent) using a sync engine connection."""
    Base.metadata.create_all(engine)
