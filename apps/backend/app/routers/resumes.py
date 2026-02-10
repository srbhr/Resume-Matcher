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

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from app.database import db
from app.pdf import render_resume_pdf, PDFRenderError
from app.config import settings

logger = logging.getLogger(__name__)
from app.schemas import (
    GenerateContentResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
    ImproveResumeData,
    RefinementStats,
    ResumeDiffSummary,
    ResumeFieldDiff,
    ResumeData,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeListResponse,
    ResumeSummary,
    ResumeUploadResponse,
    ResumeMetaUpdateRequest,
    ResumeMetaResponse,
    ResumeKanbanBulkUpdateRequest,
    RawResume,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    normalize_resume_data,
)
from app.services.parser import parse_document, parse_resume_to_json
from app.services.improver import (
    extract_job_keywords,
    generate_improvements,
    improve_resume,
)
from app.services.refiner import refine_resume, calculate_keyword_match
from app.schemas.refinement import RefinementConfig
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
    generate_resume_title,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS


def _load_config() -> dict:
    """Load configuration from config file."""
    config_path = settings.config_path
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load config: %s", e)
        return {}


def _load_feature_config() -> dict:
    """Load feature configuration from config file."""
    return _load_config()


def _get_content_language() -> str:
    """Get configured content language from config file."""
    config = _load_config()
    # Use content_language, fall back to legacy 'language' field, then default to 'en'
    return config.get("content_language", config.get("language", "en"))


def _get_default_prompt_id() -> str:
    """Get configured default prompt id from config file."""
    config = _load_config()
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    prompt_id = config.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    return prompt_id if prompt_id in option_ids else DEFAULT_IMPROVE_PROMPT_ID


KANBAN_DEFAULT_COLUMNS = [
    {"id": "applied", "label": "Applied", "order": 1},
    {"id": "interviewing", "label": "Interviewing", "order": 2},
    {"id": "offer", "label": "Offer", "order": 3},
    {"id": "rejected", "label": "Rejected", "order": 4},
    {"id": "archived", "label": "Archived", "order": 5},
]


def _get_kanban_columns() -> list[dict]:
    config = _load_config()
    raw = config.get("kanban", {}).get("columns")
    if not raw:
        return KANBAN_DEFAULT_COLUMNS
    columns = []
    seen: set[str] = set()
    for idx, col in enumerate(raw, start=1):
        col_id = str(col.get("id", "")).strip()
        label = str(col.get("label", "")).strip()
        if not col_id or not label or col_id in seen:
            continue
        seen.add(col_id)
        columns.append({"id": col_id, "label": label, "order": idx})
    return columns or KANBAN_DEFAULT_COLUMNS


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


def _hash_improved_data(data: dict[str, Any]) -> str:
    """Hash canonicalized improved data for preview/confirm validation."""
    normalized = _normalize_payload(data)
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


def _get_original_resume_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    original_data = resume.get("processed_data")
    if not original_data and resume.get("content_type") == "json":
        try:
            original_data = json.loads(resume["content"])
        except json.JSONDecodeError as e:
            logger.warning("Skipping resume diff due to JSON parse failure: %s", e)
    return original_data


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
        return None, None, f"calculation_error: {str(e)}"


def _validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
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


async def _generate_auxiliary_messages(
    improved_data: dict[str, Any],
    job_content: str,
    language: str,
    enable_cover_letter: bool,
    enable_outreach: bool,
) -> tuple[str | None, str | None, str | None, list[str]]:
    """Generate cover letter, outreach message, and resume title.

    Returns (cover_letter, outreach_message, title, warnings).
    """
    cover_letter = None
    outreach_message = None
    title = None
    warnings: list[str] = []
    generation_tasks: list[Awaitable[str]] = []
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

    results = await asyncio.gather(*generation_tasks, return_exceptions=True)
    for label, result in zip(task_labels, results):
        if isinstance(result, Exception):
            logger.warning(
                "%s generation failed: %s",
                label,
                result,
                exc_info=result,
            )
            if label != "title":
                warnings.append(f"{label.replace('_', ' ').title()} generation failed")
        else:
            if label == "title":
                title = result
            elif label == "cover_letter":
                cover_letter = result
            elif label == "outreach":
                outreach_message = result

    return cover_letter, outreach_message, title, warnings


router = APIRouter(prefix="/resumes", tags=["Resumes"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(file: UploadFile = File(...)) -> ResumeUploadResponse:
    """Upload and process a resume file (PDF/DOCX).

    Converts the file to Markdown and stores it in the database.
    Optionally parses to structured JSON if LLM is configured.
    """
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: PDF, DOC, DOCX",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to markdown
    try:
        markdown_content = await parse_document(content, file.filename or "resume.pdf")
    except Exception as e:
        logger.error(f"Document parsing failed: {e}")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please ensure it's a valid PDF or DOCX file.",
        )

    # Store in database first with "processing" status (atomic master assignment)
    resume = await db.create_resume_atomic_master(
        content=markdown_content,
        content_type="md",
        filename=file.filename,
        processed_data=None,
        processing_status="processing",
    )

    # Try to parse to structured JSON (optional, may fail if LLM not configured)
    try:
        processed_data = await parse_resume_to_json(markdown_content)
        db.update_resume(
            resume["resume_id"],
            {
                "processed_data": processed_data,
                "processing_status": "ready",
            },
        )
        resume["processed_data"] = processed_data
        resume["processing_status"] = "ready"
    except Exception as e:
        # LLM parsing failed, update status to failed
        logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
        db.update_resume(resume["resume_id"], {"processing_status": "failed"})
        resume["processing_status"] = "failed"

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


@router.get("", response_model=ResumeFetchResponse)
async def get_resume(resume_id: str = Query(...)) -> ResumeFetchResponse:
    """Fetch resume details by ID.

    Returns both raw markdown and structured data (if available),
    plus cover letter and outreach message if they exist.
    Applies lazy migration for section metadata if needed.
    """
    resume = db.get_resume(resume_id)

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
            title=resume.get("title"),
            filename=resume.get("filename"),
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=resume.get("cover_letter"),
            outreach_message=resume.get("outreach_message"),
            parent_id=resume.get("parent_id"),
            kanban_column_id=resume.get("kanban_column_id"),
            kanban_order=resume.get("kanban_order"),
            tags=resume.get("tags"),
        ),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(include_master: bool = Query(False)) -> ResumeListResponse:
    """List resumes, optionally including the master resume."""
    kanban_columns = _get_kanban_columns()
    kanban_ids = {col["id"] for col in kanban_columns}
    default_column_id = kanban_columns[0]["id"]
    resumes = db.list_resumes()
    if not include_master:
        resumes = [resume for resume in resumes if not resume.get("is_master", False)]

    resumes.sort(key=lambda item: item.get("updated_at", ""), reverse=True)

    updates: list[tuple[str, dict]] = []
    order_counter: dict[str, int] = {}
    summaries = []
    for resume in resumes:
        column_id = resume.get("kanban_column_id")
        kanban_order = resume.get("kanban_order")
        if not resume.get("is_master") and resume.get("parent_id"):
            if not column_id or column_id not in kanban_ids:
                column_id = default_column_id
            order_counter[column_id] = order_counter.get(column_id, 0) + 1
            if kanban_order is None:
                kanban_order = order_counter[column_id]

        summaries.append(
            ResumeSummary(
                resume_id=resume["resume_id"],
                title=resume.get("title"),
                filename=resume.get("filename"),
                is_master=resume.get("is_master", False),
                parent_id=resume.get("parent_id"),
                processing_status=resume.get("processing_status", "pending"),
                created_at=resume.get("created_at", ""),
                updated_at=resume.get("updated_at", ""),
                kanban_column_id=column_id,
                kanban_order=kanban_order,
                tags=resume.get("tags"),
            )
        )

        if resume.get("is_master") or not resume.get("parent_id"):
            continue
        if (
            column_id != resume.get("kanban_column_id")
            or kanban_order != resume.get("kanban_order")
        ):
            updates.append(
                (
                    resume["resume_id"],
                    {"kanban_column_id": column_id, "kanban_order": kanban_order},
                )
            )

    for resume_id, payload in updates:
        try:
            db.update_resume(resume_id, payload)
        except Exception:
            logger.warning("Failed to update kanban metadata for resume %s", resume_id)

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


@router.post("/improve/preview", response_model=ImproveResumeResponse)
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Preview a tailored resume without persisting it.

    The response includes resume_preview data but leaves resume_id null.
    """
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = _get_content_language()
    prompt_id = request.prompt_id or _get_default_prompt_id()

    stage = "load_job_keywords"
    detail = "Failed to preview resume. Please try again."
    try:
        job_keywords = job.get("job_keywords")
        job_keywords_hash = job.get("job_keywords_hash")
        content_hash = _hash_job_content(job["content"])
        if not job_keywords or job_keywords_hash != content_hash:
            stage = "extract_job_keywords"
            job_keywords = await extract_job_keywords(job["content"])
            stage = "persist_job_keywords"
            # Cache extracted keywords with a content hash for basic invalidation.
            try:
                updated_job = db.update_job(
                    request.job_id,
                    {"job_keywords": job_keywords, "job_keywords_hash": content_hash},
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
        stage = "improve_resume"
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
        )
        # Collect warnings throughout the process
        response_warnings: list[str] = []

        improved_data, preserve_warnings = _preserve_personal_info(
            _get_original_resume_data(resume),
            improved_data,
        )
        response_warnings.extend(preserve_warnings)

        # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
        stage = "refine_resume"
        refinement_stats: RefinementStats | None = None
        refinement_attempted = False
        refinement_successful = False
        try:
            # Get master resume for alignment validation
            master_resume = db.get_master_resume()
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
                refinement_stats = RefinementStats(
                    passes_completed=refinement_result.passes_completed,
                    keywords_injected=(
                        len(refinement_result.keyword_analysis.injectable_keywords)
                        if refinement_result.keyword_analysis
                        else 0
                    ),
                    ai_phrases_removed=refinement_result.ai_phrases_removed,
                    alignment_violations_fixed=(
                        len(
                            [
                                v
                                for v in refinement_result.alignment_report.violations
                                if v.severity == "critical"
                            ]
                        )
                        if refinement_result.alignment_report
                        else 0
                    ),
                    initial_match_percentage=initial_match,
                    final_match_percentage=refinement_result.final_match_percentage,
                )
                refinement_successful = True
                logger.info(
                    "Refinement completed: %d passes, %d AI phrases removed",
                    refinement_result.passes_completed,
                    len(refinement_result.ai_phrases_removed),
                )
        except Exception as e:
            logger.warning("Refinement failed, using unrefined result: %s", e)
            if refinement_attempted:
                response_warnings.append(f"Refinement failed: {str(e)}")

        improved_text = json.dumps(improved_data, indent=2)
        preview_hash = _hash_improved_data(improved_data)
        preview_hashes = job.get("preview_hashes")
        if not isinstance(preview_hashes, dict):
            preview_hashes = {}
        preview_hashes[prompt_id] = preview_hash
        # NOTE: preview_hashes updates are last-write-wins; concurrent previews can race.
        try:
            updated_job = db.update_job(
                request.job_id,
                {
                    "preview_hash": preview_hash,
                    "preview_prompt_id": prompt_id,
                    "preview_hashes": preview_hashes,
                },
            )
            if not updated_job:
                logger.warning(
                    "Failed to persist preview hash for job %s.", request.job_id
                )
        except Exception as e:
            logger.warning(
                "Failed to persist preview hash for job %s: %s", request.job_id, e
            )
        stage = "calculate_diff"
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")
        stage = "generate_improvements"
        improvements = generate_improvements(job_keywords)

        request_id = str(uuid4())
        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=None,
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
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                refinement_stats=refinement_stats,
                warnings=response_warnings,
                refinement_attempted=refinement_attempted,
                refinement_successful=refinement_successful,
            ),
        )
    except Exception as e:
        _raise_improve_error("preview", stage, e, detail)


@router.post("/improve/confirm", response_model=ImproveResumeResponse)
async def improve_resume_confirm_endpoint(
    request: ImproveResumeConfirmRequest,
) -> ImproveResumeResponse:
    """Confirm and persist a tailored resume."""
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    feature_config = _load_feature_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = _get_content_language()

    stage = "serialize_improved_data"
    detail = "Failed to confirm resume. Please try again."
    try:
        improved_data = request.improved_data.model_dump()
        improved_text = json.dumps(improved_data, indent=2)
        # NOTE: This endpoint relies on preview-hash validation to ensure the payload matches a prior preview.
        # Stronger guarantees would require server-side preview storage or re-running the improvement.
        try:
            _validate_confirm_payload(_get_original_resume_data(resume), improved_data)
        except ValueError as e:
            logger.warning("Resume confirm rejected: %s", e)
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )
        preview_hashes = job.get("preview_hashes")
        allowed_hashes: set[str] = set()
        if isinstance(preview_hashes, dict):
            allowed_hashes.update(preview_hashes.values())
        elif isinstance(preview_hashes, list):
            allowed_hashes.update(
                [value for value in preview_hashes if isinstance(value, str)]
            )
        else:
            preview_hash = job.get("preview_hash")
            if isinstance(preview_hash, str):
                allowed_hashes.add(preview_hash)

        if not allowed_hashes:
            logger.warning(
                "Rejecting confirm; preview hash missing for job %s.",
                request.job_id,
            )
            raise HTTPException(
                status_code=400,
                detail="Preview required before confirmation. Please retry preview.",
            )

        request_hash = _hash_improved_data(improved_data)
        if request_hash not in allowed_hashes:
            logger.warning("Resume confirm rejected due to preview hash mismatch.")
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )

        stage = "calculate_diff"
        response_warnings: list[str] = []
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        stage = "generate_auxiliary_messages"
        (
            cover_letter,
            outreach_message,
            title,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            language,
            enable_cover_letter,
            enable_outreach,
        )
        response_warnings.extend(aux_warnings)

        stage = "create_resume"
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title or resume.get("title") or resume.get("filename"),
        )

        improvements_payload = [imp.model_dump() for imp in request.improvements]
        stage = "create_improvement"
        request_id = str(uuid4())
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements_payload,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=request.improved_data,
                improvements=request.improvements,
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                warnings=response_warnings,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        _raise_improve_error("confirm", stage, e, detail)


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
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Fetch job description
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Load feature configuration and content language
    feature_config = _load_feature_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = _get_content_language()

    try:
        # Extract keywords from job description
        job_keywords = await extract_job_keywords(job["content"])

        # Generate improved resume in the configured language
        prompt_id = request.prompt_id or _get_default_prompt_id()

        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
        )
        # Collect warnings throughout the process
        response_warnings: list[str] = []

        improved_data, preserve_warnings = _preserve_personal_info(
            _get_original_resume_data(resume),
            improved_data,
        )
        response_warnings.extend(preserve_warnings)

        # Multi-pass refinement: keyword injection, AI phrase removal, alignment validation
        refinement_stats: RefinementStats | None = None
        refinement_attempted = False
        refinement_successful = False
        try:
            # Get master resume for alignment validation
            master_resume = db.get_master_resume()
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
                refinement_stats = RefinementStats(
                    passes_completed=refinement_result.passes_completed,
                    keywords_injected=(
                        len(refinement_result.keyword_analysis.injectable_keywords)
                        if refinement_result.keyword_analysis
                        else 0
                    ),
                    ai_phrases_removed=refinement_result.ai_phrases_removed,
                    alignment_violations_fixed=(
                        len(
                            [
                                v
                                for v in refinement_result.alignment_report.violations
                                if v.severity == "critical"
                            ]
                        )
                        if refinement_result.alignment_report
                        else 0
                    ),
                    initial_match_percentage=initial_match,
                    final_match_percentage=refinement_result.final_match_percentage,
                )
                refinement_successful = True
                logger.info(
                    "Refinement completed: %d passes, %d AI phrases removed",
                    refinement_result.passes_completed,
                    len(refinement_result.ai_phrases_removed),
                )
        except Exception as e:
            logger.warning("Refinement failed, using unrefined result: %s", e)
            if refinement_attempted:
                response_warnings.append(f"Refinement failed: {str(e)}")

        # Convert improved data to JSON string for storage
        improved_text = json.dumps(improved_data, indent=2)

        # Calculate differences between original and improved resume
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        # Generate improvement suggestions
        improvements = generate_improvements(job_keywords)

        # Generate cover letter, outreach message, and title in parallel if enabled
        (
            cover_letter,
            outreach_message,
            title,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            language,
            enable_cover_letter,
            enable_outreach,
        )
        response_warnings.extend(aux_warnings)

        # Store the tailored resume with cover letter, outreach message, and title
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title or resume.get("title") or resume.get("filename"),
        )

        # Store improvement record
        request_id = str(uuid4())
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements,
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
                # Diff metadata
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                refinement_stats=refinement_stats,
                warnings=response_warnings,
                refinement_attempted=refinement_attempted,
                refinement_successful=refinement_successful,
            ),
        )

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
    existing = db.get_resume(resume_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    updated_data = resume_data.model_dump()
    updated_content = json.dumps(updated_data, indent=2)

    updated = db.update_resume(
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
        ),
    )


@router.patch("/{resume_id}/meta", response_model=ResumeMetaResponse)
async def update_resume_meta(
    resume_id: str, request: ResumeMetaUpdateRequest
) -> ResumeMetaResponse:
    """Update resume metadata (e.g., filename)."""
    existing = db.get_resume(resume_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    updates: dict[str, Any] = {}
    kanban_columns = _get_kanban_columns()
    kanban_ids = {col["id"] for col in kanban_columns}

    if request.filename is not None:
        filename = request.filename.strip()
        if not filename:
            raise HTTPException(status_code=422, detail="Filename cannot be empty")
        if len(filename) > 120:
            raise HTTPException(status_code=422, detail="Filename too long (max 120 chars)")
        updates["filename"] = filename

    if request.title is not None:
        title = request.title.strip()
        if not title:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
        if len(title) > 120:
            raise HTTPException(status_code=422, detail="Title too long (max 120 chars)")
        updates["title"] = title

    if request.kanban_column_id is not None:
        column_id = request.kanban_column_id.strip()
        if not column_id:
            raise HTTPException(status_code=422, detail="Kanban column id cannot be empty")
        if column_id not in kanban_ids:
            raise HTTPException(status_code=422, detail="Unknown kanban column id")
        updates["kanban_column_id"] = column_id

    if request.kanban_order is not None:
        updates["kanban_order"] = request.kanban_order

    if request.tags is not None:
        tags: list[str] = []
        seen: set[str] = set()
        for raw in request.tags:
            tag = str(raw).strip()
            if not tag:
                continue
            if len(tag) > 40:
                raise HTTPException(status_code=422, detail="Tag too long (max 40 chars)")
            lower = tag.lower()
            if lower in seen:
                continue
            seen.add(lower)
            tags.append(lower)
        if len(tags) > 10:
            raise HTTPException(status_code=422, detail="Too many tags (max 10)")
        updates["tags"] = tags

    if not updates:
        raise HTTPException(status_code=422, detail="No metadata fields provided")

    updated = db.update_resume(resume_id, updates)

    summary = ResumeSummary(
        resume_id=updated["resume_id"],
        title=updated.get("title"),
        filename=updated.get("filename"),
        is_master=updated.get("is_master", False),
        parent_id=updated.get("parent_id"),
        processing_status=updated.get("processing_status", "pending"),
        created_at=updated.get("created_at"),
        updated_at=updated.get("updated_at"),
        kanban_column_id=updated.get("kanban_column_id"),
        kanban_order=updated.get("kanban_order"),
        tags=updated.get("tags"),
    )

    return ResumeMetaResponse(request_id=str(uuid4()), data=summary)


@router.patch("/kanban", response_model=ResumeListResponse)
async def update_kanban_positions(
    request: ResumeKanbanBulkUpdateRequest,
) -> ResumeListResponse:
    """Bulk update kanban positions."""
    kanban_columns = _get_kanban_columns()
    kanban_ids = {col["id"] for col in kanban_columns}

    if not request.moves:
        raise HTTPException(status_code=422, detail="No kanban moves provided")

    resumes_by_id: dict[str, dict] = {}
    for resume in db.list_resumes():
        stored_id = str(resume.get("resume_id", "")).strip()
        if not stored_id:
            continue
        resumes_by_id[stored_id] = resume
        resumes_by_id[stored_id.lower()] = resume

    def resolve_resume(raw_id: str) -> dict | None:
        candidate = str(raw_id).strip()
        if not candidate:
            return None
        if candidate.startswith("drop:"):
            candidate = candidate.replace("drop:", "", 1).strip()
        return resumes_by_id.get(candidate) or resumes_by_id.get(candidate.lower())

    summaries: list[ResumeSummary] = []
    for move in request.moves:
        if move.kanban_column_id not in kanban_ids:
            raise HTTPException(status_code=422, detail="Unknown kanban column id")
        resume = resolve_resume(move.resume_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        if resume.get("is_master"):
            raise HTTPException(status_code=422, detail="Master resume cannot be moved")

        updated = db.update_resume(
            resume["resume_id"],
            {
                "kanban_column_id": move.kanban_column_id,
                "kanban_order": move.kanban_order,
            },
        )
        summaries.append(
            ResumeSummary(
                resume_id=updated["resume_id"],
                title=updated.get("title"),
                filename=updated.get("filename"),
                is_master=updated.get("is_master", False),
                parent_id=updated.get("parent_id"),
                processing_status=updated.get("processing_status", "pending"),
                created_at=updated.get("created_at"),
                updated_at=updated.get("updated_at"),
                kanban_column_id=updated.get("kanban_column_id"),
                kanban_order=updated.get("kanban_order"),
                tags=updated.get("tags"),
            )
        )

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


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
    - template: swiss-single, swiss-two-column, modern, or modern-two-column
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
    resume = db.get_resume(resume_id)
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
    if not db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}


@router.post("/{resume_id}/retry-processing", response_model=ResumeUploadResponse)
async def retry_processing(resume_id: str) -> ResumeUploadResponse:
    """Retry AI processing for a failed resume.

    Re-runs parse_resume_to_json() on the stored markdown content.
    Only works for resumes with processing_status == "failed".
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.get("processing_status") != "failed":
        raise HTTPException(
            status_code=400,
            detail="Only resumes with 'failed' processing status can be retried.",
        )

    markdown_content = resume.get("content", "")
    if not markdown_content:
        raise HTTPException(
            status_code=400,
            detail="Resume has no stored content to re-process.",
        )

    try:
        processed_data = await parse_resume_to_json(markdown_content)
        db.update_resume(
            resume_id,
            {
                "processed_data": processed_data,
                "processing_status": "ready",
            },
        )
        return ResumeUploadResponse(
            message="Resume processing succeeded on retry",
            request_id=str(uuid4()),
            resume_id=resume_id,
            processing_status="ready",
            is_master=resume.get("is_master", False),
        )
    except Exception as e:
        logger.warning(f"Retry processing failed for resume {resume_id}: {e}")
        db.update_resume(resume_id, {"processing_status": "failed"})
        return ResumeUploadResponse(
            message="Retry processing failed",
            request_id=str(uuid4()),
            resume_id=resume_id,
            processing_status="failed",
            is_master=resume.get("is_master", False),
        )


@router.patch("/{resume_id}/cover-letter")
async def update_cover_letter(
    resume_id: str, request: UpdateCoverLetterRequest
) -> dict:
    """Update the cover letter for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"cover_letter": request.content})
    return {"message": "Cover letter updated successfully"}


@router.patch("/{resume_id}/outreach-message")
async def update_outreach_message(
    resume_id: str, request: UpdateOutreachMessageRequest
) -> dict:
    """Update the outreach message for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"outreach_message": request.content})
    return {"message": "Outreach message updated successfully"}


@router.patch("/{resume_id}/title")
async def update_title(resume_id: str, request: UpdateTitleRequest) -> dict:
    """Update the title for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    title = request.title.strip()[:80]
    db.update_resume(resume_id, {"title": title})
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
    resume = db.get_resume(resume_id)
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
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
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
    language = _get_content_language()

    # Generate cover letter
    try:
        cover_letter_content = await generate_cover_letter(
            resume_data, job["content"], language
        )
    except Exception as e:
        logger.error(f"Cover letter generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate cover letter. Please try again.",
        )

    # Save to resume record
    db.update_resume(resume_id, {"cover_letter": cover_letter_content})

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
    resume = db.get_resume(resume_id)
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
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
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
    language = _get_content_language()

    # Generate outreach message
    try:
        outreach_content = await generate_outreach_message(
            resume_data, job["content"], language
        )
    except Exception as e:
        logger.error(f"Outreach message generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate outreach message. Please try again.",
        )

    # Save to resume record
    db.update_resume(resume_id, {"outreach_message": outreach_content})

    return GenerateContentResponse(
        content=outreach_content,
        message="Outreach message generated successfully",
    )


@router.get("/{resume_id}/job-description")
async def get_job_description_for_resume(resume_id: str) -> dict:
    """Get the job description used to tailor this resume.

    This endpoint retrieves the original job description that was used
    to tailor a resume. Only works for tailored resumes (those with parent_id).
    """
    # Get the resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Job description is only available for tailored resumes.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
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
    resume = db.get_resume(resume_id)
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
