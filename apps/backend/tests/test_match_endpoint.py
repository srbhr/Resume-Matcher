import uuid
import json
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.base import create_app
from app.models import ProcessedResume, ProcessedJob, Resume, Job
from app.services.matching_service import MatchingService  # ensure import path works
from app.core.database import get_db_session

# Reuse in-memory sqlite by overriding settings could be more elaborate; here we rely on default (file) DB.
# For isolation, we create temporary resume/job records directly as processed rows.

@pytest.mark.asyncio
async def test_match_endpoint_404_on_missing_records():
    app: FastAPI = create_app()
    # Ensure schema created for sqlite fallback
    from app.core.database import async_engine
    from app.models import Base
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"resume_id": str(uuid.uuid4()), "job_id": str(uuid.uuid4())}
        resp = await client.post("/api/v1/match", json=payload)
        # Now expecting unified envelope with 404 not found errors
        assert resp.status_code in (404, 422)  # accept either while transition
        body = resp.json()
        # envelope style
        if resp.status_code == 404:
            assert 'error' in body and body['error']['code'] in ('RESUME_NOT_FOUND', 'JOB_NOT_FOUND')
        else:
            # legacy behavior fallback
            assert 'detail' in body


@pytest.mark.asyncio
async def test_match_endpoint_happy_path(db_session):
    app: FastAPI = create_app()
    # Override DB dependency to use the shared test session (same engine/loop)
    async def _override_get_db_session():
        yield db_session
    app.dependency_overrides[get_db_session] = _override_get_db_session

    # Insert minimal processed resume + job sharing some keywords using the same session
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    raw_resume = Resume(resume_id=resume_id, content="raw", content_type="text/plain")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content="job raw")
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "1", "location": {"city": "X", "country": "Y"}}),
        experiences=json.dumps({"experiences": [{"job_title": "python engineer", "company": "C", "location": "L", "start_date": "2020-01-01", "end_date": "2021-01-01", "description": ["Did X"], "technologies_used": []}]}),
        projects=json.dumps({"projects": [{"project_name": "docker tool", "description": "D", "technologies_used": [], "start_date": "2020-01-01", "end_date": "2020-06-01"}]}),
        skills=json.dumps({"skills": [{"category": "General", "skill_name": s} for s in ["python", "docker"]]}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python", "docker", "engineer"]}),
    )
    pj = ProcessedJob(
        job_id=job_id,
        job_title="Engineer",
        company_profile=json.dumps({"company_name": "Co", "industry": "Tech"}),
        location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
        date_posted="2025-01-01",
        employment_type="Full-time",
        job_summary="Build stuff",
        key_responsibilities=json.dumps({"key_responsibilities": ["Do things"]}),
        qualifications=json.dumps({"required": ["python"], "preferred": []}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": ["python", "docker", "engineer"]}),
    )
    db_session.add_all([raw_resume, raw_job, pr, pj])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/match", json={"resume_id": resume_id, "job_id": job_id})
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["resume_id"] == resume_id
        assert data["job_id"] == job_id
        assert 0 <= data["score"] <= 100
        # Basic presence of breakdown keys
        for key in ["skill_overlap", "keyword_coverage", "experience_relevance", "project_relevance", "education_bonus", "penalty_missing_critical"]:
            assert key in data["breakdown"]
