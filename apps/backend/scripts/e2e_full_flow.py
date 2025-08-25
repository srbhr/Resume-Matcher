import asyncio
import argparse
import json
import os
import sys
import uuid
from typing import Any, Dict, List, Tuple

from httpx import AsyncClient, ASGITransport

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.base import create_app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import AsyncSessionLocal, async_engine  # noqa: E402
from app.models import ProcessedResume, ProcessedJob, Resume, Job, Base  # noqa: E402


def _make_processed(
    resume_id: str,
    job_id: str,
    r: Dict[str, Any],
    j: Dict[str, Any],
    resume_md: str,
    job_md: str,
):
    # Seed raw sources as Markdown so scoring uses realistic language input (incl. Anschreiben)
    raw_resume = Resume(resume_id=resume_id, content=resume_md, content_type="text/markdown")
    raw_job = Job(job_id=job_id, resume_id=resume_id, content=job_md)
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


async def run(fixture_set: str = "short", repeats: int = 1, min_uplift: float | None = None, max_rounds: int | None = None) -> None:
    # Make all API routes bypass auth to avoid touching Clerk/prod
    os.environ["DISABLE_AUTH_FOR_TESTS"] = "1"

    # Ensure tables exist for local DBs
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Require OpenAI key for embeddings/LLM to exercise full flow strictly
    have_openai = bool(settings.EMBEDDING_API_KEY or settings.LLM_API_KEY or os.getenv("OPENAI_API_KEY"))
    if not have_openai:
        print("No OpenAI key found (EMBEDDING_API_KEY/LLM_API_KEY/OPENAI_API_KEY). Aborting full E2E.")
        return

    app = create_app()

    # Seed one representative German case (Lebenslauf + Anschreiben + Stellenbeschreibung)
    resume_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    # Load fixed fixtures for consistent uplift measurements
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    resume_fixture = "german_resume_long.md" if fixture_set == "long" else "german_resume.md"
    job_fixture = "german_job_long.md" if fixture_set == "long" else "german_job.md"
    with open(os.path.join(fixtures_dir, resume_fixture), "r", encoding="utf-8") as f:
        german_resume_md = f.read()
    with open(os.path.join(fixtures_dir, job_fixture), "r", encoding="utf-8") as f:
        german_job_md = f.read()

    r = {
        "skills": [{"category": "Backend", "skill_name": s} for s in ["Python", "Docker", "FastAPI"]],
        "experiences": [
            {
                "job_title": "Backend Engineer",
                "company": "Firma A",
                "location": "Remote",
                "start_date": "2022-01-01",
                "end_date": "2023-01-01",
                "description": [
                    "Entwicklung von Python-APIs mit FastAPI",
                    "Containerisierung mit Docker und Aufbau von CI/CD",
                ],
                "technologies_used": ["Python", "FastAPI", "Docker"],
            }
        ],
        "projects": [],
        "keywords": ["python", "docker", "fastapi", "kubernetes"],
    }
    j = {
        "title": "Backend Engineer",
        "summary": "Python-Services mit Docker, idealerweise FastAPI; CI/CD und Cloud von Vorteil",
        "responsibilities": ["Design und Implementierung von APIs", "Pflege von Docker-Builds"],
        "required": ["python", "docker"],
        "preferred": ["fastapi", "kubernetes"],
        "keywords": ["python", "docker", "fastapi", "kubernetes"],
    }

    raw_resume, raw_job, pr, pj = _make_processed(resume_id, job_id, r, j, german_resume_md, german_job_md)
    async with AsyncSessionLocal() as session:
        session.add_all([raw_resume, raw_job, pr, pj])
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # whoami (auth bypass)
        resp = await client.get("/api/v1/auth/whoami")
        print("whoami:", resp.status_code, resp.json())
        # Preview inputs
        print(f"USING FIXTURE SET: {fixture_set} (resume={resume_fixture}, job={job_fixture})")
        print("RAW RESUME PREVIEW:", (german_resume_md[:240] + ("…" if len(german_resume_md) > 240 else "")))
        print("RAW JOB PREVIEW:", (german_job_md[:240] + ("…" if len(german_job_md) > 240 else "")))

        # match (require embeddings)
        resp = await client.post(
            "/api/v1/match",
            params={"require_llm": "true"},
            json={"resume_id": resume_id, "job_id": job_id},
        )
        print("match:", resp.status_code, resp.text[:200])

        # improve (LLM-backed), optionally with min_uplift and repeats to measure variance
        uplifts: list[float] = []
        for i in range(max(1, int(repeats or 1))):
            params = {
                "use_llm": "true",
                "require_llm": "false",
                "stream": "false",
                # Make the threshold explicit to ensure reproducibility across runs
                "equivalence_threshold": "0.82",
                # Optionally force Core Technologies even when nothing is missing
                "always_core_tech": "true",
            }
            if min_uplift is not None:
                params["min_uplift"] = str(min_uplift)
            if max_rounds is not None:
                params["max_rounds"] = str(max_rounds)
            resp = await client.post(
                "/api/v1/resume/improve",
                params=params,
                json={"resume_id": resume_id, "job_id": job_id},
            )
            print(f"improve run {i+1}/{repeats}:", resp.status_code)
            if resp.status_code == 200:
                data = resp.json().get("data", {})
                orig = float(data.get("original_score") or 0)
                new = float(data.get("new_score") or 0)
                if orig:
                    try:
                        uplifts.append((new - orig) / abs(orig) * 100.0)
                    except Exception:
                        pass
        if uplifts:
            import statistics as _stats
            mean = _stats.mean(uplifts)
            stdev = _stats.pstdev(uplifts) if len(uplifts) > 1 else 0.0
            print(f"uplift_percent_runs: {', '.join(f'{u:.2f}%' for u in uplifts)}")
            print(f"uplift_mean: {mean:.2f}% uplift_stddev: {stdev:.2f}%")

        # improve (LLM-backed) — strict mode to validate real LLM uplift with require_llm=true
        resp = await client.post(
            "/api/v1/resume/improve",
            params={"use_llm": "true", "require_llm": "true", "stream": "false"},
            json={"resume_id": resume_id, "job_id": job_id},
        )
        print("improve strict:", resp.status_code)
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            print("strict original_score:", data.get("original_score"), "strict new_score:", data.get("new_score"))
            print("strict llm_used:", data.get("llm_used"))
            updated_html = data.get("updated_resume", "")
            print("UPDATED RESUME (HTML) PREVIEW [STRICT]:", (updated_html[:240] + ("…" if len(updated_html) > 240 else "")))
        else:
            print("strict improve error:", getattr(resp, "text", ""))

        # fetch combined resume
        resp = await client.get("/api/v1/resume", params={"resume_id": resume_id})
        print("resume get:", resp.status_code, "len=", len(resp.text))

        # fetch combined job
        resp = await client.get("/api/v1/job", params={"job_id": job_id})
        print("job get:", resp.status_code, "len=", len(resp.text))

        # metrics (LLM/cache counters)
        resp = await client.get("/api/v1/metrics/llm")
        print("metrics llm:", resp.status_code)
        if resp.status_code == 200:
            m = resp.json()
            print("metrics keys:", list(m.keys()))
            tokens = m.get("tokens", {})
            embeddings = m.get("embeddings", {})
            cost = m.get("cost_usd", {})
            print(
                "tokens prompt:", tokens.get("prompt_total"),
                "completion:", tokens.get("completion_total"),
                "total:", tokens.get("total"),
                "calls:", tokens.get("calls"),
            )
            print(
                "cost_usd input:", cost.get("llm_input"),
                "output:", cost.get("llm_output"),
                "total:", cost.get("llm_total"),
            )
            # Embeddings usage + grand total costs
            print(
                "embeddings calls:", embeddings.get("calls"),
                "prompt_tokens_exact:", embeddings.get("prompt_tokens_exact"),
                "prompt_tokens_estimated:", embeddings.get("prompt_tokens_estimated"),
            )
            print(
                "cost_usd embeddings:", cost.get("embeddings"),
                "grand_total:", cost.get("grand_total"),
            )

        # cache invalidation by entity
        resp = await client.delete(f"/api/v1/cache/entity/resume/{resume_id}")
        print("invalidate resume cache:", resp.status_code, resp.text)
        resp = await client.delete(f"/api/v1/cache/entity/job/{job_id}")
        print("invalidate job cache:", resp.status_code, resp.text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--fixture-set", choices=["short", "long"], default="short")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--min-uplift", type=float, default=None)
    parser.add_argument("--max-rounds", type=int, default=None)
    args, _unknown = parser.parse_known_args()
    asyncio.run(run(args.fixture_set, args.repeats, args.min_uplift, args.max_rounds))
