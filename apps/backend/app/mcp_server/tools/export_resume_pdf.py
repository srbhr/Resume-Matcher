import logging
from pathlib import Path
from typing import Any

from mcp.server.mcpserver.exceptions import ToolError

from app.config import settings
from app.mcp_server.tools._shared import require_resume, require_structured
from app.pdf import PDFRenderError, render_resume_pdf
from app.schemas.models import PageFitSettings
from app.services.page_fit import count_pdf_pages, print_margins, resume_print_url

logger = logging.getLogger(__name__)


async def export_resume_pdf(
    resume_id: str,
    output_path: str | None = None,
    print_settings: PageFitSettings | None = None,
) -> dict[str, Any]:
    """Render a saved resume to PDF and report its page count. Needs the web frontend running."""
    resume = await require_resume(resume_id)
    require_structured(resume)
    fit = print_settings or PageFitSettings()
    path = (
        Path(output_path).expanduser()
        if output_path
        else settings.data_dir / "exports" / f"{resume_id}-{fit.template}.pdf"
    )
    if path.suffix.lower() != ".pdf":
        raise ToolError("output_path must end with .pdf")
    try:
        pdf_bytes = await render_resume_pdf(
            resume_print_url(resume_id, fit), fit.pageSize, margins=print_margins(fit)
        )
    except PDFRenderError as e:
        logger.error("PDF render failed for %s: %s", resume_id, e)
        raise ToolError(
            "PDF rendering failed. Make sure the Resume Matcher frontend is running "
            f"at {settings.frontend_base_url} and can reach the backend."
        ) from e
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pdf_bytes)
    return {
        "path": str(path.resolve()),
        "page_count": count_pdf_pages(pdf_bytes),
        "bytes": len(pdf_bytes),
        "template": fit.template,
        "page_size": fit.pageSize,
    }
