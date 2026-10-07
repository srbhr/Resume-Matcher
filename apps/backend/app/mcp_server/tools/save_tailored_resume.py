from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.mcp_server.tools._shared import (
    guard,
    require_job,
    require_resume,
    require_structured,
    store_tailored_resume,
    tailoring_report,
)
from app.schemas import ResumeData


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
    saved = await store_tailored_resume(
        source, job, candidate, title, track_application
    )
    return {**saved, "grounding_warnings": report["grounding_warnings"]}
