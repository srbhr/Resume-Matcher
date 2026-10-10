"""Engine plumbing for the SQLAlchemy data layer: SQLite by default, PostgreSQL optional.

Every ``Database`` instance owns its own engines (one async for the document
tables, one sync for the encrypted ``api_keys`` table read on the synchronous
LLM hot path) built from these factories. Keeping construction here lets tests
spin up fully isolated engines against a temp-file database or a scratch schema.
"""

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.models import Base

__all__ = [
    "Base",
    "PG_LOCK_NAMESPACE",
    "init_models_sync",
    "make_async_engine",
    "make_sync_engine",
]

# Advisory-lock namespace ("RM"); the second key is hashtext(<schema>).
PG_LOCK_NAMESPACE = 0x524D
PG_INIT_LOCK_NAMESPACE = PG_LOCK_NAMESPACE + 1


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
    assert path is not None
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
    assert path is not None
    engine = create_engine(_url(path, driver=""), future=True)
    event.listen(engine, "connect", _apply_sqlite_pragmas)
    return engine


def _init_postgres(engine: Engine, schema: str | None) -> None:
    """Create the schema and tables once, even when several processes start together."""
    with engine.begin() as conn:
        conn.execute(
            text("SELECT pg_advisory_xact_lock(:ns, hashtext(:schema))"),
            {"ns": PG_INIT_LOCK_NAMESPACE, "schema": schema or "public"},
        )
        if schema:
            conn.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        Base.metadata.create_all(conn)


def init_models_sync(engine: Engine, schema: str | None = None) -> None:
    """Create all tables (idempotent) using a sync engine connection."""
    if engine.dialect.name == "postgresql":
        _init_postgres(engine, schema)
        return
    Base.metadata.create_all(engine)

    # ``create_all`` does not ALTER existing SQLite tables. Keep this additive
    # migration idempotent so older local databases can load resumes safely.
    with engine.begin() as conn:
        columns = conn.exec_driver_sql("PRAGMA table_info(resumes)").mappings().all()
        existing_columns = {column["name"] for column in columns}
        if columns and "interview_prep" not in existing_columns:
            conn.exec_driver_sql("ALTER TABLE resumes ADD COLUMN interview_prep TEXT")
        if columns and "processing_token" not in existing_columns:
            conn.exec_driver_sql("ALTER TABLE resumes ADD COLUMN processing_token TEXT")

        if columns and "is_master" in existing_columns:
            if "is_default_master" not in existing_columns:
                conn.exec_driver_sql(
                    "ALTER TABLE resumes ADD COLUMN is_default_master BOOLEAN NOT NULL DEFAULT 0"
                )
            # Multi-track masters: the single-master slot is replaced by a
            # single-default slot. create_all never drops indexes on existing tables.
            conn.exec_driver_sql("DROP INDEX IF EXISTS ux_resumes_single_master")
            if "created_at" in existing_columns:
                conn.exec_driver_sql(
                    "UPDATE resumes SET is_default_master = 1 WHERE resume_id = ("
                    "SELECT resume_id FROM resumes WHERE is_master = 1 "
                    "ORDER BY created_at, resume_id LIMIT 1) "
                    "AND NOT EXISTS (SELECT 1 FROM resumes WHERE is_default_master = 1)"
                )
            conn.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_resumes_single_default_master "
                "ON resumes (is_default_master) WHERE is_default_master = 1"
            )

        preview_columns = (
            conn.exec_driver_sql("PRAGMA table_info(tailoring_previews)")
            .mappings()
            .all()
        )
        if preview_columns and "improvements" not in {
            column["name"] for column in preview_columns
        }:
            conn.exec_driver_sql(
                "ALTER TABLE tailoring_previews ADD COLUMN improvements JSON"
            )
        if preview_columns and "source_data" not in {
            column["name"] for column in preview_columns
        }:
            conn.exec_driver_sql(
                "ALTER TABLE tailoring_previews ADD COLUMN source_data JSON"
            )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_preview_compatibility ON tailoring_previews (source_id, job_id, payload_hash, created_at)"
        )
