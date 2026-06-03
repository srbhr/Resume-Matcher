"""Conversational create-resume wizard endpoints (stateless authoring + persist)."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.database import db
from app.llm import get_llm_config
from app.schemas import (
    DraftSectionRequest,
    DraftSectionResponse,
    ResumeUploadResponse,
    WizardResumeCreate,
)
from app.schemas.models import ResumeData, normalize_resume_data
from app.services.creation import draft_section

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resumes", tags=["Resume Creation"])


def _llm_configured() -> bool:
    config = get_llm_config()
    return bool(config.api_key) or config.provider in ("ollama", "openai_compatible")


@router.post("/draft-section", response_model=DraftSectionResponse)
async def draft_section_endpoint(request: DraftSectionRequest) -> DraftSectionResponse:
    """Turn a user's plain answers into one validated ResumeData fragment."""
    if not _llm_configured():
        raise HTTPException(
            status_code=400, detail="LLM not configured. Please set an API key in Settings."
        )
    try:
        fragment = await draft_section(
            request.section,
            request.answers,
            name=request.name,
            role=request.role,
            resume_context=request.resume_context,
        )
    except Exception as e:
        logger.error("draft_section failed for section=%s: %s", request.section, e)
        raise HTTPException(
            status_code=500, detail="Failed to draft this section. Please try again."
        )
    return DraftSectionResponse(request_id=str(uuid4()), section=request.section, data=fragment)


@router.post("", response_model=ResumeUploadResponse)
async def create_resume_from_wizard(request: WizardResumeCreate) -> ResumeUploadResponse:
    """Persist the assembled resume; becomes master iff none exists."""
    try:
        normalized = normalize_resume_data(
            ResumeData.model_validate(request.processed_data).model_dump()
        )
        created = await db.create_resume_atomic_master(
            content=json.dumps(normalized, ensure_ascii=False),
            content_type="json",
            processed_data=normalized,
            processing_status="ready",
        )
        if request.title:
            await db.update_resume(created["resume_id"], {"title": request.title})
    except Exception as e:
        logger.error("create_resume_from_wizard failed: %s", e)
        raise HTTPException(
            status_code=500, detail="Failed to save your resume. Please try again."
        )
    return ResumeUploadResponse(
        message="Resume created.",
        request_id=str(uuid4()),
        resume_id=created["resume_id"],
        processing_status="ready",
        is_master=created["is_master"],
    )
