from typing import Any

from app.mcp_server.tools._shared import job_view, require_job


async def get_job(job_id: str) -> dict[str, Any]:
    """Get a stored job description and its cached keywords."""
    return job_view(await require_job(job_id))
