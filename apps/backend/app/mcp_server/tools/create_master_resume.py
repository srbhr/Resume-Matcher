import json
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.ai_limits import MAX_SOURCE_CHARACTERS
from app.database import MAX_MASTER_RESUMES, MasterResumeLimitError, db
from app.mcp_server.tools._shared import (
    MAX_TITLE_LENGTH,
    canonical,
    clean_title,
    guard,
    summary,
)
from app.schemas import ResumeData


@guard
async def create_master_resume(
    resume_data: ResumeData,
    title: str | None = None,
    source_markdown: str | None = None,
) -> dict[str, Any]:
    """Create a master resume from structured data you built (e.g. from extract_document_text)."""
    data = canonical(resume_data)
    name = data["personalInfo"]["name"].strip()
    if not name:
        raise ToolError("personalInfo.name is required.")
    if source_markdown and len(source_markdown) > MAX_SOURCE_CHARACTERS:
        raise ToolError(f"source_markdown exceeds {MAX_SOURCE_CHARACTERS} characters.")
    try:
        resume = await db.create_resume_atomic_master(
            content=json.dumps(data, ensure_ascii=False, indent=2),
            content_type="json",
            filename=f"{name}.json",
            processed_data=data,
            processing_status="ready",
            original_markdown=source_markdown or None,
            title=clean_title(title) or f"{name} Master Resume"[:MAX_TITLE_LENGTH],
        )
    except MasterResumeLimitError as e:
        raise ToolError(
            f"Master resume limit reached ({MAX_MASTER_RESUMES}). "
            "Delete one in the web app first."
        ) from e
    return summary(resume)
