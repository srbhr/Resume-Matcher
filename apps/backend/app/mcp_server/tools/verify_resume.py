import logging
from typing import Annotated, Any

from pydantic import Field

from app.database import db
from app.mcp_server.tools._shared import (
    keyword_score,
    render_failed_message,
    render_pdf,
    require_job,
    require_resume,
    require_structured,
)
from app.pdf import PDFRenderError
from app.routers.resumes import _grounding_master_data
from app.schemas.models import PageFitSettings
from app.services import ats_parse
from app.services.ats_parse.models import ParseCheckReport
from app.services.page_fit import count_pdf_pages

logger = logging.getLogger(__name__)

MIN_ORDER_FIDELITY = 0.9
MaxPages = Annotated[int | None, Field(ge=1, le=10)]


def _issues(
    report: ParseCheckReport | None,
    page_count: int | None,
    max_pages: int | None,
    score: dict[str, Any] | None,
) -> list[str]:
    issues: list[str] = []
    if report is None:
        issues.append("render_failed")
    else:
        if max_pages is not None and page_count is not None and page_count > max_pages:
            issues.append("over_page_limit")
        status = {check.id: check.status for check in report.checks}
        if status.get("multi_column") == "fail":
            issues.append("multi_column")
        if status.get("garbled_glyphs") != "pass":
            issues.append("garbled_glyphs")
        roundtrip = report.roundtrip
        if roundtrip is not None:
            if roundtrip.order_fidelity < MIN_ORDER_FIDELITY:
                issues.append("low_order_fidelity")
            if any(f.status in ("missing", "garbled") for f in roundtrip.fields):
                issues.append("fields_missing")
    if score and score.get("injectable_keywords"):
        issues.append("injectable_keywords")
    return issues


async def verify(
    resume: dict[str, Any],
    job_id: str | None,
    fit: PageFitSettings,
    max_pages: int | None,
) -> dict[str, Any]:
    resume_id = resume["resume_id"]
    data = require_structured(resume)
    if job_id is None:
        improvement = await db.get_improvement_by_tailored_resume(resume_id)
        job_id = improvement["job_id"] if improvement else None

    score = None
    if job_id is not None:
        job_keywords = (await require_job(job_id)).get("job_keywords")
        if job_keywords:
            master = await _grounding_master_data(resume) or data
            score = keyword_score(data, job_keywords, master)

    result: dict[str, Any] = {
        "resume_id": resume_id,
        "job_id": job_id,
        "template": fit.template,
        "page_count": None,
        "max_pages": max_pages,
        "score": score,
        "parse_check": None,
    }
    report = None
    try:
        pdf_bytes = await render_pdf(resume_id, fit)
    except PDFRenderError as e:
        logger.error("Verify render failed for %s: %s", resume_id, e)
        result["render_error"] = render_failed_message()
    else:
        result["page_count"] = count_pdf_pages(pdf_bytes)
        report = await ats_parse.parse_check_pdf(pdf_bytes, data, fit)
        result["parse_check"] = report.model_dump()
    result["issues"] = _issues(report, result["page_count"], max_pages, score)
    return result


async def verify_resume(
    resume_id: str,
    job_id: str | None = None,
    print_settings: PageFitSettings | None = None,
    max_pages: MaxPages = None,
) -> dict[str, Any]:
    """Render a saved resume once and report page count, ATS parse-check, keyword score and issues. Writes nothing.

    job_id defaults to the job a tailored resume was saved for. Issue codes: over_page_limit,
    multi_column, garbled_glyphs, low_order_fidelity, fields_missing, injectable_keywords, render_failed.
    """
    resume = await require_resume(resume_id)
    return await verify(resume, job_id, print_settings or PageFitSettings(), max_pages)
