"""The database records its schema version and upgrades itself once, in order."""

import random
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from app import schema_migrations
from app.database import Database
from app.db_engine import make_sync_engine
from app.models import Base
from app.schema_migrations import SCHEMA_VERSION, SchemaVersionError, migrate

TABLES = (
    "resumes",
    "jobs",
    "improvements",
    "tailoring_previews",
    "applications",
    "api_keys",
    "queue_items",
)


def version_of(path: Path) -> int:
    engine = make_sync_engine(path)
    try:
        with engine.connect() as conn:
            return schema_migrations.stored_version(conn)
    finally:
        engine.dispose()


def counts(path: Path) -> dict[str, int]:
    engine = make_sync_engine(path)
    try:
        with engine.connect() as conn:
            return {
                t: conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar_one()
                for t in TABLES
            }
    finally:
        engine.dispose()


def test_a_new_database_gets_every_model_table_at_the_current_version(
    tmp_path: Path,
) -> None:
    engine = make_sync_engine(tmp_path / "new.db")
    try:
        assert migrate(engine) == SCHEMA_VERSION
        with engine.connect() as conn:
            schema = inspect(conn)
            for table in Base.metadata.sorted_tables:
                assert {c["name"] for c in schema.get_columns(table.name)} == {
                    c.name for c in table.columns
                }, table.name
    finally:
        engine.dispose()
    assert version_of(tmp_path / "new.db") == SCHEMA_VERSION


def test_a_database_at_the_current_version_runs_no_revision(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = make_sync_engine(tmp_path / "db.db")
    try:
        migrate(engine)

        def must_not_run(*_: object) -> None:
            raise AssertionError("a revision ran on an up-to-date database")

        monkeypatch.setitem(schema_migrations.MIGRATIONS, 1, must_not_run)
        assert migrate(engine) == SCHEMA_VERSION
    finally:
        engine.dispose()


async def test_an_unversioned_database_from_an_earlier_release_keeps_every_row(
    tmp_path: Path,
) -> None:
    path = tmp_path / "earlier.db"
    db = Database(db_path=path)
    master = await db.create_resume(content="# A", is_master=True)
    tailored = await db.create_resume(content="# B", parent_id=master["resume_id"])
    job = await db.create_job("Synthetic job")
    await db.create_improvement(
        original_resume_id=master["resume_id"],
        tailored_resume_id=tailored["resume_id"],
        job_id=job["job_id"],
        improvements=[],
    )
    await db.create_application(job_id=job["job_id"], resume_id=tailored["resume_id"])
    await db.create_queue_item("q1", master["resume_id"], "Synthetic job")
    db.set_api_key_ciphertext("openai", "ciphertext")
    await db.close()
    # Earlier releases had no version table.
    engine = make_sync_engine(path)
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE schema_version")
    engine.dispose()
    before = counts(path)
    assert version_of(path) == 0

    engine = make_sync_engine(path)
    try:
        assert migrate(engine) == SCHEMA_VERSION
    finally:
        engine.dispose()

    assert version_of(path) == SCHEMA_VERSION
    assert counts(path) == before
    assert before["resumes"] == 2 and before["api_keys"] == 1


async def test_a_newer_database_is_refused_and_left_untouched(tmp_path: Path) -> None:
    path = tmp_path / "newer.db"
    engine = make_sync_engine(path)
    migrate(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql("UPDATE schema_version SET version = 99")
    with pytest.raises(SchemaVersionError) as refused:
        migrate(engine)
    engine.dispose()

    message = str(refused.value)
    assert "schema version 99" in message
    assert f"up to version {SCHEMA_VERSION}" in message
    assert version_of(path) == 99

    # The app opens the database through Database, so it refuses to start too.
    db = Database(db_path=path)
    with pytest.raises(SchemaVersionError):
        await db.get_stats()
    await db.close()


def test_two_processes_starting_together_record_one_version(tmp_path: Path) -> None:
    path = tmp_path / "shared.db"
    engines = [make_sync_engine(path) for _ in range(2)]
    start = threading.Barrier(len(engines))
    results: list[int] = []
    errors: list[BaseException] = []

    def start_up(engine: object) -> None:
        start.wait()
        try:
            results.append(migrate(engine))  # type: ignore[arg-type]
        except BaseException as error:  # noqa: BLE001 - reported below
            errors.append(error)

    threads = [threading.Thread(target=start_up, args=(e,)) for e in engines]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    for engine in engines:
        engine.dispose()

    assert errors == []
    assert results == [SCHEMA_VERSION, SCHEMA_VERSION]
    engine = make_sync_engine(path)
    try:
        with engine.connect() as conn:
            rows = conn.exec_driver_sql("SELECT version FROM schema_version").all()
    finally:
        engine.dispose()
    assert rows == [(SCHEMA_VERSION,)]


def test_stored_timestamps_sort_in_time_order() -> None:
    """Timestamps are ISO strings compared as text (models._utcnow_iso).

    ``isoformat()`` drops the microseconds when they are zero, so the strings
    differ in length; text order must still be time order.
    """
    rng = random.Random(1907)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    moments = [base + timedelta(seconds=rng.randrange(10**7)) for _ in range(300)]
    moments += [
        m.replace(microsecond=rng.choice([0, 1, 500_000, 999_999])) for m in moments
    ]
    assert sorted(m.isoformat() for m in moments) == [
        m.isoformat() for m in sorted(moments)
    ]
