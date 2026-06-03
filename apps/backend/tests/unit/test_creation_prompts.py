"""The creation prompts must format cleanly with their declared placeholders."""

from app.prompts.creation import (
    DRAFT_EDUCATION_PROMPT,
    DRAFT_PROJECT_PROMPT,
    DRAFT_SKILLS_PROMPT,
    DRAFT_SUMMARY_PROMPT,
    DRAFT_WORK_PROMPT,
)


def test_work_prompt_formats():
    out = DRAFT_WORK_PROMPT.format(
        output_language="English", name="James", role="Backend Engineer", answers="google 2yrs payments"
    )
    assert "James" in out and "google" in out
    # Literal JSON example survived (doubled braces collapsed to single):
    assert '"company"' in out


def test_education_prompt_formats():
    assert '"institution"' in DRAFT_EDUCATION_PROMPT.format(
        output_language="English", name="James", answers="BS CS, MIT, 2018"
    )


def test_project_prompt_formats():
    assert '"name"' in DRAFT_PROJECT_PROMPT.format(
        output_language="English", name="James", answers="cli tool, 1k stars"
    )


def test_skills_prompt_formats():
    assert '"technicalSkills"' in DRAFT_SKILLS_PROMPT.format(
        output_language="English", answers="python, fastapi, aws"
    )


def test_summary_prompt_formats():
    assert '"summary"' in DRAFT_SUMMARY_PROMPT.format(
        output_language="English", name="James", resume_json='{"workExperience": []}'
    )
