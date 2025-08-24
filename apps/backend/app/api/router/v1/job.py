import logging
import traceback

from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, HTTPException, Depends, Request, status, Query
from fastapi.responses import JSONResponse

from app.core import get_db_session
from app.services import JobService, JobNotFoundError
from app.core.error_codes import to_error_payload
from app.schemas.pydantic.job import JobUploadRequest
from app.core import settings
from app.core.auth import require_auth, Principal

job_router = APIRouter()
logger = logging.getLogger(__name__)


@job_router.post(
    "/upload",
    summary="stores the job posting in the database by parsing the JD into a structured format JSON",
)
async def upload_job(
    payload: JobUploadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    _principal: Principal = Depends(require_auth),
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "request_id": request_id,
                "error": {"code": "MISSING_CONTENT_TYPE", "message": "Content-Type header is missing"},
            },
        )

    if content_type not in allowed_content_types:
        return JSONResponse(
            status_code=400,
            content={
                "request_id": request_id,
                "error": {
                    "code": "UNSUPPORTED_CONTENT_TYPE",
                    "message": f"Invalid Content-Type. Only {', '.join(allowed_content_types)} is/are allowed.",
                },
            },
        )

    # Approximate size check (re-serialize payload)
    raw_len = len(payload.model_dump_json().encode('utf-8'))
    if raw_len > settings.MAX_JSON_BODY_SIZE_KB * 1024:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "request_id": request_id,
                "error": {
                    "code": "JSON_TOO_LARGE",
                    "message": f"JSON body exceeds {settings.MAX_JSON_BODY_SIZE_KB}KB limit",
                },
            },
        )

    try:
        job_service = JobService(db)
        job_ids = await job_service.create_and_store_job(payload.model_dump())
        return {
            "request_id": request_id,
            "data": {"job_id": job_ids},
        }
    except (AssertionError, JobNotFoundError) as e:
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body)
    except Exception as e:
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body)


@job_router.get(
    "",
    summary="Get job data from both job and processed_job models",
)
async def get_job(
    request: Request,
    job_id: str = Query(..., description="Job ID to fetch data for"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Retrieves job data from both job_model and processed_job model by job_id.

    Args:
        job_id: The ID of the job to retrieve

    Returns:
        Combined data from both job and processed_job models

    Raises:
        HTTPException: If the job is not found or if there's an error fetching data.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))
    headers = {"X-Request-ID": request_id}

    try:
        if not job_id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "request_id": request_id,
                    "error": {"code": "MISSING_JOB_ID", "message": "job_id is required"},
                },
                headers=headers,
            )

        job_service = JobService(db)
        job_data = await job_service.get_job_with_processed_data(
            job_id=job_id
        )
        
        if not job_data:
            raise JobNotFoundError(
                message=f"Job with id {job_id} not found"
            )

        return JSONResponse(
            content={
                "request_id": request_id,
                "data": job_data,
            },
            headers=headers,
        )
    
    except JobNotFoundError as e:
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body, headers=headers)
    except Exception as e:
        logger.error(f"Error fetching job: {str(e)} - traceback: {traceback.format_exc()}")
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body, headers=headers)
