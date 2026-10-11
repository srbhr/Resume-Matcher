"""Dialect-neutral helpers for tests that open a second connection or hold the writer."""

from typing import Any

from app.database import WRITE_LOCK_TIMEOUT_MS, Database, _write_lock_statements


def same_database(database: Database) -> Database:
    """Another Database instance on the same file or Postgres schema."""
    if database.url:
        return Database(url=database.url, schema=database.schema)
    return Database(db_path=database.db_path)


async def hold_writer(session: Any) -> None:
    """Take the single-writer reservation the way Database._write_session does.

    The timeout is finite (0 would disable it in PostgreSQL), so a stuck test fails
    with a lock error instead of hanging the suite.
    """
    postgres = session.bind.dialect.name == "postgresql"
    for statement in _write_lock_statements(postgres, WRITE_LOCK_TIMEOUT_MS):
        await session.execute(statement)
