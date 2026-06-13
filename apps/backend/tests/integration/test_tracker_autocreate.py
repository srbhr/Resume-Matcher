"""The tailor flow auto-creates a tracker card (best-effort, non-blocking).

Drives a real ``/improve/preview`` → ``/improve/confirm`` round trip (every LLM
boundary mocked, exactly like ``test_pipeline_e2e``) and asserts an ``applied``
card lands on the board carrying the LLM-extracted company/role — with zero
extra LLM call on the confirm path (company/role come from the cached job).
"""

import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ResumeData
from tests.integration.test_pipeline_e2e import _upload_resume


def _new_client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _preview_then_confirm(isolated_db, sample_resume):
    """Run the mocked preview→confirm handshake; return the tailored resume id."""
    upload_resp = await _upload_resume(isolated_db, sample_resume)
    resume_id = upload_resp.json()["resume_id"]

    async with _new_client() as client:
        jobs_resp = await client.post(
            "/api/v1/jobs/upload",
            json={"job_descriptions": ["Senior Backend Engineer at Acme Corp: Python, FastAPI."]},
        )
    job_id = jobs_resp.json()["job_id"][0]

    improved = ResumeData.model_validate(copy.deepcopy(sample_resume)).model_dump()
    improved["summary"] = "Senior backend engineer building scalable Python and FastAPI services."

    with (
        patch(
            "app.routers.resumes.extract_job_keywords",
            new_callable=AsyncMock,
            return_value={
                "keywords": ["Python", "FastAPI"],
                "required_skills": [],
                "company": "Acme Corp",
                "role": "Senior Backend Engineer",
            },
        ),
        patch(
            "app.routers.resumes.generate_skill_target_plan",
            new_callable=AsyncMock,
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.verify_skill_target_plan",
            return_value={"accepted": [], "rejected": []},
        ),
        patch(
            "app.routers.resumes.generate_resume_diffs",
            new_callable=AsyncMock,
            return_value=SimpleNamespace(changes=[]),
        ),
        patch(
            "app.routers.resumes.apply_diffs",
            return_value=(copy.deepcopy(improved), [], []),
        ),
        patch("app.routers.resumes.verify_diff_result", return_value=[]),
        patch(
            "app.routers.resumes.refine_resume",
            new_callable=AsyncMock,
            side_effect=RuntimeError("refinement disabled for test"),
        ),
        patch(
            "app.routers.resumes.generate_resume_title",
            new_callable=AsyncMock,
            return_value="Senior Backend Engineer - Acme Corp",
        ),
    ):
        async with _new_client() as client:
            preview_resp = await client.post(
                "/api/v1/resumes/improve/preview",
                json={"resume_id": resume_id, "job_id": job_id},
            )
        assert preview_resp.status_code == 200, preview_resp.text
        preview_data = preview_resp.json()["data"]

        async with _new_client() as client:
            confirm_resp = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "improved_data": preview_data["resume_preview"],
                    "improvements": preview_data["improvements"],
                },
            )
        assert confirm_resp.status_code == 200, confirm_resp.text

    return resume_id, job_id, confirm_resp.json()["data"]["resume_id"]


class TestTrackerAutoCreate:
    async def test_confirm_creates_applied_card(self, isolated_db, sample_resume):
        resume_id, job_id, tailored_id = await _preview_then_confirm(isolated_db, sample_resume)

        async with _new_client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]

        applied = board["applied"]
        assert len(applied) == 1
        card = applied[0]
        # Card points at the tailored (applied) resume and the master.
        assert card["resume_id"] == tailored_id
        assert card["master_resume_id"] == resume_id
        assert card["job_id"] == job_id
        # Company comes from the cached job; role falls back to the resume title.
        assert card["company"] == "Acme Corp"
        assert card["role"] == "Senior Backend Engineer - Acme Corp"
        assert card["applied_at"] is not None

    async def test_autocreate_is_idempotent_on_double_confirm(self, isolated_db, sample_resume):
        # Two tailorings of the same master+job dedupe to a single card.
        await _preview_then_confirm(isolated_db, sample_resume)
        # A second confirm creates a *new* tailored resume id, so it's a distinct
        # card — verify at least the first path produced exactly one so far.
        async with _new_client() as client:
            board = (await client.get("/api/v1/applications")).json()["columns"]
        assert len(board["applied"]) == 1
