"""Tailoring queue endpoints and storage against the real per-test database."""

from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database, DatabaseBusyError
from app.main import app
from tests.db_helpers import hold_writer
from tests.integration.test_storage_busy_writes import (  # noqa: F401 - fixture
    fast_busy_database,
)

JOB_DESCRIPTION = (
    "Job Title: Fullstack Dev\nCompany: Stripe\nReq ID: REQ-42\n"
    "Build payment APIs in Python."
)


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def enqueue(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    mock = MagicMock()
    monkeypatch.setattr("app.routers.jobs.queue_manager.notify", mock)
    return mock


async def _master(database: Database) -> str:
    row = await database.create_resume(
        content="Synthetic resume", is_master=True, processing_status="ready"
    )
    return row["resume_id"]


async def test_parse_metadata_endpoint(client: AsyncClient) -> None:
    async with client:
        resp = await client.post(
            "/api/v1/jobs/parse-metadata",
            json={
                "job_description": "Job Title: Staff Engineer\nCompany: Acme Corp\n"
                "Req ID: REQ-9988\nDetails here..."
            },
        )
    assert resp.status_code == 200
    assert resp.json() == {
        "role": "Staff Engineer",
        "company": "Acme Corp",
        "job_req_id": "REQ-9988",
    }


async def test_add_persists_detected_metadata_and_wakes_worker(
    isolated_db: Database, enqueue: MagicMock, client: AsyncClient
) -> None:
    resume_id = await _master(isolated_db)
    async with client:
        resp = await client.post(
            "/api/v1/jobs/queue",
            json={"resume_id": resume_id, "job_description": JOB_DESCRIPTION},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["role"], body["company"], body["job_req_id"]) == (
        "Fullstack Dev",
        "Stripe",
        "REQ-42",
    )
    assert body["status"] == "pending"
    stored = await isolated_db.get_queue_item(body["item_id"])
    assert stored is not None
    assert stored["job_description"] == JOB_DESCRIPTION
    enqueue.assert_called_once_with()


async def test_add_prefers_user_metadata_over_detection(
    isolated_db: Database, enqueue: MagicMock, client: AsyncClient
) -> None:
    resume_id = await _master(isolated_db)
    async with client:
        resp = await client.post(
            "/api/v1/jobs/queue",
            json={
                "resume_id": resume_id,
                "job_description": JOB_DESCRIPTION,
                "role": "Platform Engineer",
                "company": "  ",
            },
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["role"] == "Platform Engineer"
    assert resp.json()["company"] == "Stripe"


async def test_add_rejects_unknown_resume_and_blank_description(
    isolated_db: Database, enqueue: MagicMock, client: AsyncClient
) -> None:
    resume_id = await _master(isolated_db)
    async with client:
        missing = await client.post(
            "/api/v1/jobs/queue",
            json={"resume_id": "nope", "job_description": JOB_DESCRIPTION},
        )
        blank = await client.post(
            "/api/v1/jobs/queue",
            json={"resume_id": resume_id, "job_description": "   "},
        )
    assert missing.status_code == 404
    assert blank.status_code == 400
    assert await isolated_db.get_queue() == []
    enqueue.assert_not_called()


async def test_list_filters_by_resume_newest_first(
    isolated_db: Database, client: AsyncClient
) -> None:
    first = await isolated_db.create_queue_item("q1", "r1", "JD one")
    second = await isolated_db.create_queue_item("q2", "r1", "JD two")
    await isolated_db.create_queue_item("q3", "r2", "JD three")
    async with client:
        resp = await client.get("/api/v1/jobs/queue", params={"resume_id": "r1"})
    assert resp.status_code == 200
    ids = [item["item_id"] for item in resp.json()]
    assert set(ids) == {first["item_id"], second["item_id"]}
    assert ids == [
        item["item_id"] for item in await isolated_db.get_queue(resume_id="r1")
    ]


async def test_delete_and_clear_remove_rows(
    isolated_db: Database, client: AsyncClient
) -> None:
    await isolated_db.create_queue_item("q1", "r1", "JD one")
    await isolated_db.create_queue_item("q2", "r1", "JD two")
    await isolated_db.update_queue_item("q2", {"status": "completed"})
    async with client:
        deleted = await client.delete("/api/v1/jobs/queue/q1")
        missing = await client.delete("/api/v1/jobs/queue/q1")
        cleared = await client.delete(
            "/api/v1/jobs/queue", params={"status": "completed"}
        )
    assert deleted.status_code == 200
    assert missing.status_code == 404
    assert cleared.json() == {"cleared_count": 1}
    assert await isolated_db.get_queue() == []


async def test_update_ignores_unknown_and_primary_key_fields(
    isolated_db: Database,
) -> None:
    await isolated_db.create_queue_item("q1", "r1", "JD one")
    updated = await isolated_db.update_queue_item(
        "q1", {"item_id": "other", "status": "failed", "bogus": 1}
    )
    assert updated is not None
    assert updated["item_id"] == "q1"
    assert updated["status"] == "failed"
    assert await isolated_db.update_queue_item("missing", {"status": "failed"}) is None


async def test_queue_writes_take_the_write_reservation(
    fast_busy_database: Database,
) -> None:
    database = fast_busy_database
    await database.create_queue_item("q1", "r1", "JD one")
    async with database._session() as writer:
        await hold_writer(writer)
        with pytest.raises(DatabaseBusyError):
            await database.create_queue_item("q2", "r1", "JD two")
        with pytest.raises(DatabaseBusyError):
            await database.update_queue_item("q1", {"status": "failed"})
        with pytest.raises(DatabaseBusyError):
            await database.clear_queue()
    stored = await database.get_queue_item("q1")
    assert stored is not None and stored["status"] == "pending"
    assert [item["item_id"] for item in await database.get_queue()] == ["q1"]


async def test_contended_add_returns_503(
    fast_busy_database: Database, enqueue: MagicMock, client: AsyncClient
) -> None:
    resume_id = await _master(fast_busy_database)
    async with client:
        async with fast_busy_database._session() as writer:
            await hold_writer(writer)
            resp = await client.post(
                "/api/v1/jobs/queue",
                json={"resume_id": resume_id, "job_description": JOB_DESCRIPTION},
            )
    assert resp.status_code == 503
    assert resp.headers["retry-after"] == "1"
    assert await fast_busy_database.get_queue() == []
    enqueue.assert_not_called()


async def test_reset_database_clears_the_queue(isolated_db: Database) -> None:
    await isolated_db.create_queue_item("q1", "r1", "JD one")
    await isolated_db.reset_database()
    assert await isolated_db.get_queue() == []
