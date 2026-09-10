"""Busy processing completion must retain cleanup ownership after HTTP return."""

import asyncio
import logging
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text, update

from app import main as main_module
from app.database import Database
from app.main import app
from app.models import Resume
from app.routers import resumes
from tests.integration.test_storage_busy_writes import fast_busy_database  # noqa: F401
from tests.integration.test_upload_processing import _docx_bytes


async def test_unclaimed_upload_cannot_be_published_ready(
    fast_busy_database: Database,
) -> None:
    row = await fast_busy_database.create_resume(
        content="Synthetic upload", processing_status="processing"
    )
    with pytest.raises(ValueError, match="ownership token"):
        await fast_busy_database.finish_resume_processing(
            row["resume_id"], None, processing_status="ready"
        )
    stored = await fast_busy_database.get_resume(row["resume_id"])
    assert stored is not None and stored["processing_status"] == "processing"


async def test_sustained_contention_exhausts_retirement_and_allows_later_retry(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    sample_resume: dict[str, Any],
) -> None:
    """A permanent writer lock cannot retain a background task indefinitely."""
    database = fast_busy_database
    row = await database.create_resume(
        content="Synthetic resume", processing_status="failed"
    )
    token = await database.claim_resume_processing(row["resume_id"])
    assert token is not None
    writer = database._session()
    await writer.__aenter__()
    await writer.execute(text("BEGIN IMMEDIATE"))
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.005)
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_MAX_ATTEMPTS", 2, raising=False
    )
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_INITIAL_BACKOFF_SECONDS", 0.001,
        raising=False,
    )
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_MAX_BACKOFF_SECONDS", 0.001,
        raising=False,
    )
    caplog.set_level(logging.ERROR, logger=resumes.__name__)

    background: list[asyncio.Task[Any]] = []
    try:
        await resumes._finish_cancelled_processing(row["resume_id"], token)
        background = list(resumes._PROCESSING_CLEANUP_TASKS)
        assert background
        done, pending = await asyncio.wait(background, timeout=0.25)
        assert not pending, "sustained contention kept retirement alive indefinitely"
        assert all(isinstance(task.exception(), Exception) for task in done)
        assert "exhausted 2 attempts" in caplog.text
    finally:
        for task in background:
            if not task.done():
                task.cancel()
        if background:
            await asyncio.gather(*background, return_exceptions=True)
        await writer.rollback()
        await writer.__aexit__(None, None, None)

    stored = await database.get_resume(row["resume_id"])
    assert stored is not None and stored["processing_status"] == "processing"

    async def parse_after_lock_release(content: str) -> dict[str, Any]:
        assert content == "Synthetic resume"
        return sample_resume

    monkeypatch.setattr(resumes, "parse_resume_to_json", parse_after_lock_release)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        retried = await client.post(
            f"/api/v1/resumes/{row['resume_id']}/retry-processing"
        )
    assert retried.status_code == 200, retried.text
    stored = await database.get_resume(row["resume_id"])
    assert stored is not None and stored["processing_status"] == "ready"
    assert stored["processed_data"] == sample_resume


async def test_lifespan_reaps_contended_retirement_before_database_close(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shutdown cancels and settles an owned SQLite attempt before disposal."""
    database = fast_busy_database
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.005)
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_MAX_ATTEMPTS", 100, raising=False
    )
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_INITIAL_BACKOFF_SECONDS", 1.0,
        raising=False,
    )
    monkeypatch.setattr(
        resumes, "_PROCESSING_RETIREMENT_MAX_BACKOFF_SECONDS", 1.0,
        raising=False,
    )
    monkeypatch.setattr(
        resumes, "_PROCESSING_SHUTDOWN_GRACE_SECONDS", 0.001, raising=False
    )
    original_close = database.close
    original_finish = database.finish_resume_processing
    background: list[asyncio.Task[Any]] = []
    close_observations: list[bool] = []
    attempt_started, attempt_settled = asyncio.Event(), asyncio.Event()

    async def observed_finish(*args: Any, **kwargs: Any) -> Any:
        attempt_started.set()
        try:
            return await original_finish(*args, **kwargs)
        finally:
            attempt_settled.set()

    async def observed_close() -> None:
        close_observations.append(
            attempt_settled.is_set()
            and all(task.done() for task in background)
        )
        await original_close()

    monkeypatch.setattr(database, "finish_resume_processing", observed_finish)
    monkeypatch.setattr(main_module.db, "close", observed_close)
    writer = database._session()
    try:
        async with app.router.lifespan_context(app):
            row = await database.create_resume(
                content="Synthetic resume", processing_status="failed"
            )
            token = await database.claim_resume_processing(row["resume_id"])
            assert token is not None
            await writer.__aenter__()
            await writer.execute(text("BEGIN IMMEDIATE"))
            await resumes._finish_cancelled_processing(row["resume_id"], token)
            await attempt_started.wait()
            assert not attempt_settled.is_set()
            background = list(resumes._PROCESSING_CLEANUP_TASKS)
            assert background and any(not task.done() for task in background)
    finally:
        for task in background:
            if not task.done():
                task.cancel()
        if background:
            await asyncio.gather(*background, return_exceptions=True)
        await writer.rollback()
        await writer.__aexit__(None, None, None)

    assert close_observations == [True]
    assert not resumes._PROCESSING_CLEANUP_TASKS


@pytest.mark.parametrize("superseded", [False, True])
async def test_busy_processing_finish_is_retired_after_caller_returns(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
    sample_resume: dict[str, Any],
    superseded: bool,
) -> None:
    database = fast_busy_database
    row = await database.create_resume(
        content="Synthetic resume", processing_status="failed"
    )
    writer = database._session()
    await writer.__aenter__()
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.03)

    async def parsed_with_writer_held(*args: Any, **kwargs: Any) -> dict[str, Any]:
        del args, kwargs
        await writer.execute(text("BEGIN IMMEDIATE"))
        return sample_resume

    monkeypatch.setattr(resumes, "parse_resume_to_json", parsed_with_writer_held)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            response = await asyncio.wait_for(
                client.post(f"/api/v1/resumes/{row['resume_id']}/retry-processing"),
                timeout=0.5,
            )
        assert response.status_code == 503
        assert response.headers["retry-after"] == "1"
        assert resumes._PROCESSING_CLEANUP_TASKS
        if superseded:
            await writer.execute(
                update(Resume)
                .where(Resume.resume_id == row["resume_id"])
                .values(
                    processing_token=None,
                    processing_status="ready",
                    processed_data={"summary": "newer saved result"},
                )
            )
        await writer.commit()
    finally:
        await writer.__aexit__(None, None, None)
        await asyncio.wait_for(
            asyncio.gather(*resumes._PROCESSING_CLEANUP_TASKS), timeout=1
        )

    stored = await database.get_resume(row["resume_id"])
    assert stored is not None
    assert stored["processing_status"] == ("ready" if superseded else "failed")
    assert stored["processed_data"] == (
        {"summary": "newer saved result"} if superseded else None
    )
    async with database._session() as session:
        saved = await session.get(Resume, row["resume_id"])
        assert saved is not None and saved.processing_token is None


async def test_busy_claim_preserves_the_existing_processing_owner(
    fast_busy_database: Database,
) -> None:
    database = fast_busy_database
    row = await database.create_resume(
        content="Synthetic resume", processing_status="failed"
    )
    token = await database.claim_resume_processing(row["resume_id"])
    assert token is not None
    async with database._session() as writer:
        await writer.execute(text("BEGIN IMMEDIATE"))
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            response = await client.post(
                f"/api/v1/resumes/{row['resume_id']}/retry-processing"
            )
    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert await database.finish_resume_processing(
        row["resume_id"],
        token,
        processing_status="ready",
        processed_data={"summary": "original owner"},
    ) == "committed"


@pytest.mark.parametrize("replacement", ["none", "claim", "save"])
async def test_busy_first_upload_claim_retires_only_its_unclaimed_row(
    fast_busy_database: Database,
    monkeypatch: pytest.MonkeyPatch,
    replacement: str,
) -> None:
    database = fast_busy_database
    writer = database._session()
    await writer.__aenter__()
    original_create = database.create_resume_atomic_master
    uploaded_id: str | None = None
    monkeypatch.setattr(resumes, "_PROCESSING_CLEANUP_TIMEOUT_SECONDS", 0.03)

    async def create_before_contention(**values: Any) -> dict[str, Any]:
        nonlocal uploaded_id
        row = await original_create(**values)
        uploaded_id = row["resume_id"]
        await writer.execute(text("BEGIN IMMEDIATE"))
        return row

    monkeypatch.setattr(
        database, "create_resume_atomic_master", create_before_contention
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as client:
            response = await asyncio.wait_for(
                client.post(
                    "/api/v1/resumes/upload",
                    files={
                        "file": (
                            "synthetic.docx",
                            _docx_bytes("Synthetic resume"),
                            "application/vnd.openxmlformats-officedocument."
                            "wordprocessingml.document",
                        )
                    },
                ),
                timeout=2,
            )
        assert uploaded_id is not None
        assert response.status_code == 503, response.text
        assert response.headers["retry-after"] == "1"
        assert response.json().get("resume_id") == uploaded_id
        assert response.json().get("is_master") is True
        assert "processing_status" not in response.json()
        assert resumes._PROCESSING_CLEANUP_TASKS
        if replacement != "none":
            await writer.execute(
                update(Resume)
                .where(Resume.resume_id == uploaded_id)
                .values(
                    processing_token="newer-token" if replacement == "claim" else None,
                    processing_status=(
                        "processing" if replacement == "claim" else "ready"
                    ),
                    processed_data=(
                        None if replacement == "claim" else {"summary": "saved"}
                    ),
                )
            )
        await writer.commit()
    finally:
        await writer.__aexit__(None, None, None)
        await asyncio.wait_for(
            asyncio.gather(*resumes._PROCESSING_CLEANUP_TASKS), timeout=1
        )

    async with database._session() as session:
        row = await session.get(Resume, uploaded_id)
        assert row is not None
        if replacement == "claim":
            assert row.processing_status == "processing"
            assert row.processing_token == "newer-token"
        elif replacement == "save":
            assert row.processing_status == "ready"
            assert row.processed_data == {"summary": "saved"}
        else:
            assert row.processing_status == "failed"
            assert row.processing_token is None
