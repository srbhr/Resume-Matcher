"""One-time copy of the SQLite database into the PostgreSQL target set by DATABASE_URL.

Refuses to write into a target that already has rows, so it is safe to rerun.
Encrypted API keys are copied as ciphertext: keep the same ``data/.secret_key``.

Run with ``uv run python -m app.scripts.copy_sqlite_to_postgres [--source path]``.
"""

import argparse
import asyncio
import logging
from pathlib import Path

from sqlalchemy import func, insert, select

from app.config import settings
from app.database import Database
from app.db_url import redact
from app.models import Base

logger = logging.getLogger(__name__)


class TargetNotEmptyError(RuntimeError):
    """The target already holds data; copying would mix two databases."""


def copy_rows(source: Database, target: Database) -> dict[str, int]:
    """Copy every table from source to target in one locked target transaction."""
    source._ensure_initialized()
    target._ensure_initialized()
    assert source._sync_engine is not None and target._sync_engine is not None
    tables = Base.metadata.sorted_tables
    counts: dict[str, int] = {}
    with source._sync_engine.connect() as src, target._sync_engine.begin() as dst:
        for statement in target._write_lock():
            dst.execute(statement)
        for table in tables:
            if dst.execute(select(func.count()).select_from(table)).scalar():
                raise TargetNotEmptyError(f"Target table {table.name} is not empty.")
        for table in tables:
            rows = [dict(row) for row in src.execute(select(table)).mappings()]
            if rows:
                dst.execute(insert(table), rows)
            counts[table.name] = len(rows)
    return counts


async def _close(*databases: Database) -> None:
    for database in databases:
        await database.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=Path, default=settings.sqlite_path)
    args = parser.parse_args()
    if not settings.database_url:
        raise SystemExit("Set DATABASE_URL to the PostgreSQL target first.")
    if not args.source.is_file():
        raise SystemExit(f"SQLite database not found: {args.source}")
    source = Database(db_path=args.source)
    target = Database(url=settings.database_url, schema=settings.database_schema)
    try:
        counts = copy_rows(source, target)
    except TargetNotEmptyError as e:
        raise SystemExit(str(e)) from e
    finally:
        asyncio.run(_close(source, target))
    logger.info("Copied %s into %s", counts, redact(settings.database_url))


if __name__ == "__main__":
    main()
