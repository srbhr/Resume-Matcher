"""Dialect-neutral helpers for tests that open a second connection or hold the writer."""

from typing import Any

from app.database import Database, _write_lock_statements


def same_database(database: Database) -> Database:
    """Another Database instance on the same file or Postgres schema."""
    if database.url:
        return Database(url=database.url, schema=database.schema)
    return Database(db_path=database.db_path)


async def hold_writer(session: Any) -> None:
    """Take the single-writer reservation the way Database._write_session does."""
    postgres = session.bind.dialect.name == "postgresql"
    for statement in _write_lock_statements(postgres, lock_timeout_ms=0):
        await session.execute(statement)
