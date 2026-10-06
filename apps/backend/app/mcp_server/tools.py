"""Deterministic MCP tools: the calling agent writes content, these store, check and render it."""

import functools
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, ParamSpec, TypeVar, get_args
from uuid import uuid4

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field

from app import __version__
from app.ai_limits import MAX_JOB_CHARACTERS, MAX_SOURCE_CHARACTERS
from app.config import settings
from app.database import (
    MAX_MASTER_RESUMES,
    DatabaseBusyError,
    MasterResumeLimitError,
    ResumeNotFoundError,
    db,
)
from app.pdf import PDFRenderError, render_resume_pdf
from app.routers.resumes import (
    _get_original_resume_data,
    _grounding_master_data,
    _hash_job_content,
    _validate_confirm_payload,
)
from app.schemas import ResumeData, normalize_resume_data
from app.schemas.applications import ApplicationStatus
from app.schemas.models import PageFitSettings
from app.services.ats import compute_ats_score
from app.services.improver import generate_improvements
from app.services.page_fit import count_pdf_pages, print_margins, resume_print_url
from app.services.parser import parse_document
from app.services.refiner import analyze_keyword_gaps, calculate_keyword_match
from app.services.resume_preservation import (
    finalize_ai_resume,
    grounding_review_warnings,
)

logger = logging.getLogger(__name__)

P = ParamSpec("P")
R = TypeVar("R")

TEMPLATES: list[str] = list(
    get_args(PageFitSettings.model_fields["template"].annotation)
)
MAX_TITLE_LENGTH = 80
MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
DOCUMENT_SUFFIXES = {".pdf", ".docx", ".doc"}
TEXT_SUFFIXES = {".md", ".markdown", ".txt"}
MAX_DIFF_PATHS = 25

AUTHORING_RULES = [
    "Keep personalInfo, employers, institutions, dates and entry counts identical to the source resume.",
    "Never invent metrics, skills, tools or certifications that the source resume does not support.",
    "Rewrite, reorder and trim bullet text freely; keep descriptionStyles the same length as description.",
    "Inline HTML in descriptions is limited to <strong>, <em>, <u> and <a>.",
    "Keep existing ids and sectionMeta from the source; omit sectionMeta on new resumes to get defaults.",
]


class JobKeywords(BaseModel):
    """Requirements the agent extracted from a job description."""

    model_config = ConfigDict(extra="allow")

    company: str = ""
    role: str = ""
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    experience_requirements: list[str] = Field(default_factory=list)
    education_requirements: list[str] = Field(default_factory=list)
    key_responsibilities: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    experience_years: int | None = None
    seniority_level: str | None = None


def _guard(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
    """Map retryable database contention to a tool error."""

    @functools.wraps(fn)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return await fn(*args, **kwargs)
        except DatabaseBusyError as e:
            raise ToolError("Database is busy. Retry the same call.") from e
        except ResumeNotFoundError as e:
            raise ToolError("Resume not found.") from e

    return wrapper


async def _require_resume(resume_id: str) -> dict[str, Any]:
    resume = await db.get_resume(resume_id)
    if not resume:
        raise ToolError(f"Resume not found: {resume_id}")
    return resume


async def _require_job(job_id: str) -> dict[str, Any]:
    job = await db.get_job(job_id)
    if not job:
        raise ToolError(f"Job not found: {job_id}")
    return job


def _require_structured(resume: dict[str, Any]) -> dict[str, Any]:
    data = _get_original_resume_data(resume)
    if not data:
        raise ToolError(
            "Resume has no structured data yet. Read its source_markdown with "
            "get_resume, then save structured data with update_resume."
        )
    return data


def _canonical(resume_data: ResumeData) -> dict[str, Any]:
    data = ResumeData.model_validate(
        normalize_resume_data(resume_data.model_dump(mode="json"))
    ).model_dump(mode="json")
    if len(json.dumps(data, ensure_ascii=False)) > MAX_SOURCE_CHARACTERS:
        raise ToolError(f"Resume exceeds {MAX_SOURCE_CHARACTERS} characters.")
    return data


def _clean_title(title: str | None) -> str | None:
    cleaned = (title or "").strip()[:MAX_TITLE_LENGTH]
    return cleaned or None


def _summary(resume: dict[str, Any]) -> dict[str, Any]:
    return {
        "resume_id": resume["resume_id"],
        "title": resume.get("title"),
        "is_master": resume.get("is_master", False),
        "is_default_master": resume.get("is_default_master", False),
        "parent_id": resume.get("parent_id"),
        "processing_status": resume.get("processing_status"),
        "updated_at": resume.get("updated_at"),
    }


def _job_view(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["job_id"],
        "content": job.get("content"),
        "company": job.get("company"),
        "role": job.get("role"),
        "job_keywords": job.get("job_keywords"),
        "created_at": job.get("created_at"),
    }


def _diff_paths(a: Any, b: Any, path: str = "") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        out: list[str] = []
        for key in sorted(set(a) | set(b), key=str):
            out.extend(
                _diff_paths(
                    a.get(key), b.get(key), f"{path}.{key}" if path else str(key)
                )
            )
        return out
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out.extend(_diff_paths(x, y, f"{path}[{i}]"))
        return out
    return [] if a == b else [path or "<root>"]


def _tailoring_report(
    original: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    """Run the same preservation checks as improve/confirm."""
    violations: list[str] = []
    report: dict[str, Any] = {}
    repaired = ResumeData.model_validate(
        finalize_ai_resume(original, candidate, allow_appended_rows=True)
    ).model_dump()
    if repaired != candidate:
        paths = _diff_paths(candidate, repaired)
        violations.append(
            "preservation repairs required at: " + ", ".join(paths[:MAX_DIFF_PATHS])
        )
        report["repaired_resume_data"] = repaired
    try:
        _validate_confirm_payload(original, candidate, allow_appended_rows=True)
    except ValueError as e:
        violations.append(str(e))
    changed = _diff_paths(original, candidate)
    return {
        "valid": not violations,
        "violations": violations,
        "grounding_warnings": grounding_review_warnings(original, candidate),
        "changed_fields": changed[:MAX_DIFF_PATHS],
        "changed_field_count": len(changed),
        **report,
    }


# -- Discovery / read ------------------------------------------------------


async def get_status() -> dict[str, Any]:
    """Data location, record counts, templates and limits. Call this first."""
    stats = await db.get_stats()
    masters = await db.list_master_resumes()
    return {
        "version": __version__,
        "data_dir": str(settings.data_dir),
        "frontend_base_url": settings.frontend_base_url,
        "templates": TEMPLATES,
        "master_resumes": len(masters),
        "max_master_resumes": MAX_MASTER_RESUMES,
        **stats,
    }


async def get_resume_schema() -> dict[str, Any]:
    """JSON schema for resume_data plus the authoring rules the validators enforce."""
    return {"schema": ResumeData.model_json_schema(), "rules": AUTHORING_RULES}


async def list_resumes(include_tailored: bool = True) -> dict[str, Any]:
    """List resumes, newest first. Masters are the source of truth for tailoring."""
    resumes = await db.list_resumes()
    if not include_tailored:
        resumes = [r for r in resumes if r.get("is_master")]
    resumes.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return {"resumes": [_summary(r) for r in resumes]}


async def get_resume(resume_id: str) -> dict[str, Any]:
    """Get a resume's structured data, cover letter and outreach message."""
    resume = await _require_resume(resume_id)
    data = resume.get("processed_data")
    result = {
        **_summary(resume),
        "resume_data": (
            ResumeData.model_validate(normalize_resume_data(data)).model_dump(
                mode="json"
            )
            if data
            else None
        ),
        "cover_letter": resume.get("cover_letter"),
        "outreach_message": resume.get("outreach_message"),
    }
    if not data:
        result["source_markdown"] = resume.get("original_markdown") or (
            resume.get("content") if resume.get("content_type") == "md" else None
        )
    return result


async def get_job(job_id: str) -> dict[str, Any]:
    """Get a stored job description and its cached keywords."""
    return _job_view(await _require_job(job_id))


async def get_resume_job(resume_id: str) -> dict[str, Any]:
    """Get the job a tailored resume was tailored for."""
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise ToolError("Resume is not a tailored resume.")
    return {
        "source_resume_id": improvement["original_resume_id"],
        **_job_view(await _require_job(improvement["job_id"])),
    }


# -- Ingest / edit ----------------------------------------------------------


async def extract_document_text(file_path: str) -> dict[str, Any]:
    """Extract markdown from a local PDF/DOCX/DOC/MD/TXT file (absolute path)."""
    path = Path(file_path).expanduser()
    suffix = path.suffix.lower()
    if suffix not in DOCUMENT_SUFFIXES | TEXT_SUFFIXES:
        raise ToolError("Unsupported file type. Use PDF, DOCX, DOC, MD or TXT.")
    if not path.is_file():
        raise ToolError(f"File not found: {path}")
    if path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ToolError("File too large. Maximum size is 4MB.")
    try:
        if suffix in TEXT_SUFFIXES:
            text = path.read_text(encoding="utf-8", errors="replace")
        else:
            text = await parse_document(path.read_bytes(), path.name)
    except Exception as e:
        logger.error("Document extraction failed for %s: %s", path, e)
        raise ToolError("Could not extract text from this document.") from e
    if len(text) > MAX_SOURCE_CHARACTERS:
        raise ToolError(f"Extracted text exceeds {MAX_SOURCE_CHARACTERS} characters.")
    return {"markdown": text, "characters": len(text)}


@_guard
async def create_master_resume(
    resume_data: ResumeData,
    title: str | None = None,
    source_markdown: str | None = None,
) -> dict[str, Any]:
    """Create a master resume from structured data you built (e.g. from extract_document_text)."""
    data = _canonical(resume_data)
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
            title=_clean_title(title) or f"{name} Master Resume"[:MAX_TITLE_LENGTH],
        )
    except MasterResumeLimitError as e:
        raise ToolError(
            f"Master resume limit reached ({MAX_MASTER_RESUMES}). "
            "Delete one in the web app first."
        ) from e
    return _summary(resume)


@_guard
async def update_resume(resume_id: str, resume_data: ResumeData) -> dict[str, Any]:
    """Replace a resume's structured data. Tailored resumes get grounding warnings."""
    existing = await _require_resume(resume_id)
    data = _canonical(resume_data)
    updated = await db.update_resume(
        resume_id,
        {
            "content": json.dumps(data, indent=2),
            "content_type": "json",
            "processed_data": data,
            "processing_status": "ready",
        },
    )
    result = _summary(updated)
    if not existing.get("is_master") and existing.get("parent_id"):
        parent = await db.get_resume(existing["parent_id"])
        source = _get_original_resume_data(parent) if parent else None
        if source:
            result["grounding_warnings"] = grounding_review_warnings(source, data)
    return result


@_guard
async def set_resume_title(resume_id: str, title: str) -> dict[str, Any]:
    """Rename a resume (max 80 characters)."""
    await _require_resume(resume_id)
    cleaned = _clean_title(title)
    if not cleaned:
        raise ToolError("Title must not be empty.")
    return _summary(await db.update_resume(resume_id, {"title": cleaned}))


@_guard
async def set_cover_letter(resume_id: str, content: str) -> dict[str, Any]:
    """Store a cover letter you wrote for a resume."""
    await _require_resume(resume_id)
    return _summary(await db.update_resume(resume_id, {"cover_letter": content}))


@_guard
async def set_outreach_message(resume_id: str, content: str) -> dict[str, Any]:
    """Store an outreach message you wrote for a resume."""
    await _require_resume(resume_id)
    return _summary(await db.update_resume(resume_id, {"outreach_message": content}))


@_guard
async def set_default_master(resume_id: str) -> dict[str, Any]:
    """Make a master resume the default tailoring source."""
    resume = await _require_resume(resume_id)
    if not resume.get("is_master"):
        raise ToolError("Only master resumes can be set as default.")
    if not await db.set_default_master_resume(resume_id):
        raise ToolError(f"Resume not found: {resume_id}")
    return _summary(await _require_resume(resume_id))


# -- Jobs + tailoring --------------------------------------------------------


def _keyword_updates(content: str, keywords: JobKeywords) -> dict[str, Any]:
    updates: dict[str, Any] = {
        "job_keywords": keywords.model_dump(),
        "job_keywords_hash": _hash_job_content(content),
    }
    if keywords.company.strip():
        updates["company"] = keywords.company.strip()
    if keywords.role.strip():
        updates["role"] = keywords.role.strip()
    return updates


@_guard
async def add_job(
    job_description: str,
    company: str | None = None,
    role: str | None = None,
    keywords: JobKeywords | None = None,
) -> dict[str, Any]:
    """Store a job description. Pass the keywords you extracted to enable scoring."""
    content = job_description.strip()
    if not content:
        raise ToolError("job_description must not be empty.")
    if len(content) > MAX_JOB_CHARACTERS:
        raise ToolError(f"job_description exceeds {MAX_JOB_CHARACTERS} characters.")
    job = await db.create_job(content)
    updates = _keyword_updates(content, keywords) if keywords else {}
    for key, value in (("company", company), ("role", role)):
        if value and value.strip():
            updates[key] = value.strip()
    if updates:
        job = await db.update_job(job["job_id"], updates) or job
    return _job_view(job)


@_guard
async def set_job_keywords(job_id: str, keywords: JobKeywords) -> dict[str, Any]:
    """Attach the keywords you extracted to an existing job."""
    job = await _require_job(job_id)
    updated = await db.update_job(job_id, _keyword_updates(job["content"], keywords))
    return _job_view(updated or job)


async def validate_tailored_resume(
    source_resume_id: str, resume_data: ResumeData
) -> dict[str, Any]:
    """Dry-run the preservation checks save_tailored_resume enforces. Writes nothing."""
    source = await _require_resume(source_resume_id)
    return _tailoring_report(_require_structured(source), resume_data.model_dump())


@_guard
async def save_tailored_resume(
    source_resume_id: str,
    job_id: str,
    resume_data: ResumeData,
    title: str | None = None,
    track_application: bool = True,
) -> dict[str, Any]:
    """Save a tailored resume you wrote. Rejected if it breaks preservation rules."""
    source = await _require_resume(source_resume_id)
    job = await _require_job(job_id)
    candidate = resume_data.model_dump()
    report = _tailoring_report(_require_structured(source), candidate)
    if not report["valid"]:
        raise ToolError(
            "Tailored resume rejected: "
            + "; ".join(report["violations"])
            + ". Run validate_tailored_resume for details."
        )
    title = _clean_title(title) or _clean_title(job.get("role"))
    tailored = await db.create_tailored_resume(
        request_id=str(uuid4()),
        original_resume_id=source_resume_id,
        job_id=job_id,
        resume_fields={
            "content": json.dumps(candidate, indent=2),
            "content_type": "json",
            "filename": f"tailored_{source.get('filename') or 'resume'}",
            "is_master": False,
            "parent_id": source_resume_id,
            "processed_data": candidate,
            "processing_status": "ready",
            "title": title,
        },
        improvements=generate_improvements(job.get("job_keywords") or {}),
    )
    result = {**_summary(tailored), "grounding_warnings": report["grounding_warnings"]}
    if track_application:
        try:
            application = await db.create_application(
                job_id=job_id,
                resume_id=tailored["resume_id"],
                master_resume_id=source_resume_id,
                status="applied",
                company=job.get("company"),
                role=title or job.get("role"),
            )
            result["application_id"] = application["application_id"]
        except Exception as e:  # noqa: BLE001 - tracker is non-critical
            logger.warning("Failed to create tracker application: %s", e)
    return result


async def score_resume(
    resume_id: str | None = None,
    resume_data: ResumeData | None = None,
    job_id: str | None = None,
    keywords: JobKeywords | None = None,
) -> dict[str, Any]:
    """Keyword match and ATS score for a saved resume or draft against job keywords."""
    if (resume_id is None) == (resume_data is None):
        raise ToolError("Pass exactly one of resume_id or resume_data.")
    if keywords is not None:
        job_keywords = keywords.model_dump()
    elif job_id is not None:
        job_keywords = (await _require_job(job_id)).get("job_keywords")
        if not job_keywords:
            raise ToolError("Job has no keywords. Call set_job_keywords first.")
    else:
        raise ToolError("Pass job_id or keywords.")

    if resume_id is not None:
        resume = await _require_resume(resume_id)
        data = _require_structured(resume)
        master = await _grounding_master_data(resume) or data
    else:
        data = resume_data.model_dump(mode="json")
        default = await db.get_master_resume()
        master = (_get_original_resume_data(default) if default else None) or data

    match = calculate_keyword_match(data, job_keywords)
    gaps = analyze_keyword_gaps(job_keywords, data, master)
    ats = compute_ats_score(
        refined_resume=data,
        job_keywords=job_keywords,
        keyword_match_percentage=match,
        missing_keywords=gaps.non_injectable_keywords,
        injectable_keywords=gaps.injectable_keywords,
    )
    return {"keyword_match_percentage": round(match, 1), **ats}


# -- Render -----------------------------------------------------------------


async def export_resume_pdf(
    resume_id: str,
    output_path: str | None = None,
    print_settings: PageFitSettings | None = None,
) -> dict[str, Any]:
    """Render a saved resume to PDF and report its page count. Needs the web frontend running."""
    resume = await _require_resume(resume_id)
    _require_structured(resume)
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


# -- Tracker ----------------------------------------------------------------


async def list_applications(status: ApplicationStatus | None = None) -> dict[str, Any]:
    """List tracker cards, optionally for one status column."""
    return {
        "applications": await db.list_applications(status.value if status else None)
    }


@_guard
async def create_application(
    resume_id: str,
    company: str,
    role: str,
    job_id: str | None = None,
    job_description: str | None = None,
    status: ApplicationStatus = ApplicationStatus.applied,
    notes: str | None = None,
) -> dict[str, Any]:
    """Add a tracker card for an existing job_id or a pasted job_description."""
    await _require_resume(resume_id)
    if (job_id is None) == (job_description is None):
        raise ToolError("Pass exactly one of job_id or job_description.")
    if job_id is not None:
        await _require_job(job_id)
        return await db.create_application(
            job_id=job_id,
            resume_id=resume_id,
            status=status.value,
            company=company,
            role=role,
            notes=notes,
        )
    content = (job_description or "").strip()
    if not content or len(content) > MAX_JOB_CHARACTERS:
        raise ToolError(f"job_description must be 1-{MAX_JOB_CHARACTERS} characters.")
    return await db.create_manual_application(
        content=content,
        resume_id=resume_id,
        status=status.value,
        company=company,
        role=role,
        notes=notes,
    )


@_guard
async def update_application(
    application_id: str,
    status: ApplicationStatus | None = None,
    position: int | None = None,
    notes: str | None = None,
    company: str | None = None,
    role: str | None = None,
) -> dict[str, Any]:
    """Move or edit a tracker card. Only the fields you pass change."""
    updates: dict[str, Any] = {
        key: value
        for key, value in (
            ("position", position),
            ("notes", notes),
            ("company", company),
            ("role", role),
        )
        if value is not None
    }
    if status is not None:
        updates["status"] = status.value
    if not updates:
        raise ToolError("Nothing to update.")
    updated = await db.update_application(application_id, updates)
    if not updated:
        raise ToolError(f"Application not found: {application_id}")
    return updated


READ_ONLY_TOOLS: list[Callable[..., Awaitable[dict[str, Any]]]] = [
    get_status,
    get_resume_schema,
    list_resumes,
    get_resume,
    get_job,
    get_resume_job,
    extract_document_text,
    validate_tailored_resume,
    score_resume,
    list_applications,
]

WRITE_TOOLS: list[Callable[..., Awaitable[dict[str, Any]]]] = [
    create_master_resume,
    update_resume,
    set_resume_title,
    set_cover_letter,
    set_outreach_message,
    set_default_master,
    add_job,
    set_job_keywords,
    save_tailored_resume,
    export_resume_pdf,
    create_application,
    update_application,
]

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITE = ToolAnnotations(
    read_only_hint=False, destructive_hint=False, open_world_hint=False
)
