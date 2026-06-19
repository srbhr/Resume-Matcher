"""Resume wizard endpoints (adaptive one-question-at-a-time flow)."""

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
from app.services.resume_wizard import (
    RESUME_WIZARD_MAX_QUESTIONS,
    apply_back,
    apply_review,
    build_initial_wizard_state,
    run_ai_turn,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resume-wizard", tags=["Resume Wizard"])


@router.post("/turn", response_model=ResumeWizardTurnResponse)
async def resume_wizard_turn(
    request: ResumeWizardTurnRequest,
) -> ResumeWizardTurnResponse:
    """Advance the resume wizard by one structured turn."""
    try:
        action = request.action
        if action == "start":
            return ResumeWizardTurnResponse(state=build_initial_wizard_state())
        if action == "back":
            return ResumeWizardTurnResponse(state=apply_back(request.state))
        if action == "review":
            return ResumeWizardTurnResponse(state=apply_review(request.state))

        # Cost guard: once the question cap is reached, stop making LLM calls for
        # answer/skip turns and route the user to review instead of advancing.
        if request.state.asked_count >= RESUME_WIZARD_MAX_QUESTIONS:
            return ResumeWizardTurnResponse(state=apply_review(request.state))

        if action == "skip":
            state = await run_ai_turn(request.state, "", skip=True)
            return ResumeWizardTurnResponse(state=state)

        answer_text = request.answer.text if request.answer else ""
        state = await run_ai_turn(request.state, answer_text, skip=False)
        return ResumeWizardTurnResponse(state=state)
    except HTTPException:
        raise
    except ValueError as e:
        logger.error("Resume wizard turn validation failed: %s", e)
        raise HTTPException(status_code=422, detail="Could not update the resume draft.")
    except Exception as e:
        logger.error("Resume wizard turn failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Resume wizard failed. Please try again.",
        )


@router.post("/finalize", response_model=ResumeWizardFinalizeResponse)
async def finalize_resume_wizard(
    request: ResumeWizardFinalizeRequest,
) -> ResumeWizardFinalizeResponse:
    """Create the master resume from a validated wizard draft."""
    try:
        current_master = await db.get_master_resume()
        if current_master and current_master.get("processing_status") == "ready":
            raise HTTPException(
                status_code=409,
                detail="A master resume already exists. Delete it before creating a new one.",
            )

        normalized = normalize_resume_data(
            request.state.resume_data.model_dump(mode="json")
        )
        data = ResumeData.model_validate(normalized).model_dump(mode="json")
        content = json.dumps(data, ensure_ascii=False, sort_keys=True)
        name = data.get("personalInfo", {}).get("name", "").strip() or "Resume"
        title = f"{name} Master Resume"
        # Set the title in the atomic create so a separate update can't fail and
        # leave a committed-but-untitled master behind (which would 409 on retry).
        resume = await db.create_resume_atomic_master(
            content=content,
            content_type="json",
            filename=f"AI Resume Wizard - {name}.json",
            processed_data=data,
            processing_status="ready",
            title=title,
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
                detail="A master resume already exists. Delete it before creating a new one.",
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
        raise HTTPException(status_code=500, detail="Could not create master resume.")
