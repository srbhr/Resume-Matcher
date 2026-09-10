"""Resume management endpoints."""

import asyncio
import copy
import hashlib
import json
import logging
import unicodedata
from collections.abc import Awaitable
from pathlib import Path
from typing import Any, NoReturn
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError

from app.ai_limits import MAX_JOB_CHARACTERS, PromptSizeError, require_source_size
from app.ai_budget import (
    AIOperationDeadlineExceeded,
    AIOperationRoute,
    remaining_timeout,
)
from app.config_cache import get_content_language, load_config as _load_config
from app.database import DatabaseBusyError, ProcessingFinishOutcome, ResumeNotFoundError, db
from app.pdf import render_resume_pdf, PDFRenderError
from app.config import settings
from app.preview import (
    PreviewBusyError,
    PreviewClaim,
    PreviewConflictError,
    PreviewValidationError,
    job_fingerprint,
    resume_fingerprint,
)

from app.schemas import (
    ATSScore,
    ATSSubScores,
    GenerateContentResponse,
    GenerateInterviewPrepResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
    ImproveResumeData,
    InterviewPrepData,
    RefinementStats,
    ResumeDiffSummary,
    ResumeFieldDiff,
    ResumeData,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeListResponse,
    ResumeSummary,
    ResumeUploadResponse,
    RawResume,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    normalize_resume_data,
)
from app.services.parser import (
    DocumentResourceLimitError,
    MAX_EXTRACTED_TEXT_BYTES,
    MAX_UNPACKED_DOCUMENT_BYTES,
    has_meaningful_resume_content,
    parse_document,
    parse_resume_to_json,
    restore_dates_from_markdown,
)
from app.services.improver import (
    MONTH_PATTERN,
    apply_diffs,
    extract_job_keywords,
    generate_improvements,
    generate_skill_target_plan,
    generate_resume_diffs,
    improve_resume,
    verify_skill_target_plan,
    verify_diff_result,
)
from app.services.refiner import (
    calculate_keyword_match,
    count_retained_keywords,
    refine_resume,
)
from app.services.resume_preservation import (
    finalize_ai_resume,
    grounding_review_warnings,
    validate_confirmed_resume,
)
from app.services.ats import compute_ats_score
from app.schemas.refinement import RefinementConfig
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
    generate_resume_title,
)
from app.services.interview_prep import generate_interview_prep
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS

logger = logging.getLogger(__name__)
_PROCESSING_CLEANUP_TIMEOUT_SECONDS = 5.0
_PROCESSING_RETIREMENT_MAX_ATTEMPTS = 3
_PROCESSING_RETIREMENT_INITIAL_BACKOFF_SECONDS = 0.1
_PROCESSING_RETIREMENT_MAX_BACKOFF_SECONDS = 0.5
_PROCESSING_SHUTDOWN_GRACE_SECONDS = 1.0
_PROCESSING_CLEANUP_TASKS: set[asyncio.Task[Any]] = set()
REFINEMENT_FAILED_WARNING = "REFINEMENT_FAILED: Resume refinement was unavailable; the previous result was kept."
DIFF_UNAVAILABLE_WARNING = "DIFF_UNAVAILABLE: Resume changes could not be calculated."


async def _auto_create_tracker_application(
    *,
    job_id: str,
    tailored_resume_id: str,
    master_resume_id: str,
    job: dict[str, Any] | None,
    title: str | None,
) -> None:
    """Best-effort: drop an ``applied`` card on the tracker after a tailoring.

    Company/role come from the cached job (zero extra LLM call). Wrapped so a
    tracker failure can never break the tailoring flow.
    """
    try:
        if title is None:
            saved_resume = await db.get_resume(tailored_resume_id)
            title = (saved_resume or {}).get("title")
        company = (job or {}).get("company")
        role = title or (job or {}).get("role")
        await db.create_application(
            job_id=job_id,
            resume_id=tailored_resume_id,
            master_resume_id=master_resume_id,
            status="applied",
            company=company,
            role=role,
        )
    except Exception as e:  # noqa: BLE001 - tracker is non-critical
        logger.warning("Failed to auto-create tracker application: %s", e)


def _get_default_prompt_id() -> str:
    """Get configured default prompt id from config file."""
    config = _load_config()
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    prompt_id = config.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    return prompt_id if prompt_id in option_ids else DEFAULT_IMPROVE_PROMPT_ID


def _hash_job_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _normalize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_payload(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[Any, Any] = {}
        for key, val in value.items():
            normalized_key = (
                unicodedata.normalize("NFC", key) if isinstance(key, str) else key
            )
            normalized[normalized_key] = _normalize_payload(val)
        return normalized
    return value


def _serialize_interview_prep(interview_prep: InterviewPrepData | None) -> str | None:
    if interview_prep is None:
        return None
    return json.dumps(interview_prep.model_dump(mode="json"), ensure_ascii=False)


def _parse_interview_prep(
    raw: Any,
    *,
    resume_id: str | None = None,
) -> InterviewPrepData | None:
    if raw in (None, ""):
        return None
    try:
        payload = json.loads(raw) if isinstance(raw, str) else raw
        return InterviewPrepData.model_validate(payload)
    except (TypeError, json.JSONDecodeError, ValidationError, ValueError) as e:
        logger.warning(
            "Invalid interview_prep payload for resume %s: %s",
            resume_id or "<unknown>",
            e,
        )
        return None


def _hash_improved_data(data: dict[str, Any]) -> str:
    """Hash canonicalized improved data for preview/confirm validation.

    Canonicalize through ``ResumeData`` first so a payload that merely omits
    optional fields (which the schema defaults) hashes identically to its
    schema-complete form. Without this, ``improve/preview`` (which hashes the
    raw ``improved_data`` dict) and ``improve/confirm`` (which hashes the
    ``ResumeData`` round-trip, ``request.improved_data.model_dump()``) disagree
    for any stored resume whose ``processed_data`` is not schema-complete, and a
    valid tailoring is rejected with 400 ("preview hash mismatch").
    """
    try:
        canonical: dict[str, Any] = ResumeData.model_validate(data).model_dump()
    except ValidationError:
        canonical = data  # not a full resume payload; hash as-is
    normalized = _normalize_payload(canonical)
    serialized = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,  # Preserve original behavior for hash stability
        default=str,  # Handle non-serializable types gracefully
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _normalize_personal_info_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value).strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    normalized = _normalize_payload(value)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def _raise_improve_error(
    action: str,
    stage: str,
    error: Exception,
    detail: str,
) -> NoReturn:
    logger.error("Resume %s failed during %s: %s", action, stage, error)
    raise HTTPException(status_code=500, detail=detail)


def _validate_ai_sources(
    resume: dict[str, Any], job: dict[str, Any] | None = None
) -> None:
    """Check all stored inputs before starting expensive AI work."""
    for field in ("content", "original_markdown", "processed_data"):
        value = resume.get(field)
        if value:
            require_source_size(value)
    if job is not None:
        require_source_size(job.get("content", ""), MAX_JOB_CHARACTERS)


def _get_original_resume_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    original_data = resume.get("processed_data")
    if not original_data and resume.get("content_type") == "json":
        try:
            original_data = json.loads(resume["content"])
        except json.JSONDecodeError as e:
            logger.warning("Skipping resume diff due to JSON parse failure: %s", e)
    return original_data


def _get_original_markdown(resume: dict[str, Any]) -> str | None:
    """Get the original markdown content from a resume.

    Checks ``original_markdown`` first (persisted at upload), then
    falls back to ``content`` if it's still in markdown format.
    """
    md = resume.get("original_markdown")
    if md and isinstance(md, str):
        return md
    if resume.get("content_type") == "md":
        content = resume.get("content", "")
        if content and isinstance(content, str):
            return content
    return None


def _has_month(date_str: str) -> bool:
    """Return True if the date string contains a month name."""
    return bool(MONTH_PATTERN.search(date_str))


def _restore_original_dates(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore original date/years values that the LLM may have truncated.

    Compares each entry's ``years`` field in the tailored resume against
    the corresponding entry in the original.  If the original has more
    date precision (e.g. includes a month) and the tailored version lost
    it, the original value is restored.
    """
    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)

    for section_key in ("workExperience", "education", "personalProjects"):
        orig_entries = original_data.get(section_key, [])
        result_entries = result.get(section_key, [])
        for idx, orig_entry in enumerate(orig_entries):
            if idx >= len(result_entries):
                break
            if not isinstance(orig_entry, dict) or not isinstance(
                result_entries[idx], dict
            ):
                continue
            orig_years = orig_entry.get("years", "")
            result_years = result_entries[idx].get("years", "")
            if (
                isinstance(orig_years, str)
                and isinstance(result_years, str)
                and orig_years
                and orig_years != result_years
                and _has_month(orig_years)
                and not _has_month(result_years)
            ):
                logger.info(
                    "Restoring date in %s[%d]: %r → %r",
                    section_key,
                    idx,
                    result_years,
                    orig_years,
                )
                result_entries[idx]["years"] = orig_years

    # Custom sections (itemList)
    orig_custom = original_data.get("customSections", {})
    result_custom = result.get("customSections", {})
    if isinstance(orig_custom, dict) and isinstance(result_custom, dict):
        for section_key, orig_section in orig_custom.items():
            if not isinstance(orig_section, dict):
                continue
            result_section = result_custom.get(section_key)
            if not isinstance(result_section, dict):
                continue
            if orig_section.get("sectionType") != "itemList":
                continue
            orig_items = orig_section.get("items", [])
            result_items = result_section.get("items", [])
            for idx, orig_item in enumerate(orig_items):
                if idx >= len(result_items):
                    break
                if not isinstance(orig_item, dict) or not isinstance(
                    result_items[idx], dict
                ):
                    continue
                orig_years = orig_item.get("years", "")
                result_years = result_items[idx].get("years", "")
                if (
                    isinstance(orig_years, str)
                    and isinstance(result_years, str)
                    and orig_years
                    and orig_years != result_years
                    and _has_month(orig_years)
                    and not _has_month(result_years)
                ):
                    result_items[idx]["years"] = orig_years

    return result


def _preserve_original_skills(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore any skills, certs, languages, or awards dropped by the LLM.

    This is a hard safety net: regardless of what the LLM returns, no
    original item from these lists is ever lost.  Dropped items are
    appended at the end of the improved list.
    """
    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)

    orig_additional = original_data.get("additional", {})
    if not isinstance(orig_additional, dict):
        return result
    result_additional = result.setdefault("additional", {})

    list_fields = [
        "technicalSkills",
        "certificationsTraining",
        "languages",
        "awards",
    ]
    for field in list_fields:
        orig_items = orig_additional.get(field, [])
        if not isinstance(orig_items, list) or not orig_items:
            continue
        current_items = result_additional.get(field, [])
        if not isinstance(current_items, list):
            current_items = []

        # Build a case-insensitive index of what the LLM kept
        current_lower = {
            item.casefold() for item in current_items if isinstance(item, str)
        }

        # Append any originals that were dropped
        restored = 0
        for item in orig_items:
            if isinstance(item, str) and item.casefold() not in current_lower:
                current_items.append(item)
                current_lower.add(item.casefold())
                restored += 1

        if restored:
            logger.info("Restored %d dropped items in additional.%s", restored, field)
        result_additional[field] = current_items

    return result


def _protect_custom_sections(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Protect custom sections from LLM hallucination.

    - If an item originally had description: [], revert any fabricated descriptions.
    - If the LLM added items that weren't in the original, remove them.
    """
    if not original_data:
        return improved_data

    orig_custom = original_data.get("customSections")
    if not isinstance(orig_custom, dict) or not orig_custom:
        return improved_data

    result = copy.deepcopy(improved_data)
    result_custom = result.get("customSections")
    if not isinstance(result_custom, dict):
        return result

    for section_key, orig_section in orig_custom.items():
        if not isinstance(orig_section, dict):
            continue
        result_section = result_custom.get(section_key)
        if not isinstance(result_section, dict):
            # Section was removed by LLM — restore original
            result_custom[section_key] = copy.deepcopy(orig_section)
            logger.info("Restored missing custom section: %s", section_key)
            continue

        section_type = orig_section.get("sectionType", "")
        if section_type == "itemList":
            orig_items = orig_section.get("items", [])
            result_items = result_section.get("items", [])
            if not isinstance(orig_items, list) or not isinstance(result_items, list):
                continue

            # Trim any items the LLM added beyond the original count
            if len(result_items) > len(orig_items):
                logger.info(
                    "Trimming %d hallucinated items from customSections.%s",
                    len(result_items) - len(orig_items),
                    section_key,
                )
                result_items = result_items[: len(orig_items)]

            # Revert fabricated descriptions on items that had empty descriptions
            for idx, orig_item in enumerate(orig_items):
                if idx >= len(result_items):
                    break
                if not isinstance(orig_item, dict):
                    continue
                orig_desc = orig_item.get("description")
                if isinstance(orig_desc, list) and len(orig_desc) == 0:
                    result_desc = result_items[idx].get("description")
                    if isinstance(result_desc, list) and len(result_desc) > 0:
                        logger.info(
                            "Reverted fabricated description on customSections.%s.items[%d]",
                            section_key,
                            idx,
                        )
                        result_items[idx]["description"] = []

            result_section["items"] = result_items

    result["customSections"] = result_custom
    return result


def _preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Preserve personal info from original, return warnings if unable.

    Uses deep copy to prevent mutation of original data.
    """
    warnings: list[str] = []

    if not original_data:
        warnings.append(
            "Original resume data unavailable - personal info may be AI-generated"
        )
        return improved_data, warnings

    original_info = original_data.get("personalInfo")
    if not isinstance(original_info, dict):
        warnings.append("Original personal info missing or invalid")
        return improved_data, warnings

    # SVC-001: Use deep copy to prevent any mutation of original data
    result = copy.deepcopy(improved_data)
    result["personalInfo"] = copy.deepcopy(original_info)
    return result, warnings


def _finalized_refinement_stats(
    stats: RefinementStats,
    applied_keywords: list[str],
    finalized_data: dict[str, Any],
    job_keywords: dict[str, Any],
) -> RefinementStats:
    """Report only keyword changes retained in the finalized resume."""
    return stats.model_copy(
        update={
            "keywords_injected": count_retained_keywords(
                applied_keywords, finalized_data
            ),
            "final_match_percentage": calculate_keyword_match(
                finalized_data, job_keywords
            ),
        }
    )


def _build_ats_score(
    improved_data: dict[str, Any],
    job_keywords: dict[str, Any],
    refinement_result: Any,
    refinement_successful: bool,
) -> ATSScore | None:
    """Build ATSScore from refinement result and resume data."""
    try:
        kw_analysis = (
            refinement_result.keyword_analysis
            if refinement_successful and refinement_result is not None
            else None
        )
        final_match = calculate_keyword_match(improved_data, job_keywords)
        ats_raw = compute_ats_score(
            refined_resume=improved_data,
            job_keywords=job_keywords,
            keyword_match_percentage=final_match,
            missing_keywords=kw_analysis.non_injectable_keywords if kw_analysis else [],
            injectable_keywords=kw_analysis.injectable_keywords if kw_analysis else [],
        )
        return ATSScore(
            overall_score=ats_raw["overall_score"],
            sub_scores=ATSSubScores(**ats_raw["sub_scores"]),
            missing_keywords=ats_raw["missing_keywords"],
            injectable_keywords=ats_raw["injectable_keywords"],
            recommendations=ats_raw["recommendations"],
        )
    except Exception as e:
        logger.warning("ATS score computation failed", exc_info=True)
        return None


def _calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None, str | None]:
    """Calculate resume diffs when structured data is available.

    Returns (summary, changes, error_reason). Error reason is None on success,
    or a string describing why diff calculation failed.
    """
    original_data = _get_original_resume_data(resume)
    if not original_data:
        return None, None, "original_data_missing"
    from app.services.improver import calculate_resume_diff

    try:
        summary, changes = calculate_resume_diff(original_data, improved_data)
        return summary, changes, None
    except Exception as e:
        logger.warning("Skipping resume diff due to calculation failure: %s", e)
        return None, None, "calculation_error"


def _validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
    *,
    allow_appended_rows: bool = False,
) -> None:
    if not original_data:
        logger.warning(
            "Skipping confirm payload validation; structured resume data unavailable."
        )
        return
    original_info = original_data.get("personalInfo")
    improved_info = improved_data.get("personalInfo")
    # JSON-008: Explicit null checks with clear error messages
    if original_info is None:
        raise ValueError("Original resume missing personalInfo")
    if improved_info is None:
        raise ValueError("Improved resume missing personalInfo")
    if not isinstance(original_info, dict):
        raise ValueError(
            f"Original personalInfo is not a dict: {type(original_info).__name__}"
        )
    if not isinstance(improved_info, dict):
        raise ValueError(
            f"Improved personalInfo is not a dict: {type(improved_info).__name__}"
        )
    fields = set(original_info.keys()) | set(improved_info.keys())
    mismatches = [
        field
        for field in sorted(fields)
        if _normalize_personal_info_value(original_info.get(field))
        != _normalize_personal_info_value(improved_info.get(field))
    ]
    if mismatches:
        raise ValueError(f"personalInfo fields changed: {', '.join(mismatches)}")
    preservation_violations = validate_confirmed_resume(
        original_data, improved_data, allow_appended_rows=allow_appended_rows
    )
    if preservation_violations:
        raise ValueError(
            "source preservation failed: " + ", ".join(preservation_violations)
        )


async def _generate_auxiliary_messages(
    improved_data: dict[str, Any],
    job_content: str,
    language: str,
    enable_cover_letter: bool,
    enable_outreach: bool,
    enable_interview_prep: bool,
) -> tuple[str | None, str | None, str | None, InterviewPrepData | None, list[str]]:
    """Generate cover letter, outreach, interview prep, and resume title.

    Returns (cover_letter, outreach_message, title, interview_prep, warnings).
    """
    cover_letter = None
    outreach_message = None
    title = None
    interview_prep = None
    warnings: list[str] = []
    # Finish optional work before the operation deadline so successful outputs
    # can still be persisted if one provider call stalls. The remaining slice is
    # reserved for the resume/improvement transaction.
    generation_timeout = max(0.001, remaining_timeout() * 0.8)
    generation_tasks: list[Awaitable[str | InterviewPrepData]] = []
    task_labels: list[str] = []

    # Title generation is always on (no feature flag)
    generation_tasks.append(generate_resume_title(job_content, language))
    task_labels.append("title")

    if enable_cover_letter:
        generation_tasks.append(
            generate_cover_letter(improved_data, job_content, language)
        )
        task_labels.append("cover_letter")
    if enable_outreach:
        generation_tasks.append(
            generate_outreach_message(improved_data, job_content, language)
        )
        task_labels.append("outreach")
    if enable_interview_prep:
        generation_tasks.append(
            generate_interview_prep(improved_data, job_content, language)
        )
        task_labels.append("interview_prep")

    async def bounded_generation(
        generation: Awaitable[str | InterviewPrepData],
    ) -> str | InterviewPrepData:
        return await asyncio.wait_for(generation, timeout=generation_timeout)

    results = await asyncio.gather(
        *(bounded_generation(task) for task in generation_tasks),
        return_exceptions=True,
    )
    for label, result in zip(task_labels, results):
        if isinstance(result, (AIOperationDeadlineExceeded, PromptSizeError)):
            raise result
        if isinstance(result, Exception):
            logger.warning(
                "%s generation failed: %s",
                label,
                result,
                exc_info=result,
            )
            warnings.append(f"{label.replace('_', ' ').title()} generation failed")
        else:
            if label != "interview_prep" and (
                not isinstance(result, str) or not result.strip()
            ):
                logger.warning("%s generation returned empty output", label)
                warnings.append(
                    f"{label.replace('_', ' ').title()} generation failed"
                )
                continue
            if label == "title":
                title = result.strip()
            elif label == "cover_letter":
                cover_letter = result.strip()
            elif label == "outreach":
                outreach_message = result.strip()
            elif label == "interview_prep":
                interview_prep = result

    return cover_letter, outreach_message, title, interview_prep, warnings


router = APIRouter(route_class=AIOperationRoute, prefix="/resumes", tags=["Resumes"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
DOCUMENT_TYPES_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB
UPLOAD_READ_CHUNK_SIZE = 64 * 1024


def _validate_upload_type(file: UploadFile) -> None:
    """Require the declared MIME type to match a supported filename extension."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: PDF, DOC, DOCX",
        )

    suffix = Path(file.filename or "").suffix.lower()
    if DOCUMENT_TYPES_BY_EXTENSION.get(suffix) != file.content_type:
        raise HTTPException(
            status_code=400,
            detail="Upload a valid PDF, DOC, or DOCX file.",
        )


async def _read_upload_content(file: UploadFile) -> bytes:
    """Read at most one byte beyond the raw upload limit in bounded chunks."""
    content = bytearray()
    while len(content) <= MAX_FILE_SIZE:
        read_size = min(UPLOAD_READ_CHUNK_SIZE, MAX_FILE_SIZE - len(content) + 1)
        chunk = await file.read(read_size)
        if not chunk:
            return bytes(content)
        content.extend(chunk)
    raise HTTPException(
        status_code=413,
        detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
    )


def _require_processing_commit(
    outcome: ProcessingFinishOutcome,
    *,
    deleted_detail: str,
) -> None:
    """Map a compare-and-set miss to an intentional client outcome."""
    if outcome == "committed":
        return
    if outcome == "missing":
        raise HTTPException(status_code=404, detail=deleted_detail)
    raise HTTPException(
        status_code=409,
        detail="Resume processing was superseded by a newer attempt.",
    )


async def _await_processing_cleanup(task: asyncio.Task[Any]) -> Any:
    """Bound caller waiting while a tracked task retains database ownership."""
    _PROCESSING_CLEANUP_TASKS.add(task)

    def finished(cleanup: asyncio.Task[Any]) -> None:
        _PROCESSING_CLEANUP_TASKS.discard(cleanup)
        if not cleanup.cancelled():
            error = cleanup.exception()
            if error is not None:
                logger.error(
                    "Owned processing cleanup failed",
                    exc_info=(type(error), error, error.__traceback__),
                )

    task.add_done_callback(finished)
    deadline = asyncio.get_running_loop().time() + _PROCESSING_CLEANUP_TIMEOUT_SECONDS
    while not task.done():
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise TimeoutError("Processing cleanup continues in the background")
        try:
            # Unlike wait_for, cancellation or timeout of this waiter never
            # cancels the owned transaction/retirement task.
            await asyncio.wait({task}, timeout=remaining)
        except asyncio.CancelledError:
            continue
    return task.result()


async def _retire_processing_attempt(
    resume_id: str, processing_token: str | None
) -> None:
    """Retire an attempt after bounded contention retries."""
    retry_delay = _PROCESSING_RETIREMENT_INITIAL_BACKOFF_SECONDS
    for attempt in range(1, _PROCESSING_RETIREMENT_MAX_ATTEMPTS + 1):
        try:
            await db.finish_resume_processing(
                resume_id, processing_token, processing_status="failed"
            )
            return
        except DatabaseBusyError:
            if attempt == _PROCESSING_RETIREMENT_MAX_ATTEMPTS:
                logger.error(
                    "Processing retirement exhausted %d attempts for resume %s; "
                    "the processing row remains retryable",
                    attempt,
                    resume_id,
                )
                raise
            # Each failed reservation closes its session. Back off without
            # holding a transaction; the tracked task still owns retirement.
            await asyncio.sleep(retry_delay)
            retry_delay = min(
                retry_delay * 2,
                _PROCESSING_RETIREMENT_MAX_BACKOFF_SECONDS,
            )


async def drain_processing_cleanup_tasks() -> None:
    """Settle tracked processing cleanup before the database is disposed."""
    cleanup_tasks = set(_PROCESSING_CLEANUP_TASKS)
    if not cleanup_tasks:
        return

    _, pending = await asyncio.wait(
        cleanup_tasks,
        timeout=_PROCESSING_SHUTDOWN_GRACE_SECONDS,
    )
    if pending:
        logger.warning(
            "Cancelling %d processing cleanup task(s) during shutdown",
            len(pending),
        )
        for task in pending:
            task.cancel()

    # Do not wrap this gather in wait_for: an in-flight SQLite operation must
    # finish unwinding and release its connection before db.close() runs.
    await asyncio.gather(*cleanup_tasks, return_exceptions=True)


async def _finish_cancelled_processing(
    resume_id: str, processing_token: str | None
) -> None:
    """Retire only this attempt, deferring a stalled cleanup after a bounded wait."""
    cleanup = asyncio.create_task(
        _retire_processing_attempt(resume_id, processing_token)
    )
    try:
        await _await_processing_cleanup(cleanup)
    except TimeoutError:
        logger.warning("Processing retirement continues for resume %s", resume_id)
    except Exception:
        logger.exception("Failed to retire cancelled processing for %s", resume_id)


async def _claim_processing(
    resume_id: str, *, allow_ready_at: str | None = None
) -> str | None:
    """Recover ownership when cancellation arrives during a committed claim."""
    claim = asyncio.create_task(
        db.claim_resume_processing(resume_id, allow_ready_at=allow_ready_at)
    )
    try:
        return await asyncio.shield(claim)
    except asyncio.CancelledError:
        async def retire_claim() -> None:
            token = await claim
            if token is not None:
                await _retire_processing_attempt(resume_id, token)

        retirement = asyncio.create_task(retire_claim())
        try:
            await _await_processing_cleanup(retirement)
        except TimeoutError:
            logger.warning("Processing claim retirement continues for resume %s", resume_id)
        except Exception:
            logger.exception("Failed to settle cancelled processing claim for %s", resume_id)
        raise


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(
    request: Request, file: UploadFile = File(...)
) -> ResumeUploadResponse:
    """Upload and process a resume file (PDF/DOCX).

    Converts the file to Markdown and stores it in the database.
    Optionally parses to structured JSON if LLM is configured.
    """
    _validate_upload_type(file)

    content = await _read_upload_content(file)

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to markdown
    try:
        markdown_content = await parse_document(content, file.filename or "resume.pdf")
    except DocumentResourceLimitError as e:
        logger.warning("Document resource limit exceeded for %s: %s", file.filename, e)
        raise HTTPException(
            status_code=413,
            detail=(
                "Document content is too large to process. "
                f"Maximum expanded size is {MAX_UNPACKED_DOCUMENT_BYTES // (1024 * 1024)}MB "
                f"and extracted text is {MAX_EXTRACTED_TEXT_BYTES // (1024 * 1024)}MB."
            ),
        )
    except TimeoutError as e:
        logger.warning("Document conversion exceeded its deadline")
        raise HTTPException(
            status_code=504,
            detail="Document conversion timed out. Please try a simpler document.",
        ) from e
    except (DatabaseBusyError, PromptSizeError):
        raise
    except Exception as e:
        logger.exception("Document parsing failed")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please upload a valid PDF, DOC, or DOCX file.",
        )

    # Validate extracted text is not empty (image-based PDFs / scanned documents)
    if not markdown_content or not markdown_content.strip():
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract text from the uploaded file. The document may be "
                "image-based or scanned. Please upload a text-based PDF, DOC, or DOCX "
                "with selectable text, or run OCR first."
            ),
        )

    # Store in database first with "processing" status (atomic master assignment)
    # original_markdown is preserved permanently for date reference even after
    # builder saves overwrite `content` with JSON.
    require_source_size(markdown_content)
    resume = await db.create_resume_atomic_master(
        content=markdown_content,
        content_type="md",
        filename=file.filename,
        processed_data=None,
        processing_status="processing",
        original_markdown=markdown_content,
    )

    # Preserve acknowledgement of this request's committed insert even if its
    # parse fails or the outer operation timer cancels the handler. A status
    # snapshot would be misleading while retirement/newer work is still pending.
    request.state.uploaded_resume = (resume["resume_id"], resume.get("is_master", False))

    try:
        processing_token = await _claim_processing(resume["resume_id"])
    except DatabaseBusyError:
        # This request created the row, but no claim was installed. Retire it
        # only while its token is still NULL; a concurrent owner/save wins.
        await _finish_cancelled_processing(resume["resume_id"], None)
        raise
    except ResumeNotFoundError as e:
        raise HTTPException(
            status_code=404, detail="Resume was deleted during upload processing."
        ) from e
    if processing_token is None:
        raise HTTPException(
            status_code=409,
            detail="Resume processing was superseded by a newer attempt.",
        )

    try:
        # Try to parse to structured JSON (optional, may fail if LLM not configured)
        try:
            processed_data = await parse_resume_to_json(markdown_content)
        except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
            outcome = await db.finish_resume_processing(
                resume["resume_id"],
                processing_token,
                processing_status="failed",
            )
            _require_processing_commit(
                outcome,
                deleted_detail="Resume was deleted during upload processing.",
            )
            resume["processing_status"] = "failed"
        else:
            outcome = await db.finish_resume_processing(
                resume["resume_id"],
                processing_token,
                processing_status="ready",
                processed_data=processed_data,
            )
            _require_processing_commit(
                outcome,
                deleted_detail="Resume was deleted during upload processing.",
            )
            resume["processed_data"] = processed_data
            resume["processing_status"] = "ready"

        # Return accurate status to client (API-001 fix)
        return ResumeUploadResponse(
            message=(
                f"File {file.filename} uploaded successfully"
                if resume["processing_status"] == "ready"
                else f"File {file.filename} uploaded but parsing failed"
            ),
            request_id=str(uuid4()),
            resume_id=resume["resume_id"],
            processing_status=resume["processing_status"],
            is_master=resume.get("is_master", False),
        )
    except (
        asyncio.CancelledError,
        AIOperationDeadlineExceeded,
        PromptSizeError,
        DatabaseBusyError,
    ):
        await _finish_cancelled_processing(resume["resume_id"], processing_token)
        raise


@router.get("", response_model=ResumeFetchResponse)
async def get_resume(resume_id: str = Query(...)) -> ResumeFetchResponse:
    """Fetch resume details by ID.

    Returns both raw markdown and structured data (if available),
    plus cover letter and outreach message if they exist.
    Applies lazy migration for section metadata if needed.
    """
    resume = await db.get_resume(resume_id)

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Get processing status (default to "pending" for old records)
    processing_status = resume.get("processing_status", "pending")

    # Build response
    raw_resume = RawResume(
        id=None,  # TinyDB doesn't have numeric IDs like SQL
        content=resume["content"],
        content_type=resume["content_type"],
        created_at=resume["created_at"],
        processing_status=processing_status,
    )

    # Get processed data if available (no more on-demand parsing)
    processed_data = resume.get("processed_data")

    # Apply lazy migration - add section metadata to old resumes
    if processed_data:
        processed_data = normalize_resume_data(processed_data)

    processed_resume = (
        ResumeData.model_validate(processed_data) if processed_data else None
    )

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=resume.get("cover_letter"),
            outreach_message=resume.get("outreach_message"),
            interview_prep=_parse_interview_prep(
                resume.get("interview_prep"),
                resume_id=resume_id,
            ),
            parent_id=resume.get("parent_id"),
            title=resume.get("title"),
        ),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(include_master: bool = Query(False)) -> ResumeListResponse:
    """List resumes, optionally including the master resume."""
    resumes = await db.list_resumes()
    if not include_master:
        resumes = [resume for resume in resumes if not resume.get("is_master", False)]

    resumes.sort(key=lambda item: item.get("updated_at", ""), reverse=True)

    summaries = [
        ResumeSummary(
            resume_id=resume["resume_id"],
            filename=resume.get("filename"),
            is_master=resume.get("is_master", False),
            parent_id=resume.get("parent_id"),
            processing_status=resume.get("processing_status", "pending"),
            created_at=resume.get("created_at", ""),
            updated_at=resume.get("updated_at", ""),
            title=resume.get("title"),
        )
        for resume in resumes
    ]

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


@router.post("/improve/preview", response_model=ImproveResumeResponse)
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Preview a tailored resume without persisting it.

    The response includes resume_preview data but leaves resume_id null.
    """
    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = await db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    _validate_ai_sources(resume, job)
    language = get_content_language()
    prompt_id = request.prompt_id or _get_default_prompt_id()

    progress = {"stage": "load_job_keywords"}
    detail = "Failed to preview resume. Please try again."
    try:
        return await asyncio.wait_for(
            _improve_preview_flow(
                request=request,
                resume=resume,
                job=job,
                language=language,
                prompt_id=prompt_id,
                progress=progress,
            ),
            timeout=remaining_timeout(),
        )
    except PreviewConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except asyncio.CancelledError:
        logger.info("Improve preview cancelled at stage=%s", progress["stage"])
        raise
    except asyncio.TimeoutError:
        logger.error(
            "Improve preview timed out at stage=%s after %ss for resume %s / job %s",
            progress["stage"],
            settings.request_timeout_seconds,
            request.resume_id,
            request.job_id,
        )
        raise HTTPException(
            status_code=504,
            detail=(
                f"Resume tailoring timed out after {settings.request_timeout_seconds}s. "
                "If you are running a local LLM, raise REQUEST_TIMEOUT_SECONDS (and the "
                "matching frontend NEXT_PUBLIC_REQUEST_TIMEOUT_MS); otherwise try a shorter "
                "job description or a simpler prompt."
            ),
        )
    except (DatabaseBusyError, PromptSizeError):
        raise
    except Exception as e:
        _raise_improve_error("preview", progress["stage"], e, detail)


async def _improve_preview_flow(
    *,
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
    progress: dict[str, str] | None = None,
) -> ImproveResumeResponse:
    """Inner flow for improve/preview, extracted so it can be wrapped in wait_for."""
    if progress is None:
        progress = {}
    progress["stage"] = "load_job_keywords"
    job_keywords = job.get("job_keywords")
    job_keywords_hash = job.get("job_keywords_hash")
    content_hash = _hash_job_content(job["content"])
    if not job_keywords or job_keywords_hash != content_hash:
        job_keywords = await extract_job_keywords(job["content"])
        # Cache extracted keywords with a content hash for basic invalidation.
        # Also surface company/role to the job's top level so the tracker's
        # auto-create-on-confirm path can read them without an extra LLM call.
        cache_updates: dict[str, Any] = {
            "job_keywords": job_keywords,
            "job_keywords_hash": content_hash,
        }
        # LLM output isn't guaranteed to be a string — guard before .strip().
        raw_company = job_keywords.get("company")
        raw_role = job_keywords.get("role")
        company = raw_company.strip() if isinstance(raw_company, str) else ""
        role = raw_role.strip() if isinstance(raw_role, str) else ""
        if company:
            cache_updates["company"] = company
        if role:
            cache_updates["role"] = role
        try:
            updated_job = await db.update_job(
                request.job_id,
                cache_updates,
            )
            if not updated_job:
                logger.warning(
                    "Failed to persist job keywords for job %s.",
                    request.job_id,
                )
        except Exception as e:
            logger.warning(
                "Failed to persist job keywords for job %s: %s",
                request.job_id,
                e,
            )
    progress["stage"] = "load_original_resume"
    original_resume_data = _get_original_resume_data(resume)
    # Collect warnings throughout the process
    response_warnings: list[str] = []
    allow_appended_rows = False

    # Diff-based improvement: generate targeted changes, apply with verification
    if original_resume_data:
        skill_targets: list[dict[str, Any]] = []
        try:
            progress["stage"] = "plan_skill_targets"
            raw_skill_plan = await generate_skill_target_plan(
                original_resume_data=original_resume_data,
                job_description=job["content"],
                job_keywords=job_keywords,
                language=language,
            )
            verified_skill_plan = verify_skill_target_plan(
                raw_skill_plan,
                original_resume_data=original_resume_data,
                job_keywords=job_keywords,
                job_description=job["content"],
            )
            accepted_targets = verified_skill_plan.get("accepted", [])
            if isinstance(accepted_targets, list):
                skill_targets = [
                    target for target in accepted_targets if isinstance(target, dict)
                ]
            rejected_targets = verified_skill_plan.get("rejected", [])
            if isinstance(rejected_targets, list) and rejected_targets:
                response_warnings.append(
                    f"{len(rejected_targets)} unsupported skill target(s) rejected"
                )
        except (AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning("Skill target planning failed, continuing without it: %s", e)
            response_warnings.append("Skill target planning failed")

        progress["stage"] = "generate_resume_diffs"
        diff_result = await generate_resume_diffs(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
            skill_targets=skill_targets,
        )

        progress["stage"] = "apply_resume_diffs"
        improved_data, applied_changes, rejected_changes = apply_diffs(
            original=original_resume_data,
            changes=diff_result.changes,
            allowed_skill_targets=skill_targets,
        )
        allow_appended_rows = any(
            change.action == "append"
            for change in applied_changes
        )

        diff_warnings = verify_diff_result(
            original=original_resume_data,
            result=improved_data,
            applied_changes=applied_changes,
            job_keywords=job_keywords,
        )
        response_warnings.extend(diff_warnings)

        if rejected_changes:
            response_warnings.append(
                f"{len(rejected_changes)} change(s) rejected during verification"
            )

        logger.info(
            "Diff-based improve: %d applied, %d rejected, %d warnings",
            len(applied_changes),
            len(rejected_changes),
            len(diff_warnings),
        )
    else:
        # Fallback to full-output mode when no structured data available
        progress["stage"] = "generate_resume"
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
        )

    progress["stage"] = "preserve_source_fields"
    # Safety nets (defense in depth — should rarely activate with diff-based flow)
    improved_data, preserve_warnings = _preserve_personal_info(
        original_resume_data,
        improved_data,
    )
    response_warnings.extend(preserve_warnings)

    improved_data = _restore_original_dates(original_resume_data, improved_data)
    original_markdown = _get_original_markdown(resume)
    if original_markdown:
        improved_data = restore_dates_from_markdown(improved_data, original_markdown)
    improved_data = _preserve_original_skills(original_resume_data, improved_data)
    improved_data = _protect_custom_sections(original_resume_data, improved_data)

    # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
    refinement_stats: RefinementStats | None = None
    refinement_result = None
    refinement_attempted = False
    refinement_successful = False
    try:
        # Get master resume for alignment validation
        master_resume = await db.get_master_resume()
        master_data = (
            _get_original_resume_data(master_resume)
            if master_resume
            else _get_original_resume_data(resume)
        )
        if master_data:
            initial_match = calculate_keyword_match(improved_data, job_keywords)
            refinement_attempted = True
            progress["stage"] = "refine_resume"
            refinement_result = await refine_resume(
                initial_tailored=improved_data,
                master_resume=master_data,
                job_description=job["content"],
                job_keywords=job_keywords,
                config=RefinementConfig(),
            )
            improved_data = refinement_result.refined_data
            refinement_stats = refinement_result.to_stats(initial_match)
            refinement_successful = True
            logger.info(
                "Refinement completed: %d passes, %d AI phrases removed",
                refinement_result.passes_completed,
                len(refinement_result.ai_phrases_removed),
            )
    except (AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.warning("Refinement failed, using unrefined result: %s", e)
        if refinement_attempted:
            response_warnings.append(REFINEMENT_FAILED_WARNING)

    if original_resume_data:
        improved_data = finalize_ai_resume(
            original_resume_data,
            improved_data,
            allow_appended_rows=allow_appended_rows,
        )
        response_warnings.extend(
            grounding_review_warnings(original_resume_data, improved_data)
        )
        if refinement_stats is not None and refinement_result is not None:
            refinement_stats = _finalized_refinement_stats(
                refinement_stats,
                refinement_result.keywords_applied,
                improved_data,
                job_keywords,
            )

    progress["stage"] = "register_preview"
    improved_text = json.dumps(improved_data, indent=2)
    preview_hash = _hash_improved_data(improved_data)
    improvements = generate_improvements(job_keywords)
    registered_preview = await db.register_preview(
        source_id=request.resume_id,
        job_id=request.job_id,
        payload_hash=preview_hash,
        source_hash=resume_fingerprint(
            resume["content"],
            resume.get("processed_data"),
            resume.get("original_markdown"),
        ),
        job_hash=job_fingerprint(job["content"]),
        prompt_id=prompt_id,
        ttl_seconds=settings.preview_ttl_seconds,
        improvements=improvements,
    )
    progress["stage"] = "calculate_diff"
    diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
        resume,
        improved_data,
    )
    if diff_error:
        response_warnings.append(DIFF_UNAVAILABLE_WARNING)

    request_id = str(uuid4())
    progress["stage"] = "serialize_preview"
    return ImproveResumeResponse(
        request_id=request_id,
        data=ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            preview_id=registered_preview["preview_id"],
            preview_expires_at=registered_preview["expires_at"],
            job_id=request.job_id,
            resume_preview=ResumeData.model_validate(improved_data),
            improvements=[
                {
                    "suggestion": imp["suggestion"],
                    "lineNumber": imp.get("lineNumber"),
                }
                for imp in improvements
            ],
            markdownOriginal=resume["content"],
            markdownImproved=improved_text,
            cover_letter=None,
            outreach_message=None,
            interview_prep=None,
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            refinement_stats=refinement_stats,
            ats_score=_build_ats_score(
                improved_data,
                job_keywords,
                refinement_result,
                refinement_successful,
            ),
            warnings=response_warnings,
            refinement_attempted=refinement_attempted,
            refinement_successful=refinement_successful,
        ),
    )


@router.post("/improve/confirm", response_model=ImproveResumeResponse)
async def improve_resume_confirm_endpoint(
    request: ImproveResumeConfirmRequest,
) -> ImproveResumeResponse:
    """Confirm an accepted input snapshot once, with durable replay semantics."""
    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    job = await db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    _validate_ai_sources(resume, job)
    stage = "claim_preview"
    detail = "Failed to confirm resume. Please try again."
    claim: PreviewClaim | None = None
    try:
        improved_data = request.improved_data.model_dump()
        claim = await db.claim_preview(
            preview_id=request.preview_id,
            source_id=request.resume_id,
            job_id=request.job_id,
            payload_hash=_hash_improved_data(improved_data),
            lease_seconds=settings.request_timeout_seconds + 15,
        )
        if claim.response is not None:
            data = ImproveResumeData.model_validate(claim.response)
            await _auto_create_tracker_application(
                job_id=request.job_id, tailored_resume_id=data.resume_id,
                master_resume_id=request.resume_id, job=job, title=None,
            )
            return ImproveResumeResponse(request_id=data.request_id, data=data)

        feature_config = _load_config()
        language = get_content_language()

        try:
            original = _get_original_resume_data(resume)
            if original is None:
                raise ValueError("Original resume data is unavailable; process the source before preview")
            canonical = ResumeData.model_validate(
                finalize_ai_resume(original, improved_data, allow_appended_rows=True)
            ).model_dump()
            if canonical != improved_data:
                raise ValueError("Registered preview no longer satisfies preservation rules")
            _validate_confirm_payload(original, improved_data, allow_appended_rows=True)
        except ValueError as e:
            logger.warning("Resume confirm rejected: %s", e)
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            ) from e

        stage = "calculate_diff"
        response_warnings: list[str] = []
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume, improved_data
        )
        if diff_error:
            response_warnings.append(DIFF_UNAVAILABLE_WARNING)
        original_data = _get_original_resume_data(resume)
        if original_data:
            response_warnings.extend(
                grounding_review_warnings(original_data, improved_data)
            )

        # The durable claim lasts longer than the bounded external work. Other
        # workers return a retryable conflict instead of duplicating generation.
        stage = "generate_auxiliary_messages"
        cover_letter, outreach_message, title, interview_prep, aux_warnings = (
            await asyncio.wait_for(
                _generate_auxiliary_messages(
                    improved_data,
                    job["content"],
                    language,
                    feature_config.get("enable_cover_letter", False),
                    feature_config.get("enable_outreach_message", False),
                    feature_config.get("enable_interview_prep", False),
                ),
                timeout=remaining_timeout(),
            )
        )
        response_warnings.extend(aux_warnings)
        improved_text = json.dumps(improved_data, indent=2)
        request_id = str(uuid4())
        response = ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            job_id=request.job_id,
            resume_preview=request.improved_data,
            improvements=claim.improvements or [],
            markdownOriginal=resume["content"],
            markdownImproved=improved_text,
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            interview_prep=interview_prep,
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            warnings=response_warnings,
        )
        stage = "commit_confirmation"
        result = await db.complete_preview(
            claim=claim,
            resume_fields={
                "content": improved_text,
                "content_type": "json",
                "filename": f"tailored_{resume.get('filename', 'resume')}",
                "is_master": False,
                "parent_id": request.resume_id,
                "processed_data": improved_data,
                "processing_status": "ready",
                "cover_letter": cover_letter,
                "outreach_message": outreach_message,
                "interview_prep": _serialize_interview_prep(interview_prep),
                "title": title,
            },
            response_data=response.model_dump(mode="json"),
            improvements=claim.improvements or [],
        )
        claim = None  # The transaction committed; there is no lease to release.
        await _auto_create_tracker_application(
            job_id=request.job_id,
            tailored_resume_id=result["resume_id"],
            master_resume_id=request.resume_id,
            job=job,
            title=title,
        )
        data = ImproveResumeData.model_validate(result)
        return ImproveResumeResponse(request_id=data.request_id, data=data)
    except PreviewBusyError as e:
        raise HTTPException(
            status_code=409, detail=str(e), headers={"Retry-After": "1"}
        ) from e
    except PreviewConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except PreviewValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except asyncio.TimeoutError as e:
        logger.error(
            "Confirmation auxiliary generation timed out for preview %s",
            claim.preview_id if claim else None,
        )
        raise HTTPException(
            status_code=504, detail="Confirmation timed out. Please try again."
        ) from e
    except HTTPException:
        raise
    except (DatabaseBusyError, PromptSizeError):
        raise
    except Exception as e:
        _raise_improve_error("confirm", stage, e, detail)
    finally:
        if claim is not None and claim.token is not None:
            try:
                await asyncio.shield(db.release_preview_claim(claim))
            except Exception:
                logger.exception(
                    "Failed to release confirmation claim for %s", claim.preview_id
                )


@router.post("/improve", response_model=ImproveResumeResponse)
async def improve_resume_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Improve/tailor a resume for a specific job description.

    Uses LLM to analyze the job and generate an optimized resume version
    with improvement suggestions. Also generates cover letter and outreach
    message if enabled in feature configuration.
    Persists the tailored resume and returns a non-null resume_id.
    """
    # Fetch resume
    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Fetch job description
    job = await db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Load feature configuration and content language
    feature_config = _load_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    enable_interview_prep = feature_config.get("enable_interview_prep", False)
    _validate_ai_sources(resume, job)
    language = get_content_language()

    try:
        # Extract keywords from job description
        job_keywords = await extract_job_keywords(job["content"])

        # Generate improved resume in the configured language
        prompt_id = request.prompt_id or _get_default_prompt_id()

        original_resume_data = _get_original_resume_data(resume)
        # Collect warnings throughout the process
        response_warnings: list[str] = []
        allow_appended_rows = False

        # Diff-based improvement: generate targeted changes, apply with verification
        if original_resume_data:
            diff_result = await generate_resume_diffs(
                original_resume=resume["content"],
                job_description=job["content"],
                job_keywords=job_keywords,
                language=language,
                prompt_id=prompt_id,
                original_resume_data=original_resume_data,
            )

            improved_data, applied_changes, rejected_changes = apply_diffs(
                original=original_resume_data,
                changes=diff_result.changes,
            )
            allow_appended_rows = any(
                change.action == "append"
                for change in applied_changes
            )

            diff_warnings = verify_diff_result(
                original=original_resume_data,
                result=improved_data,
                applied_changes=applied_changes,
                job_keywords=job_keywords,
            )
            response_warnings.extend(diff_warnings)

            if rejected_changes:
                response_warnings.append(
                    f"{len(rejected_changes)} change(s) rejected during verification"
                )

            logger.info(
                "Diff-based improve (legacy): %d applied, %d rejected, %d warnings",
                len(applied_changes),
                len(rejected_changes),
                len(diff_warnings),
            )
        else:
            # Fallback to full-output mode when no structured data available
            improved_data = await improve_resume(
                original_resume=resume["content"],
                job_description=job["content"],
                job_keywords=job_keywords,
                language=language,
                prompt_id=prompt_id,
                original_resume_data=original_resume_data,
            )

        # Safety nets (defense in depth)
        improved_data, preserve_warnings = _preserve_personal_info(
            original_resume_data,
            improved_data,
        )
        response_warnings.extend(preserve_warnings)

        improved_data = _restore_original_dates(original_resume_data, improved_data)
        original_markdown = _get_original_markdown(resume)
        if original_markdown:
            improved_data = restore_dates_from_markdown(
                improved_data, original_markdown
            )
        improved_data = _preserve_original_skills(original_resume_data, improved_data)
        improved_data = _protect_custom_sections(original_resume_data, improved_data)

        # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
        refinement_stats: RefinementStats | None = None
        refinement_result = None
        refinement_attempted = False
        refinement_successful = False
        try:
            # Get master resume for alignment validation
            master_resume = await db.get_master_resume()
            master_data = (
                _get_original_resume_data(master_resume)
                if master_resume
                else _get_original_resume_data(resume)
            )
            if master_data:
                initial_match = calculate_keyword_match(improved_data, job_keywords)
                refinement_attempted = True
                refinement_result = await refine_resume(
                    initial_tailored=improved_data,
                    master_resume=master_data,
                    job_description=job["content"],
                    job_keywords=job_keywords,
                    config=RefinementConfig(),
                )
                improved_data = refinement_result.refined_data
                refinement_stats = refinement_result.to_stats(initial_match)
                refinement_successful = True
                logger.info(
                    "Refinement completed: %d passes, %d AI phrases removed",
                    refinement_result.passes_completed,
                    len(refinement_result.ai_phrases_removed),
                )
        except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning("Refinement failed, using unrefined result: %s", e)
            if refinement_attempted:
                response_warnings.append(REFINEMENT_FAILED_WARNING)

        if original_resume_data:
            improved_data = finalize_ai_resume(
                original_resume_data,
                improved_data,
                allow_review_claims=False,
                allow_appended_rows=allow_appended_rows,
            )
            response_warnings.extend(
                grounding_review_warnings(original_resume_data, improved_data)
            )
            if refinement_stats is not None and refinement_result is not None:
                refinement_stats = _finalized_refinement_stats(
                    refinement_stats,
                    refinement_result.keywords_applied,
                    improved_data,
                    job_keywords,
                )

        # Convert improved data to JSON string for storage
        improved_text = json.dumps(improved_data, indent=2)

        # Calculate differences between original and improved resume
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(DIFF_UNAVAILABLE_WARNING)

        # Generate improvement suggestions
        improvements = generate_improvements(job_keywords)

        # Generate cover letter, outreach message, and title in parallel if enabled
        (
            cover_letter,
            outreach_message,
            title,
            interview_prep,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            language,
            enable_cover_letter,
            enable_outreach,
            enable_interview_prep,
        )
        response_warnings.extend(aux_warnings)

        # Cancellation must leave both required records committed or neither.
        request_id = str(uuid4())
        tailored_resume = await db.create_tailored_resume(
            request_id=request_id,
            original_resume_id=request.resume_id,
            job_id=request.job_id,
            resume_fields={
                "content": improved_text,
                "content_type": "json",
                "filename": f"tailored_{resume.get('filename', 'resume')}",
                "is_master": False,
                "parent_id": request.resume_id,
                "processed_data": improved_data,
                "processing_status": "ready",
                "cover_letter": cover_letter,
                "outreach_message": outreach_message,
                "interview_prep": _serialize_interview_prep(interview_prep),
                "title": title,
            },
            improvements=improvements,
        )

        await _auto_create_tracker_application(
            job_id=request.job_id,
            tailored_resume_id=tailored_resume["resume_id"],
            master_resume_id=request.resume_id,
            job=job,
            title=title,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=ResumeData.model_validate(improved_data),
                improvements=[
                    {
                        "suggestion": imp["suggestion"],
                        "lineNumber": imp.get("lineNumber"),
                    }
                    for imp in improvements
                ],
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                interview_prep=interview_prep,
                # Diff metadata
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                refinement_stats=refinement_stats,
                ats_score=_build_ats_score(
                    improved_data,
                    job_keywords,
                    refinement_result,
                    refinement_successful,
                ),
                warnings=response_warnings,
                refinement_attempted=refinement_attempted,
                refinement_successful=refinement_successful,
            ),
        )

    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise

    except Exception as e:
        logger.error(f"Resume improvement failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to improve resume. Please try again.",
        )


@router.patch("/{resume_id}", response_model=ResumeFetchResponse)
async def update_resume_endpoint(
    resume_id: str, resume_data: ResumeData
) -> ResumeFetchResponse:
    """Update a resume with new structured data."""
    existing = await db.get_resume(resume_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    updated_data = resume_data.model_dump()
    updated_content = json.dumps(updated_data, indent=2)

    updated = await db.update_resume(
        resume_id,
        {
            "content": updated_content,
            "content_type": "json",
            "processed_data": updated_data,
            "processing_status": "ready",
        },
    )

    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update resume")

    raw_resume = RawResume(
        id=None,
        content=updated["content"],
        content_type=updated["content_type"],
        created_at=updated["created_at"],
        processing_status=updated.get("processing_status", "pending"),
    )

    processed_resume = (
        ResumeData.model_validate(updated.get("processed_data"))
        if updated.get("processed_data")
        else None
    )

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=updated.get("cover_letter"),
            outreach_message=updated.get("outreach_message"),
            interview_prep=_parse_interview_prep(
                updated.get("interview_prep"),
                resume_id=resume_id,
            ),
            parent_id=updated.get("parent_id"),
            title=updated.get("title"),
        ),
    )


@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    marginTop: int = Query(10, ge=5, le=25),
    marginBottom: int = Query(10, ge=5, le=25),
    marginLeft: int = Query(10, ge=5, le=25),
    marginRight: int = Query(10, ge=5, le=25),
    sectionSpacing: int = Query(3, ge=1, le=5),
    itemSpacing: int = Query(2, ge=1, le=5),
    lineHeight: int = Query(3, ge=1, le=5),
    fontSize: int = Query(3, ge=1, le=5),
    headerScale: int = Query(3, ge=1, le=5),
    headerFont: str = Query("serif", pattern="^(serif|sans-serif|mono)$"),
    bodyFont: str = Query("sans-serif", pattern="^(serif|sans-serif|mono)$"),
    compactMode: bool = Query(False),
    showContactIcons: bool = Query(False),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
) -> Response:
    """Generate a PDF for a resume using headless Chromium.

    Accepts template settings for customization:
    - template: swiss-single, swiss-two-column, modern, modern-two-column, latex, clean, or vivid
    - pageSize: A4 or LETTER
    - marginTop/Bottom/Left/Right: page margins in mm (5-25)
    - sectionSpacing: gap between sections (1-5)
    - itemSpacing: gap between items (1-5)
    - lineHeight: text line height (1-5)
    - fontSize: base font size (1-5)
    - headerScale: header size scale (1-5)
    - headerFont: serif, sans-serif, or mono
    - bodyFont: serif, sans-serif, or mono
    - compactMode: enable tighter spacing
    - showContactIcons: show icons in contact info
    - lang: locale used for print page translations
    """
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Build print URL with all settings
    params = (
        f"template={template}"
        f"&pageSize={pageSize}"
        f"&marginTop={marginTop}"
        f"&marginBottom={marginBottom}"
        f"&marginLeft={marginLeft}"
        f"&marginRight={marginRight}"
        f"&sectionSpacing={sectionSpacing}"
        f"&itemSpacing={itemSpacing}"
        f"&lineHeight={lineHeight}"
        f"&fontSize={fontSize}"
        f"&headerScale={headerScale}"
        f"&headerFont={headerFont}"
        f"&bodyFont={bodyFont}"
        f"&compactMode={str(compactMode).lower()}"
        f"&showContactIcons={str(showContactIcons).lower()}"
        f"&accentColor={accentColor}"
    )
    if lang:
        params = f"{params}&lang={lang}"
    url = f"{settings.frontend_base_url}/print/resumes/{resume_id}?{params}"

    # Use the exact margins provided; compact mode only affects spacing.
    pdf_margins = {
        "top": marginTop,
        "right": marginRight,
        "bottom": marginBottom,
        "left": marginLeft,
    }

    # Render PDF with margins applied to every page
    try:
        pdf_bytes = await render_resume_pdf(url, pageSize, margins=pdf_margins)
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {"Content-Disposition": f'attachment; filename="resume_{resume_id}.pdf"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str) -> dict:
    """Delete a resume by ID."""
    if not await db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}


@router.post("/{resume_id}/retry-processing", response_model=ResumeUploadResponse)
async def retry_processing(resume_id: str) -> ResumeUploadResponse:
    """Retry AI processing for a failed or stuck resume.

    Re-runs parse_resume_to_json() on the stored markdown content.
    Works for failed/in-progress resumes and legacy ``ready`` records whose
    structured data is empty due to an earlier parser false positive.
    """
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    status = resume.get("processing_status")
    can_retry_legacy_empty_ready = (
        status == "ready"
        and not has_meaningful_resume_content(resume.get("processed_data") or {})
    )
    if status not in ("failed", "processing") and not can_retry_legacy_empty_ready:
        raise HTTPException(
            status_code=400,
            detail="Only failed, processing, or empty legacy resumes can be retried.",
        )

    markdown_content = resume.get("content", "")
    if not markdown_content:
        raise HTTPException(
            status_code=400,
            detail="Resume has no stored content to re-process.",
        )

    require_source_size(markdown_content)
    allow_ready_at = resume.get("updated_at") if can_retry_legacy_empty_ready else None
    try:
        processing_token = await _claim_processing(
            resume_id,
            allow_ready_at=allow_ready_at,
        )
    except ResumeNotFoundError as e:
        raise HTTPException(
            status_code=404, detail="Resume was deleted during retry."
        ) from e
    if processing_token is None:
        raise HTTPException(
            status_code=409,
            detail="Resume processing was superseded by a newer attempt.",
        )

    try:
        try:
            processed_data = await parse_resume_to_json(markdown_content)
        except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
            raise
        except Exception as e:
            logger.warning(f"Retry processing failed for resume {resume_id}: {e}")
            outcome = await db.finish_resume_processing(
                resume_id,
                processing_token,
                processing_status="failed",
            )
            _require_processing_commit(
                outcome,
                deleted_detail="Resume was deleted during retry.",
            )
            return ResumeUploadResponse(
                message="Retry processing failed",
                request_id=str(uuid4()),
                resume_id=resume_id,
                processing_status="failed",
                is_master=resume.get("is_master", False),
            )
        else:
            outcome = await db.finish_resume_processing(
                resume_id,
                processing_token,
                processing_status="ready",
                processed_data=processed_data,
            )
            _require_processing_commit(
                outcome,
                deleted_detail="Resume was deleted during retry.",
            )
            return ResumeUploadResponse(
                message="Resume processing succeeded on retry",
                request_id=str(uuid4()),
                resume_id=resume_id,
                processing_status="ready",
                is_master=resume.get("is_master", False),
            )
    except (
        asyncio.CancelledError,
        AIOperationDeadlineExceeded,
        PromptSizeError,
        DatabaseBusyError,
    ):
        await _finish_cancelled_processing(resume_id, processing_token)
        raise


@router.patch("/{resume_id}/cover-letter")
async def update_cover_letter(
    resume_id: str, request: UpdateCoverLetterRequest
) -> dict:
    """Update the cover letter for a resume."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    await db.update_resume(resume_id, {"cover_letter": request.content})
    return {"message": "Cover letter updated successfully"}


@router.patch("/{resume_id}/outreach-message")
async def update_outreach_message(
    resume_id: str, request: UpdateOutreachMessageRequest
) -> dict:
    """Update the outreach message for a resume."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    await db.update_resume(resume_id, {"outreach_message": request.content})
    return {"message": "Outreach message updated successfully"}


@router.patch("/{resume_id}/title")
async def update_title(resume_id: str, request: UpdateTitleRequest) -> dict:
    """Update the title for a resume."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    title = request.title.strip()[:80]
    await db.update_resume(resume_id, {"title": title})
    return {"message": "Title updated successfully"}


@router.post(
    "/{resume_id}/generate-cover-letter", response_model=GenerateContentResponse
)
async def generate_cover_letter_endpoint(resume_id: str) -> GenerateContentResponse:
    """Generate a cover letter on-demand for an existing tailored resume.

    This endpoint allows users to generate a cover letter after a resume has been
    tailored, without needing to re-tailor the entire resume. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Cover letter can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = await db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    _validate_ai_sources(resume, job)
    language = get_content_language()

    # Generate cover letter
    try:
        cover_letter_content = await generate_cover_letter(
            resume_data, job["content"], language
        )
    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.error(f"Cover letter generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate cover letter. Please try again.",
        )

    # Save to resume record
    await db.update_resume(resume_id, {"cover_letter": cover_letter_content})

    return GenerateContentResponse(
        content=cover_letter_content,
        message="Cover letter generated successfully",
    )


@router.post("/{resume_id}/generate-outreach", response_model=GenerateContentResponse)
async def generate_outreach_endpoint(resume_id: str) -> GenerateContentResponse:
    """Generate an outreach message on-demand for an existing tailored resume.

    This endpoint allows users to generate a cold outreach message after a resume
    has been tailored. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Outreach message can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = await db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    _validate_ai_sources(resume, job)
    language = get_content_language()

    # Generate outreach message
    try:
        outreach_content = await generate_outreach_message(
            resume_data, job["content"], language
        )
    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.error(f"Outreach message generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate outreach message. Please try again.",
        )

    # Save to resume record
    await db.update_resume(resume_id, {"outreach_message": outreach_content})

    return GenerateContentResponse(
        content=outreach_content,
        message="Outreach message generated successfully",
    )


@router.post(
    "/{resume_id}/generate-interview-prep",
    response_model=GenerateInterviewPrepResponse,
)
async def generate_interview_prep_endpoint(
    resume_id: str,
) -> GenerateInterviewPrepResponse:
    """Generate interview preparation on-demand for an existing tailored resume."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Interview preparation can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    job = await db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    _validate_ai_sources(resume, job)
    language = get_content_language()

    try:
        interview_prep = await generate_interview_prep(
            resume_data,
            job["content"],
            language,
        )
    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except Exception as e:
        logger.exception("Interview preparation generation failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate interview preparation. Please try again.",
        )

    await db.update_resume(
        resume_id,
        {"interview_prep": _serialize_interview_prep(interview_prep)},
    )

    return GenerateInterviewPrepResponse(
        interview_prep=interview_prep,
        message="Interview preparation generated successfully",
    )


@router.get("/{resume_id}/job-description")
async def get_job_description_for_resume(resume_id: str) -> dict:
    """Get the job description used to tailor this resume.

    This endpoint retrieves the original job description that was used
    to tailor a resume. Only works for tailored resumes (those with parent_id).
    """
    # Get the resume
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Job description is only available for tailored resumes.",
        )

    # Get improvement record to find the job_id
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = await db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    return {
        "job_id": job["job_id"],
        "content": job["content"],
    }


@router.get("/{resume_id}/cover-letter/pdf")
async def download_cover_letter_pdf(
    resume_id: str,
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
) -> Response:
    """Generate a PDF for a cover letter using headless Chromium.

    Args:
        resume_id: The ID of the resume containing the cover letter
        pageSize: A4 or LETTER
        lang: locale used for print page translations
    """
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    cover_letter = resume.get("cover_letter")
    if not cover_letter:
        raise HTTPException(
            status_code=404, detail="No cover letter found for this resume"
        )

    # Build print URL (same pattern as resume PDF)
    url = f"{settings.frontend_base_url}/print/cover-letter/{resume_id}?pageSize={pageSize}"
    if lang:
        url = f"{url}&lang={lang}"

    # Render PDF with cover letter selector
    try:
        pdf_bytes = await render_resume_pdf(
            url, pageSize, selector=".cover-letter-print"
        )
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {
        "Content-Disposition": f'attachment; filename="cover_letter_{resume_id}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
