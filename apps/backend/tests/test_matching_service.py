import json
import uuid
import math
import pytest

from app.services.matching_service import MatchingService
from app.models import ProcessedResume, ProcessedJob, Resume, Job


def _make_processed_resume(resume_id: str, skills: list[str], experiences: list[str], projects: list[str], qualifications: list[str]):
    # Ensure FK to raw resume exists for Postgres
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "123", "location": {"city": "X", "country": "Y"}}),
        experiences=json.dumps({"experiences": [{"job_title": e, "company": "C", "location": "L", "start_date": "2020-01-01", "end_date": "2021-01-01", "description": ["Did X"], "technologies_used": []} for e in experiences]}),
        projects=json.dumps({"projects": [{"project_name": p, "description": "D", "technologies_used": [], "start_date": "2020-01-01", "end_date": "2020-06-01"} for p in projects]}),
        skills=json.dumps({"skills": [{"category": "General", "skill_name": s} for s in skills]}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": skills + experiences + projects + qualifications}),
    )
    raw = Resume(resume_id=resume_id, content="raw", content_type="text/plain")
    pr.raw_resume = raw
    return pr
    return ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "123", "location": {"city": "X", "country": "Y"}}),
        experiences=json.dumps({"experiences": [{"job_title": e, "company": "C", "location": "L", "start_date": "2020-01-01", "end_date": "2021-01-01", "description": ["Did X"], "technologies_used": []} for e in experiences]}),
        projects=json.dumps({"projects": [{"project_name": p, "description": "D", "technologies_used": [], "start_date": "2020-01-01", "end_date": "2020-06-01"} for p in projects]}),
        skills=json.dumps({"skills": [{"category": "General", "skill_name": s} for s in skills]}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": skills + experiences + projects + qualifications}),
    )


def _make_processed_job(job_id: str, resume_id: str, keywords: list[str], required_quals: list[str]):
    pj = ProcessedJob(
        job_id=job_id,
        job_title="Engineer",
        company_profile=json.dumps({"company_name": "Co", "industry": "Tech"}),
        location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
        date_posted="2025-01-01",
        employment_type="Full-time",
        job_summary="Build stuff",
        key_responsibilities=json.dumps({"key_responsibilities": ["Do things"]}),
        qualifications=json.dumps({"required": required_quals, "preferred": []}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": keywords}),
    )
    raw = Job(job_id=job_id, resume_id=resume_id, content="job raw")
    pj.raw_job = raw
    return pj


@pytest.mark.asyncio
async def test_matching_full_overlap(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    skills = ["python", "docker", "kubernetes"]
    experiences = ["python engineer"]
    projects = ["kubernetes dashboard"]
    required = ["python", "docker"]
    job_keywords = ["python", "docker", "kubernetes", "engineer"]

    db_session.add(_make_processed_resume(resume_id, skills, experiences, projects, required))
    db_session.add(_make_processed_job(job_id, resume_id, job_keywords, required))
    await db_session.commit()

    svc = MatchingService(db_session)
    result = await svc.match(resume_id, job_id)

    assert 0 <= result["score"] <= 100
    breakdown = result["breakdown"]
    assert breakdown["skill_overlap"] > 0.5
    assert breakdown["keyword_coverage"] > 0.5
    assert breakdown["education_bonus"] == 1.0


@pytest.mark.asyncio
async def test_matching_penalty_for_missing_quals(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    skills = ["python"]
    experiences = ["developer"]
    projects = []
    required = ["python", "golang"]
    job_keywords = ["python", "golang"]

    db_session.add(_make_processed_resume(resume_id, skills, experiences, projects, required))
    db_session.add(_make_processed_job(job_id, resume_id, job_keywords, required))
    await db_session.commit()

    svc = MatchingService(db_session)
    result = await svc.match(resume_id, job_id)
    breakdown = result["breakdown"]

    assert math.isclose(breakdown["penalty_missing_critical"], 0.5, rel_tol=1e-6)
    assert breakdown["education_bonus"] == 1.0


@pytest.mark.asyncio
async def test_matching_no_keywords_edge(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    skills: list[str] = []
    experiences: list[str] = []
    projects: list[str] = []
    required: list[str] = []
    job_keywords: list[str] = []

    db_session.add(_make_processed_resume(resume_id, skills, experiences, projects, required))
    db_session.add(_make_processed_job(job_id, resume_id, job_keywords, required))
    await db_session.commit()

    svc = MatchingService(db_session)
    result = await svc.match(resume_id, job_id)
    breakdown = result["breakdown"]
    assert breakdown["skill_overlap"] == 0
    assert breakdown["keyword_coverage"] == 0
    assert breakdown["experience_relevance"] == 0
    assert breakdown["project_relevance"] == 0
    assert breakdown["education_bonus"] == 0
    assert breakdown["penalty_missing_critical"] == 0
    assert result["score"] == 0
