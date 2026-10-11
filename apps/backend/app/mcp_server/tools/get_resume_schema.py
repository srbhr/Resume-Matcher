from typing import Any

from app.mcp_server.tools._shared import AUTHORING_RULES
from app.schemas import ResumeData


async def get_resume_schema() -> dict[str, Any]:
    """JSON schema for resume_data plus the authoring rules the validators enforce."""
    return {"schema": ResumeData.model_json_schema(), "rules": AUTHORING_RULES}
