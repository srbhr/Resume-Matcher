"""Helpers and constants shared by the MCP tools."""

import functools
import json
from collections.abc import Awaitable, Callable
from typing import Any, ParamSpec, TypeVar, get_args

from mcp.server.mcpserver.exceptions import ToolError
from pydantic import BaseModel, ConfigDict, Field

from app.ai_limits import MAX_SOURCE_CHARACTERS
from app.database import DatabaseBusyError, ResumeNotFoundError, db
from app.routers.resumes import (
    _get_original_resume_data,
    _hash_job_content,
    _validate_confirm_payload,
)
from app.schemas import ResumeData, normalize_resume_data
from app.schemas.models import PageFitSettings
from app.services.resume_preservation import (
    finalize_ai_resume,
    grounding_review_warnings,
)

P = ParamSpec("P")
R = TypeVar("R")

TEMPLATES: list[str] = list(
    get_args(PageFitSettings.model_fields["template"].annotation)
)
MAX_TITLE_LENGTH = 80
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


def guard(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
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


async def require_resume(resume_id: str) -> dict[str, Any]:
    resume = await db.get_resume(resume_id)
    if not resume:
        raise ToolError(f"Resume not found: {resume_id}")
    return resume


async def require_job(job_id: str) -> dict[str, Any]:
    job = await db.get_job(job_id)
    if not job:
        raise ToolError(f"Job not found: {job_id}")
    return job


def require_structured(resume: dict[str, Any]) -> dict[str, Any]:
    data = _get_original_resume_data(resume)
    if not data:
        raise ToolError(
            "Resume has no structured data yet. Read its source_markdown with "
            "get_resume, then save structured data with update_resume."
        )
    return data


def canonical(resume_data: ResumeData) -> dict[str, Any]:
    data = ResumeData.model_validate(
        normalize_resume_data(resume_data.model_dump(mode="json"))
    ).model_dump(mode="json")
    if len(json.dumps(data, ensure_ascii=False)) > MAX_SOURCE_CHARACTERS:
        raise ToolError(f"Resume exceeds {MAX_SOURCE_CHARACTERS} characters.")
    return data


def clean_title(title: str | None) -> str | None:
    cleaned = (title or "").strip()[:MAX_TITLE_LENGTH]
    return cleaned or None


def summary(resume: dict[str, Any]) -> dict[str, Any]:
    return {
        "resume_id": resume["resume_id"],
        "title": resume.get("title"),
        "is_master": resume.get("is_master", False),
        "is_default_master": resume.get("is_default_master", False),
        "parent_id": resume.get("parent_id"),
        "processing_status": resume.get("processing_status"),
        "updated_at": resume.get("updated_at"),
    }


def job_view(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": job["job_id"],
        "content": job.get("content"),
        "company": job.get("company"),
        "role": job.get("role"),
        "job_keywords": job.get("job_keywords"),
        "created_at": job.get("created_at"),
    }


def keyword_updates(content: str, keywords: JobKeywords) -> dict[str, Any]:
    updates: dict[str, Any] = {
        "job_keywords": keywords.model_dump(),
        "job_keywords_hash": _hash_job_content(content),
    }
    if keywords.company.strip():
        updates["company"] = keywords.company.strip()
    if keywords.role.strip():
        updates["role"] = keywords.role.strip()
    return updates


def diff_paths(a: Any, b: Any, path: str = "") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        out: list[str] = []
        for key in sorted(set(a) | set(b), key=str):
            out.extend(
                diff_paths(
                    a.get(key), b.get(key), f"{path}.{key}" if path else str(key)
                )
            )
        return out
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out.extend(diff_paths(x, y, f"{path}[{i}]"))
        return out
    return [] if a == b else [path or "<root>"]


def tailoring_report(
    original: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    """Run the same preservation checks as improve/confirm."""
    violations: list[str] = []
    report: dict[str, Any] = {}
    repaired = ResumeData.model_validate(
        finalize_ai_resume(original, candidate, allow_appended_rows=True)
    ).model_dump()
    if repaired != candidate:
        paths = diff_paths(candidate, repaired)
        violations.append(
            "preservation repairs required at: " + ", ".join(paths[:MAX_DIFF_PATHS])
        )
        report["repaired_resume_data"] = repaired
    try:
        _validate_confirm_payload(original, candidate, allow_appended_rows=True)
    except ValueError as e:
        violations.append(str(e))
    changed = diff_paths(original, candidate)
    return {
        "valid": not violations,
        "violations": violations,
        "grounding_warnings": grounding_review_warnings(original, candidate),
        "changed_fields": changed[:MAX_DIFF_PATHS],
        "changed_field_count": len(changed),
        **report,
    }
