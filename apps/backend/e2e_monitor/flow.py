"""Flow moves (seed-master, tailor) + the pure scorer-runner.

The scorer-runner wraps the deterministic scorers already proven in
``tests/evals/scorers.py`` so the harness and the eval suite agree on what
"a good tailoring" means. (The HTTP moves are appended to this module in a
later task.)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from e2e_monitor import API_BASE
from tests.evals.scorers import (
    is_valid_resume,
    jd_keywords_present,
    no_fabricated_employers,
    personal_info_unchanged,
    sections_preserved,
)


def score_tailoring(
    original: dict[str, Any], tailored: dict[str, Any], keywords: list[str]
) -> dict[str, Any]:
    """Run every structural scorer over an (original, tailored) pair."""
    return {
        "sections_preserved": sections_preserved(original, tailored),
        "fabricated_employers": no_fabricated_employers(original, tailored),
        "personal_info_unchanged": personal_info_unchanged(original, tailored),
        "is_valid_resume": is_valid_resume(tailored),
        "jd_keyword_coverage": jd_keywords_present(tailored, keywords),
    }


def seed_master_db(data_dir: Path, master: dict[str, Any]) -> str:
    """Pre-seed the isolated DB with a known master BEFORE the server boots.

    The upload endpoint only accepts documents (and runs a non-deterministic LLM
    parse), so for a controlled, deterministic master we write it straight into
    the isolated TinyDB file via app.database.Database — the same file the server
    opens once booted with DATA_DIR=<data_dir>. Returns the master's resume_id.
    """
    from app.database import Database

    db = Database(db_path=data_dir / "database.json")
    try:
        doc = db.create_resume(
            content="(seeded master resume)",
            content_type="md",
            is_master=True,
            processed_data=master,
            processing_status="ready",
        )
        return doc["resume_id"]
    finally:
        db.close()


def tailor(
    resume_id: str, jd_text: str, keywords: list[str], original: dict[str, Any]
) -> dict[str, Any]:
    """jobs/upload -> improve/preview -> improve/confirm; returns tailored + scores."""
    jobs_resp = httpx.post(
        f"{API_BASE}/jobs/upload",
        json={"job_descriptions": [jd_text], "resume_id": resume_id},
        timeout=120,
    )
    jobs_resp.raise_for_status()
    job_ids = jobs_resp.json().get("job_id", [])
    if not job_ids:
        raise RuntimeError("jobs/upload returned no job_id")
    job_id = job_ids[0]

    preview_resp = httpx.post(
        f"{API_BASE}/resumes/improve/preview",
        json={"resume_id": resume_id, "job_id": job_id},
        timeout=240,
    )
    preview_resp.raise_for_status()
    data = preview_resp.json()["data"]
    tailored = data["resume_preview"]
    improvements = data["improvements"]

    confirm_resp = httpx.post(
        f"{API_BASE}/resumes/improve/confirm",
        json={"resume_id": resume_id, "job_id": job_id,
              "improved_data": tailored, "improvements": improvements},
        timeout=240,
    )
    confirm_resp.raise_for_status()
    confirm = confirm_resp.json()
    return {
        "job_id": job_id,
        "tailored": tailored,
        "tailored_resume_id": confirm["data"].get("resume_id"),
        "keywords": keywords,
        "scores": score_tailoring(original, tailored, keywords),
    }
