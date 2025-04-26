import logging
import traceback

from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Request, status

from app.core import get_db_session
from app.services.resume_service import ResumeService

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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only PDF and DOCX files are allowed.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file. Please upload a valid file.",
        )

    try:
        resume_service = ResumeService(db)
        resume_id = await resume_service.convert_and_store_resume(
            file_bytes=file_bytes,
            file_type=file.content_type,
            filename=file.filename,
            content_type="md",
        )
    except Exception as e:
        logger.error(
            f"Error processing file: {str(e)} - traceback: {traceback.format_exc()}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing file: {str(e)}",
        )

    return {
        "message": f"File {file.filename} successfully processed as MD and stored in the DB",
        "request_id": request_id,
        "resume_id": resume_id,
    }
