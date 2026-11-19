"""Versioned schema migrations for SQLite and PostgreSQL.

The database records its schema version in a one-row ``schema_version`` table.
``migrate`` runs every revision newer than that version, in order, in one
transaction that a second process starting at the same time waits for (SQLite
``BEGIN IMMEDIATE``; a PostgreSQL advisory lock per schema). It runs from
``Database._ensure_initialized``, so the API server, the MCP server and the CLI
all migrate the same way.

Revision 1 is the baseline: the idempotent startup logic every earlier release
ran (create missing tables, add the columns older releases lacked, move to the
single-default-master index). A database written by any earlier release, or a
new one, runs it once and is then at version 1. Revision 2 deletes the improvement
rows earlier releases left behind when they deleted a tailored resume. Revision 3
adds ``resumes.photo``.

Adding a revision:
- add the next number to ``MIGRATIONS`` and raise ``SCHEMA_VERSION`` to it;
- keep it additive where possible; this transaction blocks every writer;
- a revision that rebuilds a SQLite table must turn foreign keys off before the
  transaction opens (``PRAGMA foreign_keys`` is a no-op inside one, and the
  rebuild's ``DROP TABLE`` then fires ``ON DELETE CASCADE`` on the children), and
  back the file up first with ``VACUUM INTO``, also outside the transaction. The
  backup holds the user's resumes, so ``reset_database`` must delete it.
"""

import logging
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import (
    Column,
    Integer,
    MetaData,
    Table,
    delete,
    exists,
    inspect,
    select,
    text,
)
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import CreateColumn

from app.models import Base, Improvement, Resume

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 3

# Advisory-lock namespace for startup ("RM" + 1, beside the writer lock's "RM").
PG_INIT_LOCK_NAMESPACE = 0x524D + 1

_version_metadata = MetaData()
_schema_version = Table(
    "schema_version",
    _version_metadata,
    Column("version", Integer, nullable=False),
)


class SchemaVersionError(RuntimeError):
    """The database was written by a newer release than this one."""


def _add_missing_column(
    conn: Connection, column: Column[Any], schema: str | None = None
) -> None:
    """Additive migration: add a model column that an existing table lacks.

    ``create_all`` never alters existing tables. The column DDL is rendered by
    the connection's dialect, so this works on SQLite and PostgreSQL alike.
    """
    existing = inspect(conn).get_columns(column.table.name, schema=schema)
    if column.name in {c["name"] for c in existing}:
        return
    table = conn.dialect.identifier_preparer.format_table(column.table)
    ddl = CreateColumn(column).compile(dialect=conn.dialect)
    conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def _baseline_postgres(conn: Connection, schema: str | None) -> None:
    Base.metadata.create_all(conn)
    _add_missing_column(conn, Improvement.__table__.c.ats_score, schema)
    _add_missing_column(conn, Improvement.__table__.c.forced_keywords, schema)
    _add_missing_column(conn, Resume.__table__.c.template_settings, schema)


def _baseline_sqlite(conn: Connection) -> None:
    Base.metadata.create_all(conn)

    # ``create_all`` does not ALTER existing SQLite tables. Keep this additive
    # migration idempotent so older local databases can load resumes safely.
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

    _add_missing_column(conn, Improvement.__table__.c.ats_score)
    _add_missing_column(conn, Improvement.__table__.c.forced_keywords)
    _add_missing_column(conn, Resume.__table__.c.template_settings)

    preview_columns = (
        conn.exec_driver_sql("PRAGMA table_info(tailoring_previews)").mappings().all()
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


def _baseline(conn: Connection, schema: str | None) -> None:
    """Revision 1: everything earlier releases did on each start, once."""
    if conn.dialect.name == "postgresql":
        _baseline_postgres(conn, schema)
    else:
        _baseline_sqlite(conn)


def _delete_orphan_improvements(conn: Connection, _schema: str | None) -> None:
    """Revision 2: delete improvements whose tailored resume no longer exists.

    Earlier releases deleted a tailored resume but kept its improvement row. Nothing
    can show that row (every reader goes through the tailored resume, and the queue
    worker checks that it still exists), but it holds text from the deleted resume.
    """
    improvements, resumes = Improvement.__table__, Resume.__table__
    deleted = conn.execute(
        delete(improvements).where(
            ~exists().where(resumes.c.resume_id == improvements.c.tailored_resume_id)
        )
    ).rowcount
    if deleted:
        logger.info("Deleted %d improvement rows left by deleted resumes", deleted)


def _add_resume_photo(conn: Connection, schema: str | None) -> None:
    """Revision 3: ``resumes.photo``, an optional photo for photo CVs."""
    _add_missing_column(conn, Resume.__table__.c.photo, schema)


MIGRATIONS: dict[int, Callable[[Connection, str | None], None]] = {
    1: _baseline,
    2: _delete_orphan_improvements,
    3: _add_resume_photo,
}


def stored_version(conn: Connection) -> int:
    """The schema version recorded in the database; 0 when none is recorded."""
    if not inspect(conn).has_table("schema_version"):
        return 0
    return int(conn.execute(select(_schema_version.c.version)).scalar() or 0)


def _apply(conn: Connection, schema: str | None) -> int:
    current = stored_version(conn)
    if current > SCHEMA_VERSION:
        raise SchemaVersionError(
            f"This database was written by a newer Resume Matcher (schema version "
            f"{current}); this release understands up to version {SCHEMA_VERSION}. "
            "Update Resume Matcher, or restore a backup of the data folder."
        )
    if current == SCHEMA_VERSION:
        return current
    for revision in range(current + 1, SCHEMA_VERSION + 1):
        started = time.perf_counter()
        MIGRATIONS[revision](conn, schema)
        logger.info(
            "Applied database schema revision %d in %.0f ms",
            revision,
            (time.perf_counter() - started) * 1000,
        )
    _schema_version.create(conn, checkfirst=True)
    conn.execute(_schema_version.delete())
    conn.execute(_schema_version.insert().values(version=SCHEMA_VERSION))
    return SCHEMA_VERSION


@contextmanager
def _sqlite_writer(engine: Engine) -> Iterator[Connection]:
    """One transaction that holds SQLite's single writer from the start."""
    with engine.connect() as conn:
        conn.exec_driver_sql("BEGIN IMMEDIATE")
        try:
            yield conn
        except BaseException:
            conn.rollback()
            raise
        conn.commit()


def migrate(engine: Engine, schema: str | None = None) -> int:
    """Bring the database to ``SCHEMA_VERSION``; returns the version it is at."""
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(
                text("SELECT pg_advisory_xact_lock(:ns, hashtext(:schema))"),
                {"ns": PG_INIT_LOCK_NAMESPACE, "schema": schema or "public"},
            )
            if schema:
                conn.exec_driver_sql(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            return _apply(conn, schema)
    with _sqlite_writer(engine) as conn:
        return _apply(conn, schema)
