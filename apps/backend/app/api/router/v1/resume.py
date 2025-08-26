import logging
import traceback

from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi import (
    APIRouter,
    File,
    UploadFile,
    HTTPException,
    Depends,
    Request,
    status,
    Query,
)
from pydantic import ValidationError

from app.core import get_db_session
from app.services import (
    ResumeService,
    ScoreImprovementService,
    ResumeNotFoundError,
    ResumeParsingError,
    ResumeValidationError,
    JobNotFoundError,
    JobParsingError,
    ResumeKeywordExtractionError,
    JobKeywordExtractionError,
)
from app.schemas.pydantic import ResumeImprovementRequest
from app.core.error_codes import to_error_payload
from app.core import settings
from app.core.auth import require_auth, Principal

resume_router = APIRouter()
logger = logging.getLogger(__name__)


@resume_router.post(
    "/upload",
    summary="Upload a resume in PDF or DOCX format and store it into DB in HTML/Markdown format",
)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    _principal: Principal = Depends(require_auth),
    defer: bool = Query(False, description="Defer structured extraction (faster response, background processing)"),
):
    """
    Accepts a PDF or DOCX file, converts it to HTML/Markdown, and stores it in the database.

    Raises:
        HTTPException: If the file type is not supported or if the file is empty.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))

    allowed_content_types = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]

    if file.content_type not in allowed_content_types:
        # unify envelope (400)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "request_id": request_id,
                "error": {
                    "code": "UNSUPPORTED_FILE_TYPE",
                    "message": "Invalid file type. Only PDF and DOCX files are allowed.",
                },
            },
        )

    file_bytes = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "request_id": request_id,
                "error": {
                    "code": "FILE_TOO_LARGE",
                    "message": f"File exceeds max size of {settings.MAX_UPLOAD_SIZE_MB}MB",
                },
            },
        )
    if not file_bytes:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "request_id": request_id,
                "error": {
                    "code": "EMPTY_FILE",
                    "message": "Empty file. Please upload a valid file.",
                },
            },
        )

    try:
        resume_service = ResumeService(db)
        resume_id = await resume_service.convert_and_store_resume(
            file_bytes=file_bytes,
            file_type=file.content_type,
            filename=file.filename,
            content_type="md",
            defer_structured=defer,
        )
        return {
            "request_id": request_id,
            "data": {
                "resume_id": resume_id,
                "processing": "deferred" if defer else "complete",
            },
        }
    except Exception as e:
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body)


@resume_router.post(
    "/improve",
    summary="Score and improve a resume against a job description",
)
async def score_and_improve(
    request: Request,
    payload: ResumeImprovementRequest,  # rely on pydantic model but catch ValidationError below
    db: AsyncSession = Depends(get_db_session),
    _principal: Principal = Depends(require_auth),
    stream: bool = Query(False, description="Enable streaming response using Server-Sent Events"),
    use_llm: bool = Query(True, description="If false, only deterministic baseline improvement is applied (no LLM call)"),
    require_llm: bool = Query(False, description="If true, fail instead of falling back when LLM/embeddings are unavailable"),
    equivalence_threshold: float | None = Query(None, ge=0.0, le=1.0, description="Cosine threshold for semantic keyword equivalence when weaving baseline"),
    always_core_tech: bool | None = Query(None, description="Always include 'Core Technologies' line even if nothing is missing"),
    min_uplift: float | None = Query(
        None,
        ge=0.0,
        le=100.0,
        description="Target relative uplift as fraction or percent (e.g., 0.2 or 20 for +20%) to try to reach with extra rounds",
    ),
    max_rounds: int | None = Query(None, ge=0, le=10, description="Extra LLM rounds if target not reached; safeguards runtime and cost"),
):
    """
    Scores and improves a resume against a job description.

    Raises:
        HTTPException: If the resume or job is not found.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))
    headers = {"X-Request-ID": request_id}

    request_payload = payload.model_dump()

    try:
        resume_id = str(request_payload.get("resume_id", ""))
        if not resume_id:
            raise ResumeNotFoundError(
                message="invalid value passed in `resume_id` field, please try again with valid resume_id."
            )
        job_id = str(request_payload.get("job_id", ""))
        if not job_id:
            raise JobNotFoundError(
                message="invalid value passed in `job_id` field, please try again with valid job_id."
            )
        score_improvement_service = ScoreImprovementService(db=db)

        # Enforce strict mode globally if enabled
        if settings.REQUIRE_LLM_STRICT:
            use_llm = True
            require_llm = True

        # Normalize min_uplift to a fraction in [0,1] even if provided as percentage (e.g., 20 => 0.20)
        if min_uplift is not None:
            try:
                # Accept values like 0.2 (fraction) or 20 (percent)
                min_uplift = float(min_uplift)
                if min_uplift > 1.0:
                    min_uplift = min_uplift / 100.0
                # Clamp to [0, 1]
                min_uplift = max(0.0, min(1.0, min_uplift))
            except Exception:
                # If parsing fails for any reason, ignore and let service defaults apply
                min_uplift = None

        if stream:
            return StreamingResponse(
                content=score_improvement_service.run_and_stream(
                    resume_id=resume_id,
                    job_id=job_id,
                    require_llm=require_llm,
                ),
                media_type="text/event-stream",
                headers=headers,
            )
        else:
            improvements = await score_improvement_service.run(
                resume_id=resume_id,
                job_id=job_id,
                use_llm=use_llm,
                require_llm=require_llm,
                equivalence_threshold=equivalence_threshold,
                always_core_tech=always_core_tech,
                min_uplift=min_uplift,
                max_rounds=max_rounds,
            )
            return JSONResponse(
                content={
                    "request_id": request_id,
                    "data": improvements,
                },
                headers=headers,
            )
    except ValidationError as ve:
        # Convert pydantic validation into unified 422 envelope
        code = status.HTTP_422_UNPROCESSABLE_ENTITY
        payload_err = {
            "request_id": request_id,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request body",
                "detail": ve.errors(),
            },
        }
        return JSONResponse(status_code=code, content=payload_err, headers=headers)
    except Exception as e:
        code, payload = to_error_payload(e, request_id)
        level = logger.warning if code == 422 else logger.error
        level(str(e))
        return JSONResponse(status_code=code, content=payload, headers=headers)


@resume_router.get(
    "",
    summary="Get resume data from both resume and processed_resume models",
)
async def get_resume(
    request: Request,
    resume_id: str = Query(..., description="Resume ID to fetch data for"),
    db: AsyncSession = Depends(get_db_session),
):
    """
    Retrieves resume data from both resume_model and processed_resume model by resume_id.

    Args:
        resume_id: The ID of the resume to retrieve

    Returns:
        Combined data from both resume and processed_resume models

    Raises:
        HTTPException: If the resume is not found or if there's an error fetching data.
    """
    request_id = getattr(request.state, "request_id", str(uuid4()))
    headers = {"X-Request-ID": request_id}

    try:
        if not resume_id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "request_id": request_id,
                    "error": {"code": "MISSING_RESUME_ID", "message": "resume_id is required"},
                },
                headers=headers,
            )

        resume_service = ResumeService(db)
        resume_data = await resume_service.get_resume_with_processed_data(
            resume_id=resume_id
        )
        
        if not resume_data:
            raise ResumeNotFoundError(
                message=f"Resume with id {resume_id} not found"
            )

        return JSONResponse(
            content={
                "request_id": request_id,
                "data": resume_data,
            },
            headers=headers,
        )
    
    except Exception as e:
        code, body = to_error_payload(e, request_id)
        return JSONResponse(status_code=code, content=body, headers=headers)