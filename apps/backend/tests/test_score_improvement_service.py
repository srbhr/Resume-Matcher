import json
import uuid
import pytest

from app.services.score_improvement_service import ScoreImprovementService
from app.models import Resume, ProcessedResume, Job, ProcessedJob


def _mk_resume(resume_id: str, content: str, extracted: list[str]):
    return (
        Resume(resume_id=resume_id, content=content, content_type="md"),
        ProcessedResume(
            resume_id=resume_id,
            personal_data=json.dumps({"firstName": "A", "lastName": "B", "email": "a@b.c", "phone": "1", "location": {"city": "X", "country": "Y"}}),
            experiences=json.dumps({"experiences": []}),
            projects=json.dumps({"projects": []}),
            skills=json.dumps({"skills": []}),
            research_work=json.dumps({"research_work": []}),
            achievements=json.dumps({"achievements": []}),
            education=json.dumps({"education": []}),
            extracted_keywords=json.dumps({"extracted_keywords": extracted}),
        ),
    )


def _mk_job(job_id: str, resume_id: str, content: str, keywords: list[str], required: list[str]):
    return (
        Job(job_id=job_id, resume_id=resume_id, content=content),
        ProcessedJob(
            job_id=job_id,
            job_title="Engineer",
            company_profile=json.dumps({"company_name": "Co"}),
            location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
            date_posted="2025-01-01",
            employment_type="Full-time",
            job_summary="Build things",
            key_responsibilities=json.dumps({"key_responsibilities": []}),
            qualifications=json.dumps({"required": required, "preferred": []}),
            compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
            application_info=json.dumps({"application_info": []}),
            extracted_keywords=json.dumps({"extracted_keywords": keywords}),
        ),
    )


@pytest.mark.asyncio
async def test_baseline_adds_section_when_missing_keywords(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    # Resume only mentions python; job expects python and docker.
    (resume, processed_resume) = _mk_resume(resume_id, content="## Profile\nExperienced Python developer.", extracted=["python"])
    (job, processed_job) = _mk_job(job_id, resume_id, content="We need Python and Docker skills", keywords=["python", "docker"], required=["python", "docker"])

    db_session.add(resume)
    db_session.add(processed_resume)
    db_session.add(job)
    db_session.add(processed_job)
    await db_session.commit()

    svc = ScoreImprovementService(db_session)
    result = await svc.run(resume_id=resume_id, job_id=job_id, use_llm=False)

    baseline = result["baseline"]
    assert baseline["added_section"] is True
    assert "Suggested Additions" in result["updated_resume"]
    assert "docker" in " ".join(baseline["missing_keywords"]).lower()
    # Score should not decrease relative to original
    assert result["new_score"] >= result["original_score"]
    # LLM not used
    assert result["llm_used"] is False


@pytest.mark.asyncio
async def test_baseline_no_section_when_all_present(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    text = "Python Docker Kubernetes"  # all keywords present already
    (resume, processed_resume) = _mk_resume(resume_id, content=text, extracted=["python", "docker", "kubernetes"])
    (job, processed_job) = _mk_job(job_id, resume_id, content="Need Python Docker Kubernetes", keywords=["python", "docker", "kubernetes"], required=["python"])

    db_session.add(resume)
    db_session.add(processed_resume)
    db_session.add(job)
    db_session.add(processed_job)
    await db_session.commit()

    svc = ScoreImprovementService(db_session)
    result = await svc.run(resume_id=resume_id, job_id=job_id, use_llm=False)

    baseline = result["baseline"]
    assert baseline["added_section"] is False
    assert baseline["missing_keywords_count"] == 0
    assert "Suggested Additions" not in result["updated_resume"]
    assert result["llm_used"] is False


@pytest.mark.asyncio
async def test_baseline_handles_empty_keywords(db_session):
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    (resume, processed_resume) = _mk_resume(resume_id, content="Just text", extracted=[])
    (job, processed_job) = _mk_job(job_id, resume_id, content="General role", keywords=[], required=[])

    db_session.add(resume)
    db_session.add(processed_resume)
    db_session.add(job)
    db_session.add(processed_job)
    await db_session.commit()

    svc = ScoreImprovementService(db_session)
    result = await svc.run(resume_id=resume_id, job_id=job_id, use_llm=False)

    baseline = result["baseline"]
    assert baseline["missing_keywords_count"] == 0
    assert baseline["added_section"] is False
    assert result["llm_used"] is False
