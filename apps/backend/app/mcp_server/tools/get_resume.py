import logging
from typing import Any

from app.mcp_server.tools._shared import require_resume, summary
from app.schemas import ResumeData, normalize_resume_data

logger = logging.getLogger(__name__)


async def get_resume(resume_id: str) -> dict[str, Any]:
    """Get a resume's structured data, cover letter and outreach message.

    If the stored data no longer matches the schema, resume_data is returned as stored
    with resume_data_error set; fix it with update_resume.
    """
    resume = await require_resume(resume_id)
    data = resume.get("processed_data")
    resume_data = None
    data_error = None
    if data:
        try:
            resume_data = ResumeData.model_validate(
                normalize_resume_data(dict(data))
            ).model_dump(mode="json")
        except (ValueError, TypeError, AttributeError) as e:
            logger.error(
                "Stored data of %s does not match the schema: %s", resume_id, e
            )
            resume_data = data
            data_error = (
                "Stored resume data does not match the current schema and is "
                "returned as stored. Rewrite it with update_resume."
            )
    result = {
        **summary(resume),
        "resume_data": resume_data,
        "cover_letter": resume.get("cover_letter"),
        "outreach_message": resume.get("outreach_message"),
    }
    if data_error:
        result["resume_data_error"] = data_error
    if not data or data_error:
        result["source_markdown"] = resume.get("original_markdown") or (
            resume.get("content") if resume.get("content_type") == "md" else None
        )
    return result
