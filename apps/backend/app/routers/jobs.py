"""Job description management endpoints."""

from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas import JobUploadRequest, JobUploadResponse

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post("/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(request: JobUploadRequest) -> JobUploadResponse:
    """Upload one or more job descriptions.

    Stores the raw text for later use in resume tailoring.
    Returns an array of job_ids corresponding to the input array.
    """
    if not request.job_descriptions:
        raise HTTPException(status_code=400, detail="No job descriptions provided")

    job_ids = []
    for jd in request.job_descriptions:
        if not jd.strip():
            raise HTTPException(status_code=400, detail="Empty job description")

        job = db.create_job(
            content=jd.strip(),
            resume_id=request.resume_id,
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


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job description by ID."""
    job = db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job
