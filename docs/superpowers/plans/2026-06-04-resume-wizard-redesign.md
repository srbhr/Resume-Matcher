# Resume Wizard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual section-picker resume wizard with an AI-led, one-question-at-a-time flow — one question at a time, the AI writes truthful resume content and chooses the next question, with a quiet live resume preview.

**Architecture:** A stateless backend turn protocol (full `ResumeWizardState` round-trips each call). One adaptive `complete_json` call per answer returns updated `resume_data`, the next question, inferred skills, and an `is_complete` flag; deterministic server-side guards (question cap, server-computed progress, section-scoped merge) keep it reliable. The frontend is a two-pane page: a one-question-at-a-time question card + a live preview. Finalize creates the single master resume and routes to `/builder`.

**Tech Stack:** FastAPI, Pydantic v2, LiteLLM `complete_json`, SQLite facade, Next.js 16 App Router, React 19, TypeScript, Tailwind v4, pytest, Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-04-resume-wizard-redesign-design.md`

---

## File Structure

Backend:
- Rewrite `apps/backend/app/schemas/resume_wizard.py` — new state/turn/finalize models.
- Rewrite `apps/backend/app/prompts/resume_wizard.py` — single adaptive turn prompt.
- Rewrite `apps/backend/app/services/resume_wizard.py` — adaptive turn + deterministic guards/helpers.
- Rewrite `apps/backend/app/routers/resume_wizard.py` — `/turn` (start/answer/skip/back/review) + `/finalize`.
- Rewrite `apps/backend/tests/unit/test_resume_wizard_service.py`.
- Rewrite `apps/backend/tests/integration/test_resume_wizard_api.py`.
- (`routers/__init__.py` and `main.py` already mount `resume_wizard_router` — no change.)

Frontend:
- Rewrite `apps/frontend/lib/api/resume-wizard.ts` — new types + helpers.
- Modify `apps/frontend/lib/api/index.ts` — its named re-export list currently includes `type ResumeWizardOption`, which the redesign removes; drop that one line (all other re-exported names still exist).
- Create `apps/frontend/components/resume-wizard/live-preview.tsx`.
- Delete `apps/frontend/components/resume-wizard/draft-preview.tsx`.
- Create `apps/frontend/components/resume-wizard/question-card.tsx`.
- Delete `apps/frontend/components/resume-wizard/section-picker.tsx`.
- Rewrite `apps/frontend/components/resume-wizard/resume-wizard-page.tsx`.
- Rewrite `apps/frontend/tests/resume-wizard-api.test.ts`.
- Rewrite `apps/frontend/tests/resume-wizard-page.test.tsx`.
- Modify all `apps/frontend/messages/*.json` — new `resumeWizard.*` keys (keep `resumeWizard.entry.*`).
- Modify `docs/agent/apis/front-end-apis.md` — update the Resume Wizard contract.
- (`tests/dashboard-master-choice.test.tsx` and the choice dialog are unchanged.)

---

### Task 1: Backend wizard schemas

**Files:**
- Rewrite: `apps/backend/app/schemas/resume_wizard.py`
- Test: `apps/backend/tests/unit/test_resume_wizard_service.py`

- [ ] **Step 1: Write the failing schema tests**

Replace the entire contents of `apps/backend/tests/unit/test_resume_wizard_service.py` with:

```python
"""Tests for the adaptive resume wizard schemas and service."""

import pytest
from pydantic import ValidationError

from app.schemas.resume_wizard import (
    ResumeWizardFinalizeRequest,
    ResumeWizardQuestion,
    ResumeWizardState,
    ResumeWizardTurnRequest,
)


def test_initial_state_defaults_to_intro() -> None:
    state = ResumeWizardState()
    assert state.step == "intro"
    assert state.current_question.section == "intro"
    assert state.resume_data.personalInfo.name == ""
    assert state.history == []
    assert state.asked_count == 0
    assert state.progress.total == 8


def test_turn_request_requires_answer_for_answer_action() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardTurnRequest(state=ResumeWizardState(), action="answer", answer=None)


def test_turn_request_skip_needs_no_answer() -> None:
    request = ResumeWizardTurnRequest(state=ResumeWizardState(), action="skip")
    assert request.action == "skip"
    assert request.answer is None


def test_question_rejects_unknown_section() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardQuestion(text="Hi", section="not-a-section")


def test_finalize_requires_non_empty_name() -> None:
    with pytest.raises(ValidationError):
        ResumeWizardFinalizeRequest(state=ResumeWizardState())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: ImportError / failures — the new schema names don't exist yet.

- [ ] **Step 3: Implement the schemas**

Replace the entire contents of `apps/backend/app/schemas/resume_wizard.py` with:

```python
"""Schemas for the adaptive (one-question-at-a-time) AI resume wizard."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.models import ResumeData

ResumeWizardSection = Literal[
    "intro",
    "contact",
    "summary",
    "workExperience",
    "internships",
    "education",
    "personalProjects",
    "skills",
    "review",
]

ResumeWizardStep = Literal["intro", "question", "review", "complete"]

ResumeWizardAction = Literal["start", "answer", "skip", "back", "review"]


class ResumeWizardQuestion(BaseModel):
    """A single question the wizard asks."""

    text: str = ""
    section: ResumeWizardSection = "intro"


class ResumeWizardProgress(BaseModel):
    """Server-computed progress for the question card's bar."""

    current: int = 0
    total: int = 8


class ResumeWizardAnswer(BaseModel):
    """User answer for one wizard turn."""

    text: str = Field(min_length=1, max_length=6000)


class ResumeWizardHistoryEntry(BaseModel):
    """One answered question, with a pre-answer draft snapshot for Back."""

    question: str
    answer: str
    section: ResumeWizardSection
    resume_data_before: ResumeData


class ResumeWizardState(BaseModel):
    """Complete state that round-trips between client and server."""

    step: ResumeWizardStep = "intro"
    resume_data: ResumeData = Field(default_factory=ResumeData)
    current_question: ResumeWizardQuestion = Field(default_factory=ResumeWizardQuestion)
    history: list[ResumeWizardHistoryEntry] = Field(default_factory=list)
    asked_count: int = 0
    inferred_skills: list[str] = Field(default_factory=list)
    is_complete: bool = False
    progress: ResumeWizardProgress = Field(default_factory=ResumeWizardProgress)
    warnings: list[str] = Field(default_factory=list)


class ResumeWizardTurnRequest(BaseModel):
    """Request for one wizard turn."""

    state: ResumeWizardState
    action: ResumeWizardAction
    answer: ResumeWizardAnswer | None = None

    @model_validator(mode="after")
    def _validate_answer_present(self) -> "ResumeWizardTurnRequest":
        if self.action == "answer" and self.answer is None:
            raise ValueError("answer is required for answer actions")
        return self


class ResumeWizardTurnResponse(BaseModel):
    """Response for one wizard turn."""

    state: ResumeWizardState


class ResumeWizardFinalizeRequest(BaseModel):
    """Request to create the master resume from the wizard draft."""

    state: ResumeWizardState

    @model_validator(mode="after")
    def _validate_ready_to_finalize(self) -> "ResumeWizardFinalizeRequest":
        if not self.state.resume_data.personalInfo.name.strip():
            raise ValueError("personalInfo.name is required")
        return self


class ResumeWizardFinalizeResponse(BaseModel):
    """Response after creating the master resume."""

    message: str
    request_id: str
    resume_id: str
    processing_status: Literal["ready"] = "ready"
    is_master: bool
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/schemas/resume_wizard.py apps/backend/tests/unit/test_resume_wizard_service.py
git commit -m "feat(wizard): adaptive resume wizard schemas"
```

---

### Task 2: Backend prompt + deterministic service helpers

**Files:**
- Rewrite: `apps/backend/app/prompts/resume_wizard.py`
- Rewrite: `apps/backend/app/services/resume_wizard.py` (helpers only in this task; the AI turn comes in Task 3)
- Test: `apps/backend/tests/unit/test_resume_wizard_service.py` (append)

- [ ] **Step 1: Append failing helper tests**

Append to `apps/backend/tests/unit/test_resume_wizard_service.py`:

```python
from app.schemas.models import ResumeData
from app.services.resume_wizard import (
    RESUME_WIZARD_MAX_QUESTIONS,
    build_initial_wizard_state,
    build_review_warnings,
    compute_progress,
    extract_intro_name,
    merge_unique_skills,
    section_prompt,
)


def test_build_initial_state_has_intro_question() -> None:
    state = build_initial_wizard_state()
    assert state.step == "intro"
    assert state.current_question.section == "intro"
    assert state.current_question.text.startswith("Hi")


def test_extract_intro_name_from_conversational_answer() -> None:
    assert extract_intro_name("Hi, I'm James and I want product roles") == "James"
    assert extract_intro_name("My name is Priya Sharma") == "Priya Sharma"
    assert extract_intro_name("just looking around") == ""


def test_merge_unique_skills_dedupes_case_insensitively_and_keeps_order() -> None:
    assert merge_unique_skills(["Python", "React"], ["python", "FastAPI"]) == [
        "Python",
        "React",
        "FastAPI",
    ]


def test_section_prompt_falls_back_for_unknown_section() -> None:
    assert section_prompt("workExperience").lower().startswith("tell me about one role")
    assert section_prompt("totally-unknown") == "What would you like to add next?"


def test_compute_progress_grows_with_questions_and_caps() -> None:
    early = compute_progress(asked_count=2, is_complete=False)
    assert early.current == 2
    assert early.total == 8
    capped = compute_progress(asked_count=RESUME_WIZARD_MAX_QUESTIONS, is_complete=True)
    assert capped.total == RESUME_WIZARD_MAX_QUESTIONS
    assert capped.current == RESUME_WIZARD_MAX_QUESTIONS


def test_review_warnings_identify_thin_resume() -> None:
    data = ResumeData()
    data.personalInfo.name = "James"
    warnings = build_review_warnings(data)
    assert any("contact" in w.lower() for w in warnings)
    assert any("experience" in w.lower() for w in warnings)
    assert any("skills" in w.lower() for w in warnings)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: ImportError — `app.services.resume_wizard` helpers don't exist in the new shape yet.

- [ ] **Step 3: Implement the adaptive prompt**

Replace the entire contents of `apps/backend/app/prompts/resume_wizard.py` with:

```python
"""Prompt template for the adaptive resume wizard turn."""

RESUME_WIZARD_TURN_PROMPT = """You are a truthful resume-writing assistant guiding a user \
through building a general master resume, ONE question at a time.

IMPORTANT: Write ALL output text — the next question AND resume content — in {output_language}.

You are working on this section right now: {current_section}

TRUTHFULNESS RULES (non-negotiable):
1. Never invent employers, job titles, dates, degrees, certifications, awards, metrics, tools, or skills.
2. Turn the user's OWN facts into strong, concise resume content. Do not add facts they did not give.
3. If a needed fact is missing or vague, do NOT guess — ask for it in "next_question".
4. Preserve existing draft data unless the user clearly changes it.
5. Build a GENERAL master resume, not a job-specific tailored one.

CONTENT SHAPE:
- Work and internship entries: aim for 3 bullets when enough facts exist.
- Project entries: aim for 2 bullets when enough facts exist.
- Skills come only from facts the user gave or existing draft data.

ADAPTIVE FLOW:
- Read the CURRENT DRAFT and the user's ANSWER. Update ONLY the {current_section} part of the resume.
- Then choose the most useful NEXT question and set "next_question.section" to the section it belongs to.
- Valid section values: intro, contact, summary, workExperience, internships, education, personalProjects, skills, review.
- Set "is_complete" to true ONLY when the resume is a solid general master resume (name + at least one substantive experience or project + some skills).

CURRENT DRAFT JSON:
{resume_json}

USER ANSWER:
{answer_text}

Output ONLY this JSON object and nothing else:
{{
  "resume_data": {{
    "personalInfo": {{"name": "", "title": "", "email": "", "phone": "", "location": "", "website": "", "linkedin": "", "github": ""}},
    "summary": "",
    "workExperience": [],
    "education": [],
    "personalProjects": [],
    "additional": {{"technicalSkills": [], "languages": [], "certificationsTraining": [], "awards": []}},
    "sectionMeta": [],
    "customSections": {{}}
  }},
  "next_question": {{"text": "Your next concise question", "section": "workExperience"}},
  "inferred_skills": ["Skill"],
  "is_complete": false
}}"""
```

- [ ] **Step 4: Implement the service helpers**

Replace the entire contents of `apps/backend/app/services/resume_wizard.py` with the following. (The AI turn function `run_ai_turn` and merge logic are added in Task 3; this task defines everything the unit tests above need.)

```python
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

_INTRO_NAME_PATTERNS = (
    re.compile(r"\bI(?:'| a)m\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)"),
    re.compile(
        r"\bmy name is\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bname(?:'s| is)?\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)",
        re.IGNORECASE,
    ),
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: all tests pass (Task 1 + Task 2 sets).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/prompts/resume_wizard.py apps/backend/app/services/resume_wizard.py apps/backend/tests/unit/test_resume_wizard_service.py
git commit -m "feat(wizard): adaptive prompt and deterministic service helpers"
```

---

### Task 3: Backend section merge, adaptive turn, and deterministic transitions

**Files:**
- Modify: `apps/backend/app/services/resume_wizard.py` (append functions)
- Test: `apps/backend/tests/unit/test_resume_wizard_service.py` (append)

- [ ] **Step 1: Append failing tests for merge, turn, back, review**

Append to `apps/backend/tests/unit/test_resume_wizard_service.py`:

```python
from unittest.mock import AsyncMock, patch

from app.services.resume_wizard import (
    apply_back,
    apply_review,
    run_ai_turn,
)

_AI_EXPERIENCE_RESULT = {
    "resume_data": {
        "personalInfo": {"name": "James"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "title": "Engineer",
                "company": "Acme",
                "years": "2021 - Present",
                "description": ["Shipped the billing service"],
            }
        ],
        "education": [],
        "personalProjects": [],
        "additional": {
            "technicalSkills": [],
            "languages": [],
            "certificationsTraining": [],
            "awards": [],
        },
        "sectionMeta": [],
        "customSections": {},
    },
    "next_question": {"text": "What did you build at Acme?", "section": "workExperience"},
    "inferred_skills": ["Python"],
    "is_complete": False,
}


def _state_on_section(section: str) -> ResumeWizardState:
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question = ResumeWizardQuestion(text="?", section=section)
    return state


async def test_ai_turn_merges_only_target_section_and_advances() -> None:
    state = _state_on_section("workExperience")
    state.resume_data.personalInfo.name = "James"
    state.resume_data.education = []

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_EXPERIENCE_RESULT,
    ):
        result = await run_ai_turn(state, "I was an engineer at Acme", skip=False)

    assert len(result.resume_data.workExperience) == 1
    assert result.resume_data.workExperience[0].company == "Acme"
    assert result.current_question.text == "What did you build at Acme?"
    assert result.asked_count == 1
    assert result.inferred_skills == ["Python"]
    assert len(result.history) == 1
    assert result.history[0].section == "workExperience"


async def test_ai_turn_does_not_let_other_sections_be_clobbered() -> None:
    state = _state_on_section("skills")
    state.resume_data.workExperience = []
    existing = {
        "id": 9,
        "title": "PM",
        "company": "Globex",
        "years": "2019 - 2021",
        "description": ["Ran the roadmap"],
    }
    state.resume_data = ResumeData.model_validate(
        {"workExperience": [existing], "additional": {"technicalSkills": ["SQL"]}}
    )

    skills_result = {
        "resume_data": {
            "workExperience": [],  # model wrongly clears experience
            "additional": {"technicalSkills": ["Python"]},
        },
        "next_question": {"text": "Anything else?", "section": "review"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=skills_result,
    ):
        result = await run_ai_turn(state, "I use Python", skip=False)

    # Experience preserved; skills merged (case-insensitive, order-preserving).
    assert len(result.resume_data.workExperience) == 1
    assert result.resume_data.additional.technicalSkills == ["SQL", "Python"]


async def test_ai_turn_question_cap_forces_completion() -> None:
    state = _state_on_section("workExperience")
    state.asked_count = RESUME_WIZARD_MAX_QUESTIONS - 1

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_EXPERIENCE_RESULT,  # is_complete False from model
    ):
        result = await run_ai_turn(state, "more detail", skip=False)

    assert result.asked_count == RESUME_WIZARD_MAX_QUESTIONS
    assert result.is_complete is True


async def test_ai_turn_skip_does_not_modify_resume_data() -> None:
    state = _state_on_section("education")
    before = state.resume_data.model_dump()

    skip_result = {
        "resume_data": {"education": [{"id": 1, "institution": "MIT"}]},
        "next_question": {"text": "What skills?", "section": "skills"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=skip_result,
    ):
        result = await run_ai_turn(state, "", skip=True)

    assert result.resume_data.model_dump() == before
    assert result.current_question.section == "skills"
    assert result.history[0].answer == ""


async def test_ai_turn_intro_uses_deterministic_name_fallback() -> None:
    state = build_initial_wizard_state()  # section intro
    result_without_name = {
        "resume_data": {"personalInfo": {"title": "Engineer"}},
        "next_question": {"text": "Where have you worked?", "section": "workExperience"},
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=result_without_name,
    ):
        result = await run_ai_turn(state, "Hi, I'm Priya, after backend roles", skip=False)

    assert result.resume_data.personalInfo.name == "Priya"


async def test_ai_turn_missing_next_question_falls_back_to_gap() -> None:
    state = _state_on_section("workExperience")
    bad_result = {
        "resume_data": _AI_EXPERIENCE_RESULT["resume_data"],
        "next_question": None,
        "inferred_skills": [],
        "is_complete": False,
    }
    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=bad_result,
    ):
        result = await run_ai_turn(state, "engineer at Acme", skip=False)

    # workExperience now filled → next gap is education.
    assert result.current_question.section == "education"


def test_apply_back_restores_previous_snapshot() -> None:
    state = _state_on_section("skills")
    state.asked_count = 2
    before = ResumeData()
    before.personalInfo.name = "James"
    state.history = [
        ResumeWizardHistoryEntry(
            question="Where have you worked?",
            answer="Acme",
            section="workExperience",
            resume_data_before=before,
        )
    ]
    state.resume_data.additional.technicalSkills = ["Python"]

    result = apply_back(state)

    assert result.asked_count == 1
    assert result.current_question.section == "workExperience"
    assert result.resume_data.additional.technicalSkills == []
    assert result.resume_data.personalInfo.name == "James"
    assert result.history == []


def test_apply_back_noop_without_history() -> None:
    state = build_initial_wizard_state()
    result = apply_back(state)
    assert result.step == "intro"
    assert result.asked_count == 0


def test_apply_review_builds_warnings_without_llm() -> None:
    state = _state_on_section("skills")
    state.resume_data.personalInfo.name = "James"
    result = apply_review(state)
    assert result.step == "review"
    assert result.current_question.section == "review"
    assert result.warnings  # thin resume → at least one note
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: ImportError — `run_ai_turn`, `apply_back`, `apply_review` not defined yet.

- [ ] **Step 3: Implement merge + turn + transitions**

Append to `apps/backend/app/services/resume_wizard.py`:

```python
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
            merged.workExperience = updated.workExperience
        return merged

    if section == "education":
        if "education" in raw_updated:
            merged.education = updated.education
        return merged

    if section == "personalProjects":
        if "personalProjects" in raw_updated:
            merged.personalProjects = updated.personalProjects
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


def _next_question(result: dict[str, Any], data: ResumeData) -> ResumeWizardQuestion:
    """Use the model's next_question, or fall back to the next empty section."""
    candidate = result.get("next_question")
    if isinstance(candidate, dict):
        text = candidate.get("text")
        section = candidate.get("section")
        if isinstance(text, str) and text.strip() and isinstance(section, str):
            return ResumeWizardQuestion(text=text.strip(), section=valid_section(section))
    gap = _next_gap_section(data)
    return ResumeWizardQuestion(text=section_prompt(gap), section=gap)


async def run_ai_turn(
    state: ResumeWizardState,
    answer_text: str,
    *,
    skip: bool,
) -> ResumeWizardState:
    """Run one adaptive AI turn (answer or skip) and validate the result."""
    section = state.current_question.section
    resume_json = json.dumps(state.resume_data.model_dump(mode="json"), ensure_ascii=False)
    prompt_answer = (
        "(The user skipped this question. Do NOT modify resume_data. "
        "Ask the next most useful question for a different section.)"
        if skip
        else answer_text
    )
    prompt = RESUME_WIZARD_TURN_PROMPT.format(
        output_language=get_language_name(get_content_language()),
        current_section=section,
        resume_json=resume_json,
        answer_text=prompt_answer,
    )
    result = await complete_json(prompt, max_tokens=8192, schema_type="resume")
    if not isinstance(result, dict):
        raise ValueError("Resume wizard LLM response must be a JSON object.")

    raw_resume = result.get("resume_data")
    inferred = _string_list(result.get("inferred_skills"))

    if skip or not isinstance(raw_resume, dict):
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

    asked_count = state.asked_count + 1
    is_complete = bool(result.get("is_complete")) or asked_count >= RESUME_WIZARD_MAX_QUESTIONS

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
        current_question=_next_question(result, data),
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
    return ResumeWizardState(
        step="question" if asked_count > 0 else "intro",
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
    next_state = state.model_copy(deep=True)
    next_state.step = "review"
    next_state.current_question = ResumeWizardQuestion(
        text=section_prompt("review"), section="review"
    )
    next_state.warnings = build_review_warnings(next_state.resume_data)
    return next_state
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py -v`
Expected: all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/resume_wizard.py apps/backend/tests/unit/test_resume_wizard_service.py
git commit -m "feat(wizard): adaptive AI turn, section-scoped merge, back/review"
```

---

### Task 4: Backend router

**Files:**
- Rewrite: `apps/backend/app/routers/resume_wizard.py`
- Test: `apps/backend/tests/integration/test_resume_wizard_api.py`

- [ ] **Step 1: Write the failing integration tests**

Replace the entire contents of `apps/backend/tests/integration/test_resume_wizard_api.py` with:

```python
"""Integration tests for the adaptive resume wizard endpoints."""

import json
from unittest.mock import AsyncMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.resume_wizard import build_initial_wizard_state

_AI_RESULT = {
    "resume_data": {
        "personalInfo": {"name": "James"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "additional": {
            "technicalSkills": ["Python"],
            "languages": [],
            "certificationsTraining": [],
            "awards": [],
        },
        "sectionMeta": [],
        "customSections": {},
    },
    "next_question": {"text": "What tools do you use most?", "section": "skills"},
    "inferred_skills": ["FastAPI"],
    "is_complete": False,
}


async def test_turn_answer_runs_ai_and_returns_next_question(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.current_question.section = "skills"

    with patch(
        "app.services.resume_wizard.complete_json",
        new_callable=AsyncMock,
        return_value=_AI_RESULT,
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/resume-wizard/turn",
                json={
                    "state": state.model_dump(mode="json"),
                    "action": "answer",
                    "answer": {"text": "I use Python and FastAPI."},
                },
            )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["current_question"]["text"] == "What tools do you use most?"
    assert payload["resume_data"]["additional"]["technicalSkills"] == ["Python", "FastAPI"]
    assert payload["asked_count"] == 1


async def test_turn_review_needs_no_llm(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.step = "question"
    state.resume_data.personalInfo.name = "James"

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "review"},
        )

    assert response.status_code == 200
    payload = response.json()["state"]
    assert payload["step"] == "review"
    assert payload["warnings"]


async def test_turn_answer_without_answer_is_422(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/turn",
            json={"state": state.model_dump(mode="json"), "action": "answer"},
        )
    assert response.status_code == 422


async def test_finalize_creates_ready_master_resume(isolated_db) -> None:
    transport = ASGITransport(app=app)
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"
    state.resume_data.personalInfo.email = "james@example.com"
    state.resume_data.additional.technicalSkills = ["Python"]

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": state.model_dump(mode="json")},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["processing_status"] == "ready"
    assert payload["is_master"] is True

    stored = await isolated_db.get_resume(payload["resume_id"])
    assert stored is not None
    assert stored["is_master"] is True
    assert stored["content_type"] == "json"
    assert json.loads(stored["content"])["personalInfo"]["name"] == "James"


async def test_finalize_rejects_when_master_exists(isolated_db, sample_resume) -> None:
    await isolated_db.create_resume(
        content=json.dumps(sample_resume),
        content_type="json",
        filename="existing.json",
        is_master=True,
        processed_data=sample_resume,
        processing_status="ready",
    )
    state = build_initial_wizard_state()
    state.resume_data.personalInfo.name = "James"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/resume-wizard/finalize",
            json={"state": state.model_dump(mode="json")},
        )

    assert response.status_code == 409
    assert "already exists" in response.json()["detail"].lower()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && uv run pytest tests/integration/test_resume_wizard_api.py -v`
Expected: failures — the router still has the old action set / response shape.

- [ ] **Step 3: Implement the router**

Replace the entire contents of `apps/backend/app/routers/resume_wizard.py` with:

```python
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
                detail="A master resume already exists. Delete it before creating a new one.",
            )
        resume = await db.update_resume(resume["resume_id"], {"title": title})
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && uv run pytest tests/integration/test_resume_wizard_api.py -v`
Expected: 5 passed.

- [ ] **Step 5: Run the full backend wizard suite**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py tests/integration/test_resume_wizard_api.py -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/routers/resume_wizard.py apps/backend/tests/integration/test_resume_wizard_api.py
git commit -m "feat(wizard): adaptive turn router + finalize"
```

---

### Task 5: Frontend API client

**Files:**
- Rewrite: `apps/frontend/lib/api/resume-wizard.ts`
- Test: `apps/frontend/tests/resume-wizard-api.test.ts`

- [ ] **Step 1: Write the failing API tests**

Replace the entire contents of `apps/frontend/tests/resume-wizard-api.test.ts` with:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
} from '@/lib/api/resume-wizard';

describe('resume wizard api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ state: createInitialResumeWizardState() }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the expected initial state', () => {
    const state = createInitialResumeWizardState();
    expect(state.step).toBe('intro');
    expect(state.current_question.section).toBe('intro');
    expect(state.current_question.text.length).toBeGreaterThan(0);
    expect(state.resume_data.personalInfo?.name).toBe('');
    expect(state.asked_count).toBe(0);
    expect(state.progress.total).toBe(8);
  });

  it('posts a turn to the resume-wizard endpoint', async () => {
    const state = createInitialResumeWizardState();
    await postResumeWizardTurn({ state, action: 'answer', answer: { text: "I'm James." } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/resume-wizard/turn');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).answer.text).toBe("I'm James.");
  });

  it('throws endpoint text when finalize fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('already exists', { status: 409 }));
    await expect(finalizeResumeWizard(createInitialResumeWizardState())).rejects.toThrow(
      /already exists/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npm run test -- resume-wizard-api.test.ts`
Expected: failures — old shape (`current_section`, no `current_question`).

- [ ] **Step 3: Implement the API client**

Replace the entire contents of `apps/frontend/lib/api/resume-wizard.ts` with:

```typescript
import type { ResumeData } from '@/components/dashboard/resume-component';
import { apiPost } from './client';

export type ResumeWizardSection =
  | 'intro'
  | 'contact'
  | 'summary'
  | 'workExperience'
  | 'internships'
  | 'education'
  | 'personalProjects'
  | 'skills'
  | 'review';

export type ResumeWizardStep = 'intro' | 'question' | 'review' | 'complete';
export type ResumeWizardAction = 'start' | 'answer' | 'skip' | 'back' | 'review';

export interface ResumeWizardQuestion {
  text: string;
  section: ResumeWizardSection;
}

export interface ResumeWizardProgress {
  current: number;
  total: number;
}

export interface ResumeWizardHistoryEntry {
  question: string;
  answer: string;
  section: ResumeWizardSection;
  resume_data_before: ResumeData;
}

export interface ResumeWizardState {
  step: ResumeWizardStep;
  resume_data: ResumeData;
  current_question: ResumeWizardQuestion;
  history: ResumeWizardHistoryEntry[];
  asked_count: number;
  inferred_skills: string[];
  is_complete: boolean;
  progress: ResumeWizardProgress;
  warnings: string[];
}

export interface ResumeWizardTurnRequest {
  state: ResumeWizardState;
  action: ResumeWizardAction;
  answer?: { text: string };
}

export interface ResumeWizardTurnResponse {
  state: ResumeWizardState;
}

export interface ResumeWizardFinalizeResponse {
  message: string;
  request_id: string;
  resume_id: string;
  processing_status: 'ready';
  is_master: boolean;
}

export const INTRO_QUESTION =
  "Hi — I'll help you build your master resume. What's your name, and what kind of role are you going for?";

function emptyResumeData(): ResumeData {
  return {
    personalInfo: {
      name: '',
      title: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      linkedin: '',
      github: '',
    },
    summary: '',
    workExperience: [],
    education: [],
    personalProjects: [],
    additional: { technicalSkills: [], languages: [], certificationsTraining: [], awards: [] },
    customSections: {},
    sectionMeta: [],
  };
}

export function createInitialResumeWizardState(): ResumeWizardState {
  return {
    step: 'intro',
    resume_data: emptyResumeData(),
    current_question: { text: INTRO_QUESTION, section: 'intro' },
    history: [],
    asked_count: 0,
    inferred_skills: [],
    is_complete: false,
    progress: { current: 0, total: 8 },
    warnings: [],
  };
}

export async function postResumeWizardTurn(
  payload: ResumeWizardTurnRequest
): Promise<ResumeWizardTurnResponse> {
  const response = await apiPost('/resume-wizard/turn', payload);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Resume wizard turn failed with status ${response.status}`);
  }
  return response.json();
}

export async function finalizeResumeWizard(
  state: ResumeWizardState
): Promise<ResumeWizardFinalizeResponse> {
  const response = await apiPost('/resume-wizard/finalize', { state });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Resume wizard finalize failed with status ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 4: Fix the barrel export in `lib/api/index.ts`**

`apps/frontend/lib/api/index.ts` re-exports wizard symbols by name and includes `type ResumeWizardOption`, which no longer exists. Remove exactly that one line so the named export list compiles. The block should read:

```typescript
// Resume wizard operations
export {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardAction,
  type ResumeWizardFinalizeResponse,
  type ResumeWizardSection,
  type ResumeWizardState,
  type ResumeWizardStep,
  type ResumeWizardTurnRequest,
  type ResumeWizardTurnResponse,
} from './resume-wizard';
```

(The `type ResumeWizardOption,` line is deleted; every other name still resolves.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/frontend && npm run test -- resume-wizard-api.test.ts`
Expected: 3 passed.

Also typecheck the barrel: `cd apps/frontend && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -i resume-wizard || echo "no wizard type errors"`
Expected: `no wizard type errors`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/lib/api/resume-wizard.ts apps/frontend/lib/api/index.ts apps/frontend/tests/resume-wizard-api.test.ts
git commit -m "feat(wizard): adaptive wizard API client types"
```

---

### Task 6: Frontend live preview component

**Files:**
- Create: `apps/frontend/components/resume-wizard/live-preview.tsx`
- Delete: `apps/frontend/components/resume-wizard/draft-preview.tsx`
- Test: `apps/frontend/tests/resume-wizard-live-preview.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/frontend/tests/resume-wizard-live-preview.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LivePreview } from '@/components/resume-wizard/live-preview';
import { createInitialResumeWizardState } from '@/lib/api/resume-wizard';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

describe('LivePreview', () => {
  it('shows the empty state before any answers', () => {
    render(<LivePreview resumeData={createInitialResumeWizardState().resume_data} inferredSkills={[]} />);
    expect(screen.getByText('resumeWizard.preview.empty')).toBeInTheDocument();
  });

  it('renders name, experience and skills as content (not counts)', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya Shah' };
    data.workExperience = [{ id: 1, title: 'Senior PM', company: 'Acme', years: '2021', description: ['Cut churn 18%'] }];
    data.additional = { technicalSkills: ['SQL', 'Roadmapping'] };

    render(<LivePreview resumeData={data} inferredSkills={[]} />);

    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText(/Senior PM/)).toBeInTheDocument();
    expect(screen.getByText('Cut churn 18%')).toBeInTheDocument();
    const region = screen.getByRole('complementary');
    expect(within(region).getByText('SQL')).toBeInTheDocument();
  });

  it('deduplicates inferred and existing skills case-insensitively', () => {
    const data = createInitialResumeWizardState().resume_data;
    data.personalInfo = { name: 'Priya' };
    data.additional = { technicalSkills: ['React'] };

    render(<LivePreview resumeData={data} inferredSkills={['react', 'Node.js']} />);

    expect(screen.getAllByText(/^react$/i)).toHaveLength(1);
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npm run test -- resume-wizard-live-preview.test.tsx`
Expected: import failure for `@/components/resume-wizard/live-preview`.

- [ ] **Step 3: Implement the live preview and delete the old draft preview**

Create `apps/frontend/components/resume-wizard/live-preview.tsx`:

```tsx
'use client';

import type { ResumeData } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface LivePreviewProps {
  resumeData: ResumeData;
  inferredSkills: string[];
}

function dedupeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const skill of skills) {
    const trimmed = skill.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

export function LivePreview({ resumeData, inferredSkills }: LivePreviewProps) {
  const { t } = useTranslations();
  const personalInfo = resumeData.personalInfo ?? {};
  const experience = resumeData.workExperience ?? [];
  const projects = resumeData.personalProjects ?? [];
  const education = resumeData.education ?? [];
  const technicalSkills = resumeData.additional?.technicalSkills ?? [];
  const skills = dedupeSkills([...technicalSkills, ...inferredSkills]);
  const inferredKeys = new Set(inferredSkills.map((s) => s.trim().toLocaleLowerCase()));

  const hasAnyContent =
    Boolean(personalInfo.name?.trim()) ||
    experience.length > 0 ||
    projects.length > 0 ||
    education.length > 0 ||
    skills.length > 0;

  return (
    <aside
      aria-label={t('resumeWizard.preview.label')}
      className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_#000000]"
    >
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-700">
        {t('resumeWizard.preview.label')}
      </p>

      {!hasAnyContent ? (
        <p className="mt-6 font-sans text-sm text-steel-grey">{t('resumeWizard.preview.empty')}</p>
      ) : (
        <div className="mt-3 space-y-5">
          <div>
            <h2 className="font-serif text-2xl font-bold leading-tight">
              {personalInfo.name?.trim() || t('resumeWizard.preview.unnamed')}
            </h2>
            {personalInfo.title?.trim() && (
              <p className="font-sans text-sm text-steel-grey">{personalInfo.title}</p>
            )}
          </div>

          {experience.length > 0 && (
            <section>
              <p className="border-b border-black pb-1 font-mono text-xs font-bold uppercase tracking-wider">
                {t('resumeWizard.preview.experience')}
              </p>
              {experience.map((item) => (
                <div key={item.id} className="mt-2">
                  <p className="font-sans text-sm font-bold">
                    {[item.title, item.company].filter(Boolean).join(' · ')}
                  </p>
                  {item.years?.trim() && (
                    <p className="font-mono text-xs text-steel-grey">{item.years}</p>
                  )}
                  <ul className="mt-1 space-y-1">
                    {(item.description ?? []).map((line, index) => (
                      <li key={index} className="font-sans text-xs leading-snug">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {projects.length > 0 && (
            <section>
              <p className="border-b border-black pb-1 font-mono text-xs font-bold uppercase tracking-wider">
                {t('resumeWizard.preview.projects')}
              </p>
              {projects.map((item) => (
                <p key={item.id} className="mt-2 font-sans text-sm font-bold">
                  {item.name}
                </p>
              ))}
            </section>
          )}

          {education.length > 0 && (
            <section>
              <p className="border-b border-black pb-1 font-mono text-xs font-bold uppercase tracking-wider">
                {t('resumeWizard.preview.education')}
              </p>
              {education.map((item) => (
                <p key={item.id} className="mt-2 font-sans text-sm">
                  {[item.degree, item.institution].filter(Boolean).join(' · ')}
                </p>
              ))}
            </section>
          )}

          {skills.length > 0 && (
            <section>
              <p className="border-b border-black pb-1 font-mono text-xs font-bold uppercase tracking-wider">
                {t('resumeWizard.preview.skills')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((skill) => {
                  const isNew = inferredKeys.has(skill.toLocaleLowerCase());
                  return (
                    <span
                      key={skill}
                      className={
                        isNew
                          ? 'border border-green-700 bg-background px-2 py-1 font-mono text-xs text-green-700'
                          : 'border border-black bg-background px-2 py-1 font-mono text-xs'
                      }
                    >
                      {isNew ? `${skill} ✓` : skill}
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
```

Then delete the old preview:

```bash
rm apps/frontend/components/resume-wizard/draft-preview.tsx
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npm run test -- resume-wizard-live-preview.test.tsx`
Expected: 3 passed.

> Note: the green-accent skill renders as `SQL ✓`; the dedupe test asserts `getByText('Node.js')` and a single case-insensitive `react`. The `✓` only appends for inferred skills, so existing-only skills (`SQL`, `Roadmapping`) match exact text in Step 1's second test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/resume-wizard/live-preview.tsx apps/frontend/tests/resume-wizard-live-preview.test.tsx
git rm apps/frontend/components/resume-wizard/draft-preview.tsx
git commit -m "feat(wizard): live resume preview replaces stat panel"
```

---

### Task 7: Frontend question card component

**Files:**
- Create: `apps/frontend/components/resume-wizard/question-card.tsx`
- Delete: `apps/frontend/components/resume-wizard/section-picker.tsx`
- Test: `apps/frontend/tests/resume-wizard-question-card.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/frontend/tests/resume-wizard-question-card.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuestionCard } from '@/components/resume-wizard/question-card';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  question: 'What is your most recent role?',
  sectionLabel: 'resumeWizard.sections.workExperience',
  progress: { current: 2, total: 8 },
  answer: '',
  onAnswerChange: vi.fn(),
  canGoBack: true,
  isBusy: false,
  onContinue: vi.fn(),
  onSkip: vi.fn(),
  onBack: vi.fn(),
  onReview: vi.fn(),
  onFinalize: vi.fn(),
  onKeepAdding: vi.fn(),
  warnings: [] as string[],
};

describe('QuestionCard', () => {
  it('on a question step shows the question, textbox, and question actions', () => {
    render(<QuestionCard step="question" {...baseProps} />);
    expect(screen.getByText('What is your most recent role?')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.back' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.create' })
    ).not.toBeInTheDocument();
  });

  it('on the intro step hides skip, review, and back', () => {
    render(<QuestionCard step="intro" {...baseProps} canGoBack={false} />);
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.continue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'resumeWizard.actions.skip' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'resumeWizard.actions.review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'resumeWizard.actions.back' })).not.toBeInTheDocument();
  });

  it('on the review step shows create + keep adding and gentle notes', () => {
    render(
      <QuestionCard
        step="review"
        {...baseProps}
        warnings={['Add at least one contact method.']}
      />
    );
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.create' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'resumeWizard.actions.keepAdding' })
    ).toBeInTheDocument();
    expect(screen.getByText('Add at least one contact method.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('disables Continue when the answer is empty and calls onContinue when filled', () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <QuestionCard step="question" {...baseProps} onContinue={onContinue} answer="" />
    );
    expect(screen.getByRole('button', { name: 'resumeWizard.actions.continue' })).toBeDisabled();

    rerender(<QuestionCard step="question" {...baseProps} onContinue={onContinue} answer="My answer" />);
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npm run test -- resume-wizard-question-card.test.tsx`
Expected: import failure for `@/components/resume-wizard/question-card`.

- [ ] **Step 3: Implement the question card and delete the section picker**

Create `apps/frontend/components/resume-wizard/question-card.tsx`:

```tsx
'use client';

import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import type { ResumeWizardProgress, ResumeWizardStep } from '@/lib/api/resume-wizard';

interface QuestionCardProps {
  step: ResumeWizardStep;
  question: string;
  sectionLabel: string;
  progress: ResumeWizardProgress;
  answer: string;
  onAnswerChange: (value: string) => void;
  canGoBack: boolean;
  isBusy: boolean;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
  onReview: () => void;
  onFinalize: () => void;
  onKeepAdding: () => void;
  warnings: string[];
}

export function QuestionCard({
  step,
  question,
  sectionLabel,
  progress,
  answer,
  onAnswerChange,
  canGoBack,
  isBusy,
  onContinue,
  onSkip,
  onBack,
  onReview,
  onFinalize,
  onKeepAdding,
  warnings,
}: QuestionCardProps) {
  const { t } = useTranslations();
  const isReview = step === 'review';
  const isQuestion = step === 'question';
  const canContinue = answer.trim().length > 0 && !isBusy;
  const totalSegments = Math.max(progress.total, 1);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Repo pattern: never let Enter bubble to a parent form/dialog.
    if (event.key !== 'Enter') return;
    event.stopPropagation();
    // one-question-at-a-time feel: Enter submits, Shift+Enter makes a newline.
    if (!event.shiftKey) {
      event.preventDefault();
      if (canContinue) onContinue();
    }
  };

  return (
    <section className="border-2 border-black bg-white shadow-[8px_8px_0px_0px_#000000]">
      <div className="flex gap-1 border-b-2 border-black p-2" aria-hidden="true">
        {Array.from({ length: totalSegments }).map((_, index) => (
          <span
            key={index}
            className={
              index < progress.current
                ? 'h-1.5 flex-1 border border-black bg-black'
                : 'h-1.5 flex-1 border border-black bg-white'
            }
          />
        ))}
      </div>

      <div className="grid gap-6 p-5 md:p-8">
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-700">
          {sectionLabel}
        </p>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{question}</h1>

        {isReview ? (
          warnings.length > 0 && (
            <ul className="grid gap-2">
              {warnings.map((warning) => (
                <li
                  key={warning}
                  className="border border-steel-grey bg-white px-3 py-2 font-sans text-sm text-steel-grey"
                >
                  {warning}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="grid gap-2">
            <label
              htmlFor="resume-wizard-answer"
              className="font-mono text-xs font-bold uppercase tracking-wider text-steel-grey"
            >
              {t('resumeWizard.answerLabel')}
            </label>
            <Textarea
              id="resume-wizard-answer"
              value={answer}
              onChange={(event) => onAnswerChange(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              className="min-h-40 bg-white font-sans text-base"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t-2 border-black pt-5">
          {isReview ? (
            <>
              <Button type="button" variant="success" onClick={onFinalize} disabled={isBusy}>
                {isBusy ? t('common.saving') : t('resumeWizard.actions.create')}
              </Button>
              <Button type="button" variant="outline" onClick={onKeepAdding} disabled={isBusy}>
                {t('resumeWizard.actions.keepAdding')}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={onContinue} disabled={!canContinue}>
                {isBusy ? t('common.loading') : t('resumeWizard.actions.continue')}
              </Button>
              {isQuestion && (
                <Button type="button" variant="outline" onClick={onSkip} disabled={isBusy}>
                  {t('resumeWizard.actions.skip')}
                </Button>
              )}
              {isQuestion && (
                <Button type="button" variant="outline" onClick={onReview} disabled={isBusy}>
                  {t('resumeWizard.actions.review')}
                </Button>
              )}
              {isQuestion && canGoBack && (
                <Button type="button" variant="ghost" onClick={onBack} disabled={isBusy}>
                  {t('resumeWizard.actions.back')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

Then delete the section picker:

```bash
rm apps/frontend/components/resume-wizard/section-picker.tsx
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npm run test -- resume-wizard-question-card.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/resume-wizard/question-card.tsx apps/frontend/tests/resume-wizard-question-card.test.tsx
git rm apps/frontend/components/resume-wizard/section-picker.tsx
git commit -m "feat(wizard): one-question-at-a-time question card; remove section picker"
```

---

### Task 8: Frontend wizard page orchestrator

**Files:**
- Rewrite: `apps/frontend/components/resume-wizard/resume-wizard-page.tsx`
- Test: `apps/frontend/tests/resume-wizard-page.test.tsx`

- [ ] **Step 1: Write the failing page tests**

Replace the entire contents of `apps/frontend/tests/resume-wizard-page.test.tsx` with:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResumeWizardPage } from '@/components/resume-wizard/resume-wizard-page';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardState,
} from '@/lib/api';

const push = vi.fn();
const incrementResumes = vi.fn();
const setHasMasterResume = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ incrementResumes, setHasMasterResume }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, finalizeResumeWizard: vi.fn(), postResumeWizardTurn: vi.fn() };
});

const mockedPostTurn = vi.mocked(postResumeWizardTurn);
const mockedFinalize = vi.mocked(finalizeResumeWizard);

function makeState(overrides: Partial<ResumeWizardState> = {}): ResumeWizardState {
  return { ...createInitialResumeWizardState(), ...overrides };
}

describe('ResumeWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the intro question and answer textbox', () => {
    render(<ResumeWizardPage />);
    expect(screen.getByText(/Hi — I'll help you build your master resume/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('submits the intro answer and shows the next question', async () => {
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'question',
        current_question: { text: 'Where have you worked?', section: 'workExperience' },
        resume_data: {
          ...createInitialResumeWizardState().resume_data,
          personalInfo: { name: 'James' },
        },
        asked_count: 1,
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: "I'm James." } });
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith({
        state: expect.objectContaining({ step: 'intro' }),
        action: 'answer',
        answer: { text: "I'm James." },
      });
    });
    expect(await screen.findByText('Where have you worked?')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
  });

  it('moves to review via the Review action', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 2,
        })
      )
    );
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'review',
        current_question: { text: 'Review', section: 'review' },
        warnings: ['Add at least one contact method.'],
        resume_data: {
          ...createInitialResumeWizardState().resume_data,
          personalInfo: { name: 'James' },
        },
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.review' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith({
        state: expect.objectContaining({ current_question: expect.objectContaining({ section: 'skills' }) }),
        action: 'review',
      });
    });
    expect(await screen.findByRole('button', { name: 'resumeWizard.actions.create' })).toBeInTheDocument();
  });

  it('finalizes a review draft, updates status cache, clears the draft, and routes to builder', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'review',
          current_question: { text: 'Review', section: 'review' },
          resume_data: {
            ...createInitialResumeWizardState().resume_data,
            personalInfo: { name: 'James' },
          },
        })
      )
    );
    mockedFinalize.mockResolvedValueOnce({
      message: 'Created',
      request_id: 'req_1',
      resume_id: 'resume_123',
      processing_status: 'ready',
      is_master: true,
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.create' }));

    await waitFor(() => {
      expect(mockedFinalize).toHaveBeenCalledWith(expect.objectContaining({ step: 'review' }));
      expect(localStorage.getItem('master_resume_id')).toBe('resume_123');
      expect(localStorage.getItem('resume_wizard_draft')).toBeNull();
      expect(incrementResumes).toHaveBeenCalledTimes(1);
      expect(setHasMasterResume).toHaveBeenCalledWith(true);
      expect(push).toHaveBeenCalledWith('/builder?id=resume_123');
    });
  });

  it('shows an error and preserves the question when a turn fails', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 1,
        })
      )
    );
    mockedPostTurn.mockRejectedValueOnce(new Error('boom'));

    render(<ResumeWizardPage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Python' } });
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('resumeWizard.errors.turnFailed');
    expect(screen.getByText('Skills?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/frontend && npm run test -- resume-wizard-page.test.tsx`
Expected: failures — the page still renders the old section-picker shape.

- [ ] **Step 3: Implement the page orchestrator**

Replace the entire contents of `apps/frontend/components/resume-wizard/resume-wizard-page.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardSection,
  type ResumeWizardState,
} from '@/lib/api';
import { LivePreview } from './live-preview';
import { QuestionCard } from './question-card';

const DRAFT_STORAGE_KEY = 'resume_wizard_draft';
const MASTER_RESUME_KEY = 'master_resume_id';
const WIZARD_SECTIONS: ResumeWizardSection[] = [
  'intro',
  'contact',
  'summary',
  'workExperience',
  'internships',
  'education',
  'personalProjects',
  'skills',
  'review',
];
const WIZARD_STEPS: ResumeWizardState['step'][] = ['intro', 'question', 'review', 'complete'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Validate a saved draft against the current shape; fall back to a fresh state. */
function readSavedDraft(): ResumeWizardState | null {
  try {
    const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as unknown;
    if (!isRecord(parsed)) return null;

    const initial = createInitialResumeWizardState();
    const step = WIZARD_STEPS.includes(parsed.step as ResumeWizardState['step'])
      ? (parsed.step as ResumeWizardState['step'])
      : initial.step;
    const question = isRecord(parsed.current_question) ? parsed.current_question : {};
    const section = WIZARD_SECTIONS.includes(question.section as ResumeWizardSection)
      ? (question.section as ResumeWizardSection)
      : initial.current_question.section;

    return {
      ...initial,
      ...parsed,
      step,
      resume_data: isRecord(parsed.resume_data) ? (parsed.resume_data as ResumeWizardState['resume_data']) : initial.resume_data,
      current_question: {
        text: typeof question.text === 'string' && question.text.trim() ? question.text : initial.current_question.text,
        section,
      },
      history: Array.isArray(parsed.history) ? (parsed.history as ResumeWizardState['history']) : [],
      asked_count: typeof parsed.asked_count === 'number' ? parsed.asked_count : 0,
      inferred_skills: Array.isArray(parsed.inferred_skills)
        ? (parsed.inferred_skills as string[]).filter((s) => typeof s === 'string')
        : [],
      is_complete: parsed.is_complete === true,
      progress: isRecord(parsed.progress) ? (parsed.progress as ResumeWizardState['progress']) : initial.progress,
      warnings: Array.isArray(parsed.warnings)
        ? (parsed.warnings as string[]).filter((w) => typeof w === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export function ResumeWizardPage() {
  const { t } = useTranslations();
  const router = useRouter();
  const { incrementResumes, setHasMasterResume } = useStatusCache();
  const [state, setState] = useState<ResumeWizardState>(() => createInitialResumeWizardState());
  const [answer, setAnswer] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const saved = readSavedDraft();
    if (saved) setState(saved);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || state.step === 'complete') return;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state));
  }, [isLoaded, state]);

  const sectionLabel = t(`resumeWizard.sections.${state.current_question.section}`);

  const runTurn = async (
    action: 'answer' | 'skip' | 'back' | 'review',
    errorTranslationKey: string,
    withAnswer: boolean
  ) => {
    setErrorKey(null);
    setIsBusy(true);
    try {
      const response = await postResumeWizardTurn({
        state,
        action,
        ...(withAnswer ? { answer: { text: answer.trim() } } : {}),
      });
      setState(response.state);
      setAnswer('');
    } catch {
      setErrorKey(errorTranslationKey);
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinue = () => {
    if (answer.trim().length === 0 || isBusy) return;
    void runTurn('answer', 'resumeWizard.errors.turnFailed', true);
  };
  const handleSkip = () => void runTurn('skip', 'resumeWizard.errors.turnFailed', false);
  const handleBack = () => void runTurn('back', 'resumeWizard.errors.turnFailed', false);
  const handleReview = () => void runTurn('review', 'resumeWizard.errors.turnFailed', false);
  const handleKeepAdding = () =>
    setState((current) => ({
      ...current,
      step: 'question',
      current_question: { text: t('resumeWizard.keepAddingPrompt'), section: 'review' },
    }));

  const handleFinalize = async () => {
    setErrorKey(null);
    setIsBusy(true);
    try {
      const response = await finalizeResumeWizard(state);
      localStorage.setItem(MASTER_RESUME_KEY, response.resume_id);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      incrementResumes();
      setHasMasterResume(true);
      setState((current) => ({ ...current, step: 'complete' }));
      router.push(`/builder?id=${response.resume_id}`);
    } catch {
      setErrorKey('resumeWizard.errors.finalizeFailed');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-black md:px-8 md:py-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-steel-grey">
              {t('resumeWizard.title')}
            </p>
            <Button type="button" variant="ghost" onClick={() => router.push('/dashboard')}>
              {t('resumeWizard.actions.backToDashboard')}
            </Button>
          </div>

          {errorKey && (
            <div className="border-2 border-red-600 bg-red-100 p-4" role="alert">
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-red-600">
                {t('common.error')}
              </p>
              <p className="mt-1 font-sans text-sm">{t(errorKey)}</p>
            </div>
          )}

          <QuestionCard
            step={state.step === 'complete' ? 'review' : state.step}
            question={state.current_question.text}
            sectionLabel={sectionLabel}
            progress={state.progress}
            answer={answer}
            onAnswerChange={setAnswer}
            canGoBack={state.history.length > 0}
            isBusy={isBusy}
            onContinue={handleContinue}
            onSkip={handleSkip}
            onBack={handleBack}
            onReview={handleReview}
            onFinalize={handleFinalize}
            onKeepAdding={handleKeepAdding}
            warnings={state.warnings}
          />
        </div>

        <LivePreview resumeData={state.resume_data} inferredSkills={state.inferred_skills} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/frontend && npm run test -- resume-wizard-page.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/resume-wizard/resume-wizard-page.tsx apps/frontend/tests/resume-wizard-page.test.tsx
git commit -m "feat(wizard): one-question-at-a-time page orchestrator with live preview"
```

---

### Task 9: Locale keys (all 5 files) + API docs

**Files:**
- Modify: `apps/frontend/messages/en.json`, `es.json`, `zh.json`, `ja.json`, `pt-BR.json`
- Modify: `docs/agent/apis/front-end-apis.md`
- Test: `apps/frontend/tests/i18n-locale-parity.test.ts` (existing — must stay green)

- [ ] **Step 1: Replace the `resumeWizard` block in `en.json`**

In `apps/frontend/messages/en.json`, replace the existing `"resumeWizard": { ... }` object with the following (keep the surrounding keys intact; **keep the existing `entry` sub-object** — it is reused by the unchanged choice dialog, so paste it back inside):

```json
"resumeWizard": {
  "title": "Resume Wizard",
  "answerLabel": "Your answer",
  "keepAddingPrompt": "What would you like to add or change?",
  "sections": {
    "intro": "Getting started",
    "contact": "Contact details",
    "summary": "Professional summary",
    "workExperience": "Work experience",
    "internships": "Internships",
    "education": "Education",
    "personalProjects": "Projects",
    "skills": "Skills",
    "review": "Review"
  },
  "actions": {
    "continue": "Continue",
    "skip": "Skip",
    "back": "Back",
    "review": "Review & finish",
    "create": "Create master resume",
    "keepAdding": "Keep adding",
    "backToDashboard": "Back to Dashboard"
  },
  "preview": {
    "label": "Live Draft",
    "empty": "Your resume appears here as you answer.",
    "unnamed": "Unnamed Resume",
    "experience": "Experience",
    "education": "Education",
    "projects": "Projects",
    "skills": "Skills"
  },
  "errors": {
    "turnFailed": "The wizard could not save that answer. Try again.",
    "finalizeFailed": "The wizard could not create your master resume. Try again."
  },
  "entry": {
    "kicker": "Master Resume Setup",
    "title": "Choose your starting point",
    "description": "Create your master resume from an existing document or build it step by step with AI guidance.",
    "upload": {
      "kicker": "Existing File",
      "title": "Upload a resume",
      "description": "Start from a PDF, DOC, or DOCX file and let Resume Matcher parse it into your master profile.",
      "action": "Upload Resume"
    },
    "wizard": {
      "kicker": "AI Guided",
      "title": "Build with AI wizard",
      "description": "Answer focused prompts and let the wizard assemble a strong first master resume draft.",
      "action": "Start Wizard"
    }
  }
}
```

- [ ] **Step 2: Mirror the structure in the other four locales**

In each of `es.json`, `zh.json`, `ja.json`, `pt-BR.json`, replace the existing `"resumeWizard"` object with the **same key structure** as `en.json` above. Translate the string values where you are confident; otherwise copy the English string verbatim. **Every key path must exist identically in all five files** (the build's `tsc` step and the locale-parity test fail otherwise). Keep each file's existing `entry` translations — only the new top-level keys (`title`, `answerLabel`, `keepAddingPrompt`, `sections`, `actions`, `preview`, `errors`) need adding, and remove any now-unused old keys (`kicker`, `assistantLabel`, `actions.finalize`, `preview.label/warnings/...`) so the five files match exactly.

Suggested translations for the new `actions`/`sections` are fine to provide; the hard requirement is identical structure.

- [ ] **Step 3: Run the locale-parity + a quick key check**

Run: `cd apps/frontend && npm run test -- i18n-locale-parity.test.ts`
Expected: PASS (all five `messages/*.json` structurally match `en.json`).

Also confirm no locale is missing the new path:

Run: `cd apps/frontend && node -e "const en=require('./messages/en.json');for(const l of ['es','zh','ja','pt-BR']){const m=require('./messages/'+l+'.json');const a=JSON.stringify(Object.keys(en.resumeWizard.sections));const b=JSON.stringify(Object.keys(m.resumeWizard.sections));if(a!==b)throw new Error(l+' sections mismatch');}console.log('locale sections OK');"`
Expected: `locale sections OK`

- [ ] **Step 4: Update the API docs**

In `docs/agent/apis/front-end-apis.md`, replace the existing "Resume Wizard" section with:

~~~markdown
## Resume Wizard (`lib/api/resume-wizard.ts`)

```typescript
postResumeWizardTurn(payload: ResumeWizardTurnRequest) → ResumeWizardTurnResponse
finalizeResumeWizard(state: ResumeWizardState) → ResumeWizardFinalizeResponse
createInitialResumeWizardState() → ResumeWizardState
```

Backend endpoints:

- `POST /api/v1/resume-wizard/turn` — one adaptive turn. `action` is `start | answer | skip | back | review`. `answer`/`skip` run one AI call that updates `resume_data`, returns the next `current_question`, `inferred_skills`, and an `is_complete` flag; `back`/`review`/`start` are deterministic (no LLM). The full `ResumeWizardState` round-trips in the request and response.
- `POST /api/v1/resume-wizard/finalize` — creates the single master resume from the draft (`processing_status: "ready"`), or `409` if a master already exists.

The wizard is an AI-led, one-question-at-a-time flow that builds a general master resume; it does not require a job description and does not replace the upload parser. Question and content text are produced in the configured **content language**; static UI chrome uses the `resumeWizard.*` i18n keys.
~~~

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/messages/en.json apps/frontend/messages/es.json apps/frontend/messages/zh.json apps/frontend/messages/ja.json apps/frontend/messages/pt-BR.json docs/agent/apis/front-end-apis.md
git commit -m "feat(wizard): locale keys for adaptive wizard + API docs"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend — full wizard suite**

Run: `cd apps/backend && uv run pytest tests/unit/test_resume_wizard_service.py tests/integration/test_resume_wizard_api.py -v`
Expected: all pass.

- [ ] **Step 2: Backend — full suite (no regressions)**

Run: `cd apps/backend && uv run pytest -q`
Expected: the whole suite passes (LLM evals excluded by default).

- [ ] **Step 3: Frontend — wizard + dashboard + parity tests**

Run: `cd apps/frontend && npm run test -- resume-wizard-api.test.ts resume-wizard-live-preview.test.tsx resume-wizard-question-card.test.tsx resume-wizard-page.test.tsx dashboard-master-choice.test.tsx i18n-locale-parity.test.ts`
Expected: all pass.

- [ ] **Step 4: Frontend — full test run (no regressions)**

Run: `cd apps/frontend && npm run test`
Expected: all pass (confirms nothing imported the deleted `section-picker`/`draft-preview`).

- [ ] **Step 5: Lint + format (required before commit)**

Run: `cd apps/frontend && npm run lint && npm run format`
Expected: lint passes; if Prettier rewrites files, inspect `git diff` and commit the formatting.

- [ ] **Step 6: Build (catches i18n shape drift)**

Run: `cd apps/frontend && npm run build`
Expected: build succeeds. If it fails only because the backend isn't running for server-rendered `/print/*` routes, record that separately and rely on `tsc`/lint/test results.

- [ ] **Step 7: Commit any formatting changes**

```bash
git add -A
git commit -m "chore(wizard): lint + format pass" || echo "nothing to format"
```

---

## Plan Self-Review

**Spec coverage:**
- one-question-at-a-time two-pane layout → Tasks 7 (card), 8 (page layout `lg:grid-cols-[1fr_360px]`).
- Live preview (no counts/warnings) → Task 6.
- AI writes + adapts (single call) → Task 3 (`run_ai_turn`).
- Server-side guardrails (cap, server progress, section merge, fallbacks) → Tasks 2 (`compute_progress`, `RESUME_WIZARD_MAX_QUESTIONS`) + 3 (`_merge_section`, `_next_question`, cap override).
- State shape (current_question/history/asked_count/is_complete/progress; removed options/completed_sections) → Tasks 1, 5.
- Actions start/answer/skip/back/review → Tasks 3, 4.
- Truthfulness → Task 2 (prompt).
- Finalize unchanged + 409 → Task 4.
- i18n (chrome keys; content-language questions) → Task 9.
- Error handling (inline, state preserved) → Task 8 (test 5).
- Deletions (section-picker, draft-preview) → Tasks 6, 7.
- Testing across layers → Tasks 1–8 inline + Task 10.

**Placeholder scan:** No TBD/TODO; every code step has full content; no "similar to Task N".

**Type consistency:** Backend names used consistently across tasks — `build_initial_wizard_state`, `run_ai_turn(state, answer_text, *, skip)`, `apply_back`, `apply_review`, `_merge_section`, `_next_question`, `_next_gap_section`, `compute_progress`, `build_review_warnings`, `merge_unique_skills`, `extract_intro_name`, `section_prompt`, `valid_section`, `normalize_wizard_resume_data`, `_string_list`, `RESUME_WIZARD_MAX_QUESTIONS`. Schema names (`ResumeWizardState.current_question/history/asked_count/is_complete/progress`) match the frontend `ResumeWizardState` (Task 5) and the page/card props (Tasks 7, 8). Locale key paths used in components (`resumeWizard.sections.*`, `resumeWizard.actions.*`, `resumeWizard.preview.*`, `resumeWizard.errors.*`, `resumeWizard.answerLabel`, `resumeWizard.title`, `resumeWizard.keepAddingPrompt`) all defined in Task 9. `common.loading`/`common.saving`/`common.error` already exist in the locale files (used by the current wizard/components).
