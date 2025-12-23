"""Resume management endpoints."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.database import db

logger = logging.getLogger(__name__)
from app.schemas import (
    ImproveResumeRequest,
    ImproveResumeResponse,
    ImproveResumeData,
    ResumeData,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeUploadResponse,
    RawResume,
)
from app.services.parser import parse_document, parse_resume_to_json
from app.services.improver import (
    extract_job_keywords,
    generate_improvements,
    improve_resume,
)

router = APIRouter(prefix="/resumes", tags=["Resumes"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(file: UploadFile = File(...)) -> ResumeUploadResponse:
    """Upload and process a resume file (PDF/DOCX).

    Converts the file to Markdown and stores it in the database.
    Optionally parses to structured JSON if LLM is configured.
    """
    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: PDF, DOC, DOCX",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to markdown
    try:
        markdown_content = await parse_document(content, file.filename or "resume.pdf")
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse document: {str(e)}",
        )

    # Check if this is the first resume (make it master)
    is_master = db.get_master_resume() is None

    # Store in database first with "processing" status
    resume = db.create_resume(
        content=markdown_content,
        content_type="md",
        filename=file.filename,
        is_master=is_master,
        processed_data=None,
        processing_status="processing",
    )

    # Try to parse to structured JSON (optional, may fail if LLM not configured)
    try:
        processed_data = await parse_resume_to_json(markdown_content)
        db.update_resume(resume["resume_id"], {
            "processed_data": processed_data,
            "processing_status": "ready",
        })
        resume["processed_data"] = processed_data
        resume["processing_status"] = "ready"
    except Exception as e:
        # LLM parsing failed, update status to failed
        logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
        db.update_resume(resume["resume_id"], {"processing_status": "failed"})
        resume["processing_status"] = "failed"

    return ResumeUploadResponse(
        message=f"File {file.filename} successfully processed as MD and stored in the DB",
        request_id=str(uuid4()),
        resume_id=resume["resume_id"],
    )


@router.get("", response_model=ResumeFetchResponse)
async def get_resume(resume_id: str = Query(...)) -> ResumeFetchResponse:
    """Fetch resume details by ID.

    Returns both raw markdown and structured data (if available).
    """
    resume = db.get_resume(resume_id)

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Get processing status (default to "pending" for old records)
    processing_status = resume.get("processing_status", "pending")

    # Build response
    raw_resume = RawResume(
        id=None,  # TinyDB doesn't have numeric IDs like SQL
        content=resume["content"],
        content_type=resume["content_type"],
        created_at=resume["created_at"],
        processing_status=processing_status,
    )

    # Get processed data if available (no more on-demand parsing)
    processed_data = resume.get("processed_data")
    processed_resume = ResumeData.model_validate(processed_data) if processed_data else None

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            raw_resume=raw_resume,
            processed_resume=processed_resume,
        ),
    )


@router.post("/improve", response_model=ImproveResumeResponse)
async def improve_resume_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Improve/tailor a resume for a specific job description.

    Uses LLM to analyze the job and generate an optimized resume version
    with improvement suggestions.
    """
    # Fetch resume
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Fetch job description
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    try:
        # Extract keywords from job description
        job_keywords = await extract_job_keywords(job["content"])

        # Generate improved resume
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
        )

        # Convert improved data to JSON string for storage
        improved_text = json.dumps(improved_data, indent=2)

        # Generate improvement suggestions
        improvements = generate_improvements(job_keywords)

        # Store the tailored resume
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
        )

        # Store improvement record
        request_id = str(uuid4())
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=ResumeData.model_validate(improved_data),
                improvements=[
                    {"suggestion": imp["suggestion"], "lineNumber": imp.get("lineNumber")}
                    for imp in improvements
                ],
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
            ),
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to improve resume: {str(e)}",
        )


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str) -> dict:
    """Delete a resume by ID."""
    if not db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}
