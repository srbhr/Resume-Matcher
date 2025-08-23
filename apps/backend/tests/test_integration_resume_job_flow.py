import json
import pytest
from fastapi.testclient import TestClient

from app.base import create_app
from app.models import Base, ProcessedResume, ProcessedJob
from app.core.database import async_engine, AsyncSessionLocal

pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_full_resume_job_match_flow():
    """End-to-end flow:
    1. Upload resume (DISABLE_BACKGROUND_TASKS expected true via conftest so structured extraction runs inline).
    2. Upload job description JSON.
    3. Fetch resume & job detail endpoints.
    4. Call match endpoint for deterministic score.
    5. Fetch metrics, then invalidate resume-specific cache entries and assert metrics counter increases or stays >=.
    """
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    app = create_app()
    client = TestClient(app)

    # 1. Upload resume (simulate PDF)
    resume_bytes = b"Integration Resume Content"
    files = {"file": ("resume.pdf", resume_bytes, "application/pdf")}
    r_resp = client.post("/api/v1/resume/upload?defer=true", files=files)
    assert r_resp.status_code == 200, r_resp.text
    resume_id = r_resp.json()["data"]["resume_id"]
    assert resume_id

    # 2. Upload job
    job_payload = {
        "job_descriptions": [
            "# Software Engineer\nWe need a Software Engineer with Python skills. Responsibilities: build, test."
        ],
        "resume_id": resume_id,
    }
    j_resp = client.post("/api/v1/job/upload", json=job_payload)
    assert j_resp.status_code == 200, j_resp.text
    job_id_resp = j_resp.json()["data"]["job_id"]
    # Service returns a list of ids; normalize to first
    job_id = job_id_resp[0] if isinstance(job_id_resp, list) else job_id_resp
    assert job_id

    # Seed minimal processed rows (simulate successful extraction without LLM)
    async with AsyncSessionLocal() as session:
        # Only insert if absent
        pr = await session.get(ProcessedResume, resume_id)
        if pr is None:
            session.add(
                ProcessedResume(
                    resume_id=resume_id,
                    personal_data={"name": "Test User"},
                    experiences={"experiences": [{"job_title": "Engineer"}]},
                    projects={"projects": [{"project_name": "Proj"}]},
                    skills={"skills": ["python", "testing"]},
                    research_work=None,
                    achievements=None,
                    education={"education": []},
                    extracted_keywords={"extracted_keywords": ["python", "engineer"]},
                )
            )
        pj = await session.get(ProcessedJob, job_id)
        if pj is None:
            session.add(
                ProcessedJob(
                    job_id=job_id,
                    job_title="Software Engineer",
                    job_summary="Engineering role",
                    company_profile="We build things",
                    key_responsibilities={"responsibilities": ["build", "test"]},
                    qualifications={"required": ["python"]},
                    extracted_keywords={"extracted_keywords": ["python", "engineer"]},
                )
            )
        await session.commit()

    # 3. Fetch resume & job detail
    g_res = client.get(f"/api/v1/resume?resume_id={resume_id}")
    assert g_res.status_code == 200, g_res.text
    resume_data = g_res.json()["data"]
    assert resume_data["resume_id"] == resume_id
    assert "processed_resume" in resume_data

    g_job = client.get(f"/api/v1/job?job_id={job_id}")
    assert g_job.status_code == 200, g_job.text
    job_data = g_job.json()["data"]
    assert job_data["job_id"] == job_id

    # 4. Match
    match_payload = {"resume_id": resume_id, "job_id": job_id}
    m_resp = client.post("/api/v1/match", json=match_payload)
    assert m_resp.status_code == 200, m_resp.text
    match_data = m_resp.json()["data"]
    assert match_data["resume_id"] == resume_id and match_data["job_id"] == job_id
    assert 0 <= match_data["score"] <= 100

    # 5. Metrics before invalidation
    metrics_before = client.get("/api/v1/metrics/llm").json()
    deleted_before = metrics_before.get("invalidation", {}).get("deleted", 0)

    # Invalidate resume cache entries
    inv_resp = client.delete(f"/api/v1/cache/entity/resume/{resume_id}")
    assert inv_resp.status_code == 200

    metrics_after = client.get("/api/v1/metrics/llm").json()
    deleted_after = metrics_after.get("invalidation", {}).get("deleted", 0)
    assert deleted_after >= deleted_before
