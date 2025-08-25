import os
import uuid
import json
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.base import create_app
from app.models import ProcessedResume, ProcessedJob, Resume, Job
from app.core.database import get_db_session
from app.core.config import settings as core_settings


requires_openai = pytest.mark.skipif(
    not (
        core_settings.EMBEDDING_API_KEY
        or core_settings.LLM_API_KEY
        or os.getenv("OPENAI_API_KEY")
    ),
    reason="No OpenAI key found (EMBEDDING_API_KEY/LLM_API_KEY/OPENAI_API_KEY); skipping real OpenAI integration test",
)


@pytest.mark.asyncio
@requires_openai
async def test_match_endpoint_strict_llm_real_openai(db_session):
    """End-to-end test using real OpenAI embeddings when a key is present.

    Verifies require_llm=true path returns 200 and a sensible score/breakdown.
    """
    app: FastAPI = create_app()

    # Override DB dependency to share the same AsyncSession/engine
    async def _override_get_db_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_get_db_session

    # Seed minimal resume/job with overlapping semantics
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    raw_resume = Resume(resume_id=resume_id, content="raw", content_type="text/plain")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content="job raw")
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({
            "firstName": "Ada",
            "lastName": "Lovelace",
            "email": "ada@example.com",
            "phone": "1",
            "location": {"city": "X", "country": "Y"},
        }),
        experiences=json.dumps({
            "experiences": [
                {
                    "job_title": "Software Engineer",
                    "company": "C",
                    "location": "Remote",
                    "start_date": "2021-01-01",
                    "end_date": "2022-01-01",
                    "description": [
                        "Built backend services in Python and designed REST APIs",
                        "Integrated OpenAI embeddings for semantic search",
                    ],
                    "technologies_used": ["python", "fastapi", "openai"],
                }
            ]
        }),
        projects=json.dumps({
            "projects": [
                {
                    "project_name": "Semantic Matcher",
                    "description": "Embedding-based matching of resumes to job descriptions",
                    "technologies_used": ["python", "numpy"],
                    "start_date": "2021-06-01",
                    "end_date": "2021-12-01",
                }
            ]
        }),
        skills=json.dumps({"skills": [{"category": "General", "skill_name": s} for s in ["python", "fastapi", "openai", "embeddings"]]}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python", "embeddings", "api"]}),
    )
    pj = ProcessedJob(
        job_id=job_id,
        job_title="Backend Engineer (Semantic Search)",
        company_profile=json.dumps({"company_name": "Co", "industry": "Tech"}),
        location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
        date_posted="2025-01-01",
        employment_type="Full-time",
        job_summary="Develop services using Python and embeddings",
        key_responsibilities=json.dumps({"key_responsibilities": ["Design and implement APIs", "Integrate embeddings for search"]}),
        qualifications=json.dumps({"required": ["python", "embeddings"], "preferred": ["fastapi"]}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python", "fastapi", "embeddings"]}),
    )
    db_session.add_all([raw_resume, raw_job, pr, pj])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(f"/api/v1/match?require_llm=true", json={"resume_id": resume_id, "job_id": job_id})
        # If provider fails despite key, backend maps to 503; otherwise 200
        assert resp.status_code in (200, 503), resp.text
        body = resp.json()
        if resp.status_code == 200:
            data = body["data"]
            assert data["resume_id"] == resume_id
            assert data["job_id"] == job_id
            assert 0 <= data["score"] <= 100
            assert isinstance(data.get("breakdown"), dict)
        else:
            # Strict mode should surface AI provider outage/unavailable
            err = body.get("error", {})
            assert err.get("code") == "AI_PROVIDER_UNAVAILABLE"
