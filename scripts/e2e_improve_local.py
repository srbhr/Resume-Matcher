import asyncio
import os
import sys
from typing import List

# Make backend package importable when launched from repo root
REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
APPS_BACKEND = os.path.normpath(os.path.join(REPO_ROOT, "..", "apps", "backend"))
if APPS_BACKEND not in sys.path:
    sys.path.insert(0, APPS_BACKEND)

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.base import Base  # type: ignore
from app.models.resume import Resume, ProcessedResume  # type: ignore
from app.models.job import Job, ProcessedJob  # type: ignore
from app.services.score_improvement_service import ScoreImprovementService  # type: ignore
from app.core.config import settings  # type: ignore


async def setup_db(echo: bool = False) -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=echo, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    SessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    return SessionLocal()


async def seed_minimal(db: AsyncSession) -> tuple[str, str]:
    # Minimal German resume and job with Fuhrpark/Backoffice flavor
    resume_md = (
        "# Max Mustermann\n\n"
        "## Profil\n"
        "Kaufmännischer Mitarbeiter mit Erfahrung im Backoffice. Sicher im Umgang mit MS-Office.\n\n"
        "## Berufserfahrung\n"
        "- Unterstützung im Office-Alltag; allgemeine Verwaltung\n\n"
        "## Ausbildung\n"
        "- Industriekaufmann IHK\n"
    )
    job_md = (
        "# Sachbearbeiter Fuhrpark (m/w/d)\n\n"
        "- Koordination von Poolfahrzeugen, Übergaben/Rücknahmen\n"
        "- Fahrtenbuchführung, Ordnungswidrigkeitenmanagement\n"
        "- Leasinganfragen, Fahrzeugbestellungen, Excel-Reporting\n"
    )
    # Keywords
    job_kws: List[str] = [
        "Verwaltung/Koordination von Poolfahrzeugen",
        "Fahrtenbuchführung",
        "Ordnungswidrigkeitenmanagement",
        "Leasing",
        "Fahrzeugbestellungen",
        "Fahrzeugübergaben/-rücknahmen",
        "MS‑Office (Excel, Outlook, Word)",
    ]
    resume_kws: List[str] = ["Backoffice", "Verwaltung", "MS‑Office"]

    resume_id = "res-e2e-1"
    job_id = "job-e2e-1"

    # Insert records
    db.add(Resume(resume_id=resume_id, content=resume_md, content_type="md"))
    import json
    db.add(ProcessedResume(
        resume_id=resume_id,
        personal_data={},
        experiences=[],
        projects=[],
        skills=[],
        education=[],
        extracted_keywords=json.dumps(resume_kws),
    ))

    db.add(Job(job_id=job_id, resume_id=resume_id, content=job_md))
    db.add(ProcessedJob(
        job_id=job_id,
        job_title="Sachbearbeiter Fuhrpark",
        job_summary="Fuhrparkverwaltung",
        extracted_keywords=json.dumps(job_kws),
    ))
    await db.commit()
    return resume_id, job_id


async def main():
    # So we can exercise the deterministic fallback without network
    settings.REQUIRE_LLM_STRICT = False

    db = await setup_db(echo=False)
    async with db as session:
        resume_id, job_id = await seed_minimal(session)
        svc = ScoreImprovementService(session)
        result = await svc.run(
            resume_id=resume_id,
            job_id=job_id,
            use_llm=False,           # avoid LLM call
            require_llm=False,       # allow fallback
        )
        print("Original score:", result["baseline"]["baseline_score"])  # may be coverage ratio
        print("New score:", result["new_score"])                         # coverage-based
        print("Missing (baseline):", result["baseline"]["missing_keywords"])  # noqa
        print("--- Updated Resume (Markdown) ---")
        # The service returns HTML in updated_resume; instead, print the normalized md from cleanup:
        # We don’t directly have the md here; but we can quickly verify labels via the HTML content
        # and baseline keys are already printed above.
        # For quick smoke, print a substring signal:
        html = result["updated_resume"]
        print(html[:800])


if __name__ == "__main__":
    asyncio.run(main())
