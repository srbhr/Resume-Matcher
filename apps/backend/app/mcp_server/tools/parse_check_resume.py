import logging
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.config import settings
from app.mcp_server.tools._shared import require_resume, require_structured
from app.pdf import PDFRenderError
from app.schemas.models import PageFitSettings
from app.services import ats_parse

logger = logging.getLogger(__name__)


async def parse_check_resume(
    resume_id: str, print_settings: PageFitSettings | None = None
) -> dict[str, Any]:
    """ATS parse-check a saved resume as rendered with these settings, plus a round trip against its data. Writes nothing."""
    resume = await require_resume(resume_id)
    data = require_structured(resume)
    try:
        report = await ats_parse.parse_check_render(
            resume_id, data, print_settings or PageFitSettings()
        )
    except PDFRenderError as e:
        logger.error("Parse check render failed for %s: %s", resume_id, e)
        raise ToolError(
            "PDF rendering failed. Make sure the Resume Matcher frontend is running "
            f"at {settings.frontend_base_url} and can reach the backend."
        ) from e
    return report.model_dump()
