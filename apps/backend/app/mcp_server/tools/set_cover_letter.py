from typing import Any

from app.database import db
from app.mcp_server.tools._shared import guard, require_resume, summary


@guard
async def set_cover_letter(resume_id: str, content: str) -> dict[str, Any]:
    """Store a cover letter you wrote for a resume."""
    await require_resume(resume_id)
    return summary(await db.update_resume(resume_id, {"cover_letter": content}))
