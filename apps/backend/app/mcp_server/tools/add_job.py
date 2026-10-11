from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.ai_limits import MAX_JOB_CHARACTERS
from app.database import db
from app.mcp_server.tools._shared import JobKeywords, guard, job_view, keyword_updates


@guard
async def add_job(
    job_description: str,
    company: str | None = None,
    role: str | None = None,
    keywords: JobKeywords | None = None,
) -> dict[str, Any]:
    """Store a job description. Pass the keywords you extracted to enable scoring."""
    content = job_description.strip()
    if not content:
        raise ToolError("job_description must not be empty.")
    if len(content) > MAX_JOB_CHARACTERS:
        raise ToolError(f"job_description exceeds {MAX_JOB_CHARACTERS} characters.")
    job = await db.create_job(content)
    updates = keyword_updates(content, keywords) if keywords else {}
    for key, value in (("company", company), ("role", role)):
        if value and value.strip():
            updates[key] = value.strip()
    if updates:
        job = await db.update_job(job["job_id"], updates) or job
    return job_view(job)
