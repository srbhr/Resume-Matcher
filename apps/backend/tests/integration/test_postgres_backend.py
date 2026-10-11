"""PostgreSQL write serialization and setup against a real server (TEST_DATABASE_URL)."""

import asyncio
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import Database, DatabaseBusyError
from app.models import Application, Resume
from app.scripts.copy_sqlite_to_postgres import copy_rows
from tests.conftest import drop_postgres_schema, postgres_test_url
from tests.db_helpers import same_database

pytestmark = [pytest.mark.integration, pytest.mark.postgres]


@pytest.fixture
async def make_db() -> AsyncIterator[Callable[[str | None], Database]]:
    opened: list[Database] = []

    def make(schema: str | None = None) -> Database:
        database = Database(
            url=postgres_test_url(), schema=schema or f"t_{uuid4().hex[:20]}"
        )
        opened.append(database)
        return database

    yield make
    for database in opened:
        await database.close()
    for schema in {database.schema for database in opened}:
        assert schema
        drop_postgres_schema(schema)


async def test_second_writer_waits_then_sees_the_first_commit(
    make_db: Callable[[str | None], Database],
) -> None:
    first = make_db(None)
    second = same_database(first)
    await second.list_applications()
    async with first._write_session() as session:
        session.add(
            Application(application_id="a0", job_id="j0", resume_id="r0", position=0)
        )
        await session.flush()
        waiting = asyncio.create_task(
            second.create_application(job_id="j1", resume_id="r1")
        )
        await asyncio.sleep(0.3)
        assert not waiting.done()
        await session.commit()
    created = await waiting
    assert created["position"] == 1
    await second.close()


async def test_lock_timeout_raises_busy(
    make_db: Callable[[str | None], Database],
) -> None:
    first = make_db(None)
    second = same_database(first)
    second.lock_timeout_ms = 50
    async with first._write_session():
        with pytest.raises(DatabaseBusyError):
            await second.create_job("Engineer")
    assert (await second.get_stats())["total_jobs"] == 0
    await second.close()


async def test_schemas_do_not_block_each_other(
    make_db: Callable[[str | None], Database],
) -> None:
    first, other = make_db(None), make_db(None)
    await other.list_resumes()
    async with first._write_session():
        job = await asyncio.wait_for(other.create_job("Engineer"), timeout=2)
    assert await other.get_job(job["job_id"]) is not None
    assert (await first.get_stats())["total_jobs"] == 0


async def test_only_one_default_master(
    make_db: Callable[[str | None], Database],
) -> None:
    database = make_db(None)
    await database.list_resumes()
    async with database._session() as session:
        for i in range(2):
            session.add(
                Resume(
                    resume_id=f"m{i}",
                    content="x",
                    is_master=True,
                    is_default_master=i == 0,
                )
            )
        await session.commit()
        session.add(
            Resume(resume_id="m2", content="x", is_master=True, is_default_master=True)
        )
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_concurrent_startup_creates_the_schema_once(
    make_db: Callable[[str | None], Database],
) -> None:
    schema = f"t_{uuid4().hex[:20]}"
    first, second = make_db(schema), make_db(schema)
    await asyncio.gather(
        asyncio.to_thread(first._ensure_initialized),
        asyncio.to_thread(second._ensure_initialized),
    )
    created = await first.create_job("Engineer")
    assert await second.get_job(created["job_id"]) is not None


async def test_copy_sqlite_into_postgres(
    make_db: Callable[[str | None], Database], tmp_path: Path
) -> None:
    source = Database(db_path=tmp_path / "source.db")
    resume = await source.create_resume(
        content="x", processed_data={"summary": "s"}, processing_status="ready"
    )
    await source.create_job("Engineer", resume["resume_id"])
    source.set_api_key_ciphertext("openai", "ciphertext")
    target = make_db(None)
    counts = copy_rows(source, target)
    assert counts["resumes"] == counts["jobs"] == counts["api_keys"] == 1
    assert await target.get_resume(resume["resume_id"]) == await source.get_resume(
        resume["resume_id"]
    )
    assert target.get_api_key_ciphertexts() == {"openai": "ciphertext"}
    await source.close()
