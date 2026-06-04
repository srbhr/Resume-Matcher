"""Service helpers for the adaptive resume wizard."""

import copy
import json
import re
from typing import Any

from app.config_cache import get_content_language
from app.llm import complete_json
from app.prompts.resume_wizard import RESUME_WIZARD_TURN_PROMPT
from app.prompts.templates import get_language_name
from app.schemas.models import ResumeData, normalize_resume_data
from app.schemas.resume_wizard import (
    ResumeWizardHistoryEntry,
    ResumeWizardProgress,
    ResumeWizardQuestion,
    ResumeWizardState,
)

RESUME_WIZARD_MAX_QUESTIONS = 15
_PROGRESS_BASELINE = 8

_VALID_SECTIONS = {
    "intro",
    "contact",
    "summary",
    "workExperience",
    "internships",
    "education",
    "personalProjects",
    "skills",
    "review",
}

_INTRO_QUESTION = (
    "Hi — I'll help you build your master resume. "
    "What's your name, and what kind of role are you going for?"
)

_SECTION_PROMPTS = {
    "intro": _INTRO_QUESTION,
    "contact": "What's the best email, phone, or links (LinkedIn / GitHub / site) to include?",
    "summary": "In a sentence or two, how would you describe yourself professionally?",
    "workExperience": (
        "Tell me about one role: title, company, dates, what you did, and any measurable impact."
    ),
    "internships": (
        "Tell me about one internship: title, company, dates, what you worked on, "
        "and what changed because of it."
    ),
    "education": (
        "Tell me about your education: school, degree, dates, and any honors or standout coursework."
    ),
    "personalProjects": (
        "Tell me about one project: what you built, why it mattered, the tech you used, and any results."
    ),
    "skills": "What tools, technologies, or skills do you want on your resume?",
    "review": "Let's review what's here before we create your master resume.",
}

# The keyword ("my name", "name") may be lower- or upper-cased, but the captured
# name must start uppercase — so we case the keyword explicitly with [Mm]/[Nn]
# instead of re.IGNORECASE (which would let the [A-Z] capture match lowercase
# words and produce false positives like "domain name facebook is" -> "facebook is").
_INTRO_NAME_PATTERNS = (
    re.compile(r"\bI(?:'| a)m\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
    re.compile(r"\b[Mm]y name is\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
    re.compile(r"\b[Nn]ame(?:'s| is)?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
)


def section_prompt(section: str) -> str:
    """Deterministic fallback question text for a section."""
    return _SECTION_PROMPTS.get(section, "What would you like to add next?")


def valid_section(section: str) -> str:
    """Clamp an LLM-provided section to a known value (defaults to review)."""
    return section if section in _VALID_SECTIONS else "review"


def build_initial_wizard_state() -> ResumeWizardState:
    """Build the first state shown to a user entering the wizard."""
    return ResumeWizardState(
        step="intro",
        resume_data=ResumeData(),
        current_question=ResumeWizardQuestion(text=_INTRO_QUESTION, section="intro"),
        progress=ResumeWizardProgress(current=0, total=_PROGRESS_BASELINE),
    )


def extract_intro_name(answer: str) -> str:
    """Extract a likely user name from the intro answer."""
    for pattern in _INTRO_NAME_PATTERNS:
        match = pattern.search(answer)
        if match:
            return match.group(1).strip().rstrip(".")
    return ""


def merge_unique_skills(existing: list[str], inferred: list[str]) -> list[str]:
    """Merge skills while preserving first-seen casing and order."""
    merged: list[str] = []
    seen: set[str] = set()
    for item in [*existing, *inferred]:
        skill = item.strip()
        key = skill.casefold()
        if skill and key not in seen:
            merged.append(skill)
            seen.add(key)
    return merged


def build_review_warnings(data: ResumeData) -> list[str]:
    """Deterministic, gentle notes about useful resume facts that are missing."""
    warnings: list[str] = []
    info = data.personalInfo
    contact = [
        info.email,
        info.phone,
        info.linkedin or "",
        info.github or "",
        info.website or "",
    ]
    if not any(value.strip() for value in contact):
        warnings.append("Add at least one contact method (email, phone, or a link).")
    if not data.workExperience and not data.personalProjects:
        warnings.append("Add at least one experience, internship, or project.")
    if not data.education:
        warnings.append("Education is empty — skip only if that's intentional.")
    if not data.additional.technicalSkills:
        warnings.append("Skills are empty — add tools or technologies you've used.")
    return warnings


def compute_progress(asked_count: int, is_complete: bool) -> ResumeWizardProgress:
    """Server-side progress so the bar never trusts the model."""
    total = min(
        RESUME_WIZARD_MAX_QUESTIONS,
        max(_PROGRESS_BASELINE, asked_count + (0 if is_complete else 2)),
    )
    return ResumeWizardProgress(current=min(asked_count, total), total=total)


def normalize_wizard_resume_data(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize wizard resume data through the shared resume schema."""
    normalized = normalize_resume_data(copy.deepcopy(data))
    return ResumeData.model_validate(normalized).model_dump()


def _string_list(value: Any) -> list[str]:
    """Return string items from a list-like LLM field."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _next_gap_section(data: ResumeData) -> str:
    """Pick the next obviously-empty section, else review."""
    if not data.workExperience:
        return "workExperience"
    if not data.education:
        return "education"
    if not data.personalProjects:
        return "personalProjects"
    if not data.additional.technicalSkills:
        return "skills"
    return "review"
