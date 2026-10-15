"""A resume's saved formatting: stored per resume, returned on fetch, carried to copies."""

from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app

VIVID: dict[str, Any] = {
    "template": "vivid-single",
    "pageSize": "LETTER",
    "margins": {"top": 12, "bottom": 14, "left": 16, "right": 18},
    "spacing": {"section": 4, "item": 1, "lineHeight": 2},
    "fontSize": {
        "base": 2,
        "headerScale": 5,
        "headerFont": "mono",
        "bodyFont": "serif",
    },
    "compactMode": True,
    "showContactIcons": True,
    "accentColor": "orange",
    "revision": 1_700_000_000_000,
}


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def _ready_resume(db: Database, *, master: bool = True) -> dict[str, Any]:
    data = {"personalInfo": {"name": "Ada"}, "summary": "s", "workExperience": []}
    if master:
        return await db.create_resume_atomic_master(
            content="cv", processed_data=data, processing_status="ready"
        )
    return await db.create_resume(
        content="cv", processed_data=data, processing_status="ready"
    )


async def _fetch_settings(client: AsyncClient, resume_id: str) -> Any:
    res = await client.get("/api/v1/resumes", params={"resume_id": resume_id})
    assert res.status_code == 200, res.text
    return res.json()["data"]["template_settings"]


async def test_never_formatted_resume_has_no_settings(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await _ready_resume(isolated_db)
    assert await _fetch_settings(client, resume["resume_id"]) is None


async def test_saved_settings_round_trip_per_resume(
    client: AsyncClient, isolated_db: Database
) -> None:
    formatted = await _ready_resume(isolated_db)
    other = await _ready_resume(isolated_db, master=False)

    res = await client.patch(
        f"/api/v1/resumes/{formatted['resume_id']}/template-settings", json=VIVID
    )

    assert res.status_code == 200, res.text
    assert res.json() == VIVID
    assert await _fetch_settings(client, formatted["resume_id"]) == VIVID
    # Another resume keeps its own (no) formatting.
    assert await _fetch_settings(client, other["resume_id"]) is None


async def test_editing_content_keeps_the_saved_settings(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await _ready_resume(isolated_db)
    await client.patch(
        f"/api/v1/resumes/{resume['resume_id']}/template-settings", json=VIVID
    )

    res = await client.patch(
        f"/api/v1/resumes/{resume['resume_id']}",
        json={"personalInfo": {"name": "Ada"}, "summary": "edited"},
    )

    assert res.status_code == 200
    assert res.json()["data"]["template_settings"] == VIVID


@pytest.mark.parametrize(
    "bad",
    [
        {**VIVID, "template": "not-a-template"},
        {**VIVID, "margins": {**VIVID["margins"], "top": 99}},
        {**VIVID, "fontSize": {**VIVID["fontSize"], "bodyFont": "comic"}},
    ],
)
async def test_invalid_settings_are_rejected_and_not_saved(
    client: AsyncClient, isolated_db: Database, bad: dict[str, Any]
) -> None:
    resume = await _ready_resume(isolated_db)

    res = await client.patch(
        f"/api/v1/resumes/{resume['resume_id']}/template-settings", json=bad
    )

    assert res.status_code == 422
    assert await _fetch_settings(client, resume["resume_id"]) is None


async def test_settings_for_a_missing_resume_404(
    client: AsyncClient, isolated_db: Database
) -> None:
    res = await client.patch("/api/v1/resumes/missing/template-settings", json=VIVID)
    assert res.status_code == 404


@pytest.mark.parametrize("master", [True, False])
async def test_duplicate_copies_the_settings(
    client: AsyncClient, isolated_db: Database, master: bool
) -> None:
    source = await _ready_resume(isolated_db, master=master)
    await client.patch(
        f"/api/v1/resumes/{source['resume_id']}/template-settings", json=VIVID
    )

    res = await client.post(f"/api/v1/resumes/{source['resume_id']}/duplicate")

    assert res.status_code == 201, res.text
    copy_id = res.json()["resume_id"]
    assert await _fetch_settings(client, copy_id) == VIVID
    # Independent: reformatting the copy leaves the source alone.
    await client.patch(
        f"/api/v1/resumes/{copy_id}/template-settings",
        json={**VIVID, "template": "latex"},
    )
    assert await _fetch_settings(client, source["resume_id"]) == VIVID


async def test_resume_list_carries_each_resumes_settings(
    client: AsyncClient, isolated_db: Database
) -> None:
    formatted = await _ready_resume(isolated_db)
    bare = await _ready_resume(isolated_db)
    await client.patch(
        f"/api/v1/resumes/{formatted['resume_id']}/template-settings", json=VIVID
    )

    res = await client.get("/api/v1/resumes/list", params={"include_master": "true"})

    assert res.status_code == 200
    by_id = {row["resume_id"]: row for row in res.json()["data"]}
    assert by_id[formatted["resume_id"]]["template_settings"] == VIVID
    assert by_id[bare["resume_id"]]["template_settings"] is None


async def test_an_older_save_cannot_undo_a_newer_one(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await _ready_resume(isolated_db)
    url = f"/api/v1/resumes/{resume['resume_id']}/template-settings"
    newer = {**VIVID, "template": "latex", "revision": VIVID["revision"] + 5}
    await client.patch(url, json=newer)

    # The earlier change's request arrives last.
    res = await client.patch(url, json=VIVID)

    assert res.status_code == 200
    assert res.json() == newer
    assert await _fetch_settings(client, resume["resume_id"]) == newer


async def test_a_newer_save_replaces_the_stored_one(
    client: AsyncClient, isolated_db: Database
) -> None:
    resume = await _ready_resume(isolated_db)
    url = f"/api/v1/resumes/{resume['resume_id']}/template-settings"
    await client.patch(url, json=VIVID)
    newer = {**VIVID, "template": "clean", "revision": VIVID["revision"] + 1}

    res = await client.patch(url, json=newer)

    assert res.json() == newer
    assert await _fetch_settings(client, resume["resume_id"]) == newer
