"""ATS screening endpoint."""

import json
import logging

from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas.ats import ATSScreenRequest, ATSScreeningResult
from app.services.ats_optimizer import run_pass2
from app.services.ats_scorer import run_pass1

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ats", tags=["ATS"])


@router.post("/screen", response_model=ATSScreeningResult)
async def screen_resume(request: ATSScreenRequest) -> ATSScreeningResult:
    """Run ATS screening: score + optimize resume vs job description."""
    # Validate at least one resume source and one job source
    if not request.resume_id and not request.resume_text:
        raise HTTPException(
            status_code=422,
            detail="Either resume_id or resume_text is required.",
        )
    if not request.job_id and not request.job_description:
        raise HTTPException(
            status_code=422,
            detail="Either job_id or job_description is required.",
        )

    # Resolve resume
    resume_text = request.resume_text or ""
    resume_json: dict = {}
    from_db = False

    if request.resume_id:
        resume = db.get_resume(request.resume_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found.")
        resume_json = resume.get("processed_data") or {}
        resume_text = resume.get("content", resume_text)
        from_db = True

    # Only enforce the minimum length check on directly-supplied resume_text,
    # not on content fetched from the database (which may be a stored reference).
    if not from_db and len(resume_text.strip()) < 100:
        raise HTTPException(
            status_code=400,
            detail="Resume text too short to analyze (minimum 100 characters).",
        )

    # Resolve job description
    job_text = request.job_description or ""

    if request.job_id:
        job = db.get_job(request.job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        job_text = job.get("content", job_text)

    # Pass 1: Score
    try:
        pass1 = await run_pass1(resume_text, job_text)
    except Exception as exc:
        logger.error("ATS Pass 1 failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="ATS scoring failed. Please try again.",
        ) from exc

    # Pass 2: Optimize (non-fatal — partial result returned on failure)
    optimized_resume = None
    optimization_suggestions: list[str] = []
    try:
        pass2 = await run_pass2(
            resume_json=resume_json,
            job_text=job_text,
            score_data=pass1,
        )
        optimized_resume = pass2["optimized_resume"]
        optimization_suggestions = pass2["optimization_suggestions"]
    except Exception as exc:
        logger.warning("ATS Pass 2 failed (non-fatal): %s", exc)

    # Optionally persist the optimized resume
    saved_resume_id: str | None = None
    if request.save_optimized:
        if optimized_resume is None:
            raise HTTPException(
                status_code=409,
                detail="Optimization unavailable — cannot save.",
            )
        try:
            optimized_dict = optimized_resume.model_dump()
            new_resume = db.create_resume(
                content=json.dumps(optimized_dict),
                content_type="json",
                processed_data=optimized_dict,
                processing_status="ready",
                parent_id=request.resume_id,
                title="ATS Optimized Resume",
            )
            saved_resume_id = new_resume["resume_id"]
        except Exception as exc:
            logger.error("Failed to save optimized resume: %s", exc)
            raise HTTPException(
                status_code=500,
                detail="Failed to save optimized resume.",
            ) from exc

    return ATSScreeningResult(
        score=pass1["score"],
        decision=pass1["decision"],
        keyword_table=pass1["keyword_table"],
        missing_keywords=pass1["missing_keywords"],
        warning_flags=pass1["warning_flags"],
        optimization_suggestions=optimization_suggestions,
        optimized_resume=optimized_resume,
        saved_resume_id=saved_resume_id,
    )
