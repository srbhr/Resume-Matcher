from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import guard, require_resume, summary


@guard
async def set_default_master(resume_id: str) -> dict[str, Any]:
    """Make a master resume the default tailoring source."""
    resume = await require_resume(resume_id)
    if not resume.get("is_master"):
        raise ToolError("Only master resumes can be set as default.")
    if not await db.set_default_master_resume(resume_id):
        raise ToolError(f"Resume not found: {resume_id}")
    return summary(await require_resume(resume_id))
