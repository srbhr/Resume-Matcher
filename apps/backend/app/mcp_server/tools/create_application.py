from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.ai_limits import MAX_JOB_CHARACTERS
from app.database import db
from app.mcp_server.tools._shared import guard, require_job, require_resume
from app.schemas.applications import ApplicationStatus


@guard
async def create_application(
    resume_id: str,
    company: str,
    role: str,
    job_id: str | None = None,
    job_description: str | None = None,
    status: ApplicationStatus = ApplicationStatus.applied,
    notes: str | None = None,
) -> dict[str, Any]:
    """Add a tracker card for an existing job_id or a pasted job_description."""
    await require_resume(resume_id)
    if (job_id is None) == (job_description is None):
        raise ToolError("Pass exactly one of job_id or job_description.")
    if job_id is not None:
        await require_job(job_id)
        return await db.create_application(
            job_id=job_id,
            resume_id=resume_id,
            status=status.value,
            company=company,
            role=role,
            notes=notes,
        )
    content = (job_description or "").strip()
    if not content or len(content) > MAX_JOB_CHARACTERS:
        raise ToolError(f"job_description must be 1-{MAX_JOB_CHARACTERS} characters.")
    return await db.create_manual_application(
        content=content,
        resume_id=resume_id,
        status=status.value,
        company=company,
        role=role,
        notes=notes,
    )
