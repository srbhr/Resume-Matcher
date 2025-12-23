"""Resume improvement service using LLM."""

import json
from typing import Any

from app.llm import complete_json
from app.prompts import (
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPT,
    SCORE_RESUME_PROMPT,
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


async def score_resume(
    resume_text: str, job_keywords: dict[str, Any]
) -> dict[str, Any]:
    """Score how well a resume matches job requirements.

    Args:
        resume_text: Resume content (markdown or JSON string)
        job_keywords: Extracted job keywords from extract_job_keywords

    Returns:
        Score and analysis results
    """
    keywords_str = json.dumps(job_keywords, indent=2)

    prompt = SCORE_RESUME_PROMPT.format(
        job_keywords=keywords_str,
        resume_text=resume_text,
    )

    return await complete_json(
        prompt=prompt,
        system_prompt="You are an expert ATS scoring system.",
    )


async def improve_resume(
    original_resume: str,
    job_description: str,
    current_score: int,
    job_keywords: dict[str, Any],
) -> dict[str, Any]:
    """Improve resume to better match job description.

    Args:
        original_resume: Original resume content (markdown)
        job_description: Target job description
        current_score: Current match score
        job_keywords: Extracted job keywords

    Returns:
        Improved resume data matching ResumeData schema
    """
    keywords_str = json.dumps(job_keywords, indent=2)

    prompt = IMPROVE_RESUME_PROMPT.format(
        current_score=current_score,
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


async def generate_improvements(
    original_score: dict[str, Any],
    new_score: dict[str, Any],
) -> list[dict[str, Any]]:
    """Generate list of improvement suggestions based on score changes.

    Args:
        original_score: Original scoring results
        new_score: New scoring results after improvement

    Returns:
        List of improvement suggestions
    """
    improvements = []

    # Compare matched skills
    original_matched = set(original_score.get("matched_skills", []))
    new_matched = set(new_score.get("matched_skills", []))
    added_skills = new_matched - original_matched

    for skill in added_skills:
        improvements.append({
            "suggestion": f"Added emphasis on '{skill}' to match job requirements",
            "lineNumber": None,  # Line numbers removed - not accurate
        })

    # Add gap closures
    original_gaps = set(original_score.get("gaps", []))
    new_gaps = set(new_score.get("gaps", []))
    closed_gaps = original_gaps - new_gaps

    for gap in closed_gaps:
        improvements.append({
            "suggestion": f"Addressed gap: {gap}",
            "lineNumber": None,
        })

    # Add strengths from new score
    new_strengths = new_score.get("strengths", [])
    for strength in new_strengths[:3]:  # Limit to top 3
        improvements.append({
            "suggestion": f"Highlighted strength: {strength}",
            "lineNumber": None,
        })

    # Default improvement if none detected
    if not improvements:
        score_diff = new_score.get("score", 0) - original_score.get("score", 0)
        if score_diff > 0:
            improvements.append({
                "suggestion": f"Optimized resume content for +{score_diff} points improvement",
                "lineNumber": None,
            })
        else:
            improvements.append({
                "suggestion": "Resume content reorganized for better keyword alignment",
                "lineNumber": None,
            })

    return improvements
