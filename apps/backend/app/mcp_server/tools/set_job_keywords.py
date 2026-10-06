from typing import Any

from app.database import db
from app.mcp_server.tools._shared import (
    JobKeywords,
    guard,
    job_view,
    keyword_updates,
    require_job,
)


@guard
async def set_job_keywords(job_id: str, keywords: JobKeywords) -> dict[str, Any]:
    """Attach the keywords you extracted to an existing job."""
    job = await require_job(job_id)
    updated = await db.update_job(job_id, keyword_updates(job["content"], keywords))
    return job_view(updated or job)
