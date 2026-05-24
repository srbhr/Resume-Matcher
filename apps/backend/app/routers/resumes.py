"""Resume management endpoints."""

import asyncio
import copy
import hashlib
import json
import logging
import unicodedata
from collections.abc import AsyncGenerator, Awaitable
from pathlib import Path
from typing import Any, NoReturn
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse

from app.config_cache import get_content_language, load_config as _load_config
from app.database import db
from app.pdf import render_resume_pdf, PDFRenderError, add_qr_code_to_pdf
from app.config import settings

logger = logging.getLogger(__name__)
from app.schemas import (
    GenerateContentResponse,
    GenerateCounterpartRequest,
    GenerateCounterpartResponse,
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
    RawResume,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    UpdateTemplateSettingsRequest,
    normalize_resume_data,
)
from app.services.parser import (
    generate_counterpart_document,
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
from app.services.refiner import refine_resume, calculate_keyword_match
from app.schemas.refinement import RefinementConfig
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
    generate_resume_title,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS


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
            if not isinstance(orig_entry, dict) or not isinstance(result_entries[idx], dict):
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
                if not isinstance(orig_item, dict) or not isinstance(result_items[idx], dict):
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
    cover_letter_guidance: str | None = None,
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
            generate_cover_letter(
                improved_data,
                job_content,
                language,
                user_guidance=cover_letter_guidance,
            )
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

    # Validate extracted text is not empty (image-based PDFs / scanned documents)
    if not markdown_content or not markdown_content.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from the uploaded file. The document may be image-based or scanned. Please upload a file with selectable text.",
        )

    # Store in database first with "processing" status (atomic master assignment)
    # original_markdown is preserved permanently for date reference even after
    # builder saves overwrite `content` with JSON.
    resume = await db.create_resume_atomic_master(
        content=markdown_content,
        content_type="md",
        filename=file.filename,
        processed_data=None,
        processing_status="processing",
        original_markdown=markdown_content,
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


@router.post("/create-blank", response_model=ResumeUploadResponse)
async def create_blank_resume() -> ResumeUploadResponse:
    """Create a blank master resume for manual editing in the builder.

    Bypasses the file-upload requirement so users can build a resume
    from scratch directly in the editor.
    """
    empty_resume_data = ResumeData().model_dump()
    resume = await db.create_resume_atomic_master(
        content=json.dumps(empty_resume_data),
        content_type="json",
        filename=None,
        processed_data=empty_resume_data,
        processing_status="ready",
    )
    return ResumeUploadResponse(
        message="Blank resume created successfully",
        request_id=str(uuid4()),
        resume_id=resume["resume_id"],
        processing_status=resume["processing_status"],
        is_master=resume.get("is_master", False),
    )


async def _read_and_parse_upload(
    upload: UploadFile,
) -> tuple[str, dict[str, Any] | None, str, str]:
    """Read an UploadFile and parse it to markdown + structured JSON.

    Returns (markdown, processed_data_or_none, processing_status, filename).
    """
    if upload.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {upload.content_type}. Allowed: PDF, DOC, DOCX",
        )
    content = await upload.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        markdown = await parse_document(content, upload.filename or "document.pdf")
    except Exception as e:
        logger.error(f"Document parsing failed: {e}")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please ensure it's a valid PDF or DOCX file.",
        )

    if not markdown or not markdown.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from the uploaded file. The document may be image-based or scanned. Please upload a file with selectable text.",
        )

    processed: dict[str, Any] | None = None
    status_ = "failed"
    try:
        processed = await parse_resume_to_json(markdown)
        status_ = "ready"
    except Exception as e:
        logger.warning(
            f"Parsing to JSON failed for {upload.filename}: {e}"
        )

    return markdown, processed, status_, upload.filename or "document.pdf"


@router.post("/upload-bundle", response_model=ResumeUploadResponse)
async def upload_resume_bundle(
    resume_file: UploadFile | None = File(None),
    cv_file: UploadFile | None = File(None),
    group_name: str | None = Form(None),
    resume_filename: str | None = Form(None),
    cv_filename: str | None = Form(None),
) -> ResumeUploadResponse:
    """Upload a Resume and/or CV together as a single master group.

    At least one of `resume_file` or `cv_file` is required. If both are
    provided, the resume becomes the master and the CV is stored as a linked
    child document. If only one is provided, it becomes the master with the
    matching `document_kind` and the user can later generate the other side
    via /generate-counterpart.
    """
    if resume_file is None and cv_file is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of resume_file or cv_file must be provided.",
        )

    title = (group_name or "").strip() or None
    resume_dl = (resume_filename or "").strip() or "Resume.pdf"
    cv_dl = (cv_filename or "").strip() or "CV.pdf"

    # Read+parse whichever files are present.
    resume_payload = (
        await _read_and_parse_upload(resume_file) if resume_file is not None else None
    )
    cv_payload = (
        await _read_and_parse_upload(cv_file) if cv_file is not None else None
    )

    # The master holds the resume when present, else the CV.
    if resume_payload is not None:
        master_markdown, master_processed, master_status, master_filename = resume_payload
        master_kind = "resume"
    else:
        assert cv_payload is not None
        master_markdown, master_processed, master_status, master_filename = cv_payload
        master_kind = "cv"

    master = await db.create_resume_atomic_master(
        content=master_markdown,
        content_type="md",
        filename=master_filename,
        processed_data=master_processed,
        processing_status=master_status,
        original_markdown=master_markdown,
        title=title,
        document_kind=master_kind,
        resume_download_filename=resume_dl,
        cv_download_filename=cv_dl,
    )

    cv_child_id: str | None = None
    if resume_payload is not None and cv_payload is not None:
        cv_md, cv_processed, cv_status, cv_filename_raw = cv_payload
        child = db.create_resume(
            content=cv_md,
            content_type="md",
            filename=cv_filename_raw,
            is_master=False,
            parent_id=master["resume_id"],
            processed_data=cv_processed,
            processing_status=cv_status,
            original_markdown=cv_md,
            document_kind="cv",
            title=title,
        )
        cv_child_id = child["resume_id"]

    overall_status = master["processing_status"]
    return ResumeUploadResponse(
        message=(
            "Bundle uploaded successfully"
            if overall_status == "ready"
            else "Bundle uploaded; some documents failed AI parsing"
        ),
        request_id=str(uuid4()),
        resume_id=master["resume_id"],
        processing_status=overall_status,
        is_master=True,
        document_kind=master_kind,
        cv_resume_id=cv_child_id,
    )


@router.post(
    "/{master_id}/generate-counterpart",
    response_model=GenerateCounterpartResponse,
)
async def generate_counterpart_endpoint(
    master_id: str, payload: GenerateCounterpartRequest
) -> GenerateCounterpartResponse:
    """Generate the missing Resume or CV from the document already on file.

    `target='resume'` expands a stored CV into a one-page resume;
    `target='cv'` expands a stored resume into a long-form CV.
    """
    master = db.get_resume(master_id)
    if not master:
        raise HTTPException(status_code=404, detail="Master resume not found")
    if not master.get("is_master"):
        raise HTTPException(
            status_code=400,
            detail="generate-counterpart must be called against a master resume",
        )

    resume_doc, cv_doc = db.get_documents_for_master(master)

    target = payload.target
    if target == "cv":
        if cv_doc is not None:
            raise HTTPException(
                status_code=400,
                detail="CV already exists for this master.",
            )
        source = resume_doc
    else:
        if resume_doc is not None:
            raise HTTPException(
                status_code=400,
                detail="Resume already exists for this master.",
            )
        source = cv_doc

    if source is None or not source.get("processed_data"):
        raise HTTPException(
            status_code=400,
            detail="Source document has no structured data — cannot generate counterpart.",
        )

    try:
        generated_data = await generate_counterpart_document(
            source["processed_data"], target=target
        )
    except Exception as e:
        logger.error(f"Counterpart generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate counterpart document. Please try again.",
        )

    generated_markdown = json.dumps(generated_data, indent=2)

    # If the master's document_kind equals the target kind it means the master
    # row itself is the empty/missing slot — update it in place. Otherwise we
    # create a linked child row of the target kind.
    if master.get("document_kind") == target:
        updated = db.update_resume(
            master_id,
            {
                "content": generated_markdown,
                "content_type": "json",
                "processed_data": generated_data,
                "processing_status": "ready",
            },
        )
        return GenerateCounterpartResponse(
            message=f"Generated {target} successfully",
            resume_id=updated["resume_id"],
            target=target,
            processing_status="ready",
        )

    child = db.create_resume(
        content=generated_markdown,
        content_type="json",
        filename=None,
        is_master=False,
        parent_id=master_id,
        processed_data=generated_data,
        processing_status="ready",
        document_kind=target,
        title=master.get("title"),
    )
    return GenerateCounterpartResponse(
        message=f"Generated {target} successfully",
        resume_id=child["resume_id"],
        target=target,
        processing_status="ready",
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

    # Resolve which document IDs belong to this master group, so the viewer
    # can switch between Resume and CV tabs and know if either is missing.
    if resume.get("is_master"):
        resume_doc, cv_doc = db.get_documents_for_master(resume)
    else:
        parent = (
            db.get_resume(resume["parent_id"]) if resume.get("parent_id") else None
        )
        if parent and parent.get("is_master"):
            resume_doc, cv_doc = db.get_documents_for_master(parent)
        else:
            resume_doc, cv_doc = (resume, None) if resume.get("document_kind") != "cv" else (None, resume)

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=resume.get("cover_letter"),
            outreach_message=resume.get("outreach_message"),
            parent_id=resume.get("parent_id"),
            is_master=resume.get("is_master", False),
            title=resume.get("title"),
            template_settings=resume.get("template_settings"),
            document_kind=resume.get("document_kind", "resume"),
            resume_doc_id=resume_doc.get("resume_id") if resume_doc else None,
            cv_doc_id=cv_doc.get("resume_id") if cv_doc else None,
            resume_download_filename=resume.get("resume_download_filename"),
            cv_download_filename=resume.get("cv_download_filename"),
        ),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(include_master: bool = Query(False)) -> ResumeListResponse:
    """List resumes, optionally including the master resume.

    CV documents linked to a resume master are filtered out — they're part of
    a master group, not standalone entries the dashboard should render.
    """
    resumes = db.list_resumes()
    if not include_master:
        resumes = [resume for resume in resumes if not resume.get("is_master", False)]

    # Exclude CV children of a resume master from the listing; they aren't
    # tailored variants, so the dashboard shouldn't surface them as siblings.
    resumes = [
        resume
        for resume in resumes
        if not (
            resume.get("document_kind") == "cv"
            and resume.get("parent_id")
            and not resume.get("is_master", False)
        )
    ]

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
            document_kind=resume.get("document_kind", "resume"),
        )
        for resume in resumes
    ]

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


@router.post("/improve/preview")
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
) -> StreamingResponse:
    """Preview a tailored resume without persisting it.

    Returns an SSE stream so the Next.js dev-server proxy never sees an idle
    socket (which it would kill after ~30 s).  Keep-alive comments are sent
    every 5 s during LLM processing; the final result arrives as a JSON data
    event.  The response_id null on resume_id signals a preview-only result.
    """
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = get_content_language()
    prompt_id = request.prompt_id or _get_default_prompt_id()

    async def _generate() -> AsyncGenerator[bytes, None]:
        task: asyncio.Task[ImproveResumeResponse] = asyncio.create_task(
            _improve_preview_flow(
                request=request,
                resume=resume,
                job=job,
                language=language,
                prompt_id=prompt_id,
            )
        )
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 1800.0  # 30-minute ceiling
        try:
            while not task.done():
                remaining = deadline - loop.time()
                if remaining <= 0:
                    task.cancel()
                    yield b"data: " + json.dumps({
                        "__error__": "Resume tailoring timed out. Please try again."
                    }).encode() + b"\n\n"
                    return
                done, _ = await asyncio.wait({task}, timeout=min(5.0, remaining))
                if not done:
                    yield b": keep-alive\n\n"

            result = task.result()  # re-raises if the task failed
            yield b"data: " + result.model_dump_json().encode() + b"\n\n"
            yield b"data: [DONE]\n\n"

        except HTTPException as exc:
            logger.error(
                "Improve preview rejected for resume %s / job %s: %s",
                request.resume_id, request.job_id, exc.detail,
            )
            yield b"data: " + json.dumps({
                "__error__": exc.detail,
                "__status__": exc.status_code,
            }).encode() + b"\n\n"
        except Exception as exc:
            logger.error(
                "Improve preview failed for resume %s / job %s: %s",
                request.resume_id, request.job_id, exc,
            )
            yield b"data: " + json.dumps({
                "__error__": "Failed to preview resume. Please try again.",
            }).encode() + b"\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _improve_preview_flow(
    *,
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
) -> ImproveResumeResponse:
    """Inner flow for improve/preview, extracted so it can be wrapped in wait_for."""
    job_keywords = job.get("job_keywords")
    job_keywords_hash = job.get("job_keywords_hash")
    content_hash = _hash_job_content(job["content"])
    if not job_keywords or job_keywords_hash != content_hash:
        job_keywords = await extract_job_keywords(job["content"])
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
    original_resume_data = _get_original_resume_data(resume)
    # Collect warnings throughout the process
    response_warnings: list[str] = []

    # Diff-based improvement: generate targeted changes, apply with verification
    if original_resume_data:
        skill_targets: list[dict[str, Any]] = []
        try:
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
                    target
                    for target in accepted_targets
                    if isinstance(target, dict)
                ]
            rejected_targets = verified_skill_plan.get("rejected", [])
            if isinstance(rejected_targets, list) and rejected_targets:
                response_warnings.append(
                    f"{len(rejected_targets)} unsupported skill target(s) rejected"
                )
        except Exception as e:
            logger.warning("Skill target planning failed, continuing without it: %s", e)
            response_warnings.append("Skill target planning failed")

        diff_result = await generate_resume_diffs(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
            skill_targets=skill_targets,
        )

        improved_data, applied_changes, rejected_changes = apply_diffs(
            original=original_resume_data,
            changes=diff_result.changes,
            allowed_skill_targets=skill_targets,
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
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
        )

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
    refinement_attempted = False
    refinement_successful = False
    try:
        # Get the master that this resume belongs to (for alignment validation).
        # In multi-master mode, callers tailor against a specific master; resolve
        # via parent_id rather than picking the global "the" master.
        master_resume = db.resolve_master_for_resume(resume)
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
    diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
        resume,
        improved_data,
    )
    if diff_error:
        response_warnings.append(f"Could not calculate changes: {diff_error}")
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


@router.post("/improve/confirm")
async def improve_resume_confirm_endpoint(
    request: ImproveResumeConfirmRequest,
) -> StreamingResponse:
    """Confirm and persist a tailored resume.

    Returns an SSE stream so the Next.js dev-server proxy never sees an idle
    socket (which it would kill after ~30 s).  Keep-alive comments are sent
    every 5 s during LLM processing; the final result arrives as a JSON data
    event.
    """
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    async def _generate() -> AsyncGenerator[bytes, None]:
        task: asyncio.Task[ImproveResumeResponse] = asyncio.create_task(
            _improve_confirm_flow(request=request, resume=resume, job=job)
        )
        loop = asyncio.get_running_loop()
        deadline = loop.time() + 1800.0  # 30-minute ceiling
        try:
            while not task.done():
                remaining = deadline - loop.time()
                if remaining <= 0:
                    task.cancel()
                    yield b"data: " + json.dumps({
                        "__error__": "Resume saving timed out. Please try again."
                    }).encode() + b"\n\n"
                    return
                done, _ = await asyncio.wait({task}, timeout=min(5.0, remaining))
                if not done:
                    yield b": keep-alive\n\n"

            result = task.result()  # re-raises if the task failed
            yield b"data: " + result.model_dump_json().encode() + b"\n\n"
            yield b"data: [DONE]\n\n"

        except HTTPException as exc:
            logger.error(
                "Improve confirm rejected for resume %s / job %s: %s",
                request.resume_id, request.job_id, exc.detail,
            )
            yield b"data: " + json.dumps({
                "__error__": exc.detail,
                "__status__": exc.status_code,
            }).encode() + b"\n\n"
        except Exception as exc:
            logger.error(
                "Improve confirm failed for resume %s / job %s: %s",
                request.resume_id, request.job_id, exc,
            )
            yield b"data: " + json.dumps({
                "__error__": "Failed to save resume. Please try again.",
            }).encode() + b"\n\n"
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _improve_confirm_flow(
    *,
    request: ImproveResumeConfirmRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
) -> ImproveResumeResponse:
    """Inner flow for improve/confirm, extracted so it can be wrapped with keep-alive SSE."""
    feature_config = _load_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = get_content_language()

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
            cover_letter_guidance=request.cover_letter_guidance,
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
            title=title,
            template_settings=resume.get("template_settings"),
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
    feature_config = _load_config()
    enable_cover_letter = feature_config.get("enable_cover_letter", False)
    enable_outreach = feature_config.get("enable_outreach_message", False)
    language = get_content_language()

    try:
        # Extract keywords from job description
        job_keywords = await extract_job_keywords(job["content"])

        # Generate improved resume in the configured language
        prompt_id = request.prompt_id or _get_default_prompt_id()

        original_resume_data = _get_original_resume_data(resume)
        # Collect warnings throughout the process
        response_warnings: list[str] = []

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
            improved_data = restore_dates_from_markdown(improved_data, original_markdown)
        improved_data = _preserve_original_skills(original_resume_data, improved_data)
        improved_data = _protect_custom_sections(original_resume_data, improved_data)

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

        # Store the tailored resume with cover letter, outreach message, and title.
        # Inherit template_settings (including QR position) from the master so the
        # tailored resume opens with the same look as its parent.
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
            title=title,
            template_settings=resume.get("template_settings"),
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
    baseSizePt: float = Query(10.5, ge=7.0, le=14.0),
    sectionHeaderSizePt: float = Query(12.5, ge=8.0, le=18.0),
    headerFont: str = Query("serif", pattern="^(serif|sans-serif|mono|cambria)$"),
    bodyFont: str = Query("sans-serif", pattern="^(serif|sans-serif|mono|cambria)$"),
    compactMode: bool = Query(False),
    showContactIcons: bool = Query(False),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
    nameSizePt: float = Query(21.0, ge=8.0, le=36.0),
    contactSizePt: float = Query(9.0, ge=6.0, le=16.0),
    bodySizePt: float = Query(10.0, ge=6.0, le=16.0),
    sectionHeaderBold: bool = Query(True),
    sectionHeaderItalic: bool = Query(False),
    itemTitleBold: bool = Query(True),
    itemTitleItalic: bool = Query(False),
    itemSubtitleBold: bool = Query(False),
    itemSubtitleItalic: bool = Query(False),
    qrCodeUrl: str | None = Query(None),
    qrCodeSizeMm: float = Query(25.0, ge=5.0, le=80.0),
    qrCodeXMm: float = Query(140.0, ge=0.0, le=300.0),
    qrCodeYMm: float = Query(5.0, ge=0.0, le=400.0),
) -> Response:
    """Generate a PDF for a resume using headless Chromium.

    Accepts template settings for customization:
    - template: swiss-single, swiss-two-column, modern, or modern-two-column
    - pageSize: A4 or LETTER
    - marginTop/Bottom/Left/Right: page margins in mm (5-25)
    - sectionSpacing: gap between sections (1-5)
    - itemSpacing: gap between items (1-5)
    - lineHeight: text line height (1-5)
    - baseSizePt: item title / date font size in pt (7-14)
    - sectionHeaderSizePt: section header font size in pt (8-18)
    - headerFont: serif, sans-serif, or mono
    - bodyFont: serif, sans-serif, or mono
    - compactMode: enable tighter spacing
    - showContactIcons: show icons in contact info
    - lang: locale used for print page translations
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Build PDF filename from person's name (FirstnameLastname.pdf)
    _processed: dict[str, Any] = resume.get("processed_data") or {}
    _personal_info: dict[str, Any] = _processed.get("personalInfo") or {}
    _name_raw: str = (_personal_info.get("name") or "").strip()
    _name_safe: str = "".join(c for c in _name_raw if c not in '/\\:*?"<>|')
    pdf_filename: str = f"{_name_safe}.pdf" if _name_safe else f"resume_{resume_id}.pdf"

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
        f"&baseSizePt={baseSizePt}"
        f"&sectionHeaderSizePt={sectionHeaderSizePt}"
        f"&headerFont={headerFont}"
        f"&bodyFont={bodyFont}"
        f"&compactMode={str(compactMode).lower()}"
        f"&showContactIcons={str(showContactIcons).lower()}"
        f"&accentColor={accentColor}"
        f"&nameSizePt={nameSizePt}"
        f"&contactSizePt={contactSizePt}"
        f"&bodySizePt={bodySizePt}"
        f"&sectionHeaderBold={str(sectionHeaderBold).lower()}"
        f"&sectionHeaderItalic={str(sectionHeaderItalic).lower()}"
        f"&itemTitleBold={str(itemTitleBold).lower()}"
        f"&itemTitleItalic={str(itemTitleItalic).lower()}"
        f"&itemSubtitleBold={str(itemSubtitleBold).lower()}"
        f"&itemSubtitleItalic={str(itemSubtitleItalic).lower()}"
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

    # Render PDF with margins applied to every page.
    # QR code (if configured) is composited onto the rendered PDF as a
    # reportlab overlay rather than rendered into the print HTML, because
    # Chromium's print engine clips absolutely-positioned content that
    # falls outside the body's printable area (i.e., inside the page margins).
    try:
        pdf_bytes = await render_resume_pdf(url, pageSize, margins=pdf_margins)
        if qrCodeUrl:
            pdf_bytes = add_qr_code_to_pdf(
                pdf_bytes,
                qrCodeUrl,
                size_mm=qrCodeSizeMm,
                x_mm=qrCodeXMm,
                y_mm=qrCodeYMm,
                page_size=pageSize,
            )
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {"Content-Disposition": f'attachment; filename="{pdf_filename}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str) -> dict:
    """Delete a resume by ID."""
    if not db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}


@router.post("/{resume_id}/retry-processing", response_model=ResumeUploadResponse)
async def retry_processing(resume_id: str) -> ResumeUploadResponse:
    """Retry AI processing for a failed or stuck resume.

    Re-runs parse_resume_to_json() on the stored markdown content.
    Works for resumes with processing_status == "failed" or "processing".
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.get("processing_status") not in ("failed", "processing"):
        raise HTTPException(
            status_code=400,
            detail="Only resumes with 'failed' or 'processing' status can be retried.",
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


@router.patch("/{resume_id}/template-settings")
async def update_template_settings(
    resume_id: str, request: UpdateTemplateSettingsRequest
) -> dict:
    """Persist template/formatting settings (fonts, sizes, styles) for a resume.

    If the resume is a master, the QR-code portion of the settings is also
    propagated to all tailored children so the QR position stays consistent
    across every generated resume. Other formatting (margins, fonts) is left
    alone on children since tailored resumes may have been customized.
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"template_settings": request.settings})

    if resume.get("is_master"):
        qr_code = (request.settings or {}).get("qrCode")
        if qr_code is not None:
            for child in db.list_resumes():
                if child.get("parent_id") == resume_id:
                    child_settings = dict(child.get("template_settings") or {})
                    child_settings["qrCode"] = qr_code
                    db.update_resume(
                        child["resume_id"], {"template_settings": child_settings}
                    )

    return {"message": "Template settings updated successfully"}


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
    language = get_content_language()

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
    language = get_content_language()

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
