"""Cover letter and outreach message generation service."""

import json
from typing import Any

from app.llm import complete
from app.prompts.templates import COVER_LETTER_PROMPT, OUTREACH_MESSAGE_PROMPT


async def generate_cover_letter(
    resume_data: dict[str, Any],
    job_description: str,
) -> str:
    """Generate a cover letter based on resume and job description.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text

    Returns:
        Generated cover letter as plain text
    """
    prompt = COVER_LETTER_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data, indent=2),
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional career coach and resume writer. Write compelling, personalized cover letters.",
        max_tokens=2048,
    )

    return result.strip()


async def generate_outreach_message(
    resume_data: dict[str, Any],
    job_description: str,
) -> str:
    """Generate a cold outreach message for networking.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text

    Returns:
        Generated outreach message as plain text
    """
    prompt = OUTREACH_MESSAGE_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data, indent=2),
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional networking coach. Write genuine, engaging cold outreach messages.",
        max_tokens=1024,
    )

    return result.strip()
