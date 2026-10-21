import logging
from typing import Annotated, Any

from pydantic import Field

from app.config_cache import get_content_language
from app.database import db
from app.mcp_server.tools._shared import (
    keyword_score,
    render_failed_message,
    render_pdf,
    require_job,
    require_resume,
    require_valid_structured,
)
from app.pdf import PDFRenderError
from app.routers.resumes import _grounding_master_data, _scorable_job_keywords
from app.schemas.models import PageFitSettings
from app.services import ats_parse
from app.services.ats_parse.models import ParseCheckReport
from app.services.page_fit import count_pdf_pages, page_limit
from app.services.writing_quality import writing_report

logger = logging.getLogger(__name__)

MIN_ORDER_FIDELITY = 0.9
MaxPages = Annotated[int | None, Field(ge=1, le=10)]


def _issues(
    report: ParseCheckReport | None,
    page_count: int | None,
    max_pages: int | None,
    score: dict[str, Any] | None,
    no_job_keywords: bool,
    weak_writing: bool = False,
) -> list[str]:
    issues: list[str] = []
    if report is None:
        issues.append("render_failed")
    else:
        if max_pages is not None and page_count is not None and page_count > max_pages:
            issues.append("over_page_limit")
        status = {check.id: check.status for check in report.checks}
        if status.get("text_layer") == "fail":
            issues.append("text_layer")
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
            if roundtrip.truncated:
                issues.append("roundtrip_truncated")
    if score and score.get("injectable_keywords"):
        issues.append("injectable_keywords")
    if no_job_keywords:
        issues.append("no_job_keywords")
    if weak_writing:
        issues.append("weak_writing")
    return issues


async def verify(
    resume: dict[str, Any],
    job_id: str | None,
    fit: PageFitSettings,
    max_pages: int | None,
) -> dict[str, Any]:
    resume_id = resume["resume_id"]
    max_pages = page_limit(fit, max_pages)
    data = require_valid_structured(resume)
    if job_id is None:
        improvement = await db.get_improvement_by_tailored_resume(resume_id)
        job_id = improvement["job_id"] if improvement else None

    score = None
    job_keywords = None
    if job_id is not None:
        # Stale (cached for other job text) or empty keywords count as missing, as in the builder.
        job_keywords = _scorable_job_keywords(await require_job(job_id))
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
        "writing": writing_report(data, get_content_language()).model_dump(
            include={"score", "findings"}
        ),
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
    result["issues"] = _issues(
        report,
        result["page_count"],
        max_pages,
        score,
        no_job_keywords=job_id is not None and not job_keywords,
        weak_writing=any(
            f["severity"] == "hard" for f in result["writing"]["findings"]
        ),
    )
    return result


async def verify_resume(
    resume_id: str,
    job_id: str | None = None,
    print_settings: PageFitSettings | None = None,
    max_pages: MaxPages = None,
) -> dict[str, Any]:
    """Render a saved resume once and report page count, ATS parse-check, keyword score and issues. Writes nothing.

    job_id defaults to the job a tailored resume was saved for. With print_settings.cv_mode
    true (an academic CV) there is no page cap: max_pages is ignored and over_page_limit is
    never raised; page_count is still reported. Issue codes: over_page_limit,
    text_layer (the PDF has too little extractable text), multi_column, garbled_glyphs,
    low_order_fidelity, fields_missing, roundtrip_truncated, injectable_keywords,
    no_job_keywords (the job has no keywords, so there is no score: call set_job_keywords),
    weak_writing (a line has an em dash or a weak opener: see writing.findings, each with
    the path to fix), render_failed. writing.score (0 to 100) comes from the same code rules
    as the app's Writing score.
    """
    resume = await require_resume(resume_id)
    return await verify(resume, job_id, print_settings or PageFitSettings(), max_pages)
