"""Engine plumbing for the SQLAlchemy data layer: SQLite by default, PostgreSQL optional.

Every ``Database`` instance owns its own engines (one async for the document
tables, one sync for the encrypted ``api_keys`` table read on the synchronous
LLM hot path) built from these factories. Keeping construction here lets tests
spin up fully isolated engines against a temp-file database or a scratch schema.
"""

import sqlite3
import time
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.models import Base
from app.schema_migrations import migrate

__all__ = [
    "Base",
    "PG_LOCK_NAMESPACE",
    "init_models_sync",
    "make_async_engine",
    "make_sync_engine",
]

# Advisory-lock namespace ("RM"); the second key is hashtext(<schema>).
PG_LOCK_NAMESPACE = 0x524D


# How long a new connection waits for another one to release the write lock
# before it can switch the file to WAL. Matches busy_timeout.
_WAL_SWITCH_TIMEOUT_SECONDS = 5.0


def _enable_wal(cursor: Any) -> None:
    """Switch the file to WAL, waiting out a connection that holds the write lock.

    Changing the journal mode needs an exclusive lock, and when another connection
    holds the write lock SQLite answers "database is locked" at once instead of using
    ``busy_timeout`` (it would risk a deadlock). Only a new file can hit this: once
    it is in WAL, the pragma takes no lock. Two processes starting together on a new
    database do hit it, because one migrates inside ``BEGIN IMMEDIATE``.
    """
    deadline = time.monotonic() + _WAL_SWITCH_TIMEOUT_SECONDS
    delay = 0.01
    while True:
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            return
        except sqlite3.OperationalError as error:
            if "locked" not in str(error) or time.monotonic() >= deadline:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 0.2)


def _apply_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    """Set per-connection SQLite PRAGMAs.

    WAL improves concurrent read/write between the async (doc tables) and sync
    (api_keys) engines pointed at the same file; ``busy_timeout`` rides out the
    brief lock contention that creates; ``foreign_keys`` enforces relational
    integrity (off by default in SQLite).
    """
    cursor = dbapi_connection.cursor()
    try:
        _enable_wal(cursor)
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def _url(path: Path, *, driver: str) -> str:
    """Build a SQLite URL. Absolute paths yield the required four slashes."""
    return f"sqlite+{driver}:///{path}" if driver else f"sqlite:///{path}"


def _postgres_options(schema: str | None) -> dict[str, Any]:
    # READ COMMITTED: reads after the write lock see the previous holder's commit.
    options: dict[str, Any] = {
        "future": True,
        "pool_pre_ping": True,
        "isolation_level": "READ COMMITTED",
    }
    if schema:
        options["connect_args"] = {"options": f"-c search_path={schema}"}
    return options


def make_async_engine(
    path: Path | None = None, *, url: str | None = None, schema: str | None = None
) -> AsyncEngine:
    """Create the async engine (``aiosqlite`` or ``psycopg``) for the document tables."""
    if url:
        return create_async_engine(url, **_postgres_options(schema))
    if path is None:
        raise ValueError("make_async_engine needs either a url or a path.")
    engine = create_async_engine(_url(path, driver="aiosqlite"), future=True)
    event.listen(engine.sync_engine, "connect", _apply_sqlite_pragmas)
    return engine


def make_sync_engine(
    path: Path | None = None, *, url: str | None = None, schema: str | None = None
) -> Engine:
    """Create the sync engine used for the encrypted api_keys table.

    Key reads happen synchronously (``get_llm_config`` → ``load_config_file`` →
    ``resolve_api_key``), so a sync engine avoids threading async through
    ``llm.py``. It points at the same database as the async engine.
    """
    if url:
        return create_engine(url, **_postgres_options(schema))
    if path is None:
        raise ValueError("make_sync_engine needs either a url or a path.")
    engine = create_engine(_url(path, driver=""), future=True)
    event.listen(engine, "connect", _apply_sqlite_pragmas)
    return engine


def init_models_sync(engine: Engine, schema: str | None = None) -> None:
    """Bring the database to the current schema version (``app.schema_migrations``)."""
    migrate(engine, schema)
