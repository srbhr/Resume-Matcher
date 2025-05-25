from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, HTTPException, Depends, Request, status

from app.core import get_db_session
from app.services import JobService
from app.schemas.pydantic.job import JobUploadRequest

job_router = APIRouter()


@job_router.post(
    "/upload",
    summary="stores the job posting in the database by parsing the JD into a structured format JSON",
)
async def upload_job(
    payload: JobUploadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """
    Accepts a job description as a MarkDown text and stores it in the database.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))

    allowed_content_types = [
        "application/json",
    ]

    content_type = request.headers.get("content-type")
    if not content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Content-Type header is missing",
        )

    if content_type not in allowed_content_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid Content-Type. Only {', '.join(allowed_content_types)} is/are allowed.",
        )

    try:
        job_service = JobService(db)
        job_ids = await job_service.create_and_store_job(payload.model_dump())

    except AssertionError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"{str(e)}",
        )

    return {
        "message": "data successfully processed",
        "job_id": job_ids,
        "request": {
            "request_id": request_id,
            "payload": payload,
        },
    }
