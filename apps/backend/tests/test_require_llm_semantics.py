import uuid
import json
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.base import create_app
from app.models import Resume, ProcessedResume, Job, ProcessedJob
from app.core.database import AsyncSessionLocal
from app.agent.exceptions import ProviderError


def _seed_pair():
    """Create a minimal resume/job pair with overlapping keywords."""
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    raw_resume = Resume(resume_id=resume_id, content="Python developer", content_type="md")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content="Looking for Python skills")
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "1", "location": {"city": "X", "country": "Y"}}),
        experiences=json.dumps({"experiences": []}),
        projects=json.dumps({"projects": []}),
        skills=json.dumps({"skills": []}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python"]}),
    )
    pj = ProcessedJob(
        job_id=job_id,
        job_title="Engineer",
        company_profile=json.dumps({"company_name": "Co"}),
        location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
        date_posted="2025-01-01",
        employment_type="Full-time",
        job_summary="Build things",
        key_responsibilities=json.dumps({"key_responsibilities": []}),
        qualifications=json.dumps({"required": ["python"], "preferred": []}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python"]}),
    )
    return resume_id, job_id, [raw_resume, raw_job, pr, pj]


@pytest.mark.asyncio
async def test_improve_require_llm_returns_503_on_provider_failure(monkeypatch):
    """When require_llm=true and the embedding provider fails, the endpoint must return 503 with AI_PROVIDER_UNAVAILABLE."""
    app: FastAPI = create_app()

    # Prepare schema
    from app.models import Base
    from app.core.database import async_engine
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed data
    resume_id, job_id, rows = _seed_pair()
    async with AsyncSessionLocal() as session:
        session.add_all(rows)
        await session.commit()

    # Patch EmbeddingManager.embed to raise ProviderError
    from app.services import score_improvement_service as sis

    async def _raise(*args, **kwargs):  # type: ignore[no-untyped-def]
        raise ProviderError("simulated provider failure")

    monkeypatch.setattr(sis.EmbeddingManager, "embed", _raise)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(f"/api/v1/resumes/improve?require_llm=true", json={"resume_id": resume_id, "job_id": job_id})
        assert resp.status_code == 503, resp.text
        payload = resp.json()
        assert payload.get("error", {}).get("code") == "AI_PROVIDER_UNAVAILABLE"
        assert "request_id" in payload
