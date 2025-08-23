import uuid
import json
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.base import create_app
from app.models import Resume, ProcessedResume, Job, ProcessedJob
from app.core.database import AsyncSessionLocal


def _seed_records(use_missing: bool = True):
    """Create a resume/job pair; if use_missing True omit one keyword from resume so baseline adds section."""
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    if use_missing:
        resume_content = "Python developer with cloud experience"
        resume_keywords = ["python"]
    else:
        resume_content = "Python developer with cloud experience and Docker skills"
        resume_keywords = ["python", "docker"]
    raw_resume = Resume(resume_id=resume_id, content=resume_content, content_type="md")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content="We need Python and Docker skills")
    job_keywords = ["python", "docker"]
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "1", "location": {"city": "X", "country": "Y"}}),
        experiences=json.dumps({"experiences": []}),
        projects=json.dumps({"projects": []}),
        skills=json.dumps({"skills": []}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": resume_keywords}),
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
        qualifications=json.dumps({"required": job_keywords, "preferred": []}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": job_keywords}),
    )
    return resume_id, job_id, [raw_resume, raw_job, pr, pj]


@pytest.mark.asyncio
async def test_improve_endpoint_baseline_only():
    app: FastAPI = create_app()
    resume_id, job_id, rows = _seed_records(use_missing=True)
    from app.models import Base
    from app.core.database import async_engine
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        session.add_all(rows)
        await session.commit()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(f"/api/v1/resumes/improve?use_llm=false", json={"resume_id": resume_id, "job_id": job_id})
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["resume_id"] == resume_id
        assert data["job_id"] == job_id
        assert data["baseline"]["added_section"] is True
        assert data["baseline"]["missing_keywords_count"] >= 1
        assert data["llm_used"] is False
        assert data["new_score"] >= data["original_score"]


@pytest.mark.asyncio
async def test_improve_endpoint_no_missing_keywords():
    app: FastAPI = create_app()
    resume_id, job_id, rows = _seed_records(use_missing=False)
    from app.models import Base
    from app.core.database import async_engine
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        session.add_all(rows)
        await session.commit()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/resumes/improve?use_llm=false", json={"resume_id": resume_id, "job_id": job_id})
            assert resp.status_code == 200, resp.text
            data = resp.json()["data"]
            print("DEBUG resume:", rows[0].content)
            print("DEBUG job keywords:", json.loads(rows[3].extracted_keywords))
            print("DEBUG baseline:", data["baseline"])
            assert data["baseline"]["added_section"] is False
            assert data["baseline"]["missing_keywords_count"] == 0
            assert data["llm_used"] is False
