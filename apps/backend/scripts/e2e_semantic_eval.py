import asyncio
import json
import os
import sys
import uuid
from typing import Any, Dict, List, Tuple

from httpx import AsyncClient, ASGITransport

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.base import create_app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models import ProcessedResume, ProcessedJob, Resume, Job  # noqa: E402


Case = Tuple[str, Dict[str, Any], Dict[str, Any]]


def _make_processed(resume_id: str, job_id: str, r: Dict[str, Any], j: Dict[str, Any]):
    raw_resume = Resume(resume_id=resume_id, content="raw", content_type="text/plain")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content="job raw")
    pr = ProcessedResume(
        resume_id=resume_id,
        personal_data=json.dumps({
            "firstName": "Test",
            "lastName": "User",
            "email": "t@example.com",
            "phone": "1",
            "location": {"city": "X", "country": "Y"},
        }),
        experiences=json.dumps({"experiences": r.get("experiences", [])}),
        projects=json.dumps({"projects": r.get("projects", [])}),
        skills=json.dumps({"skills": r.get("skills", [])}),
        research_work=json.dumps({"research_work": []}),
        achievements=json.dumps({"achievements": []}),
        education=json.dumps({"education": []}),
        extracted_keywords=json.dumps({"extracted_keywords": r.get("keywords", [])}),
    )
    pj = ProcessedJob(
        job_id=job_id,
        job_title=j.get("title", "Engineer"),
        company_profile=json.dumps({"company_name": "Co", "industry": "Tech"}),
        location=json.dumps({"city": "", "state": "", "country": "", "remote_status": "Remote"}),
        date_posted="2025-01-01",
        employment_type="Full-time",
        job_summary=j.get("summary", ""),
        key_responsibilities=json.dumps({"key_responsibilities": j.get("responsibilities", [])}),
        qualifications=json.dumps({"required": j.get("required", []), "preferred": j.get("preferred", [])}),
        compensation_and_benfits=json.dumps({"compensation_and_benfits": []}),
        application_info=json.dumps({"application_info": []}),
        extracted_keywords=json.dumps({"extracted_keywords": j.get("keywords", [])}),
    )
    return raw_resume, raw_job, pr, pj


async def run() -> None:
    # Key presence check for real OpenAI embeddings
    if not (settings.EMBEDDING_API_KEY or settings.LLM_API_KEY or os.getenv("OPENAI_API_KEY")):
        print("No OpenAI key found (EMBEDDING_API_KEY/LLM_API_KEY/OPENAI_API_KEY). Aborting.")
        return

    app = create_app()

    cases: List[Case] = [
        (
            "Lexical overlap (python/docker)",
            {
                "skills": [{"category": "General", "skill_name": s} for s in ["python", "docker", "fastapi"]],
                "experiences": [
                    {
                        "job_title": "Backend Engineer",
                        "company": "A",
                        "location": "Remote",
                        "start_date": "2022-01-01",
                        "end_date": "2023-01-01",
                        "description": ["Developed Python APIs with FastAPI", "Built Docker images and CI pipelines"],
                        "technologies_used": ["python", "fastapi", "docker"],
                    }
                ],
                "projects": [],
                "keywords": ["python", "docker", "fastapi"],
            },
            {
                "title": "Backend Engineer",
                "summary": "Build backend services in Python and Docker",
                "responsibilities": ["Design APIs", "Maintain Docker builds"],
                "required": ["python", "docker"],
                "preferred": ["fastapi"],
                "keywords": ["python", "docker", "fastapi"],
            },
        ),
        (
            "Semantic (embeddings/semantic search)",
            {
                "skills": [{"category": "ML", "skill_name": s} for s in ["embeddings", "vector search", "semantic search"]],
                "experiences": [
                    {
                        "job_title": "AI Engineer",
                        "company": "B",
                        "location": "Remote",
                        "start_date": "2022-01-01",
                        "end_date": "2023-01-01",
                        "description": ["Implemented text embeddings for semantic search", "Optimized cosine similarity retrieval"],
                        "technologies_used": ["python", "numpy"],
                    }
                ],
                "projects": [],
                "keywords": ["embeddings", "semantic search", "cosine"],
            },
            {
                "title": "Backend Engineer (NLP)",
                "summary": "Develop services using text embeddings for search",
                "responsibilities": ["Implement semantic search", "Compute cosine similarity"],
                "required": ["text embeddings", "semantic search"],
                "preferred": ["python"],
                "keywords": ["embeddings", "semantic search"],
            },
        ),
        (
            "Low overlap (design vs backend)",
            {
                "skills": [{"category": "Design", "skill_name": s} for s in ["photoshop", "illustrator"]],
                "experiences": [
                    {
                        "job_title": "Graphic Designer",
                        "company": "C",
                        "location": "Onsite",
                        "start_date": "2021-01-01",
                        "end_date": "2022-01-01",
                        "description": ["Designed marketing materials"],
                        "technologies_used": ["photoshop"],
                    }
                ],
                "projects": [],
                "keywords": ["design", "photoshop"],
            },
            {
                "title": "Backend Engineer",
                "summary": "Develop Python services",
                "responsibilities": ["Build APIs"],
                "required": ["python"],
                "preferred": ["docker"],
                "keywords": ["python", "docker"],
            },
        ),
    ]

    results: List[Tuple[str, int]] = []

    for label, r, j in cases:
        resume_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        raw_resume, raw_job, pr, pj = _make_processed(resume_id, job_id, r, j)
        async with AsyncSessionLocal() as session:
            session.add_all([raw_resume, raw_job, pr, pj])
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(f"/api/v1/match?require_llm=true", json={"resume_id": resume_id, "job_id": job_id})
            if resp.status_code != 200:
                print(f"{label}: HTTP {resp.status_code} -> {resp.text}")
                results.append((label, -1))
                continue
            data = resp.json()["data"]
            results.append((label, int(round(data["score"]))))

    # Report
    print("\nE2E semantic evaluation (require_llm=true):")
    for label, score in results:
        print(f"- {label:36} -> {score if score >= 0 else 'ERROR'}")

    # Basic ordering expectations
    scores = {k: v for k, v in results}
    if all(k in scores and scores[k] >= 0 for k in [
        "Lexical overlap (python/docker)",
        "Semantic (embeddings/semantic search)",
        "Low overlap (design vs backend)",
    ]):
        good = scores["Low overlap (design vs backend)"] < min(
            scores["Lexical overlap (python/docker)"], scores["Semantic (embeddings/semantic search)"]
        )
        print("\nOrdering check: low-overlap < others ->", "PASS" if good else "FAIL")


if __name__ == "__main__":
    asyncio.run(run())
