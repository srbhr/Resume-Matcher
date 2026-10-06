"""Deterministic ATS parse-check: extraction, layout and content checks, and a round trip."""

from typing import Any, Literal

from app.pdf import render_resume_pdf
from app.schemas.models import PageFitSettings
from app.services.ats_parse.checks import run_checks, score
from app.services.ats_parse.extract import ExtractedDocument, extract_document
from app.services.ats_parse.models import ParseCheckReport
from app.services.ats_parse.roundtrip import compute_roundtrip
from app.services.page_fit import print_margins, resume_print_url

PREVIEW_CHARACTERS = 2_000


def build_report(
    doc: ExtractedDocument,
    *,
    source: Literal["upload", "render"],
    resume_data: dict[str, Any] | None = None,
    locale: str | None = None,
    template: str | None = None,
) -> ParseCheckReport:
    checks = run_checks(doc, {"locale": locale, "template": template})
    status = {check.id: check.status for check in checks}
    if status["text_layer"] == "fail":
        extractability = "none"
    elif (
        status["garbled_glyphs"] == "fail"
        or status.get("text_coverage", "pass") != "pass"
        or doc.truncated
    ):
        extractability = "partial"
    else:
        extractability = "full"
    return ParseCheckReport(
        source=source,
        extractability=extractability,
        overall_score=score(checks, {"extraction", "layout"}),
        content_score=score(checks, {"content"}),
        page_count=doc.page_count,
        checks=checks,
        roundtrip=compute_roundtrip(resume_data, doc.text) if resume_data else None,
        template=template,
        extracted_text_preview=doc.text[:PREVIEW_CHARACTERS],
    )


async def parse_check_bytes(
    content: bytes,
    filename: str,
    *,
    source: Literal["upload", "render"] = "upload",
    resume_data: dict[str, Any] | None = None,
    locale: str | None = None,
    template: str | None = None,
) -> ParseCheckReport:
    doc = await extract_document(content, filename)
    return build_report(
        doc, source=source, resume_data=resume_data, locale=locale, template=template
    )


async def parse_check_render(
    resume_id: str, resume_data: dict[str, Any], fit: PageFitSettings
) -> ParseCheckReport:
    """Parse-check the exact PDF that GET /resumes/{id}/pdf returns for these settings."""
    pdf_bytes = await render_resume_pdf(
        resume_print_url(resume_id, fit), fit.pageSize, margins=print_margins(fit)
    )
    return await parse_check_bytes(
        pdf_bytes,
        "resume.pdf",
        source="render",
        resume_data=resume_data,
        locale=fit.lang,
        template=fit.template,
    )
