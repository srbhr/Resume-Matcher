"""Direct tailoring persists required rows together, even across cancellation."""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapper

from app.config import settings
from app.database import Database
from app.main import app
from app.models import Improvement, Resume
from app.routers import resumes
from app.schemas.models import ImproveDiffResult, ResumeData


@pytest.fixture
async def direct_case(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[tuple[AsyncClient, dict[str, str]]]:
    source = ResumeData.model_validate(sample_resume).model_dump()
    original = await isolated_db.create_resume_atomic_master(
        content=json.dumps(source), processed_data=source, processing_status="ready"
    )
    job = await isolated_db.create_job("Python engineer at Synthetic Co")
    monkeypatch.setattr(resumes, "_load_config", lambda: {})
    monkeypatch.setattr(resumes, "get_content_language", lambda: "en")
    monkeypatch.setattr(resumes, "_get_default_prompt_id", lambda: "nudge")
    monkeypatch.setattr(
        resumes,
        "extract_job_keywords",
        AsyncMock(return_value={"keywords": ["Python"], "required_skills": []}),
    )
    monkeypatch.setattr(
        resumes,
        "generate_resume_diffs",
        AsyncMock(return_value=ImproveDiffResult(changes=[])),
    )
    monkeypatch.setattr(
        resumes,
        "refine_resume",
        AsyncMock(side_effect=RuntimeError("Synthetic unavailable refinement")),
    )
    monkeypatch.setattr(
        resumes, "generate_resume_title", AsyncMock(return_value="Synthetic engineer")
    )
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        yield client, {"resume_id": original["resume_id"], "job_id": job["job_id"]}


async def test_deadline_after_commit_never_leaves_unlinked_tailored_resume(
    isolated_db: Database,
    direct_case: tuple[AsyncClient, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, payload = direct_case
    committed = asyncio.Event()
    original_commit = AsyncSession.commit

    async def pause_after_resume_commit(session: AsyncSession) -> None:
        has_tailored = any(
            isinstance(row, Resume) and row.parent_id == payload["resume_id"]
            for row in (*session.new, *session.identity_map.values())
        )
        await original_commit(session)
        if has_tailored:
            committed.set()
            await asyncio.Event().wait()

    monkeypatch.setattr(AsyncSession, "commit", pause_after_resume_commit)
    monkeypatch.setattr(settings, "request_timeout_seconds", 0.2)
    response = await client.post("/api/v1/resumes/improve", json=payload)
    assert committed.is_set(), response.text
    assert response.status_code == 504, response.text
    tailored = [row for row in await isolated_db.list_resumes() if row["parent_id"]]
    assert len(tailored) == 1
    relation = await isolated_db.get_improvement_by_tailored_resume(
        tailored[0]["resume_id"]
    )
    assert relation is not None, (
        "The deadline left a committed resume without its required relation"
    )
    assert relation["original_resume_id"] == payload["resume_id"]
    assert relation["job_id"] == payload["job_id"]


async def test_cancellation_before_commit_rolls_back_flushed_required_rows(
    isolated_db: Database,
    direct_case: tuple[AsyncClient, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, payload = direct_case
    flushed = asyncio.Event()
    original_commit = AsyncSession.commit

    async def pause_before_resume_commit(session: AsyncSession) -> None:
        has_tailored = any(
            isinstance(row, Resume) and row.parent_id == payload["resume_id"]
            for row in (*session.new, *session.identity_map.values())
        )
        if has_tailored:
            await session.flush()
            flushed.set()
            await asyncio.Event().wait()
        await original_commit(session)

    monkeypatch.setattr(AsyncSession, "commit", pause_before_resume_commit)
    request = asyncio.create_task(
        client.post("/api/v1/resumes/improve", json=payload)
    )
    try:
        await asyncio.wait_for(flushed.wait(), 1)
        request.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request
    finally:
        request.cancel()
        await asyncio.gather(request, return_exceptions=True)
    assert [row["resume_id"] for row in await isolated_db.list_resumes()] == [
        payload["resume_id"]
    ]
    async with isolated_db._session() as session:
        assert list((await session.execute(select(Improvement))).scalars()) == []


async def test_improvement_insert_failure_rolls_back_tailored_resume(
    isolated_db: Database,
    direct_case: tuple[AsyncClient, dict[str, str]],
) -> None:
    client, payload = direct_case

    def fail_relation(
        _mapper: Mapper[Any], _connection: Connection, _row: Improvement
    ) -> None:
        raise RuntimeError("Synthetic required relation insertion failure")

    event.listen(Improvement, "before_insert", fail_relation)
    try:
        response = await client.post("/api/v1/resumes/improve", json=payload)
    finally:
        event.remove(Improvement, "before_insert", fail_relation)
    assert response.status_code == 500
    assert [row["resume_id"] for row in await isolated_db.list_resumes()] == [
        payload["resume_id"]
    ]
    async with isolated_db._session() as session:
        assert list((await session.execute(select(Improvement))).scalars()) == []


@pytest.mark.parametrize("tracker_fails", [False, True])
async def test_direct_success_links_required_records_and_keeps_tracker_best_effort(
    isolated_db: Database,
    direct_case: tuple[AsyncClient, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
    tracker_fails: bool,
) -> None:
    client, payload = direct_case
    if tracker_fails:
        monkeypatch.setattr(
            isolated_db,
            "create_application",
            AsyncMock(side_effect=RuntimeError("Synthetic tracker failure")),
        )
    response = await client.post("/api/v1/resumes/improve", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()
    relation = await isolated_db.get_improvement_by_tailored_resume(
        result["data"]["resume_id"]
    )
    assert relation is not None
    assert relation["request_id"] == result["request_id"] == result["data"]["request_id"]
    assert relation["improvements"] == result["data"]["improvements"]
    saved = await isolated_db.get_resume(result["data"]["resume_id"])
    assert saved is not None and saved["title"] == "Synthetic engineer"
    assert saved["processed_data"] == result["data"]["resume_preview"]
    cards = await isolated_db.list_applications()
    if tracker_fails:
        assert cards == []
    else:
        assert len(cards) == 1
        assert cards[0]["resume_id"] == result["data"]["resume_id"]
        assert cards[0]["job_id"] == payload["job_id"]
