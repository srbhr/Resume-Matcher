from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from uuid import uuid4
from app.services.resume_service import ResumeService
from app.core import get_db_session

resume_router = APIRouter()


@resume_router.post(
    "/upload",
    summary="Upload a resume in PDF or DOCX format and store it into DB in HTML/Markdown format",
)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db_session),
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
            status_code=400,
            detail="Invalid file type. Only PDF and DOCX files are allowed.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=400, detail="Empty file. Please upload a valid file."
        )

    try:
        resume_id = ResumeService(db).convert_and_store_resume(
            file_bytes=file_bytes,
            file_type=file.content_type,
            filename=file.filename,
            content_type="md",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

    return {
        "message": f"File {file.filename} successfully processed as MD and stored in the DB",
        "request_id": request_id,
        "resume_id": resume_id,
    }
