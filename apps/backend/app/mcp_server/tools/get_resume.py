from typing import Any

from app.mcp_server.tools._shared import require_resume, summary
from app.schemas import ResumeData, normalize_resume_data


async def get_resume(resume_id: str) -> dict[str, Any]:
    """Get a resume's structured data, cover letter and outreach message."""
    resume = await require_resume(resume_id)
    data = resume.get("processed_data")
    result = {
        **summary(resume),
        "resume_data": (
            ResumeData.model_validate(normalize_resume_data(data)).model_dump(
                mode="json"
            )
            if data
            else None
        ),
        "cover_letter": resume.get("cover_letter"),
        "outreach_message": resume.get("outreach_message"),
    }
    if not data:
        result["source_markdown"] = resume.get("original_markdown") or (
            resume.get("content") if resume.get("content_type") == "md" else None
        )
    return result
