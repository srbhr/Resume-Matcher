"""Duplicating a resume: master copies, tailored copies, guards, titles."""

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import MAX_MASTER_RESUMES, Database, DatabaseBusyError
from app.main import app
from app.routers.resumes import MASTER_LIMIT_DETAIL, _copy_title


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def _master(db: Database, name: str) -> dict[str, Any]:
    return await db.create_resume_atomic_master(
        content=name,
        processing_status="ready",
        title=f"{name} track",
        processed_data={
            "personalInfo": {"name": "A"},
            "summary": name,
            "workExperience": [],
        },
    )


async def test_duplicate_master_creates_non_default_master_copy(
    client: AsyncClient, isolated_db: Database
) -> None:
    source = await _master(isolated_db, "DevRel")

    res = await client.post(f"/api/v1/resumes/{source['resume_id']}/duplicate")

    assert res.status_code == 201
    body = res.json()
    assert body["is_master"] is True
    assert body["is_default_master"] is False
    assert body["title"] == "DevRel track (Copy)"
    assert body["parent_id"] is None
    assert body["resume_id"] != source["resume_id"]

    copy_row = await isolated_db.get_resume(body["resume_id"])
    assert copy_row is not None
    assert copy_row["processed_data"] == source["processed_data"]
    assert copy_row["processing_status"] == "ready"

    # Distinct object: editing the copy through the real API leaves the source alone.
    patch = await client.patch(
        f"/api/v1/resumes/{body['resume_id']}",
        json={"personalInfo": {"name": "Changed"}, "summary": "edited copy"},
    )
    assert patch.status_code == 200
    source_after = await isolated_db.get_resume(source["resume_id"])
    assert source_after is not None
    assert source_after["processed_data"] == source["processed_data"]
    copy_after = await isolated_db.get_resume(body["resume_id"])
    assert copy_after is not None
    assert copy_after["processed_data"]["summary"] == "edited copy"

    # The original stays the default master.
    assert (await isolated_db.get_master_resume())["resume_id"] == source["resume_id"]


async def test_duplicate_master_rejected_at_limit(
    client: AsyncClient, isolated_db: Database
) -> None:
    first = await _master(isolated_db, "m0")
    for i in range(1, MAX_MASTER_RESUMES):
        await _master(isolated_db, f"m{i}")

    res = await client.post(f"/api/v1/resumes/{first['resume_id']}/duplicate")

    assert res.status_code == 409
    assert res.json()["detail"] == MASTER_LIMIT_DETAIL
    assert (
        res.json()["detail"]
        == "You can keep up to 5 master resumes. Delete one before adding another."
    )
    assert len(await isolated_db.list_master_resumes()) == MAX_MASTER_RESUMES


async def test_duplicate_tailored_keeps_parent(
    client: AsyncClient, isolated_db: Database
) -> None:
    master = await _master(isolated_db, "swe")
    tailored = await isolated_db.create_resume(
        content="tailored",
        content_type="json",
        processing_status="ready",
        parent_id=master["resume_id"],
        title="Acme role",
        processed_data={"personalInfo": {"name": "A"}, "summary": "tailored"},
        cover_letter="Dear Acme",
        outreach_message="Hi there",
        interview_prep='{"questions": []}',
    )

    res = await client.post(f"/api/v1/resumes/{tailored['resume_id']}/duplicate")

    assert res.status_code == 201
    body = res.json()
    assert body["is_master"] is False
    assert body["is_default_master"] is False
    assert body["parent_id"] == master["resume_id"]
    assert body["title"] == "Acme role (Copy)"

    copy_row = await isolated_db.get_resume(body["resume_id"])
    assert copy_row is not None
    assert copy_row["processed_data"] == tailored["processed_data"]
    assert copy_row["cover_letter"] == "Dear Acme"
    assert copy_row["outreach_message"] == "Hi there"
    assert copy_row["interview_prep"] == '{"questions": []}'
    assert len(await isolated_db.list_master_resumes()) == 1


async def test_duplicate_tailored_carries_its_job_context(
    client: AsyncClient, isolated_db: Database
) -> None:
    """Ruling R15: the copy keeps the original's job link, so JD features keep working."""
    master = await _master(isolated_db, "swe")
    job = await isolated_db.create_job("Platform Engineer at Acme", master["resume_id"])
    tailored = await isolated_db.create_tailored_resume(
        request_id="req-original",
        original_resume_id=master["resume_id"],
        job_id=job["job_id"],
        resume_fields={
            "content": "tailored",
            "content_type": "json",
            "processing_status": "ready",
            "parent_id": master["resume_id"],
            "title": "Acme role",
            "processed_data": {"personalInfo": {"name": "A"}, "summary": "tailored"},
        },
        improvements=[{"suggestion": "Lead with Kubernetes", "lineNumber": None}],
    )
    source_jd = await client.get(
        f"/api/v1/resumes/{tailored['resume_id']}/job-description"
    )
    assert source_jd.status_code == 200

    res = await client.post(f"/api/v1/resumes/{tailored['resume_id']}/duplicate")

    assert res.status_code == 201
    copy_id = res.json()["resume_id"]
    copy_jd = await client.get(f"/api/v1/resumes/{copy_id}/job-description")
    assert copy_jd.status_code == 200, copy_jd.text
    assert copy_jd.json() == source_jd.json()
    link = await isolated_db.get_improvement_by_tailored_resume(copy_id)
    assert link is not None
    assert link["job_id"] == job["job_id"]
    assert link["original_resume_id"] == master["resume_id"]
    assert link["improvements"] == [
        {"suggestion": "Lead with Kubernetes", "lineNumber": None}
    ]
    assert link["request_id"] != "req-original"
    # The original keeps its own link.
    original_link = await isolated_db.get_improvement_by_tailored_resume(
        tailored["resume_id"]
    )
    assert original_link is not None and original_link["request_id"] == "req-original"


async def test_duplicate_tailored_copy_generates_cover_letter_from_the_job(
    client: AsyncClient, isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    master = await _master(isolated_db, "swe")
    job = await isolated_db.create_job("Platform Engineer at Acme", master["resume_id"])
    tailored = await isolated_db.create_tailored_resume(
        request_id="req-cl",
        original_resume_id=master["resume_id"],
        job_id=job["job_id"],
        resume_fields={
            "content": "tailored",
            "content_type": "json",
            "processing_status": "ready",
            "parent_id": master["resume_id"],
            "processed_data": {"personalInfo": {"name": "A"}, "summary": "tailored"},
        },
        improvements=[],
    )
    copy_id = (
        await client.post(f"/api/v1/resumes/{tailored['resume_id']}/duplicate")
    ).json()["resume_id"]
    generate = AsyncMock(return_value="Dear Acme")
    monkeypatch.setattr("app.routers.resumes.generate_cover_letter", generate)

    res = await client.post(f"/api/v1/resumes/{copy_id}/generate-cover-letter")

    assert res.status_code == 200, res.text
    assert generate.await_args is not None
    assert "Platform Engineer at Acme" in generate.await_args.args


async def test_duplicate_rejects_missing_and_not_ready(
    client: AsyncClient, isolated_db: Database
) -> None:
    missing = await client.post("/api/v1/resumes/does-not-exist/duplicate")
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Resume not found"

    busy = await isolated_db.create_resume(content="x", processing_status="processing")
    res = await client.post(f"/api/v1/resumes/{busy['resume_id']}/duplicate")
    assert res.status_code == 409
    assert res.json()["detail"] == "Only ready resumes can be duplicated."


async def test_duplicate_master_never_takes_over_stuck_default(
    client: AsyncClient, isolated_db: Database
) -> None:
    ready = await _master(isolated_db, "ready")
    stuck = await _master(isolated_db, "stuck")
    assert await isolated_db.set_default_master_resume(stuck["resume_id"])
    await isolated_db.update_resume(stuck["resume_id"], {"processing_status": "failed"})

    res = await client.post(f"/api/v1/resumes/{ready['resume_id']}/duplicate")

    assert res.status_code == 201
    body = res.json()
    assert body["is_master"] is True
    assert body["is_default_master"] is False
    assert (await isolated_db.get_master_resume())["resume_id"] == stuck["resume_id"]
    copy_row = await isolated_db.get_resume(body["resume_id"])
    assert copy_row is not None and copy_row["is_default_master"] is False
    default_rows = [
        m for m in await isolated_db.list_master_resumes() if m["is_default_master"]
    ]
    assert [m["resume_id"] for m in default_rows] == [stuck["resume_id"]]


@pytest.mark.parametrize("is_master", [True, False])
async def test_duplicate_maps_database_busy_to_503(
    client: AsyncClient,
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
    is_master: bool,
) -> None:
    master = await _master(isolated_db, "busy")
    source = (
        master
        if is_master
        else await isolated_db.create_resume(
            content="child",
            processing_status="ready",
            parent_id=master["resume_id"],
        )
    )
    busy = AsyncMock(side_effect=DatabaseBusyError("Database is busy"))
    monkeypatch.setattr(isolated_db, "create_resume_atomic_master", busy)
    monkeypatch.setattr(isolated_db, "create_resume", busy)

    res = await client.post(f"/api/v1/resumes/{source['resume_id']}/duplicate")

    assert res.status_code == 503
    assert res.headers["Retry-After"] == "1"
    busy.assert_awaited_once()


def test_copy_title_truncates_to_80() -> None:
    title = _copy_title({"title": "x" * 100})
    assert len(title) <= 80
    assert title.endswith(" (Copy)")
    assert _copy_title({"title": "Short"}) == "Short (Copy)"
    assert _copy_title({"title": None, "filename": "cv.pdf"}) == "cv.pdf (Copy)"
    assert _copy_title({}) == "Resume (Copy)"
