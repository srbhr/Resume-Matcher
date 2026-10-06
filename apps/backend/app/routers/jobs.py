"""Job description management endpoints."""

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.database import DatabaseBusyError, db
from app.schemas import (
    BatchItemResponse,
    BatchStatusResponse,
    BatchTailorRequest,
    BatchTailorResponse,
    JobMetadataParseRequest,
    JobMetadataParseResponse,
    JobQueueAddRequest,
    JobQueueItemResponse,
    JobUploadRequest,
    JobUploadResponse,
)
from app.services.queue_worker import extract_job_details, queue_manager
batch_manager = queue_manager

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


@router.post("/batch-tailor", response_model=BatchTailorResponse)
async def create_batch_tailor(request: BatchTailorRequest) -> BatchTailorResponse:
    """Queue multiple job descriptions for sequential, rate-limited resume tailoring."""
    clean_jds = [jd.strip() for jd in request.job_descriptions if jd.strip()]
    if not clean_jds:
        raise HTTPException(status_code=400, detail="No valid job descriptions provided")

    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Master resume not found")

    batch_id = str(uuid4())
    rate_limit = max(0.0, float(request.rate_limit_seconds))

    db.create_batch(
        batch_id=batch_id,
        resume_id=request.resume_id,
        total_items=len(clean_jds),
        rate_limit_seconds=rate_limit,
        prompt_id=request.prompt_id,
    )

    for idx, jd in enumerate(clean_jds):
        item_id = str(uuid4())
        db.create_batch_item(
            item_id=item_id,
            batch_id=batch_id,
            resume_id=request.resume_id,
            job_description=jd,
            index=idx,
            prompt_id=request.prompt_id,
        )

    await batch_manager.enqueue_batch(batch_id)

    return BatchTailorResponse(
        batch_id=batch_id,
        total_jobs=len(clean_jds),
        message=f"Queued {len(clean_jds)} job descriptions for background tailoring",
        status="queued",
    )


@router.get("/batch/{batch_id}", response_model=BatchStatusResponse)
async def get_batch_status(batch_id: str) -> BatchStatusResponse:
    """Get the current progress and status of a batch tailoring task."""
    batch = db.get_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    raw_items = db.get_batch_items(batch_id)
    items = []
    for it in raw_items:
        desc = it.get("job_description", "")
        snippet = (desc[:120] + "...") if len(desc) > 120 else desc
        items.append(
            BatchItemResponse(
                item_id=it["item_id"],
                index=it.get("index", 0),
                job_description_snippet=snippet,
                status=it.get("status", "pending"),
                tailored_resume_id=it.get("tailored_resume_id"),
                job_id=it.get("job_id"),
                error=it.get("error"),
                created_at=it.get("created_at", ""),
                updated_at=it.get("updated_at", ""),
            )
        )

    return BatchStatusResponse(
        batch_id=batch["batch_id"],
        resume_id=batch["resume_id"],
        total_jobs=batch.get("total_jobs", len(items)),
        completed_jobs=batch.get("completed_jobs", 0),
        failed_jobs=batch.get("failed_jobs", 0),
        status=batch.get("status", "queued"),
        rate_limit_seconds=float(batch.get("rate_limit_seconds", 5.0)),
        created_at=batch.get("created_at", ""),
        updated_at=batch.get("updated_at", ""),
        items=items,
    )


@router.get("/batches/list")
async def list_recent_batches() -> list[dict]:
    """List recent batch tailoring tasks."""
    return db.list_batches(limit=20)


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
async def parse_job_metadata(request: JobMetadataParseRequest) -> JobMetadataParseResponse:
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

    resume = await db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Master resume not found")

    # Extract metadata if not provided
    extracted = extract_job_details(request.job_description)
    role = (request.role or "").strip() or extracted.get("role", "")
    company = (request.company or "").strip() or extracted.get("company", "")
    job_req_id = (request.job_req_id or "").strip() or extracted.get("job_req_id", "")

    item_id = str(uuid4())
    rate_limit = max(0.0, float(request.rate_limit_seconds))

    item = db.create_queue_item(
        item_id=item_id,
        resume_id=request.resume_id,
        job_description=request.job_description.strip(),
        role=role,
        company=company,
        job_req_id=job_req_id,
        rate_limit_seconds=rate_limit,
        prompt_id=request.prompt_id,
    )

    await queue_manager.enqueue_item(item_id)
    return _format_queue_item(item)


@router.get("/queue", response_model=list[JobQueueItemResponse])
async def list_queue(resume_id: str | None = None) -> list[JobQueueItemResponse]:
    """Get recent items in the tailoring queue."""
    items = db.get_queue(resume_id=resume_id, limit=100)
    return [_format_queue_item(item) for item in items]


@router.delete("/queue/{item_id}")
async def delete_queue_item(item_id: str) -> dict:
    """Remove a specific item from the queue."""
    deleted = db.delete_queue_item(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return {"deleted": True, "item_id": item_id}


@router.delete("/queue")
async def clear_queue(status: str | None = None) -> dict:
    """Clear completed, failed, or all queue items."""
    count = db.clear_queue(status=status)
    return {"cleared_count": count}


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job description by ID."""
    job = await db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job
