from typing import Any

from app.database import db
from app.mcp_server.tools._shared import summary


async def list_resumes(include_tailored: bool = True) -> dict[str, Any]:
    """List resumes, newest first. Masters are the source of truth for tailoring."""
    resumes = await db.list_resumes()
    if not include_tailored:
        resumes = [r for r in resumes if r.get("is_master")]
    resumes.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return {"resumes": [summary(r) for r in resumes]}
