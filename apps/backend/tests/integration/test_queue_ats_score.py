"""A queue-tailored resume keeps an ATS score the builder can read and recalculate."""

import json
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app
from app.routers import resumes
from app.schemas.models import ImproveDiffResult, ResumeData
from app.services.queue_worker import QueueManager

JOB_KEYWORDS = {
    "role": "Senior Backend Engineer",
    "required_skills": ["Python"],
    "preferred_skills": [],
    "keywords": ["Python"],
}


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest.fixture
def stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run the real tailoring pipeline with every LLM step stubbed out."""
    monkeypatch.setattr(resumes, "_load_config", lambda: {})
    monkeypatch.setattr(resumes, "get_content_language", lambda: "en")
    monkeypatch.setattr(resumes, "_get_default_prompt_id", lambda: "nudge")
    monkeypatch.setattr(
        resumes, "extract_job_keywords", AsyncMock(return_value=JOB_KEYWORDS)
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
        resumes, "generate_resume_title", AsyncMock(return_value="Backend role")
    )


async def test_queue_output_stores_an_ats_score_and_can_be_recalculated(
    isolated_db: Database,
    sample_resume: dict[str, Any],
    stub_llm: None,
    client: AsyncClient,
) -> None:
    source = ResumeData.model_validate(sample_resume).model_dump()
    master = await isolated_db.create_resume_atomic_master(
        content=json.dumps(source), processed_data=source, processing_status="ready"
    )
    await isolated_db.create_queue_item(
        "q1", master["resume_id"], "Senior Backend Engineer: Python", 0
    )

    await QueueManager().drain()

    item = await isolated_db.get_queue_item("q1")
    assert item is not None
    assert item["status"] == "completed", item["error"]
    tailored_id = item["tailored_resume_id"]
    improvement = await isolated_db.get_improvement_by_tailored_resume(tailored_id)
    assert improvement is not None
    stored = improvement["ats_score"]
    assert stored is not None, "the queue saved no ATS score for the builder"
    assert stored["calculated_at"]

    last = await client.get(f"/api/v1/resumes/{tailored_id}/ats-score")
    assert last.status_code == 200, last.text
    assert last.json() == stored

    # Recalculation reads the job keywords cached while tailoring.
    recalculated = await client.post(f"/api/v1/resumes/{tailored_id}/ats-score")
    assert recalculated.status_code == 200, recalculated.text
    assert recalculated.json()["score"] == stored["score"]
