"""Job description management endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from app.database import DatabaseBusyError, db
from app.schemas import JobUploadRequest, JobUploadResponse

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


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job description by ID."""
    job = await db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job
