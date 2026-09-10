"""Real-storage regression tests for atomic writes and tracker ordering."""

import asyncio
from collections.abc import Iterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapper

from app.database import Database
from app.main import app
from app.models import Job, Resume


@pytest.fixture
def failing_insert() -> Iterator[None]:
    """Fail after preceding transaction work, at the actual ORM insert."""

    def reject_resume(
        _mapper: Mapper[Any], _connection: Connection, target: Resume
    ) -> None:
        if target.filename == "fail.pdf":
            raise RuntimeError("Synthetic insert failure")

    def reject_job(_mapper: Mapper[Any], _connection: Connection, target: Job) -> None:
        if target.content == "fail":
            raise RuntimeError("Synthetic insert failure")

    event.listen(Resume, "before_insert", reject_resume)
    event.listen(Job, "before_insert", reject_job)
    yield
    event.remove(Resume, "before_insert", reject_resume)
    event.remove(Job, "before_insert", reject_job)


async def test_failed_replacement_keeps_previous_master(
    isolated_db: Database,
    failing_insert: None,
) -> None:
    old = await isolated_db.create_resume_atomic_master(
        content="original", processing_status="failed"
    )
    with pytest.raises(RuntimeError, match="Synthetic insert failure"):
        await isolated_db.create_resume_atomic_master(
            content="replacement", filename="fail.pdf"
        )
    master = await isolated_db.get_master_resume()
    assert master is not None and master["resume_id"] == old["resume_id"]
    assert len(await isolated_db.list_resumes()) == 1


async def test_concurrent_replacements_and_late_completion_preserve_master_identity(
    isolated_db: Database,
) -> None:
    old = await isolated_db.create_resume_atomic_master(
        content="old", processing_status="processing"
    )
    other = Database(db_path=isolated_db.db_path)
    await other.list_resumes()
    start = asyncio.Event()

    async def replace(database: Database, name: str) -> dict[str, Any]:
        await start.wait()
        return await database.create_resume_atomic_master(
            content=name, processing_status="ready"
        )

    tasks = [
        asyncio.create_task(replace(isolated_db, "first")),
        asyncio.create_task(replace(other, "second")),
    ]
    start.set()
    try:
        created = await asyncio.gather(*tasks)
        assert sum(row["is_master"] for row in created) == 1
        master_id = next(row["resume_id"] for row in created if row["is_master"])
        # Processing completion writes its original ID, never a cached master flag.
        completed = await other.update_resume(
            old["resume_id"],
            {
                "processed_data": {"summary": "late original"},
                "processing_status": "ready",
            },
        )
        assert completed["is_master"] is False
        master = await isolated_db.get_master_resume()
        assert master is not None and master["resume_id"] == master_id
        with pytest.raises(IntegrityError):
            await other.create_resume(content="duplicate", is_master=True)
        assert len(await isolated_db.list_resumes()) == 3
    finally:
        await other.close()


@pytest.mark.parametrize(
    "descriptions,expected_status", [(["valid", "  "], 400), (["valid", "fail"], 500)]
)
async def test_job_upload_failure_persists_none_of_the_batch(
    isolated_db: Database,
    failing_insert: None,
    descriptions: list[str],
    expected_status: int,
) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/v1/jobs/upload", json={"job_descriptions": descriptions}
        )
    assert response.status_code == expected_status
    async with isolated_db._session() as session:
        assert list((await session.execute(select(Job))).scalars()) == []


async def test_concurrent_creates_allocate_distinct_contiguous_positions(
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first_counted = asyncio.Event()
    all_counted = asyncio.Event()
    release = asyncio.Event()
    original = isolated_db._next_position
    counted = 0

    async def hold_allocation(session: Any, status: str) -> int:
        nonlocal counted
        position = await original(session, status)
        counted += 1
        first_counted.set()
        if counted == 8:
            all_counted.set()
        await release.wait()
        return position

    monkeypatch.setattr(isolated_db, "_next_position", hold_allocation)
    tasks = [
        asyncio.create_task(
            isolated_db.create_application(job_id=f"j{i}", resume_id=f"r{i}")
        )
        for i in range(8)
    ]
    await first_counted.wait()
    try:
        # On the old implementation all transactions read the same count.
        # A serialized writer correctly keeps later allocations outside this
        # critical section until the first transaction is released.
        await asyncio.wait_for(all_counted.wait(), timeout=0.5)
    except TimeoutError:
        pass
    finally:
        release.set()
    created = await asyncio.gather(*tasks)
    assert sorted(card["position"] for card in created) == list(range(8))
    saved = await isolated_db.list_applications("applied")
    assert [card["position"] for card in saved] == list(range(8))
    assert len({(card["job_id"], card["resume_id"]) for card in saved}) == 8


async def test_null_status_is_rejected_but_omitted_status_and_nullable_notes_work(
    isolated_db: Database,
) -> None:
    card = await isolated_db.create_application(
        job_id="job", resume_id="resume", notes="old"
    )
    url = f"/api/v1/applications/{card['application_id']}"
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        invalid = await client.patch(url, json={"status": None})
        assert invalid.status_code == 422
        updated = await client.patch(url, json={"notes": None})
    assert updated.status_code == 200
    assert updated.json()["status"] == "applied"
    assert updated.json()["notes"] is None


async def test_create_move_and_bulk_delete_share_column_ordering(
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cards = [
        await isolated_db.create_application(job_id=f"j{i}", resume_id=f"r{i}")
        for i in range(6)
    ]
    for i in range(2):
        await isolated_db.create_application(
            job_id=f"s{i}", resume_id=f"s{i}", status="saved"
        )
    other = Database(db_path=isolated_db.db_path)
    await other.list_applications()  # Initialize both instances before contention.
    counted = asyncio.Event()
    release = asyncio.Event()
    original = isolated_db._next_position

    async def hold_create(session: Any, status: str) -> int:
        position = await original(session, status)
        counted.set()
        await release.wait()
        return position

    monkeypatch.setattr(isolated_db, "_next_position", hold_create)
    creation = asyncio.create_task(
        isolated_db.create_application(job_id="new", resume_id="new")
    )
    await counted.wait()
    mutations = asyncio.gather(
        other.update_application(
            cards[0]["application_id"], {"status": "saved", "position": 0}
        ),
        other.bulk_update_applications(
            [cards[1]["application_id"], cards[2]["application_id"]], "saved"
        ),
        other.delete_application(cards[3]["application_id"]),
        other.bulk_delete_applications([cards[4]["application_id"]]),
    )
    try:
        try:
            await asyncio.wait_for(asyncio.shield(mutations), timeout=0.5)
        except TimeoutError:
            pass
        finally:
            release.set()
        await creation
        await mutations
        for status, count in [("applied", 2), ("saved", 5)]:
            rows = await isolated_db.list_applications(status)
            assert [row["position"] for row in rows] == list(range(count))
    finally:
        await other.close()


async def test_application_dates_stamp_on_application_transition_and_preserve_manual_values(
    isolated_db: Database,
) -> None:
    first = await isolated_db.create_application(
        job_id="j1", resume_id="r1", status="saved"
    )
    manual = await isolated_db.create_application(
        job_id="j2", resume_id="r2", status="saved", applied_at="2025-01-02"
    )
    bulk = await isolated_db.create_application(
        job_id="j3", resume_id="r3", status="saved"
    )
    moved = await isolated_db.update_application(
        first["application_id"], {"status": "applied"}
    )
    assert moved is not None and moved["applied_at"] is not None
    await isolated_db.bulk_update_applications(
        [manual["application_id"], bulk["application_id"]], "interview"
    )
    assert (await isolated_db.get_application(manual["application_id"]))[
        "applied_at"
    ] == "2025-01-02"
    assert (await isolated_db.get_application(bulk["application_id"]))[
        "applied_at"
    ] is not None
    cleared = await isolated_db.update_application(
        first["application_id"], {"applied_at": None}
    )
    assert cleared is not None and cleared["applied_at"] is None


@pytest.mark.parametrize("bulk", [False, True])
async def test_cleared_dates_remain_empty_until_a_new_saved_to_applied_transition(
    isolated_db: Database,
    bulk: bool,
) -> None:
    row = await isolated_db.create_application(job_id="job", resume_id="resume")
    row_id = row["application_id"]
    await isolated_db.update_application(row_id, {"applied_at": None})

    async def move(status: str) -> dict[str, Any]:
        if bulk:
            await isolated_db.bulk_update_applications([row_id], status)
        else:
            await isolated_db.update_application(row_id, {"status": status})
        result = await isolated_db.get_application(row_id)
        assert result is not None
        return result

    assert (await move("interview"))["applied_at"] is None
    assert (await move("saved"))["applied_at"] is None
    assert (await move("applied"))["applied_at"] is not None
    # An explicit clear in the same individual patch always wins over stamping.
    await move("saved")
    explicit_clear = await isolated_db.update_application(
        row_id, {"status": "applied", "applied_at": None}
    )
    assert explicit_clear is not None and explicit_clear["applied_at"] is None


def test_status_openapi_excludes_null_but_allows_omission() -> None:
    from app.schemas.applications import ApplicationUpdate
    schema = ApplicationUpdate.model_json_schema()
    assert {"type": "null"} not in schema["properties"]["status"].get("anyOf", [])
    assert "status" not in schema.get("required", [])
    assert ApplicationUpdate().model_dump(exclude_unset=True) == {}


async def test_sqlite_contention_is_retryable_503(isolated_db: Database) -> None:
    card = await isolated_db.create_application(job_id="job", resume_id="resume")
    async with isolated_db._write_session():
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            response = await client.patch(f"/api/v1/applications/{card['application_id']}", json={"notes": "changed"})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    stored = await isolated_db.get_application(card["application_id"])
    assert stored is not None and stored["notes"] is None


async def test_existing_tracker_card_does_not_wait_for_writer(isolated_db: Database) -> None:
    card = await isolated_db.create_application(job_id="job", resume_id="resume")
    async with isolated_db._write_session():
        duplicate = await asyncio.wait_for(isolated_db.create_application(job_id="job", resume_id="resume"), 0.2)
    assert duplicate == card


async def test_job_upload_contention_is_retryable_without_partial_batch(isolated_db: Database) -> None:
    seed = await isolated_db.create_job("existing job")
    async with isolated_db._write_session():
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
            response = await client.post("/api/v1/jobs/upload", json={"job_descriptions": ["Python engineer", "Data engineer"]})
    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    async with isolated_db._session() as session:
        saved_ids = list((await session.execute(select(Job.job_id))).scalars())
    assert saved_ids == [seed["job_id"]]


async def test_busy_manual_card_creation_cleans_up_its_job(isolated_db: Database, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.database import DatabaseBusyError
    from unittest.mock import AsyncMock
    monkeypatch.setattr(isolated_db, "_insert_application", AsyncMock(side_effect=DatabaseBusyError("synthetic contention")))
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test") as client:
        response = await client.post("/api/v1/applications", json={"resume_id": "synthetic", "job_description": "Engineer", "company": "Acme", "role": "Engineer"})
    assert response.status_code == 503
    async with isolated_db._session() as session:
        assert list((await session.execute(select(Job))).scalars()) == []
