"""Multi-track master resumes: flags, default switching, limit, grounding."""

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import MAX_MASTER_RESUMES, Database
from app.main import app


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
        processed_data={"personalInfo": {"name": "A"}, "summary": name},
    )


async def test_list_exposes_default_flag(
    client: AsyncClient, isolated_db: Database
) -> None:
    first = await _master(isolated_db, "devrel")
    second = await _master(isolated_db, "swe")
    res = await client.get("/api/v1/resumes/list", params={"include_master": "true"})
    assert res.status_code == 200
    rows = {r["resume_id"]: r for r in res.json()["data"]}
    assert rows[first["resume_id"]]["is_default_master"] is True
    assert rows[second["resume_id"]]["is_default_master"] is False
    assert rows[second["resume_id"]]["is_master"] is True


async def test_set_default_endpoint_switches_default(
    client: AsyncClient, isolated_db: Database
) -> None:
    await _master(isolated_db, "devrel")
    second = await _master(isolated_db, "swe")
    res = await client.post(f"/api/v1/resumes/{second['resume_id']}/default")
    assert res.status_code == 200
    assert res.json() == {"resume_id": second["resume_id"], "is_default_master": True}
    assert (await isolated_db.get_master_resume())["resume_id"] == second["resume_id"]


async def test_set_default_rejects_missing_and_non_master(
    client: AsyncClient, isolated_db: Database
) -> None:
    plain = await isolated_db.create_resume(content="child")
    assert (await client.post("/api/v1/resumes/missing/default")).status_code == 404
    assert (
        await client.post(f"/api/v1/resumes/{plain['resume_id']}/default")
    ).status_code == 400


async def test_set_default_lost_race_after_precheck_is_404(
    client: AsyncClient, isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    master = await _master(isolated_db, "devrel")
    # The pre-check saw a master; it vanished (or stopped being one) before the write.
    monkeypatch.setattr(
        isolated_db, "set_default_master_resume", AsyncMock(return_value=False)
    )
    res = await client.post(f"/api/v1/resumes/{master['resume_id']}/default")
    assert res.status_code == 404
    assert res.json() == {"detail": "Resume not found"}


async def test_fetch_exposes_master_flags(
    client: AsyncClient, isolated_db: Database
) -> None:
    master = await _master(isolated_db, "devrel")
    res = await client.get("/api/v1/resumes", params={"resume_id": master["resume_id"]})
    data = res.json()["data"]
    assert data["is_master"] is True and data["is_default_master"] is True


async def test_upload_rejects_sixth_master(
    client: AsyncClient, isolated_db: Database
) -> None:
    for i in range(MAX_MASTER_RESUMES):
        await _master(isolated_db, f"m{i}")
    with (
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value="# Jane Doe\n\nEngineer with Python experience.",
        ),
        patch(
            "app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock
        ) as parse_json,
    ):
        res = await client.post(
            "/api/v1/resumes/upload",
            files={"file": ("resume.pdf", b"synthetic", "application/pdf")},
        )
    assert res.status_code == 409
    assert "up to 5 master resumes" in res.json()["detail"]
    parse_json.assert_not_awaited()
    assert len(await isolated_db.list_master_resumes()) == MAX_MASTER_RESUMES


async def test_preview_grounds_refiner_on_source_master(
    client: AsyncClient, isolated_db: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import resumes as resumes_router
    from app.schemas.models import ImproveDiffResult

    await _master(isolated_db, "default-track")
    source = await _master(isolated_db, "source-track")
    job = await isolated_db.create_job(
        content="Need Python", resume_id=source["resume_id"]
    )
    seen: dict[str, Any] = {}

    async def fake_refine(**kwargs: Any) -> Any:
        seen["master"] = kwargs["master_resume"]
        raise RuntimeError("stop after capture")

    monkeypatch.setattr(resumes_router, "_load_config", lambda: {})
    monkeypatch.setattr(resumes_router, "get_content_language", lambda: "en")
    monkeypatch.setattr(
        resumes_router,
        "extract_job_keywords",
        AsyncMock(return_value={"required_skills": ["Python"]}),
    )
    monkeypatch.setattr(
        resumes_router, "generate_skill_target_plan", AsyncMock(return_value={})
    )
    monkeypatch.setattr(
        resumes_router,
        "generate_resume_diffs",
        AsyncMock(return_value=ImproveDiffResult(changes=[])),
    )
    monkeypatch.setattr(resumes_router, "refine_resume", fake_refine)
    monkeypatch.setattr(
        resumes_router, "generate_resume_title", AsyncMock(return_value="Engineer")
    )
    res = await client.post(
        "/api/v1/resumes/improve/preview",
        json={"resume_id": source["resume_id"], "job_id": job["job_id"]},
    )
    assert res.status_code == 200, res.text
    assert seen["master"]["summary"] == "source-track"


async def _tailored(db: Database, parent_id: str | None, name: str) -> dict[str, Any]:
    return await db.create_resume(
        content=name,
        parent_id=parent_id,
        processing_status="ready",
        processed_data={"personalInfo": {"name": "A"}, "summary": name},
    )


@pytest.mark.parametrize("endpoint", ["/improve/preview", "/improve"])
async def test_tailored_source_grounds_refiner_on_its_own_track(
    client: AsyncClient,
    isolated_db: Database,
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
) -> None:
    from app.routers import resumes as resumes_router
    from app.schemas.models import ImproveDiffResult

    await _master(isolated_db, "default-track")
    track_b = await _master(isolated_db, "track-b")
    child = await _tailored(isolated_db, track_b["resume_id"], "tailored-from-b")
    job = await isolated_db.create_job(
        content="Need Python", resume_id=child["resume_id"]
    )
    seen: dict[str, Any] = {}

    async def fake_refine(**kwargs: Any) -> Any:
        seen["master"] = kwargs["master_resume"]
        raise RuntimeError("stop after capture")

    monkeypatch.setattr(resumes_router, "_load_config", lambda: {})
    monkeypatch.setattr(resumes_router, "get_content_language", lambda: "en")
    monkeypatch.setattr(resumes_router, "_get_default_prompt_id", lambda: "nudge")
    monkeypatch.setattr(
        resumes_router,
        "extract_job_keywords",
        AsyncMock(return_value={"required_skills": ["Python"]}),
    )
    monkeypatch.setattr(
        resumes_router, "generate_skill_target_plan", AsyncMock(return_value={})
    )
    monkeypatch.setattr(
        resumes_router,
        "generate_resume_diffs",
        AsyncMock(return_value=ImproveDiffResult(changes=[])),
    )
    monkeypatch.setattr(resumes_router, "refine_resume", fake_refine)
    monkeypatch.setattr(
        resumes_router, "generate_resume_title", AsyncMock(return_value="Engineer")
    )
    res = await client.post(
        f"/api/v1/resumes{endpoint}",
        json={"resume_id": child["resume_id"], "job_id": job["job_id"]},
    )
    assert res.status_code == 200, res.text
    assert seen["master"]["summary"] == "track-b"


@pytest.mark.parametrize(
    ("parent", "expected"),
    [("missing", "default-track"), ("tailored", "default-track"), ("none", "source")],
)
async def test_grounding_falls_back_to_default_master_then_source(
    isolated_db: Database, parent: str, expected: str
) -> None:
    from app.routers.resumes import _grounding_master_data

    if parent == "none":
        source = await _tailored(isolated_db, None, "source")
    else:
        await _master(isolated_db, "default-track")
        await _master(isolated_db, "track-b")
        parent_id = "missing-resume-id"
        if parent == "tailored":
            parent_id = (await _tailored(isolated_db, None, "other-tailored"))[
                "resume_id"
            ]
        source = await _tailored(isolated_db, parent_id, "source")
    grounding = await _grounding_master_data(source)
    assert grounding is not None and grounding["summary"] == expected


async def test_render_draft_endpoint_serves_and_404s(client: AsyncClient) -> None:
    from app.services.page_fit import render_drafts

    token = render_drafts.put({"personalInfo": {"name": "Draft"}})
    res = await client.get(f"/api/v1/resumes/render-drafts/{token}")
    assert res.status_code == 200
    assert res.json()["data"]["processed_resume"]["personalInfo"]["name"] == "Draft"
    assert (
        await client.get("/api/v1/resumes/render-drafts/" + "0" * 32)
    ).status_code == 404
