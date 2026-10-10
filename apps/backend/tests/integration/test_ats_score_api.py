"""GET/POST /resumes/{id}/ats-score: last calculated ATS score and recalculation."""

import hashlib
from collections.abc import AsyncIterator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app

JOB_CONTENT = "Senior Backend Engineer at Acme: Python, Kubernetes, Terraform"
JOB_KEYWORDS = {
    "role": "Senior Backend Engineer",
    "required_skills": ["Python", "Kubernetes"],
    "preferred_skills": ["Terraform"],
    "keywords": [],
}

MASTER_DATA: dict[str, Any] = {
    "personalInfo": {"name": "A", "title": "Backend Engineer", "email": "a@x.io"},
    "summary": "Backend engineer.",
    "workExperience": [
        {
            "title": "SWE",
            "company": "X",
            "years": "Jan 2020 - Present",
            "description": ["Built Python services on Kubernetes", "Wrote Terraform"],
        },
    ],
    "education": [
        {"institution": "U", "degree": "BSc", "years": "Sep 2015 - Jun 2019"}
    ],
    "additional": {"technicalSkills": ["Python", "Kubernetes", "Terraform"]},
}

TAILORED_DATA: dict[str, Any] = {
    **MASTER_DATA,
    "workExperience": [
        {
            "title": "SWE",
            "company": "X",
            "years": "Jan 2020 - Present",
            "description": ["Built Python services on Kubernetes"],
        },
    ],
    "additional": {"technicalSkills": ["Python", "Kubernetes"]},
}


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


async def _tailored(
    db: Database, *, cache_keywords: bool = True, data: dict[str, Any] | None = None
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    master = await db.create_resume_atomic_master(
        content="master",
        processing_status="ready",
        title="Master",
        processed_data=MASTER_DATA,
    )
    job = await db.create_job(JOB_CONTENT, master["resume_id"])
    if cache_keywords:
        await db.update_job(
            job["job_id"],
            {
                "job_keywords": JOB_KEYWORDS,
                "job_keywords_hash": hashlib.sha256(
                    JOB_CONTENT.encode("utf-8")
                ).hexdigest(),
            },
        )
    tailored = await db.create_tailored_resume(
        request_id="req-1",
        original_resume_id=master["resume_id"],
        job_id=job["job_id"],
        resume_fields={
            "content": "tailored",
            "content_type": "json",
            "processing_status": "ready",
            "parent_id": master["resume_id"],
            "title": "Acme role",
            "processed_data": data or TAILORED_DATA,
        },
        improvements=[],
    )
    return master, job, tailored


def _url(resume: dict[str, Any]) -> str:
    return f"/api/v1/resumes/{resume['resume_id']}/ats-score"


async def test_recalculate_scores_and_persists_the_result(
    client: AsyncClient, isolated_db: Database
) -> None:
    _, _, tailored = await _tailored(isolated_db)

    res = await client.post(_url(tailored))

    assert res.status_code == 200, res.text
    record = res.json()
    assert record["calculated_at"]
    score = record["score"]
    subs = score["sub_scores"]
    assert subs["keyword_match"] == pytest.approx(100 * 2 / 3, abs=0.1)
    # Headline "Backend Engineer" is a near miss for "Senior Backend Engineer".
    assert 0 < subs["title_match"] < 100
    assert subs["date_consistency"] == 100.0
    # Terraform is missing from the tailored copy but true in the master.
    assert score["injectable_keywords"] == ["Terraform"]
    assert score["missing_keywords"] == []

    last = await client.get(_url(tailored))
    assert last.status_code == 200, last.text
    assert last.json() == record


async def test_last_score_stays_until_recalculated_after_edits(
    client: AsyncClient, isolated_db: Database
) -> None:
    _, _, tailored = await _tailored(isolated_db)
    first = (await client.post(_url(tailored))).json()
    edited = {
        **TAILORED_DATA,
        "personalInfo": {
            **TAILORED_DATA["personalInfo"],
            "title": "Senior Backend Engineer",
        },
    }
    await isolated_db.update_resume(tailored["resume_id"], {"processed_data": edited})

    unchanged = await client.get(_url(tailored))
    assert unchanged.json() == first  # still the last calculated score

    again = await client.post(_url(tailored))
    assert again.status_code == 200, again.text
    assert again.json()["score"]["sub_scores"]["title_match"] == 100.0
    assert again.json()["calculated_at"] >= first["calculated_at"]
    assert (await client.get(_url(tailored))).json() == again.json()


async def test_not_yet_calculated_is_404(
    client: AsyncClient, isolated_db: Database
) -> None:
    _, _, tailored = await _tailored(isolated_db)
    res = await client.get(_url(tailored))
    assert res.status_code == 404


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_master_resume_has_no_ats_score(
    client: AsyncClient, isolated_db: Database, method: str
) -> None:
    master, _, _ = await _tailored(isolated_db)
    res = await client.request(method, _url(master))
    assert res.status_code == 400


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_unknown_resume_is_404(
    client: AsyncClient, isolated_db: Database, method: str
) -> None:
    res = await client.request(method, "/api/v1/resumes/does-not-exist/ats-score")
    assert res.status_code == 404


async def test_uncached_job_keywords_cannot_be_recalculated(
    client: AsyncClient, isolated_db: Database
) -> None:
    _, _, tailored = await _tailored(isolated_db, cache_keywords=False)
    res = await client.post(_url(tailored))
    assert res.status_code == 409


async def test_stale_job_keywords_are_not_used(
    client: AsyncClient, isolated_db: Database
) -> None:
    _, job, tailored = await _tailored(isolated_db)
    await isolated_db.update_job(job["job_id"], {"content": JOB_CONTENT + " and Go"})
    res = await client.post(_url(tailored))
    assert res.status_code == 409
