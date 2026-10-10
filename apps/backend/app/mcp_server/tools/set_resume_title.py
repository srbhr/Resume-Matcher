from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import clean_title, guard, require_resume, summary


@guard
async def set_resume_title(resume_id: str, title: str) -> dict[str, Any]:
    """Rename a resume (max 80 characters)."""
    await require_resume(resume_id)
    cleaned = clean_title(title)
    if not cleaned:
        raise ToolError("Title must not be empty.")
    return summary(await db.update_resume(resume_id, {"title": cleaned}))
