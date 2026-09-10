"""A manual tracker card and its pasted job are one database operation."""

import asyncio
import sqlite3
from collections.abc import Iterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper, Session

from app.database import Database
from app.main import app
from app.models import Application
from tests.integration.test_storage_busy_writes import fast_busy_database  # noqa: F401


MANUAL_CARD = {
    "resume_id": "synthetic-resume",
    "job_description": "Synthetic engineer job",
    "company": "Synthetic Company",
    "role": "Engineer",
    "status": "saved",
    "notes": "Synthetic note",
}


@pytest.fixture
def client() -> Iterator[AsyncClient]:
    yield AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    )


async def test_manual_card_never_exposes_a_committed_job_without_its_card(
    fast_busy_database: Database,
    client: AsyncClient,
) -> None:
    """A writer arriving after any commit cannot prevent half an operation."""
    database = fast_busy_database
    observer = sqlite3.connect(database.db_path, timeout=0.01)
    observed: list[tuple[int, int]] = []

    def contend_after_commit(session: Session) -> None:
        del session
        jobs = observer.execute("SELECT count(*) FROM jobs").fetchone()[0]
        cards = observer.execute("SELECT count(*) FROM applications").fetchone()[0]
        observed.append((jobs, cards))
        if jobs > cards and not observer.in_transaction:
            observer.execute("BEGIN IMMEDIATE")

    event.listen(Session, "after_commit", contend_after_commit)
    try:
        async with client:
            response = await asyncio.wait_for(
                client.post("/api/v1/applications", json=MANUAL_CARD), timeout=0.5
            )
    finally:
        event.remove(Session, "after_commit", contend_after_commit)
        observer.rollback()
        observer.close()

    assert response.status_code == 200, response.text
    assert observed == [(1, 1)]
    card = response.json()
    job = await database.get_job(card["job_id"])
    assert job is not None
    assert job["content"] == MANUAL_CARD["job_description"]
    assert job["resume_id"] == MANUAL_CARD["resume_id"]
    assert job["company"] == MANUAL_CARD["company"]
    assert job["role"] == MANUAL_CARD["role"]
    assert card["status"] == "saved" and card["applied_at"] is None
    assert card["notes"] == MANUAL_CARD["notes"]


async def test_failed_manual_card_insert_rolls_back_job_even_when_cleanup_would_be_busy(
    fast_busy_database: Database,
    client: AsyncClient,
) -> None:
    """A second writer after rollback must not strand an independently saved job."""
    database = fast_busy_database
    writer = sqlite3.connect(database.db_path, timeout=0.01)
    contended = False

    def reject_card(
        mapper: Mapper[Any], connection: Connection, target: Application
    ) -> None:
        del mapper, connection, target
        raise RuntimeError("Synthetic card insert failure")

    def contend_after_rollback(session: Session) -> None:
        nonlocal contended
        del session
        if not contended:
            writer.execute("BEGIN IMMEDIATE")
            contended = True

    event.listen(Application, "before_insert", reject_card)
    event.listen(Session, "after_rollback", contend_after_rollback)
    try:
        async with client:
            response = await asyncio.wait_for(
                client.post("/api/v1/applications", json=MANUAL_CARD), timeout=0.5
            )
        assert contended
        assert response.status_code == 500
        assert "Synthetic card insert failure" not in response.text
    finally:
        event.remove(Application, "before_insert", reject_card)
        event.remove(Session, "after_rollback", contend_after_rollback)
        writer.rollback()
        writer.close()

    assert (await database.get_stats())["total_jobs"] == 0
    assert await database.list_applications() == []


async def test_cancelled_manual_card_creation_rolls_back_its_job(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
    client: AsyncClient,
) -> None:
    """Cancellation while allocating the card must undo its preceding job insert."""
    database = fast_busy_database
    allocating = asyncio.Event()
    original = database._next_position

    async def pause_position(session: Any, status: str) -> int:
        position = await original(session, status)
        allocating.set()
        await asyncio.Event().wait()
        return position

    monkeypatch.setattr(database, "_next_position", pause_position)
    async with client:
        request = asyncio.create_task(
            client.post("/api/v1/applications", json=MANUAL_CARD)
        )
        try:
            await asyncio.wait_for(allocating.wait(), timeout=1)
            request.cancel()
            with pytest.raises(asyncio.CancelledError):
                await request
        finally:
            if not request.done():
                request.cancel()
            await asyncio.gather(request, return_exceptions=True)

    assert (await database.get_stats())["total_jobs"] == 0
    assert await database.list_applications() == []
