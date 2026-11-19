import json
from typing import Any

from app.database import db
from app.mcp_server.tools._shared import canonical, guard, require_resume, summary
from app.schemas import ResumeData
from app.services.resume_preservation import grounding_review_warnings
from app.services.tailoring import get_original_resume_data


@guard
async def update_resume(resume_id: str, resume_data: ResumeData) -> dict[str, Any]:
    """Replace a resume's structured data. Tailored resumes get grounding warnings."""
    existing = await require_resume(resume_id)
    data = canonical(resume_data)
    updated = await db.update_resume(
        resume_id,
        {
            "content": json.dumps(data, indent=2),
            "content_type": "json",
            "processed_data": data,
            "processing_status": "ready",
        },
    )
    result = summary(updated)
    if not existing.get("is_master") and existing.get("parent_id"):
        parent = await db.get_resume(existing["parent_id"])
        source = get_original_resume_data(parent) if parent else None
        if source:
            result["grounding_warnings"] = grounding_review_warnings(source, data)
    return result
