from typing import Any

from app.mcp_server.tools._shared import (
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
    return tailoring_report(require_structured(source), resume_data.model_dump())
