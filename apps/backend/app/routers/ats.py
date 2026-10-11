"""ATS parse-check endpoints (deterministic, no LLM)."""

import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.ai_budget import AIOperationDeadlineExceeded, AIOperationRoute
from app.database import db
from app.pdf import PDFRenderError
from app.routers.resumes import (
    _get_original_resume_data,
    _read_upload_content,
    _validate_upload_type,
)
from app.schemas.models import PageFitSettings
from app.services.ats_parse import parse_check_bytes, parse_check_render
from app.services.ats_parse.extract import SUPPORTED_SUFFIXES
from app.services.ats_parse.models import ParseCheckReport
from app.services.parser import (
    MAX_EXTRACTED_TEXT_BYTES,
    MAX_UNPACKED_DOCUMENT_BYTES,
    DocumentResourceLimitError,
)

logger = logging.getLogger(__name__)

router = APIRouter(route_class=AIOperationRoute, tags=["ATS"])

TOO_LARGE_DETAIL = (
    "Document content is too large to check. "
    f"Maximum expanded size is {MAX_UNPACKED_DOCUMENT_BYTES // (1024 * 1024)}MB "
    f"and extracted text is {MAX_EXTRACTED_TEXT_BYTES // (1024 * 1024)}MB."
)


@router.post("/ats/parse-check", response_model=ParseCheckReport)
async def parse_check_upload(file: UploadFile = File(...)) -> ParseCheckReport:
    """Check how well an ATS can extract text from an uploaded PDF or DOCX."""
    _validate_upload_type(file)
    if Path(file.filename or "").suffix.lower() not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Upload a PDF or DOCX file.")
    content = await _read_upload_content(file)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        return await parse_check_bytes(content, file.filename or "resume.pdf")
    except DocumentResourceLimitError as e:
        logger.warning("Parse check resource limit for %s: %s", file.filename, e)
        raise HTTPException(status_code=413, detail=TOO_LARGE_DETAIL) from e
    except AIOperationDeadlineExceeded:
        raise
    except TimeoutError as e:
        logger.warning("Parse check exceeded its deadline")
        raise HTTPException(
            status_code=504,
            detail="Parse check timed out. Please try a simpler document.",
        ) from e
    except Exception as e:
        logger.error("Parse check failed for %s: %s", file.filename, e)
        raise HTTPException(
            status_code=422,
            detail="Could not read this document. Please upload a valid PDF or DOCX file.",
        ) from e


@router.post("/resumes/{resume_id}/parse-check", response_model=ParseCheckReport)
async def parse_check_resume(
    resume_id: str, fit: PageFitSettings | None = None
) -> ParseCheckReport:
    """Render a saved resume like GET /resumes/{id}/pdf and parse-check the result."""
    resume = await db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    data = _get_original_resume_data(resume)
    if not data:
        raise HTTPException(
            status_code=422, detail="Resume has no structured data to check yet."
        )
    try:
        return await parse_check_render(resume_id, data, fit or PageFitSettings())
    except PDFRenderError as e:
        logger.error("Parse check render failed for %s: %s", resume_id, e)
        raise HTTPException(
            status_code=503, detail="Could not render the resume. Please try again."
        ) from e
    except AIOperationDeadlineExceeded:
        raise
    except TimeoutError as e:
        logger.warning("Parse check exceeded its deadline for %s", resume_id)
        raise HTTPException(status_code=504, detail="Parse check timed out.") from e
    except Exception as e:
        logger.error("Parse check failed for %s: %s", resume_id, e)
        raise HTTPException(
            status_code=500, detail="Parse check failed. Please try again."
        ) from e
