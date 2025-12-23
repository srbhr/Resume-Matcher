"""Resume improvement service using LLM."""

import json
from typing import Any

from app.llm import complete_json
from app.prompts import (
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPT,
)
from app.prompts.templates import RESUME_SCHEMA
from app.schemas import ResumeData


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Extract keywords and requirements from job description.

    Args:
        job_description: Raw job description text

    Returns:
        Structured keywords and requirements
    """
    prompt = EXTRACT_KEYWORDS_PROMPT.format(job_description=job_description)

    return await complete_json(
        prompt=prompt,
        system_prompt="You are an expert job description analyzer.",
    )


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
) -> dict[str, Any]:
    """Improve resume to better match job description.

    Args:
        original_resume: Original resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords

    Returns:
        Improved resume data matching ResumeData schema
    """
    keywords_str = json.dumps(job_keywords, indent=2)

    prompt = IMPROVE_RESUME_PROMPT.format(
        job_description=job_description,
        job_keywords=keywords_str,
        original_resume=original_resume,
        schema=RESUME_SCHEMA,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON.",
        max_tokens=8192,
    )

    # Validate against schema
    validated = ResumeData.model_validate(result)
    return validated.model_dump()


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate improvement suggestions based on job keywords.

    Args:
        job_keywords: Extracted job keywords

    Returns:
        List of improvement suggestions
    """
    improvements = []

    # Generate suggestions based on required skills
    required_skills = job_keywords.get("required_skills", [])
    for skill in required_skills[:3]:  # Top 3 required skills
        improvements.append({
            "suggestion": f"Emphasized '{skill}' to match job requirements",
            "lineNumber": None,
        })

    # Generate suggestions based on key responsibilities
    responsibilities = job_keywords.get("key_responsibilities", [])
    for resp in responsibilities[:2]:  # Top 2 responsibilities
        improvements.append({
            "suggestion": f"Aligned experience with: {resp}",
            "lineNumber": None,
        })

    # Default improvement if none generated
    if not improvements:
        improvements.append({
            "suggestion": "Resume content optimized for better keyword alignment with job description",
            "lineNumber": None,
        })

    return improvements
