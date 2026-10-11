from typing import Any

from app.mcp_server.tools._shared import (
    ensure_within_size_limit,
    require_resume,
    require_structured,
    tailoring_report,
)
from app.schemas import ResumeData


async def validate_tailored_resume(
    source_resume_id: str, resume_data: ResumeData
) -> dict[str, Any]:
    """Dry-run the preservation checks save_tailored_resume enforces. Writes nothing."""
    source = await require_resume(source_resume_id)
    candidate = resume_data.model_dump()
    ensure_within_size_limit(candidate)
    return tailoring_report(require_structured(source), candidate)
