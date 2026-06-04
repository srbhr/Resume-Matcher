"""Resume wizard endpoints."""

import json
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas.models import ResumeData, normalize_resume_data
from app.schemas.resume_wizard import (
    ResumeWizardFinalizeRequest,
    ResumeWizardFinalizeResponse,
    ResumeWizardTurnRequest,
    ResumeWizardTurnResponse,
)
from app.services.resume_wizard import build_initial_wizard_state

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resume-wizard", tags=["Resume Wizard"])


@router.post("/turn", response_model=ResumeWizardTurnResponse)
async def resume_wizard_turn(
    request: ResumeWizardTurnRequest,
) -> ResumeWizardTurnResponse:
    """Advance the resume wizard by one structured turn.

    NOTE: Full AI-turn logic is implemented in Task 3. This stub keeps the
    router importable during the Task 2 → Task 3 transition.
    """
    raise HTTPException(
        status_code=501,
        detail="Resume wizard AI turn not yet implemented.",
    )


@router.post("/finalize", response_model=ResumeWizardFinalizeResponse)
async def finalize_resume_wizard(
    request: ResumeWizardFinalizeRequest,
) -> ResumeWizardFinalizeResponse:
    """Create the master resume from a validated wizard draft."""
    current_master = await db.get_master_resume()
    if current_master and current_master.get("processing_status") == "ready":
        raise HTTPException(
            status_code=409,
            detail="A master resume already exists. Delete it before creating a new one.",
        )

    try:
        normalized = normalize_resume_data(
            request.state.resume_data.model_dump(mode="json")
        )
        data = ResumeData.model_validate(normalized).model_dump(mode="json")
        content = json.dumps(data, ensure_ascii=False, sort_keys=True)
        name = data.get("personalInfo", {}).get("name", "").strip() or "Resume"
        title = f"{name} Master Resume"
        resume = await db.create_resume_atomic_master(
            content=content,
            content_type="json",
            filename=f"AI Resume Wizard - {name}.json",
            processed_data=data,
            processing_status="ready",
        )
        if not resume.get("is_master", False):
            try:
                await db.delete_resume(resume["resume_id"])
            except Exception as e:
                logger.error(
                    "Failed to clean up non-master wizard resume %s: %s",
                    resume.get("resume_id"),
                    e,
                )
            raise HTTPException(
                status_code=409,
                detail=(
                    "A master resume already exists. Delete it before creating a new one."
                ),
            )
        resume = await db.update_resume(
            resume["resume_id"],
            {"title": title},
        )
        return ResumeWizardFinalizeResponse(
            message="Master resume created.",
            request_id=str(uuid4()),
            resume_id=resume["resume_id"],
            processing_status="ready",
            is_master=resume.get("is_master", False),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Resume wizard finalize failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Could not create master resume.",
        )
