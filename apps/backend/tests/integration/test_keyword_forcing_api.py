"""POST /resumes/improve/apply-keywords and confirming a forced preview.

Real routers and a real temp database; every LLM boundary is mocked.
"""

import copy
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ResumeChange
from app.services.keyword_forcing import _verified_changes

JOB_KEYWORDS = {
    "required_skills": ["Python", "Kubernetes"],
    "preferred_skills": [],
    "keywords": ["microservices"],
}
MIGRATION = "Led migration from monolith to microservices architecture"


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _preview(sample_resume: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    with (
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value="# Jane Doe\n",
        ),
        patch(
            "app.routers.resumes.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=copy.deepcopy(sample_resume),
        ),
    ):
        async with _client() as client:
            upload = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
    resume_id = upload.json()["resume_id"]
    async with _client() as client:
        job = await client.post(
            "/api/v1/jobs/upload",
            json={
                "job_descriptions": [
                    "Platform engineer. Python, Kubernetes, microservices. "
                    "Run the container platform for every product team."
                ]
            },
        )
    job_id = job.json()["job_id"][0]
    with (
        patch(
            "app.routers.resumes.extract_job_keywords",
            new_callable=AsyncMock,
            return_value=copy.deepcopy(JOB_KEYWORDS),
        ),
        patch(
            "app.routers.resumes.generate_skill_target_plan",
            new_callable=AsyncMock,
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.generate_resume_diffs",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(changes=[]),
        ),
        patch(
            "app.routers.resumes.refine_resume",
            new_callable=AsyncMock,
            side_effect=RuntimeError("refinement disabled for test"),
        ),
    ):
        async with _client() as client:
            resp = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
    assert resp.status_code == 200, resp.text
    return resume_id, resp.json()["data"]


async def _apply(
    resume_id: str, preview: dict[str, Any], keywords: list[dict[str, Any]], llm: Any
) -> Any:
    with patch("app.services.keyword_forcing.complete_json", llm):
        async with _client() as client:
            return await client.post(
                "/api/v1/resumes/improve/apply-keywords",
                json={
                    "resume_id": resume_id,
                    "job_id": preview["job_id"],
                    "preview_id": preview["preview_id"],
                    "improved_data": preview["resume_preview"],
                    "keywords": keywords,
                },
            )


def _placement(value: str) -> dict[str, Any]:
    return {
        "changes": [
            {
                "path": "additional.technicalSkills",
                "action": "add_skill",
                "original": None,
                "value": "Kubernetes",
                "reason": "Kubernetes",
            },
            {
                "path": "workExperience[0].description[1]",
                "action": "replace",
                "original": MIGRATION,
                "value": value,
                "reason": "Kubernetes",
            },
        ]
    }


async def test_unconfirmed_keyword_the_master_lacks_is_refused(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    llm = AsyncMock()
    resp = await _apply(resume_id, preview, [{"keyword": "Kubernetes"}], llm)
    assert resp.status_code == 400
    assert llm.await_count == 0


async def test_keyword_not_in_the_job_is_refused(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    resp = await _apply(
        resume_id, preview, [{"keyword": "Rust", "attested": True}], AsyncMock()
    )
    assert resp.status_code == 400


async def test_stale_preview_is_refused(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    preview["resume_preview"]["summary"] = "Edited after the preview."
    resp = await _apply(
        resume_id, preview, [{"keyword": "Kubernetes", "attested": True}], AsyncMock()
    )
    assert resp.status_code == 409


async def test_attested_keyword_lands_in_skills_and_one_bullet(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    woven = MIGRATION + " on Kubernetes"
    resp = await _apply(
        resume_id,
        preview,
        [{"keyword": "Kubernetes", "attested": True}],
        AsyncMock(return_value=_placement(woven)),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    resume = data["resume_preview"]
    assert resume["workExperience"][0]["description"][1] == woven
    assert "Kubernetes" in resume["additional"]["technicalSkills"]
    assert data["keyword_placements"] == [
        {
            "keyword": "Kubernetes",
            "paths": ["workExperience[0].description[1]", "additional.technicalSkills"],
        }
    ]
    assert data["forced_keywords"] == ["Kubernetes"]
    assert "Kubernetes" not in data["ats_score"]["missing_keywords"]
    assert data["preview_id"] != preview["preview_id"]


async def test_a_line_that_adds_more_than_the_keyword_is_dropped(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    resp = await _apply(
        resume_id,
        preview,
        [{"keyword": "Kubernetes", "attested": True}],
        AsyncMock(return_value=_placement(MIGRATION + " on Kubernetes and Helm")),
    )
    data = resp.json()["data"]
    assert data["resume_preview"]["workExperience"][0]["description"][1] == MIGRATION
    assert data["keyword_placements"][0]["paths"] == ["additional.technicalSkills"]


async def test_provider_failure_still_places_the_keyword_in_skills(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    resp = await _apply(
        resume_id,
        preview,
        [{"keyword": "Kubernetes", "attested": True}],
        AsyncMock(side_effect=RuntimeError("provider down")),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["keyword_placements"][0]["paths"] == ["additional.technicalSkills"]


async def test_confirm_stores_forced_keywords_and_updates_master(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    applied = await _apply(
        resume_id,
        preview,
        [{"keyword": "Kubernetes", "attested": True}],
        AsyncMock(return_value=_placement(MIGRATION + " on Kubernetes")),
    )
    data = applied.json()["data"]
    with patch(
        "app.routers.resumes.generate_resume_title",
        new_callable=AsyncMock,
        return_value="Platform Engineer",
    ):
        async with _client() as client:
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": data["job_id"],
                    "preview_id": data["preview_id"],
                    "improved_data": data["resume_preview"],
                    "improvements": data["improvements"],
                    "forced_keywords": ["Kubernetes"],
                    "master_skills_to_add": ["Kubernetes"],
                },
            )
    assert confirm.status_code == 200, confirm.text
    tailored_id = confirm.json()["data"]["resume_id"]

    improvement = await isolated_db.get_improvement_by_tailored_resume(tailored_id)
    assert improvement["forced_keywords"] == ["Kubernetes"]
    master = await isolated_db.get_resume(resume_id)
    assert "Kubernetes" in master["processed_data"]["additional"]["technicalSkills"]

    async with _client() as client:
        jd = await client.get(f"/api/v1/resumes/{tailored_id}/job-description")
    assert jd.json()["forced_keywords"] == ["Kubernetes"]


async def test_master_write_back_ignores_keywords_that_were_not_forced(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, preview = await _preview(sample_resume)
    with patch(
        "app.routers.resumes.generate_resume_title",
        new_callable=AsyncMock,
        return_value="Platform Engineer",
    ):
        async with _client() as client:
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": preview["job_id"],
                    "preview_id": preview["preview_id"],
                    "improved_data": preview["resume_preview"],
                    "improvements": preview["improvements"],
                    "master_skills_to_add": ["Kubernetes"],
                },
            )
    assert confirm.status_code == 200, confirm.text
    master = await isolated_db.get_resume(resume_id)
    assert "Kubernetes" not in master["processed_data"]["additional"]["technicalSkills"]


def test_a_keyword_lands_in_at_most_two_lines(sample_resume: dict[str, Any]) -> None:
    rows = sample_resume["workExperience"][0]["description"]
    proposed = [
        ResumeChange(
            path=f"workExperience[0].description[{j}]",
            action="replace",
            original=row,
            value=f"{row} on Kubernetes",
            reason="Kubernetes",
        )
        for j, row in enumerate(rows)
    ]
    accepted = _verified_changes(sample_resume, ["Kubernetes"], proposed)
    assert [c.path for c in accepted] == [
        "workExperience[0].description[0]",
        "workExperience[0].description[1]",
    ]


@pytest.mark.parametrize("value", ["Kubernetes", "kubernetes"])
def test_add_skill_uses_the_job_spelling(
    sample_resume: dict[str, Any], value: str
) -> None:
    proposed = [
        ResumeChange(
            path="additional.technicalSkills",
            action="add_skill",
            original=None,
            value=value,
            reason="k",
        )
    ]
    accepted = _verified_changes(sample_resume, ["Kubernetes"], proposed)
    assert [c.value for c in accepted] == ["Kubernetes"]
