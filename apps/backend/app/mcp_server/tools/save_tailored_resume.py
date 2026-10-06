import json
import logging
from typing import Any
from uuid import uuid4

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import (
    clean_title,
    guard,
    require_job,
    require_resume,
    require_structured,
    summary,
    tailoring_report,
)
from app.schemas import ResumeData
from app.services.improver import generate_improvements

logger = logging.getLogger(__name__)


@guard
async def save_tailored_resume(
    source_resume_id: str,
    job_id: str,
    resume_data: ResumeData,
    title: str | None = None,
    track_application: bool = True,
) -> dict[str, Any]:
    """Save a tailored resume you wrote. Rejected if it breaks preservation rules."""
    source = await require_resume(source_resume_id)
    job = await require_job(job_id)
    candidate = resume_data.model_dump()
    report = tailoring_report(require_structured(source), candidate)
    if not report["valid"]:
        raise ToolError(
            "Tailored resume rejected: "
            + "; ".join(report["violations"])
            + ". Run validate_tailored_resume for details."
        )
    title = clean_title(title) or clean_title(job.get("role"))
    tailored = await db.create_tailored_resume(
        request_id=str(uuid4()),
        original_resume_id=source_resume_id,
        job_id=job_id,
        resume_fields={
            "content": json.dumps(candidate, indent=2),
            "content_type": "json",
            "filename": f"tailored_{source.get('filename') or 'resume'}",
            "is_master": False,
            "parent_id": source_resume_id,
            "processed_data": candidate,
            "processing_status": "ready",
            "title": title,
        },
        improvements=generate_improvements(job.get("job_keywords") or {}),
    )
    result = {**summary(tailored), "grounding_warnings": report["grounding_warnings"]}
    if track_application:
        try:
            application = await db.create_application(
                job_id=job_id,
                resume_id=tailored["resume_id"],
                master_resume_id=source_resume_id,
                status="applied",
                company=job.get("company"),
                role=title or job.get("role"),
            )
            result["application_id"] = application["application_id"]
        except Exception as e:  # noqa: BLE001 - tracker is non-critical
            logger.warning("Failed to create tracker application: %s", e)
    return result
