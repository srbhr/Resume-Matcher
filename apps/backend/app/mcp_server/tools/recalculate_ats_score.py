import logging
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.database import DatabaseBusyError, db
from app.mcp_server.tools._shared import (
    guard,
    require_resume,
    require_valid_structured,
)
from app.routers.resumes import (
    _cached_job_keywords,
    _grounding_master_data,
    _score_tailored_data,
)

logger = logging.getLogger(__name__)


@guard
async def recalculate_ats_score(resume_id: str) -> dict[str, Any]:
    """Recompute and store a tailored resume's ATS score from its saved data and job keywords.

    Deterministic, same as the builder's Recalculate button. Use it after update_resume so the
    stored score the builder shows is current.
    """
    resume = await require_resume(resume_id)
    if not resume.get("parent_id"):
        raise ToolError("ATS score is only available for tailored resumes.")
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    job = await db.get_job(improvement["job_id"]) if improvement else None
    if not job:
        raise ToolError("No job description is linked to this resume.")
    job_keywords = _cached_job_keywords(job)
    if job_keywords is None:
        raise ToolError(
            "The linked job has no current keywords. Call set_job_keywords for it first."
        )
    data = require_valid_structured(resume)
    try:
        record = _score_tailored_data(
            data, job_keywords, await _grounding_master_data(resume) or data
        )
        await db.set_ats_score(resume_id, record)
    except DatabaseBusyError:
        raise  # guard maps this to a retryable tool error
    except Exception as e:
        logger.error("ATS score calculation failed for %s: %s", resume_id, e)
        raise ToolError("Failed to calculate the ATS score.") from e
    return {"resume_id": resume_id, "job_id": job["job_id"], "ats_score": record}
