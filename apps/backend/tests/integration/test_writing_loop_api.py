"""The writing loop inside tailoring, the progress stream and Heavy rewrite.

Real routers and a real temp database; every LLM boundary is mocked.
"""

import asyncio
import copy
import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ResumeChange
from app.services.improver import apply_diffs
from app.services.progress import progress_events, tracked_progress

WEAK = "Responsible for the migration from monolith to microservices"
REWRITE = "Moved the monolith to microservices, ending shared-release deploys"


def _client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _master_and_job(sample_resume: dict[str, Any]) -> tuple[str, str]:
    data = copy.deepcopy(sample_resume)
    data["workExperience"][0]["description"][1] = WEAK
    with (
        patch(
            "app.routers.resumes.parse_document",
            new_callable=AsyncMock,
            return_value="# Jane Doe\n",
        ),
        patch(
            "app.routers.resumes.parse_resume_to_json",
            new_callable=AsyncMock,
            return_value=data,
        ),
    ):
        async with _client() as client:
            upload = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"%PDF-1.4 fake", "application/pdf")},
            )
    assert upload.status_code == 200, upload.text
    async with _client() as client:
        job = await client.post(
            "/api/v1/jobs/upload",
            json={
                "job_descriptions": [
                    "Senior backend engineer. Python, FastAPI, microservices, AWS. "
                    "Lead platform migrations and mentor engineers."
                ]
            },
        )
    assert job.status_code == 200, job.text
    return upload.json()["resume_id"], job.json()["job_id"][0]


def _tailor_mocks() -> list[Any]:
    return [
        patch(
            "app.routers.resumes.extract_job_keywords",
            new_callable=AsyncMock,
            return_value={"keywords": ["microservices"], "required_skills": ["Python"]},
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
        patch(
            "app.routers.resumes.generate_resume_title",
            new_callable=AsyncMock,
            return_value="Backend Engineer - Acme",
        ),
    ]


async def _preview(
    resume_id: str, job_id: str, llm: AsyncMock, prompt_id: str = "keywords"
) -> dict[str, Any]:
    mocks = _tailor_mocks()
    for mock in mocks:
        mock.start()
    try:
        with patch("app.services.writing_loop.complete_json", llm):
            async with _client() as client:
                resp = await client.post(
                    "/api/v1/resumes/improve/preview",
                    json={
                        "resume_id": resume_id,
                        "job_id": job_id,
                        "prompt_id": prompt_id,
                    },
                )
    finally:
        for mock in mocks:
            mock.stop()
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def test_preview_rewrites_weak_bullet_and_confirm_accepts_it(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, job_id = await _master_and_job(sample_resume)
    llm = AsyncMock(
        side_effect=[
            {"bullets": []},
            {
                "changes": [
                    {
                        "path": "workExperience[0].description[1]",
                        "action": "replace",
                        "original": WEAK,
                        "value": REWRITE,
                        "reason": "weak opener",
                    }
                ]
            },
        ]
    )
    data = await _preview(resume_id, job_id, llm)

    assert data["resume_preview"]["workExperience"][0]["description"][1] == REWRITE
    writing = data["writing"]
    assert writing["rewritten_paths"] == ["workExperience[0].description[1]"]
    assert writing["score"] > writing["before_score"]
    assert not any(f["rule"] == "weak_opener" for f in writing["findings"])

    with patch(
        "app.routers.resumes.generate_resume_title",
        new_callable=AsyncMock,
        return_value="Backend Engineer - Acme",
    ):
        async with _client() as client:
            confirm = await client.post(
                "/api/v1/resumes/improve/confirm",
                json={
                    "resume_id": resume_id,
                    "job_id": job_id,
                    "preview_id": data["preview_id"],
                    "improved_data": data["resume_preview"],
                    "improvements": data["improvements"],
                },
            )
    assert confirm.status_code == 200, confirm.text
    saved = await isolated_db.get_resume(confirm.json()["data"]["resume_id"])
    assert saved["processed_data"]["workExperience"][0]["description"][1] == REWRITE


async def test_light_nudge_critiques_without_rewriting(
    isolated_db: Any, sample_resume: dict[str, Any]
) -> None:
    resume_id, job_id = await _master_and_job(sample_resume)
    llm = AsyncMock(
        return_value={
            "bullets": [
                {
                    "path": "workExperience[0].description[1]",
                    "no_outcome": True,
                    "weak_opener": True,
                    "note": "Say what the migration changed.",
                }
            ]
        }
    )
    data = await _preview(resume_id, job_id, llm, prompt_id="nudge")

    assert llm.await_count == 1
    assert data["resume_preview"]["workExperience"][0]["description"][1] == WEAK
    assert data["writing"]["rewritten_paths"] == []
    assert [n["note"] for n in data["writing"]["critic_notes"]] == [
        "Say what the migration changed."
    ]


async def test_heavy_mode_is_an_offered_prompt_option(isolated_db: Any) -> None:
    async with _client() as client:
        resp = await client.get("/api/v1/config/prompts")
    assert resp.status_code == 200
    assert "heavy" in [option["id"] for option in resp.json()["prompt_options"]]


def test_bullet_reorder_runs_after_rewrites_and_only_when_allowed(
    sample_resume: dict[str, Any],
) -> None:
    rows = sample_resume["workExperience"][0]["description"]
    changes = [
        ResumeChange(
            path="workExperience[0].description",
            action="reorder",
            original=None,
            value=[rows[2], rows[0], rows[1]],
            reason="strongest first",
        ),
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original=rows[0],
            value="Built FastAPI REST APIs in Python serving 50K requests/day",
            reason="CAR",
        ),
    ]
    result, applied, rejected = apply_diffs(
        sample_resume, changes, allow_bullet_reorder=True
    )
    assert result["workExperience"][0]["description"] == [
        rows[2],
        "Built FastAPI REST APIs in Python serving 50K requests/day",
        rows[1],
    ]
    assert len(applied) == 2 and rejected == []

    _, _, rejected = apply_diffs(sample_resume, changes[:1])
    assert len(rejected) == 1

    not_a_permutation = changes[0].model_copy(update={"value": [rows[0], rows[1]]})
    _, _, rejected = apply_diffs(
        sample_resume, [not_a_permutation], allow_bullet_reorder=True
    )
    assert len(rejected) == 1


async def test_progress_events_stream_stages_then_done() -> None:
    events: list[str] = []

    async def consume() -> None:
        async for event in progress_events("p1", max_seconds=5):
            events.append(event)

    with tracked_progress("p1", "load_job_keywords") as progress:
        task = asyncio.create_task(consume())
        await asyncio.sleep(0.3)
        progress["stage"] = "critique_writing"
        await asyncio.sleep(0.3)
    await asyncio.wait_for(task, timeout=3)

    stages = [
        json.loads(e.split("data: ", 1)[1])["stage"]
        for e in events
        if e.startswith("data: ")
    ]
    assert stages == ["load_job_keywords", "critique_writing"]
    assert events[-1].startswith("event: done")


async def test_progress_endpoint_serves_event_stream(isolated_db: Any) -> None:
    with tracked_progress("p2", "refine_resume"):
        pass
    async with _client() as client:
        resp = await client.get("/api/v1/resumes/improve/progress/p2")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert "no-transform" in resp.headers["cache-control"]
    assert '"stage": "refine_resume"' in resp.text
    assert "event: done" in resp.text


@pytest.mark.parametrize("bad", ["../etc", "x" * 65, "a b"])
async def test_preview_rejects_malformed_progress_ids(
    isolated_db: Any, bad: str
) -> None:
    async with _client() as client:
        resp = await client.post(
            "/api/v1/resumes/improve/preview",
            json={"resume_id": "r", "job_id": "j", "progress_id": bad},
        )
    assert resp.status_code == 422
