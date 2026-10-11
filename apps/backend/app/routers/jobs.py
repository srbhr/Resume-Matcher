"""Job description management endpoints."""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.ai_limits import MAX_JOB_CHARACTERS, require_source_size
from app.database import DatabaseBusyError, db
from app.schemas import (
    JobMetadataParseRequest,
    JobMetadataParseResponse,
    JobQueueAddRequest,
    JobQueueItemResponse,
    JobUploadRequest,
    JobUploadResponse,
)
from app.services.queue_worker import extract_job_details, queue_manager

router = APIRouter(prefix="/jobs", tags=["Jobs"])
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(request: JobUploadRequest) -> JobUploadResponse:
    """Upload one or more job descriptions.

    Stores the raw text for later use in resume tailoring.
    Returns an array of job_ids corresponding to the input array.
    """
    if not request.job_descriptions:
        raise HTTPException(status_code=400, detail="No job descriptions provided")

    descriptions = [jd.strip() for jd in request.job_descriptions]
    if any(not jd for jd in descriptions):
        raise HTTPException(status_code=400, detail="Empty job description")
    try:
        jobs = await db.create_jobs(
            contents=descriptions,
            resume_id=request.resume_id,
        )
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Failed to upload job descriptions")
        raise HTTPException(
            status_code=500,
            detail="Failed to upload job descriptions. Please try again.",
        ) from exc

    return JobUploadResponse(
        message="data successfully processed",
        job_id=[job["job_id"] for job in jobs],
        request={
            "job_descriptions": request.job_descriptions,
            "resume_id": request.resume_id,
        },
    )


def _format_queue_item(item: dict) -> JobQueueItemResponse:
    desc = item.get("job_description", "")
    snippet = (desc[:120] + "...") if len(desc) > 120 else desc
    return JobQueueItemResponse(
        item_id=item["item_id"],
        resume_id=item.get("resume_id", ""),
        job_description_snippet=snippet,
        role=item.get("role", "") or "",
        company=item.get("company", "") or "",
        job_req_id=item.get("job_req_id", "") or "",
        status=item.get("status", "pending"),
        tailored_resume_id=item.get("tailored_resume_id"),
        title=item.get("title"),
        job_id=item.get("job_id"),
        error=item.get("error"),
        rate_limit_seconds=float(item.get("rate_limit_seconds", 5.0)),
        created_at=item.get("created_at", ""),
        updated_at=item.get("updated_at", ""),
    )


@router.post("/parse-metadata", response_model=JobMetadataParseResponse)
async def parse_job_metadata(
    request: JobMetadataParseRequest,
) -> JobMetadataParseResponse:
    """Instantly parse role, company, and job req ID using heuristics with 0 LLM calls."""
    extracted = extract_job_details(request.job_description)
    return JobMetadataParseResponse(
        role=extracted.get("role", ""),
        company=extracted.get("company", ""),
        job_req_id=extracted.get("job_req_id", ""),
    )


@router.post("/queue", response_model=JobQueueItemResponse)
async def add_to_queue(request: JobQueueAddRequest) -> JobQueueItemResponse:
    """Queue a single job description for sequential background resume tailoring."""
    if not request.job_description or not request.job_description.strip():
        raise HTTPException(status_code=400, detail="Job description cannot be empty")
    # Refuse now what the worker would fail later, before anything is stored.
    require_source_size(request.job_description.strip(), MAX_JOB_CHARACTERS)

    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Master resume not found")

    # Extract metadata if not provided
    extracted = extract_job_details(request.job_description)
    role = (request.role or "").strip() or extracted.get("role", "")
    company = (request.company or "").strip() or extracted.get("company", "")
    job_req_id = (request.job_req_id or "").strip() or extracted.get("job_req_id", "")

    item_id = str(uuid4())

    item = await db.create_queue_item(
        item_id=item_id,
        resume_id=request.resume_id,
        job_description=request.job_description.strip(),
        role=role,
        company=company,
        job_req_id=job_req_id,
        rate_limit_seconds=request.rate_limit_seconds,
        prompt_id=request.prompt_id,
    )

    queue_manager.notify()
    return _format_queue_item(item)


@router.get("/queue", response_model=list[JobQueueItemResponse])
async def list_queue(resume_id: str | None = None) -> list[JobQueueItemResponse]:
    """Get recent items in the tailoring queue."""
    items = await db.get_queue(resume_id=resume_id, limit=100)
    return [_format_queue_item(item) for item in items]


@router.delete("/queue/{item_id}")
async def delete_queue_item(item_id: str) -> dict:
    """Remove a specific item from the queue."""
    outcome = await db.delete_queue_item(item_id)
    if outcome == "missing":
        raise HTTPException(status_code=404, detail="Queue item not found")
    if outcome == "in_progress":
        raise HTTPException(
            status_code=409,
            detail="This item is being tailored. Try again when it finishes.",
        )
    return {"deleted": True, "item_id": item_id}


@router.delete("/queue")
async def clear_queue(status: str | None = None, resume_id: str | None = None) -> dict:
    """Clear queue items, optionally only one status and one master resume's items."""
    count = await db.clear_queue(status=status, resume_id=resume_id)
    return {"cleared_count": count}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job description by ID."""
    job = await db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job
