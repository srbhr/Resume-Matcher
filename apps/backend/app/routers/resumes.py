"""Resume management endpoints."""

import asyncio
import copy
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NoReturn
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError

from app.ai_budget import (
    AIOperationDeadlineExceeded,
    AIOperationRoute,
    remaining_timeout,
)
from app.ai_limits import PromptSizeError, require_source_size
from app.config import settings
from app.config_cache import get_content_language
from app.config_cache import load_config as _load_config
from app.database import (
    DatabaseBusyError,
    MasterResumeLimitError,
    ProcessingFinishOutcome,
    ResumeNotFoundError,
    db,
)
from app.pdf import PRINT_ERROR_SELECTOR, PDFRenderError, render_resume_pdf
from app.preview import (
    PreviewBusyError,
    PreviewClaim,
    PreviewConflictError,
    PreviewValidationError,
)
from app.schemas import (
    ATSScoreRecord,
    DuplicateResumeResponse,
    GenerateContentResponse,
    GenerateInterviewPrepResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeData,
    ImproveResumeRequest,
    ImproveResumeResponse,
    InterviewPrepData,
    PageFitSettings,
    RawResume,
    ResumeData,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeListResponse,
    ResumeSummary,
    ResumeUploadResponse,
    SetDefaultMasterResponse,
    TemplateSettings,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    normalize_resume_data,
)
from app.schemas.models import ResumeTemplate
from app.schemas.writing import ApplyKeywordsRequest
from app.services.cover_letter import (
    generate_cover_letter,
    generate_outreach_message,
)
from app.services.interview_prep import generate_interview_prep
from app.services.keyword_forcing import force_keywords, keyword_placements
from app.services.page_fit import render_drafts, resume_print_url
from app.services.parser import (
    MAX_EXTRACTED_TEXT_BYTES,
    MAX_PDF_PREFLIGHT_PAGES,
    MAX_UNPACKED_DOCUMENT_BYTES,
    DocumentPageLimitError,
    DocumentPasswordError,
    DocumentResourceLimitError,
    has_meaningful_resume_content,
    parse_document,
    parse_resume_to_json,
)
from app.services.progress import progress_events, tracked_progress
from app.services.refiner import (
    _extract_all_text,
    analyze_keyword_gaps,
    job_keyword_terms,
)
from app.services.resume_preservation import (
    finalize_ai_resume,
    grounding_review_warnings,
)
from app.services.tailoring import (
    DIFF_UNAVAILABLE_WARNING,
    _ats_score_model,
    _auto_create_tracker_application,
    _cached_job_keywords,
    _calculate_diff_from_resume,
    _generate_auxiliary_messages,
    _get_default_prompt_id,
    _get_original_resume_data,
    _grounding_master_data,
    _hash_improved_data,
    _improve_preview_flow,
    _scorable_job_keywords,
    _score_tailored_data,
    _serialize_interview_prep,
    _validate_ai_sources,
    _validate_confirm_payload,
    execute_tailoring_pipeline,
)
from app.services.text_match import keyword_in_text
from app.services.writing_loop import finalized_writing_report

logger = logging.getLogger(__name__)
_PROCESSING_CLEANUP_TIMEOUT_SECONDS = 5.0
_PROCESSING_RETIREMENT_MAX_ATTEMPTS = 3
_PROCESSING_RETIREMENT_INITIAL_BACKOFF_SECONDS = 0.1
_PROCESSING_RETIREMENT_MAX_BACKOFF_SECONDS = 0.5
_PROCESSING_SHUTDOWN_GRACE_SECONDS = 1.0
_PROCESSING_CLEANUP_TASKS: set[asyncio.Task[Any]] = set()


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


def _raise_improve_error(
    action: str,
    stage: str,
    error: Exception,
    detail: str,
) -> NoReturn:
    logger.error("Resume %s failed during %s: %s", action, stage, error)
    raise HTTPException(status_code=500, detail=detail)


router = APIRouter(route_class=AIOperationRoute, prefix="/resumes", tags=["Resumes"])

# Legacy binary .doc is not listed: the document converter cannot read it, so
# it is refused here with a clear message instead of failing after upload.
ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
DOCUMENT_TYPES_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
LEGACY_DOC_DETAIL = (
    "Legacy Word .doc files are not supported. Save the file as DOCX or PDF "
    "and upload it again."
)
UNPARSED_RESUME_PDF_DETAIL = (
    "This resume has not been processed yet, so there is nothing to put in a PDF. "
    "Retry processing it from the dashboard, then download again."
)
PASSWORD_PDF_DETAIL = (
    "This PDF is password-protected. Remove the password (or print it to a new "
    "PDF) and upload it again."
)
# Browsers report "" or application/octet-stream when the OS has no MIME
# mapping for the extension (e.g. .docx on Windows without Office).
UNKNOWN_CONTENT_TYPES = {None, "", "application/octet-stream"}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB
UPLOAD_READ_CHUNK_SIZE = 64 * 1024
MASTER_LIMIT_DETAIL = (
    "You can keep up to 5 master resumes. Delete one before adding another."
)


def _has_renderable_resume_data(resume: dict[str, Any]) -> bool:
    """Whether the print page can render this resume (mirrors its data lookup)."""
    if resume.get("processed_data"):
        return True
    try:
        # Builder saves store the structured resume as JSON in ``content``.
        return isinstance(json.loads(resume.get("content") or ""), dict)
    except ValueError:
        return False


def _validate_upload_type(file: UploadFile) -> None:
    """Require the declared MIME type to match a supported filename extension."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix == ".doc" or file.content_type == "application/msword":
        raise HTTPException(status_code=400, detail=LEGACY_DOC_DETAIL)
    content_type = file.content_type
    if content_type in UNKNOWN_CONTENT_TYPES and suffix in DOCUMENT_TYPES_BY_EXTENSION:
        # The container preflight still validates the bytes by this suffix.
        content_type = DOCUMENT_TYPES_BY_EXTENSION[suffix]
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Allowed: PDF, DOCX",
        )

    if DOCUMENT_TYPES_BY_EXTENSION.get(suffix) != content_type:
        raise HTTPException(
            status_code=400,
            detail="Upload a valid PDF or DOCX file.",
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
            logger.warning(
                "Processing claim retirement continues for resume %s", resume_id
            )
        except Exception:
            logger.exception(
                "Failed to settle cancelled processing claim for %s", resume_id
            )
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
    except DocumentPageLimitError as e:
        logger.warning("PDF page limit exceeded for %s: %s", file.filename, e)
        raise HTTPException(
            status_code=413,
            detail=(
                f"PDF has more than {MAX_PDF_PREFLIGHT_PAGES} pages. "
                "Please upload a shorter document."
            ),
        )
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
    except DocumentPasswordError as e:
        logger.info("Password-protected PDF refused: %s", file.filename)
        raise HTTPException(status_code=422, detail=PASSWORD_PDF_DETAIL) from e
    except TimeoutError as e:
        logger.warning("Document conversion exceeded its deadline")
        raise HTTPException(
            status_code=504,
            detail="Document conversion timed out. Please try a simpler document.",
        ) from e
    except (DatabaseBusyError, PromptSizeError):
        raise
    except Exception:
        logger.exception("Document parsing failed")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please upload a valid PDF or DOCX file.",
        )

    # Validate extracted text is not empty (image-based PDFs / scanned documents)
    if not markdown_content or not markdown_content.strip():
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract text from the uploaded file. The document may be "
                "image-based or scanned. Please upload a text-based PDF or DOCX "
                "with selectable text, or run OCR first."
            ),
        )

    # Store in database first with "processing" status (atomic master assignment)
    # original_markdown is preserved permanently for date reference even after
    # builder saves overwrite `content` with JSON.
    require_source_size(markdown_content)
    try:
        resume = await db.create_resume_atomic_master(
            content=markdown_content,
            content_type="md",
            filename=file.filename,
            processed_data=None,
            processing_status="processing",
            original_markdown=markdown_content,
        )
    except MasterResumeLimitError as e:
        logger.info("Upload rejected: %s", e)
        raise HTTPException(status_code=409, detail=MASTER_LIMIT_DETAIL) from e

    # Preserve acknowledgement of this request's committed insert even if its
    # parse fails or the outer operation timer cancels the handler. A status
    # snapshot would be misleading while retirement/newer work is still pending.
    request.state.uploaded_resume = (
        resume["resume_id"],
        resume.get("is_master", False),
    )

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
            is_default_master=resume.get("is_default_master", False),
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
            is_master=resume.get("is_master", False),
            is_default_master=resume.get("is_default_master", False),
            template_settings=resume.get("template_settings"),
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
            is_default_master=resume.get("is_default_master", False),
            parent_id=resume.get("parent_id"),
            processing_status=resume.get("processing_status", "pending"),
            created_at=resume.get("created_at", ""),
            updated_at=resume.get("updated_at", ""),
            title=resume.get("title"),
            template_settings=resume.get("template_settings"),
        )
        for resume in resumes
    ]

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


@router.get("/render-drafts/{token}")
async def get_render_draft(token: str) -> dict[str, Any]:
    """Serve a short-lived unsaved draft to the print route for page measurement."""
    data = render_drafts.get(token)
    if data is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return {"data": {"processed_resume": data}}


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

    detail = "Failed to preview resume. Please try again."
    with tracked_progress(request.progress_id, "load_job_keywords") as progress:
        return await _run_preview_with_progress(
            request, resume, job, language, prompt_id, progress, detail
        )


async def _run_preview_with_progress(
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
    progress: dict[str, str],
    detail: str,
) -> ImproveResumeResponse:
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


@router.get("/improve/progress/{progress_id}")
async def improve_progress_stream(progress_id: str) -> StreamingResponse:
    """Stream the live stages of a preview or writing run (server-sent events)."""
    if not progress_id or len(progress_id) > 64:
        raise HTTPException(status_code=404, detail="Unknown progress id")
    return StreamingResponse(
        progress_events(progress_id, settings.request_timeout_seconds + 30),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _clean_keywords(values: list[str]) -> list[str]:
    """Trimmed, de-duplicated (case-insensitive) keyword strings."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        keyword = value.strip()[:80] if isinstance(value, str) else ""
        if keyword and keyword.casefold() not in seen:
            seen.add(keyword.casefold())
            cleaned.append(keyword)
    return cleaned


async def _add_master_skills(master_id: str, keywords: list[str]) -> None:
    """Add confirmed keywords to the master's skills list (best effort).

    The tailored resume is already saved; a failure here only means the next
    tailoring asks about the keyword again, so it is logged, not raised.
    """
    if not keywords:
        return
    try:
        await db.add_resume_skills(master_id, keywords)
    except Exception:
        logger.warning(
            "Adding confirmed skills to master %s failed", master_id, exc_info=True
        )


@router.post("/improve/apply-keywords", response_model=ImproveResumeResponse)
async def apply_keywords_endpoint(
    request: ApplyKeywordsRequest,
) -> ImproveResumeResponse:
    """Work chosen job keywords into a preview; the result is a new preview.

    A keyword the master does not show is applied only with ``attested``.
    Nothing is saved until the new preview is confirmed.
    """
    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    job = await db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")
    _validate_ai_sources(resume, job)

    current = request.improved_data.model_dump()
    preview = await db.get_preview(request.preview_id)
    if (
        preview is None
        or preview["source_id"] != request.resume_id
        or preview["job_id"] != request.job_id
        or preview["result_resume_id"] is not None
        or preview["expires_at"] <= datetime.now(timezone.utc).isoformat()
        or preview["payload_hash"] != _hash_improved_data(current)
    ):
        raise HTTPException(
            status_code=409,
            detail="Preview expired or changed. Please generate a new preview.",
        )
    job_keywords = _scorable_job_keywords(job)
    if not job_keywords:
        raise HTTPException(
            status_code=409,
            detail="This job has no keywords. Please generate a new preview.",
        )
    source = preview["source_data"] or _get_original_resume_data(resume)
    if source is None:
        raise HTTPException(status_code=400, detail="Resume has no structured data.")
    master = await _grounding_master_data(resume) or source
    master_text = _extract_all_text(master)
    terms = {term.casefold(): term for term in job_keyword_terms(job_keywords)}

    keywords: list[str] = []
    for item in request.keywords:
        term = terms.get(item.keyword.strip().casefold())
        if term is None:
            raise HTTPException(
                status_code=400, detail="Only keywords from this job can be applied."
            )
        if not item.attested and not keyword_in_text(term, master_text):
            raise HTTPException(
                status_code=400,
                detail="Confirm each keyword your master resume does not show.",
            )
        if term not in keywords:
            keywords.append(term)

    language = get_content_language()
    try:
        forced = await asyncio.wait_for(
            force_keywords(current, keywords, job["content"], language),
            timeout=remaining_timeout(),
        )
    except asyncio.TimeoutError as e:
        raise HTTPException(
            status_code=504, detail="Applying keywords timed out. Please try again."
        ) from e
    final = ResumeData.model_validate(
        finalize_ai_resume(source, forced, allow_appended_rows=True)
    ).model_dump()
    placements = keyword_placements(current, final, keywords)

    # The replacement keeps the original preview's input fingerprints, so
    # register_preview (which re-checks them in its write transaction) refuses
    # it when the master or the job changed since the first preview.
    try:
        registered = await db.register_preview(
            source_id=request.resume_id,
            job_id=request.job_id,
            payload_hash=_hash_improved_data(final),
            source_hash=preview["source_hash"],
            job_hash=preview["job_hash"],
            prompt_id=request.prompt_id or _get_default_prompt_id(),
            ttl_seconds=settings.preview_ttl_seconds,
            improvements=preview["improvements"],
            source_data=preview["source_data"],
        )
    except PreviewConflictError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    response_warnings: list[str] = []
    diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
        resume, final, source
    )
    if diff_error:
        response_warnings.append(DIFF_UNAVAILABLE_WARNING)
    request_id = str(uuid4())
    return ImproveResumeResponse(
        request_id=request_id,
        data=ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            preview_id=registered["preview_id"],
            preview_expires_at=registered["expires_at"],
            job_id=request.job_id,
            resume_preview=ResumeData.model_validate(final),
            improvements=[
                {"suggestion": imp["suggestion"], "lineNumber": imp.get("lineNumber")}
                for imp in preview["improvements"]
            ],
            markdownOriginal=resume["content"],
            markdownImproved=json.dumps(final, indent=2),
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            ats_score=_ats_score_model(
                final, job_keywords, analyze_keyword_gaps(job_keywords, final, master)
            ),
            writing=finalized_writing_report(None, final, language, source),
            keyword_placements=placements,
            forced_keywords=[p.keyword for p in placements if p.paths],
            warnings=response_warnings,
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
                job_id=request.job_id,
                tailored_resume_id=data.resume_id,
                master_resume_id=request.resume_id,
                job=job,
                title=None,
            )
            return ImproveResumeResponse(request_id=data.request_id, data=data)

        feature_config = _load_config()
        language = get_content_language()
        forced_keywords = _clean_keywords(request.forced_keywords)

        try:
            original = claim.source_data or _get_original_resume_data(resume)
            if original is None:
                raise ValueError(
                    "Original resume data is unavailable; process the source before preview"
                )
            canonical = ResumeData.model_validate(
                finalize_ai_resume(original, improved_data, allow_appended_rows=True)
            ).model_dump()
            if canonical != improved_data:
                raise ValueError(
                    "Registered preview no longer satisfies preservation rules"
                )
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
            resume, improved_data, original
        )
        if diff_error:
            response_warnings.append(DIFF_UNAVAILABLE_WARNING)
        if original:
            response_warnings.extend(grounding_review_warnings(original, improved_data))

        # The durable claim lasts longer than the bounded external work. Other
        # workers return a retryable conflict instead of duplicating generation.
        stage = "generate_auxiliary_messages"
        (
            cover_letter,
            outreach_message,
            title,
            interview_prep,
            aux_warnings,
        ) = await asyncio.wait_for(
            _generate_auxiliary_messages(
                improved_data,
                job["content"],
                language,
                feature_config.get("enable_cover_letter", False),
                feature_config.get("enable_outreach_message", False),
                feature_config.get("enable_interview_prep", False),
                forced_keywords=forced_keywords,
            ),
            timeout=remaining_timeout(),
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
            forced_keywords=forced_keywords,
            warnings=response_warnings,
        )
        ats_record: dict[str, Any] | None = None
        job_keywords = _cached_job_keywords(job)
        if job_keywords is not None:
            try:
                ats_record = _score_tailored_data(
                    improved_data,
                    job_keywords,
                    await _grounding_master_data(resume) or improved_data,
                )
            except Exception:
                logger.warning("ATS score at confirmation failed", exc_info=True)
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
                "template_settings": copy.deepcopy(resume.get("template_settings")),
            },
            response_data=response.model_dump(mode="json"),
            improvements=claim.improvements or [],
            ats_score=ats_record,
            forced_keywords=forced_keywords,
        )
        claim = None  # The transaction committed; there is no lease to release.
        await _add_master_skills(
            request.resume_id,
            [
                keyword
                for keyword in _clean_keywords(request.master_skills_to_add)
                if keyword in forced_keywords
            ],
        )
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
    try:
        (
            tailored_resume,
            improved_data,
            improvements,
            request_id,
            extra_meta,
        ) = await execute_tailoring_pipeline(
            resume_id=request.resume_id,
            job_id=request.job_id,
            prompt_id=request.prompt_id,
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
                markdownOriginal=extra_meta.get("original_content", ""),
                markdownImproved=extra_meta.get("improved_text", ""),
                cover_letter=extra_meta.get("cover_letter"),
                outreach_message=extra_meta.get("outreach_message"),
                interview_prep=extra_meta.get("interview_prep"),
                diff_summary=extra_meta.get("diff_summary"),
                detailed_changes=extra_meta.get("detailed_changes"),
                refinement_stats=extra_meta.get("refinement_stats"),
                ats_score=extra_meta.get("ats_score"),
                warnings=extra_meta.get("response_warnings", []),
                refinement_attempted=extra_meta.get("refinement_attempted", False),
                refinement_successful=extra_meta.get("refinement_successful", False),
            ),
        )

    except (DatabaseBusyError, AIOperationDeadlineExceeded, PromptSizeError):
        raise
    except HTTPException:
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
            is_master=updated.get("is_master", False),
            is_default_master=updated.get("is_default_master", False),
            template_settings=updated.get("template_settings"),
        ),
    )


@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: ResumeTemplate = Query("swiss-single"),
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
    - template: swiss-single, swiss-two-column, modern, modern-two-column, latex, clean, vivid,
      vivid-single, modern-deedy, or deedy
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
    if not _has_renderable_resume_data(resume):
        # The print page has nothing to render (the AI parse failed or has not
        # run). Say so now instead of waiting out the render deadline.
        raise HTTPException(status_code=409, detail=UNPARSED_RESUME_PDF_DETAIL)

    # Validated and URL-encoded the same way as the page-fit and ATS renders.
    fit = PageFitSettings(
        template=template,
        pageSize=pageSize,
        marginTop=marginTop,
        marginBottom=marginBottom,
        marginLeft=marginLeft,
        marginRight=marginRight,
        sectionSpacing=sectionSpacing,
        itemSpacing=itemSpacing,
        lineHeight=lineHeight,
        fontSize=fontSize,
        headerScale=headerScale,
        headerFont=headerFont,
        bodyFont=bodyFont,
        compactMode=compactMode,
        showContactIcons=showContactIcons,
        accentColor=accentColor,
        lang=lang,
    )
    url = resume_print_url(resume_id, fit)

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
                is_default_master=resume.get("is_default_master", False),
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
                is_default_master=resume.get("is_default_master", False),
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


@router.patch("/{resume_id}/template-settings", response_model=TemplateSettings)
async def update_template_settings(
    resume_id: str, settings: TemplateSettings
) -> TemplateSettings:
    """Save the resume's formatting (template, margins, fonts...) chosen in the builder.

    Returns the stored settings: unchanged when this save is older than them.
    """
    try:
        stored = await db.save_template_settings(resume_id, settings.model_dump())
    except ResumeNotFoundError:
        raise HTTPException(status_code=404, detail="Resume not found")
    return TemplateSettings.model_validate(stored)


@router.post("/{resume_id}/default", response_model=SetDefaultMasterResponse)
async def set_default_master_resume(resume_id: str) -> SetDefaultMasterResponse:
    """Make a master resume the default tailoring source."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.get("is_master", False):
        raise HTTPException(
            status_code=400, detail="Only master resumes can be set as default."
        )
    if not await db.set_default_master_resume(resume_id):
        # Only a master deleted since the pre-check gets here: no code path clears
        # is_master on an existing row, so 404 is the right answer.
        raise HTTPException(status_code=404, detail="Resume not found")
    return SetDefaultMasterResponse(resume_id=resume_id, is_default_master=True)


_MAX_TITLE_LENGTH = 80
_COPY_SUFFIX = " (Copy)"


def _copy_title(resume: dict[str, Any]) -> str:
    """Title for a duplicated resume, capped at the 80 chars the title endpoint allows."""
    base = (resume.get("title") or resume.get("filename") or "Resume").strip()
    base = base[: _MAX_TITLE_LENGTH - len(_COPY_SUFFIX)].rstrip()
    return f"{base}{_COPY_SUFFIX}"


@router.post(
    "/{resume_id}/duplicate", response_model=DuplicateResumeResponse, status_code=201
)
async def duplicate_resume(resume_id: str) -> DuplicateResumeResponse:
    """Copy a ready resume. A master copy becomes a non-default master."""
    source = await db.get_resume(resume_id)
    if not source:
        raise HTTPException(status_code=404, detail="Resume not found")
    if source.get("processing_status") != "ready":
        raise HTTPException(
            status_code=409, detail="Only ready resumes can be duplicated."
        )

    fields: dict[str, Any] = {
        "content": source["content"],
        "content_type": source.get("content_type", "md"),
        "filename": source.get("filename"),
        "processed_data": copy.deepcopy(source.get("processed_data")),
        "original_markdown": source.get("original_markdown"),
        "cover_letter": source.get("cover_letter"),
        "outreach_message": source.get("outreach_message"),
        "interview_prep": source.get("interview_prep"),
        "processing_status": "ready",
        "title": _copy_title(source),
        "template_settings": copy.deepcopy(source.get("template_settings")),
    }
    try:
        if source.get("is_master", False):
            duplicate = await db.create_resume_atomic_master(
                **fields, take_over_stuck_default=False
            )
        else:
            fields.update(is_master=False, parent_id=source.get("parent_id"))
            # A tailored copy keeps the original's job link so JD features work on it.
            link = await db.get_improvement_by_tailored_resume(resume_id)
            if link is None:
                duplicate = await db.create_resume(**fields)
            else:
                duplicate = await db.create_tailored_resume(
                    request_id=str(uuid4()),
                    original_resume_id=link["original_resume_id"],
                    job_id=link["job_id"],
                    resume_fields=fields,
                    improvements=link["improvements"],
                )
    except MasterResumeLimitError as e:
        logger.info("Duplicate rejected: %s", e)
        raise HTTPException(status_code=409, detail=MASTER_LIMIT_DETAIL) from e
    except DatabaseBusyError:
        raise
    except Exception as e:
        logger.error("Failed to duplicate resume %s: %s", resume_id, e)
        raise HTTPException(
            status_code=500, detail="Failed to duplicate resume. Please try again."
        ) from e

    return DuplicateResumeResponse(
        resume_id=duplicate["resume_id"],
        title=duplicate["title"],
        is_master=duplicate.get("is_master", False),
        is_default_master=duplicate.get("is_default_master", False),
        parent_id=duplicate.get("parent_id"),
    )


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
        forced = improvement.get("forced_keywords") or []
        interview_prep = await generate_interview_prep(
            resume_data,
            job["content"],
            language,
            **({"forced_keywords": forced} if forced else {}),
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


async def _tailored_resume_job_link(
    resume_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The tailored resume and its improvement (job) link, or the HTTP error."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="ATS score is only available for tailored resumes.",
        )
    improvement = await db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=404,
            detail="No job description is linked to this resume.",
        )
    return resume, improvement


@router.get("/{resume_id}/ats-score", response_model=ATSScoreRecord | None)
async def get_ats_score_for_resume(resume_id: str) -> ATSScoreRecord | None:
    """Last calculated ATS score of a tailored resume, or null if never calculated."""
    _, improvement = await _tailored_resume_job_link(resume_id)
    record = improvement.get("ats_score")
    return ATSScoreRecord.model_validate(record) if record else None


@router.post("/{resume_id}/ats-score", response_model=ATSScoreRecord)
async def recalculate_ats_score_for_resume(resume_id: str) -> ATSScoreRecord:
    """Recalculate a tailored resume's ATS score from its saved data and store it.

    Deterministic (no LLM call): uses the job keywords cached when the resume
    was tailored, so edits saved since then are reflected.
    """
    resume, improvement = await _tailored_resume_job_link(resume_id)
    job = await db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="No job description is linked to this resume.",
        )
    job_keywords = _cached_job_keywords(job)
    if job_keywords is None:
        raise HTTPException(
            status_code=409,
            detail="The job description has not been analyzed. Tailor the resume again to score it.",
        )
    tailored_data = _get_original_resume_data(resume)
    if not tailored_data:
        raise HTTPException(
            status_code=409, detail="This resume has no structured data to score."
        )
    master_data = await _grounding_master_data(resume) or tailored_data
    try:
        record = _score_tailored_data(tailored_data, job_keywords, master_data)
        await db.set_ats_score(resume_id, record)
    except DatabaseBusyError:
        raise  # mapped to a retryable 503 by the app-level handler
    except Exception as e:
        logger.error("ATS score calculation failed for %s: %s", resume_id, e)
        raise HTTPException(
            status_code=500, detail="Failed to calculate ATS score. Please try again."
        ) from e
    return ATSScoreRecord.model_validate(record)


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

    keywords = _scorable_job_keywords(job)
    return {
        "job_id": job["job_id"],
        "content": job["content"],
        # The terms the ATS score's keyword match counts, so JD Match shows the same number.
        "keywords": job_keyword_terms(keywords) if keywords else None,
        "company": job.get("company") or None,
        # Keywords the user forced in; JD Match highlights them apart.
        "forced_keywords": improvement.get("forced_keywords") or [],
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
            url, pageSize, selector=f".cover-letter-print, {PRINT_ERROR_SELECTOR}"
        )
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {
        "Content-Disposition": f'attachment; filename="cover_letter_{resume_id}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
