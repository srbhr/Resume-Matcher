from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import db
from app.mcp_server.tools._shared import (
    JobKeywords,
    keyword_score,
    require_job,
    require_resume,
    require_structured,
)
from app.routers.resumes import _get_original_resume_data, _grounding_master_data
from app.schemas import ResumeData


async def score_resume(
    resume_id: str | None = None,
    resume_data: ResumeData | None = None,
    job_id: str | None = None,
    keywords: JobKeywords | None = None,
) -> dict[str, Any]:
    """Keyword match and ATS score for a saved resume or draft against job keywords."""
    if (resume_id is None) == (resume_data is None):
        raise ToolError("Pass exactly one of resume_id or resume_data.")
    if keywords is not None:
        job_keywords = keywords.model_dump()
    elif job_id is not None:
        job_keywords = (await require_job(job_id)).get("job_keywords")
        if not job_keywords:
            raise ToolError("Job has no keywords. Call set_job_keywords first.")
    else:
        raise ToolError("Pass job_id or keywords.")

    if resume_id is not None:
        resume = await require_resume(resume_id)
        data = require_structured(resume)
        master = await _grounding_master_data(resume) or data
    else:
        data = resume_data.model_dump(mode="json")
        default = await db.get_master_resume()
        master = (_get_original_resume_data(default) if default else None) or data

    return keyword_score(data, job_keywords, master)
