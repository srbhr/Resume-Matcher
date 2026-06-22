"""Job description management endpoints."""

from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas import JobDetail, JobSummary, JobUpdateRequest, JobUploadRequest, JobUploadResponse

router = APIRouter(prefix="/jobs", tags=["Jobs"])

_CONTENT_PREVIEW_LEN = 200


def _to_summary(job: dict) -> JobSummary:
    content = job.get("content", "")
    preview = content[:_CONTENT_PREVIEW_LEN]
    if len(content) > _CONTENT_PREVIEW_LEN:
        preview += "…"
    return JobSummary(
        job_id=job["job_id"],
        title=job.get("title"),
        company=job.get("company"),
        url=job.get("url"),
        content_preview=preview,
        resume_id=job.get("resume_id"),
        created_at=job["created_at"],
    )


def _to_detail(job: dict) -> JobDetail:
    return JobDetail(
        job_id=job["job_id"],
        title=job.get("title"),
        company=job.get("company"),
        url=job.get("url"),
        content=job.get("content", ""),
        resume_id=job.get("resume_id"),
        created_at=job["created_at"],
    )


@router.post("/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(request: JobUploadRequest) -> JobUploadResponse:
    """Upload one or more job descriptions.

    Stores the raw text for later use in resume tailoring.
    Returns an array of job_ids corresponding to the input array.
    The optional `company`, `title`, and `url` fields are applied to every job
    in the batch.
    """
    if not request.job_descriptions:
        raise HTTPException(status_code=400, detail="No job descriptions provided")

    job_ids = []
    for jd in request.job_descriptions:
        if not jd.strip():
            raise HTTPException(status_code=400, detail="Empty job description")

        job = await db.create_job(
            content=jd.strip(),
            resume_id=request.resume_id,
            company=request.company,
            title=request.title,
            url=request.url,
        )
        job_ids.append(job["job_id"])

    return JobUploadResponse(
        message="data successfully processed",
        job_id=job_ids,
        request={
            "job_descriptions": request.job_descriptions,
            "resume_id": request.resume_id,
        },
    )


@router.get("", response_model=list[JobSummary])
async def list_jobs() -> list[JobSummary]:
    """List all uploaded job descriptions."""
    return [_to_summary(job) for job in await db.list_jobs()]


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(job_id: str) -> JobDetail:
    """Get a job description by ID with all fields and full content."""
    job = await db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return _to_detail(job)


@router.patch("/{job_id}", response_model=JobDetail)
async def update_job(job_id: str, request: JobUpdateRequest) -> JobDetail:
    """Update optional metadata (company, title, url) on a job description."""
    if not await db.get_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    job = await db.update_job(job_id, updates)
    return _to_detail(job)
