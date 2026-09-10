"""Service helpers for the adaptive resume wizard."""

import copy
import json
import re
from collections import Counter, deque
from collections.abc import Callable
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError, field_validator

from app.config_cache import get_content_language
from app.llm import _scrub_secrets, complete_json
from app.prompts.resume_wizard import RESUME_WIZARD_TURN_PROMPT
from app.prompts.templates import get_language_name
from app.schemas.models import (
    Education,
    Experience,
    Project,
    ResumeData,
    normalize_resume_data,
)
from app.schemas.resume_wizard import (
    ResumeWizardHistoryEntry,
    ResumeWizardProgress,
    ResumeWizardQuestion,
    ResumeWizardState,
)
from app.services.improver import _sanitize_user_input
from app.services.resume_wizard_copy import wizard_copy

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


class _IdentifiedEntry(Protocol):
    """List entry carrying the stable identity shared with the wizard model."""

    id: int


class _ResumeWizardAIEnvelope(BaseModel):
    """Require resume data; omitted or null guidance uses safe defaults."""

    model_config = ConfigDict(strict=True)

    resume_data: dict[str, Any]
    next_question: dict[str, Any] | None = None
    inferred_skills: list[str] = Field(default_factory=list)
    is_complete: StrictBool = False

    @field_validator("inferred_skills", mode="before")
    @classmethod
    def _default_null_skills(cls, value: Any) -> Any:
        return [] if value is None else value

    @field_validator("is_complete", mode="before")
    @classmethod
    def _default_null_completion(cls, value: Any) -> Any:
        return False if value is None else value

# The keyword ("my name", "name") may be lower- or upper-cased, but the captured
# name must start uppercase — so we case the keyword explicitly with [Mm]/[Nn]
# instead of re.IGNORECASE (which would let the [A-Z] capture match lowercase
# words and produce false positives like "domain name facebook is" -> "facebook is").
_INTRO_NAME_PATTERNS = (
    re.compile(r"\bI(?:'| a)m\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
    re.compile(r"\b[Mm]y name is\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
    re.compile(r"\b[Nn]ame(?:'s| is)?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
)


def section_prompt(section: str, language: str = "en") -> str:
    """Deterministic fallback question text for a section."""
    return wizard_copy(language, section if section in _VALID_SECTIONS else "next")


def valid_section(section: str) -> str:
    """Clamp an LLM-provided section to a known value (defaults to review)."""
    return section if section in _VALID_SECTIONS else "review"


def build_initial_wizard_state() -> ResumeWizardState:
    """Build the first state shown to a user entering the wizard."""
    language = get_content_language()
    return ResumeWizardState(
        step="intro",
        resume_data=ResumeData(),
        current_question=ResumeWizardQuestion(
            text=section_prompt("intro", language), section="intro"
        ),
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


def build_review_warnings(data: ResumeData, language: str = "en") -> list[str]:
    """Deterministic, gentle notes about useful resume facts that are missing."""
    warnings: list[str] = []
    info = data.personalInfo
    # Name is the one HARD requirement for finalize (the request 422s without it),
    # so surface it at review rather than letting the user hit a generic failure.
    if not info.name.strip():
        warnings.append(wizard_copy(language, "warning_name"))
    contact = [
        info.email,
        info.phone,
        info.linkedin or "",
        info.github or "",
        info.website or "",
    ]
    if not any(value.strip() for value in contact):
        warnings.append(wizard_copy(language, "warning_contact"))
    if not data.workExperience and not data.personalProjects:
        warnings.append(wizard_copy(language, "warning_experience"))
    if not data.education:
        warnings.append(wizard_copy(language, "warning_education"))
    if not data.additional.technicalSkills:
        warnings.append(wizard_copy(language, "warning_skills"))
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


def _merge_entries[T: _IdentifiedEntry](
    existing: list[T],
    updated: list[T],
    key: Callable[[T], tuple[str, ...]],
    raw_updated: object,
) -> list[T]:
    """Merge echoed entries by stable id, appending entries declared as new.

    A partial model reply (e.g. it echoes only the role the user just described
    instead of the full list) must NOT erase earlier entries. So: existing
    entries the model omits are kept, entries retaining a known positive id are
    replaced in place, and entries without a known id are appended. The content
    signature remains only as compatibility for echoes that genuinely omit ids.
    Raw field presence must survive schema defaults because an explicit ``id: 0``
    is add intent even when a new entry shares the same content signature.
    """
    result = list(existing)
    id_index: dict[int, int] = {}
    signature_positions: dict[tuple[str, ...], deque[int]] = {}
    for position, item in enumerate(result):
        if item.id > 0:
            id_index.setdefault(item.id, position)
        signature_positions.setdefault(key(item), deque()).append(position)
    raw_items = raw_updated if isinstance(raw_updated, list) else []
    unidentified_full_echo = (
        len(existing) > 1
        and len(updated) == len(existing)
        and all(
            isinstance(raw_item, dict)
            and ("id" not in raw_item or raw_item.get("id") == 0)
            for raw_item in raw_items
        )
        and Counter(key(item) for item in updated)
        == Counter(key(item) for item in existing)
    )
    for item_index, item in enumerate(updated):
        raw_item = raw_items[item_index] if item_index < len(raw_items) else None
        has_explicit_id = isinstance(raw_item, dict) and "id" in raw_item
        position = id_index.pop(item.id, None) if item.id > 0 else None
        if unidentified_full_echo:
            position = signature_positions[key(item)][0]
        elif position is None and item.id <= 0 and not has_explicit_id:
            candidates = signature_positions.get(key(item), deque())
            if len(candidates) == 1:
                position = candidates[0]
        if position is not None:
            previous_key = key(result[position])
            candidates = signature_positions.get(previous_key)
            if candidates is not None:
                try:
                    candidates.remove(position)
                except ValueError:
                    pass
                if not candidates:
                    signature_positions.pop(previous_key)
            item.id = result[position].id
            result[position] = item
            continue

        # A positive id unknown to the current draft is not stable identity.
        # Treat it as add intent and let the allocator choose a collision-free id.
        item.id = 0
        result.append(item)
        if has_explicit_id:
            signature_positions.setdefault(key(item), deque()).append(len(result) - 1)
    return result


def _experience_key(item: Experience) -> tuple[str, ...]:
    return (
        item.title.strip().casefold(),
        item.company.strip().casefold(),
        item.years.strip().casefold(),
    )


def _education_key(item: Education) -> tuple[str, ...]:
    return (
        item.institution.strip().casefold(),
        item.degree.strip().casefold(),
        item.years.strip().casefold(),
    )


def _project_key(item: Project) -> tuple[str, ...]:
    return (item.name.strip().casefold(), item.years.strip().casefold())


def _merge_section(
    *,
    existing: ResumeData,
    updated: ResumeData,
    raw_updated: dict[str, Any],
    section: str,
    inferred_skills: list[str],
) -> ResumeData:
    """Merge LLM output ONLY into the active section, never clobbering the rest."""
    merged = existing.model_copy(deep=True)

    if section in {"intro", "contact"}:
        if isinstance(raw_updated.get("personalInfo"), dict):
            for field in ("name", "title", "email", "phone", "location"):
                new_val = getattr(updated.personalInfo, field)
                if isinstance(new_val, str) and new_val.strip():
                    setattr(merged.personalInfo, field, new_val)
            for field in ("website", "linkedin", "github"):
                new_val = getattr(updated.personalInfo, field)
                if new_val:
                    setattr(merged.personalInfo, field, new_val)
        return merged

    if section == "summary":
        if "summary" in raw_updated and updated.summary.strip():
            merged.summary = updated.summary
        return merged

    if section in {"workExperience", "internships"}:
        if "workExperience" in raw_updated:
            merged.workExperience = _merge_entries(
                merged.workExperience,
                updated.workExperience,
                _experience_key,
                raw_updated.get("workExperience"),
            )
        return merged

    if section == "education":
        if "education" in raw_updated:
            merged.education = _merge_entries(
                merged.education,
                updated.education,
                _education_key,
                raw_updated.get("education"),
            )
        return merged

    if section == "personalProjects":
        if "personalProjects" in raw_updated:
            merged.personalProjects = _merge_entries(
                merged.personalProjects,
                updated.personalProjects,
                _project_key,
                raw_updated.get("personalProjects"),
            )
        return merged

    if section == "skills":
        raw_additional = raw_updated.get("additional")
        if isinstance(raw_additional, dict):
            if "technicalSkills" in raw_additional:
                merged.additional.technicalSkills = merge_unique_skills(
                    merged.additional.technicalSkills,
                    updated.additional.technicalSkills,
                )
            if "languages" in raw_additional:
                merged.additional.languages = merge_unique_skills(
                    merged.additional.languages, updated.additional.languages
                )
            if "certificationsTraining" in raw_additional:
                merged.additional.certificationsTraining = merge_unique_skills(
                    merged.additional.certificationsTraining,
                    updated.additional.certificationsTraining,
                )
            if "awards" in raw_additional:
                merged.additional.awards = merge_unique_skills(
                    merged.additional.awards, updated.additional.awards
                )
        merged.additional.technicalSkills = merge_unique_skills(
            merged.additional.technicalSkills, inferred_skills
        )
        return merged

    # Unknown / review section: never mutate resume_data.
    return merged


def _assign_entry_ids(data: ResumeData) -> None:
    """Preserve stable positive ids and allocate ids only for new entries.

    Downstream consumers use ids for React keys and builder updates. An id echoed
    from the current draft must therefore survive corrections; omitted, invalid,
    or duplicate ids receive monotonically increasing replacements.
    """
    for entries in (data.workExperience, data.education, data.personalProjects):
        next_id = max((item.id for item in entries if item.id > 0), default=0) + 1
        used: set[int] = set()
        for item in entries:
            if item.id > 0 and item.id not in used:
                used.add(item.id)
                continue
            while next_id in used:
                next_id += 1
            item.id = next_id
            used.add(item.id)
            next_id += 1


def _next_question(
    candidate: dict[str, Any] | None,
    data: ResumeData,
    language: str,
) -> ResumeWizardQuestion:
    """Use the model's next_question, or fall back to the next empty section."""
    if isinstance(candidate, dict):
        text = candidate.get("text")
        section = candidate.get("section")
        if isinstance(text, str) and text.strip() and isinstance(section, str):
            return ResumeWizardQuestion(text=text.strip(), section=valid_section(section))
    gap = _next_gap_section(data)
    return ResumeWizardQuestion(text=section_prompt(gap, language), section=gap)


async def run_ai_turn(
    state: ResumeWizardState,
    answer_text: str,
    *,
    skip: bool,
) -> ResumeWizardState:
    """Run one adaptive AI turn (answer or skip) and validate the result."""
    section = state.current_question.section
    language = get_content_language()
    resume_json = json.dumps(state.resume_data.model_dump(mode="json"), ensure_ascii=False)
    prompt_answer = (
        "(The user skipped this question. Do NOT modify resume_data. "
        "Ask the next most useful question for a different section.)"
        if skip
        # Strip prompt-injection patterns AND redact credential-like tokens
        # (sk-…/AIza…/Bearer …) before the answer reaches the LLM.
        else _scrub_secrets(_sanitize_user_input(answer_text))
    )
    prompt = RESUME_WIZARD_TURN_PROMPT.format(
        output_language=get_language_name(language),
        current_section=section,
        resume_json=resume_json,
        answer_text=prompt_answer,
    )
    result = await complete_json(prompt, max_tokens=8192, schema_type="resume")
    try:
        envelope = _ResumeWizardAIEnvelope.model_validate(result)
    except ValidationError as error:
        raise ValueError("Resume wizard received an invalid response.") from error

    raw_resume = envelope.resume_data
    inferred = envelope.inferred_skills

    if skip:
        data = state.resume_data.model_copy(deep=True)
    else:
        updated = ResumeData.model_validate(normalize_wizard_resume_data(raw_resume))
        data = _merge_section(
            existing=state.resume_data,
            updated=updated,
            raw_updated=raw_resume,
            section=section,
            inferred_skills=inferred,
        )

    if section == "intro" and not data.personalInfo.name.strip():
        fallback = extract_intro_name(answer_text)
        if fallback:
            data.personalInfo.name = fallback

    # Entries from the LLM default to id=0; give them unique ids so the preview
    # keys and the builder's id-based logic work on a finalized wizard resume.
    _assign_entry_ids(data)

    asked_count = state.asked_count + 1
    # `is_complete` is a SUGGESTION to surface "Review & finish" — the step stays
    # "question" and never auto-finalizes. The client decides when to call /review.
    is_complete = envelope.is_complete or asked_count >= RESUME_WIZARD_MAX_QUESTIONS

    history = list(state.history)
    history.append(
        ResumeWizardHistoryEntry(
            question=state.current_question.text,
            answer="" if skip else answer_text,
            section=section,
            resume_data_before=state.resume_data,
        )
    )

    return ResumeWizardState(
        step="question",
        resume_data=data,
        current_question=_next_question(envelope.next_question, data, language),
        history=history,
        asked_count=asked_count,
        inferred_skills=inferred,
        is_complete=is_complete,
        progress=compute_progress(asked_count, is_complete),
        warnings=[],
    )


def apply_back(state: ResumeWizardState) -> ResumeWizardState:
    """Deterministically restore the previous question + draft snapshot."""
    if not state.history:
        return state.model_copy(deep=True)
    history = list(state.history)
    last = history.pop()
    asked_count = max(0, state.asked_count - 1)
    # Derive step from the restored question itself, not just the count, so a
    # restored non-intro question never renders under the intro step (which hides
    # the question-step actions).
    return ResumeWizardState(
        step="intro" if last.section == "intro" else "question",
        resume_data=last.resume_data_before,
        current_question=ResumeWizardQuestion(text=last.question, section=last.section),
        history=history,
        asked_count=asked_count,
        inferred_skills=[],
        is_complete=False,
        progress=compute_progress(asked_count, False),
        warnings=[],
    )


def apply_review(state: ResumeWizardState) -> ResumeWizardState:
    """Move to the review step (no LLM call) and compute gentle warnings."""
    language = get_content_language()
    next_state = state.model_copy(deep=True)
    next_state.step = "review"
    next_state.current_question = ResumeWizardQuestion(
        text=section_prompt("review", language), section="review"
    )
    next_state.warnings = build_review_warnings(next_state.resume_data, language)
    return next_state
