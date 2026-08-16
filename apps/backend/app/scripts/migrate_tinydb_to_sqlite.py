"""Idempotent one-time importer: legacy TinyDB ``database.json`` → SQLite.

Safe to run repeatedly and on every startup:
- no legacy file present  → no-op;
- SQLite already has rows  → skip (assume already migrated);
- otherwise               → copy resumes/jobs/improvements 1:1 (preserving
  primary keys and timestamps), enforce the single-master invariant, then
  rename the legacy file to ``database.json.migrated`` as a rollback artifact.

Run standalone with ``uv run python -m app.scripts.migrate_tinydb_to_sqlite``.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.config import settings
from app.database import Database, db
from app.models import Improvement, Job, Resume, _utcnow_iso

logger = logging.getLogger(__name__)

_JOB_CORE_FIELDS = {"job_id", "content", "resume_id", "created_at"}


def _legacy_path() -> Path:
    return settings.db_path  # data/database.json


async def migrate(database: Database | None = None) -> dict[str, Any]:
    """Import the legacy TinyDB file into SQLite if needed.

    Returns a summary dict: ``{"status": ..., counts...}``.
    """
    database = database or db
    legacy = _legacy_path()

    if not legacy.exists():
        return {"status": "no_legacy_file"}

    stats = await database.get_stats()
    if (stats["total_resumes"] or stats["total_jobs"] or stats["total_improvements"]):
        logger.info("SQLite already populated; skipping TinyDB import.")
        return {"status": "already_populated"}

    # Gated import — tinydb is only needed for this one-time migration.
    from tinydb import TinyDB

    tdb = TinyDB(legacy)
    try:
        resumes = list(tdb.table("resumes").all())
        jobs = list(tdb.table("jobs").all())
        improvements = list(tdb.table("improvements").all())
    finally:
        tdb.close()

    # Enforce the single-master invariant: if multiple resumes claim master,
    # keep the earliest by created_at and demote the rest.
    masters = [r for r in resumes if r.get("is_master")]
    if len(masters) > 1:
        masters.sort(key=lambda r: r.get("created_at", ""))
        keep = masters[0].get("resume_id")
        for r in resumes:
            if r.get("is_master") and r.get("resume_id") != keep:
                r["is_master"] = False
        logger.warning(
            "Legacy DB had %d masters; kept %s, demoted the rest.", len(masters), keep
        )

    async with database._session() as session:
        for r in resumes:
            session.add(
                Resume(
                    resume_id=r["resume_id"],
                    content=r.get("content", ""),
                    content_type=r.get("content_type", "md"),
                    filename=r.get("filename"),
                    is_master=bool(r.get("is_master", False)),
                    parent_id=r.get("parent_id"),
                    processed_data=r.get("processed_data"),
                    processing_status=r.get("processing_status", "pending"),
                    cover_letter=r.get("cover_letter"),
                    outreach_message=r.get("outreach_message"),
                    interview_prep=r.get("interview_prep"),
                    title=r.get("title"),
                    original_markdown=r.get("original_markdown"),
                    created_at=r.get("created_at") or _utcnow_iso(),
                    updated_at=r.get("updated_at") or r.get("created_at") or _utcnow_iso(),
                )
            )
        for j in jobs:
            meta = {k: v for k, v in j.items() if k not in _JOB_CORE_FIELDS}
            session.add(
                Job(
                    job_id=j["job_id"],
                    content=j.get("content", ""),
                    resume_id=j.get("resume_id"),
                    created_at=j.get("created_at") or _utcnow_iso(),
                    metadata_json=meta,
                )
            )
        for imp in improvements:
            session.add(
                Improvement(
                    request_id=imp["request_id"],
                    original_resume_id=imp.get("original_resume_id", ""),
                    tailored_resume_id=imp.get("tailored_resume_id", ""),
                    job_id=imp.get("job_id", ""),
                    improvements=imp.get("improvements", []),
                    created_at=imp.get("created_at") or _utcnow_iso(),
                )
            )
        await session.commit()

    # Rename the legacy file so a restart doesn't re-trigger and we keep a
    # rollback artifact.
    migrated = legacy.with_suffix(legacy.suffix + ".migrated")
    try:
        legacy.rename(migrated)
    except OSError as e:
        logger.warning("Could not rename legacy DB file: %s", e)

    summary = {
        "status": "migrated",
        "resumes": len(resumes),
        "jobs": len(jobs),
        "improvements": len(improvements),
    }
    logger.info("TinyDB → SQLite import complete: %s", summary)
    return summary


def main() -> None:
    """Console entry point for a manual run."""
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(migrate())
    print(result)


if __name__ == "__main__":
    main()
