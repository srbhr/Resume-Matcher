from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import job_view, require_job, require_resume


async def get_resume_job(resume_id: str) -> dict[str, Any]:
    """Get the job a tailored resume was tailored for."""
    await require_resume(resume_id)
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise ToolError("Resume is not a tailored resume.")
    return {
        "source_resume_id": improvement["original_resume_id"],
        **job_view(await require_job(improvement["job_id"])),
    }
