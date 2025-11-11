"""
Resume Validation API Endpoint

Provides endpoints for validating resume content without processing.
"""

import logging
import traceback
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services import ResumeValidator

logger = logging.getLogger(__name__)
validation_router = APIRouter()


class ValidationRequest(BaseModel):
    """Request model for resume validation"""
    content: str


class ValidationResponse(BaseModel):
    """Response model for resume validation"""
    is_valid: bool
    score: float
    issues: list
    sections_found: Dict[str, bool]
    statistics: Dict[str, Any]


@validation_router.post(
    "/validate",
    summary="Validate resume content and check for critical sections",
    response_model=ValidationResponse,
    status_code=status.HTTP_200_OK,
)
async def validate_resume(request: ValidationRequest) -> ValidationResponse:
    """
    Validates resume content and returns validation results including:
    - Presence of critical sections (contact, education, experience, skills)
    - Content length and formatting issues
    - Missing power keywords
    - Overall validation score

    Args:
        request: ValidationRequest containing the resume content to validate

    Returns:
        ValidationResponse with validation results

    Raises:
        HTTPException: If resume content is empty or invalid
    """
    try:
        if not request.content or not request.content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Resume content cannot be empty"
            )

        validator = ResumeValidator()
        validation_result = validator.validate(request.content)

        return ValidationResponse(**validation_result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Resume validation failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Resume validation failed: {str(e)}"
        )
