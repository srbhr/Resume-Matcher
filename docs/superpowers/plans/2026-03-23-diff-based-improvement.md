# Diff-Based Resume Improvement — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-prompt full-resume LLM output with a diff-based approach where the LLM outputs only targeted changes, eliminating structural hallucination by construction.

**Architecture:** The LLM generates a list of `ResumeChange` diffs (path + action + value). A local `apply_diffs()` function verifies each change against the original resume and applies only those that pass 4 gates. A `verify_diff_result()` function runs local quality checks. The refiner and all downstream systems receive a full dict as before — no changes needed.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, LiteLLM (via existing `complete_json()`), pytest

**Spec:** `docs/superpowers/specs/2026-03-23-diff-based-improvement-design.md`

---

## File Map

| File | Responsibility | Change type |
|------|---------------|-------------|
| `apps/backend/app/schemas/models.py` | `ResumeChange` + `ImproveDiffResult` Pydantic models | Add (~20 lines at end) |
| `apps/backend/app/schemas/__init__.py` | Re-export new models | Add 2 imports + 2 `__all__` entries |
| `apps/backend/app/prompts/templates.py` | `DIFF_IMPROVE_PROMPT` + `DIFF_STRATEGY_INSTRUCTIONS` | Add (~50 lines at end) |
| `apps/backend/app/prompts/__init__.py` | Re-export new prompt constants | Add 2 imports + 2 `__all__` entries |
| `apps/backend/app/services/improver.py` | `generate_resume_diffs()`, `apply_diffs()`, `verify_diff_result()`, path helpers | Add (~250 lines) |
| `apps/backend/app/routers/resumes.py` | Wire `_improve_preview_flow()` to call diff functions | Modify (~20 lines) |
| `apps/backend/tests/test_apply_diffs.py` | Tests for `apply_diffs()` — path resolution, gates, actions | Create |
| `apps/backend/tests/test_verify_diffs.py` | Tests for `verify_diff_result()` — all 6 checks | Create |
| `apps/backend/tests/test_generate_diffs.py` | Tests for `generate_resume_diffs()` — prompt construction, LLM mock | Create |

---

## Chunk 1: Schemas + Prompt Templates

### Task 1: Add `ResumeChange` and `ImproveDiffResult` Pydantic models

**Files:**
- Modify: `apps/backend/app/schemas/models.py:701` (append after last class)
- Modify: `apps/backend/app/schemas/__init__.py`
- Test: `apps/backend/tests/test_apply_diffs.py` (validation tests)

- [ ] **Step 1: Write failing test for ResumeChange validation**

Create `apps/backend/tests/test_apply_diffs.py`:

```python
"""Tests for diff-based resume improvement."""

from app.schemas.models import ResumeChange, ImproveDiffResult


def test_resume_change_replace_valid() -> None:
    change = ResumeChange(
        path="workExperience[0].description[1]",
        action="replace",
        original="Built REST APIs",
        value="Designed and built REST APIs using Python and FastAPI",
        reason="Added JD keywords",
    )
    assert change.action == "replace"
    assert change.original == "Built REST APIs"


def test_resume_change_append_valid() -> None:
    change = ResumeChange(
        path="workExperience[0].description",
        action="append",
        original=None,
        value="Implemented CI/CD pipelines reducing deploy time by 50%",
        reason="Added relevant achievement",
    )
    assert change.action == "append"
    assert change.original is None


def test_resume_change_reorder_valid() -> None:
    change = ResumeChange(
        path="additional.technicalSkills",
        action="reorder",
        original=None,
        value=["Python", "FastAPI", "Docker", "AWS"],
        reason="Prioritized JD-relevant skills",
    )
    assert isinstance(change.value, list)


def test_improve_diff_result_valid() -> None:
    result = ImproveDiffResult(
        changes=[
            ResumeChange(
                path="summary",
                action="replace",
                original="Old summary",
                value="New summary",
                reason="Better alignment",
            )
        ],
        strategy_notes="Focused on backend keywords",
    )
    assert len(result.changes) == 1
    assert result.strategy_notes == "Focused on backend keywords"


def test_improve_diff_result_empty_changes() -> None:
    result = ImproveDiffResult(changes=[], strategy_notes="No changes needed")
    assert len(result.changes) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && python -m pytest tests/test_apply_diffs.py -v`
Expected: FAIL — `ImportError: cannot import name 'ResumeChange' from 'app.schemas.models'`

- [ ] **Step 3: Add models to `schemas/models.py`**

Append after the `StatusResponse` class at end of file (`apps/backend/app/schemas/models.py`):

```python
# Diff-Based Improvement Models


class ResumeChange(BaseModel):
    """A single targeted change the LLM wants to make to the resume."""

    path: str = Field(description="Dot+bracket path, e.g. 'workExperience[0].description[1]'")
    action: Literal["replace", "append", "reorder"]
    original: str | None = Field(default=None, description="Current text at path — for verification")
    value: str | list[str] = Field(description="New content")
    reason: str = Field(description="Why this change helps match the JD")


class ImproveDiffResult(BaseModel):
    """LLM output: a list of targeted resume changes."""

    changes: list[ResumeChange] = Field(default_factory=list)
    strategy_notes: str = Field(default="")
```

- [ ] **Step 4: Export from `schemas/__init__.py`**

Add to imports block in `apps/backend/app/schemas/__init__.py`:
```python
from app.schemas.models import (
    ...
    ResumeChange,
    ImproveDiffResult,
)
```

Add to `__all__` list:
```python
"ResumeChange",
"ImproveDiffResult",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend && python -m pytest tests/test_apply_diffs.py -v`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/schemas/models.py apps/backend/app/schemas/__init__.py apps/backend/tests/test_apply_diffs.py
git commit -m "feat: add ResumeChange and ImproveDiffResult Pydantic models"
```

---

### Task 2: Add prompt template and strategy instructions

**Files:**
- Modify: `apps/backend/app/prompts/templates.py:413` (append after last line)
- Modify: `apps/backend/app/prompts/__init__.py`

- [ ] **Step 1: Add `DIFF_IMPROVE_PROMPT` and `DIFF_STRATEGY_INSTRUCTIONS` to `templates.py`**

Append after line 413 in `apps/backend/app/prompts/templates.py`:

```python
# Diff-based improvement prompt — outputs targeted changes instead of full resume

DIFF_STRATEGY_INSTRUCTIONS = {
    "nudge": "Make minimal edits. Only rephrase where there is a clear match. Do not add new bullet points.",
    "keywords": "Weave in relevant keywords where evidence already exists. You may rephrase bullets but do not add new ones.",
    "full": "Make targeted adjustments. You may rephrase bullets and add new ones that elaborate on existing work, but do not invent new responsibilities.",
}

DIFF_IMPROVE_PROMPT = """Given this resume and job description, output a JSON object with targeted changes to better align the resume with the job.

RULES:
1. Only modify content — never change names, companies, dates, institutions, or degrees
2. Do not invent skills, metrics, or achievements not supported by the original resume text
3. Do not add new work entries, education entries, or project entries
4. {strategy_instruction}
5. Each change MUST include the original text (copied exactly) so it can be verified
6. For each change, explain WHY it helps match the job description
7. Generate all new text in {output_language}
8. Do not use em dash characters
9. Keep changes minimal and targeted — do not rewrite content that already aligns well

PATHS you can target:
- "summary" — the resume summary text
- "workExperience[i].description[j]" — a specific bullet (i = entry index, j = bullet index)
- "workExperience[i].description" — append a new bullet (action: "append")
- "personalProjects[i].description[j]" — a specific project bullet
- "personalProjects[i].description" — append a new project bullet
- "additional.technicalSkills" — reorder the skills list (action: "reorder")

Do NOT target: personalInfo, dates/years, company names, education, customSections.

Keywords to emphasize (only if already supported by resume content):
{job_keywords}

Job Description:
{job_description}

Original Resume:
{original_resume}

Output this exact JSON format, nothing else:
{{{{
  "changes": [
    {{{{
      "path": "workExperience[0].description[1]",
      "action": "replace",
      "original": "the exact original text at this path",
      "value": "the improved text",
      "reason": "why this change helps"
    }}}},
    {{{{
      "path": "summary",
      "action": "replace",
      "original": "the current summary text",
      "value": "the improved summary",
      "reason": "why this change helps"
    }}}},
    {{{{
      "path": "additional.technicalSkills",
      "action": "reorder",
      "original": null,
      "value": ["most relevant skill first", "then next", "..."],
      "reason": "reordered to prioritize JD-relevant skills"
    }}}}
  ],
  "strategy_notes": "brief summary of the tailoring approach"
}}}}"""
```

- [ ] **Step 2: Export from `prompts/__init__.py`**

Add to imports in `apps/backend/app/prompts/__init__.py`:
```python
from app.prompts.templates import (
    ...
    DIFF_IMPROVE_PROMPT,
    DIFF_STRATEGY_INSTRUCTIONS,
)
```

Add to `__all__`:
```python
"DIFF_IMPROVE_PROMPT",
"DIFF_STRATEGY_INSTRUCTIONS",
```

- [ ] **Step 3: Verify import works**

Run: `cd apps/backend && python -c "from app.prompts import DIFF_IMPROVE_PROMPT, DIFF_STRATEGY_INSTRUCTIONS; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/prompts/templates.py apps/backend/app/prompts/__init__.py
git commit -m "feat: add diff-based improvement prompt template and strategy instructions"
```

---

## Chunk 2: Core Engine — `apply_diffs()` with Path Resolution

### Task 3: Implement path resolution and `apply_diffs()`

This is the core engine. It parses paths like `"workExperience[0].description[1]"`, resolves them against the original dict, runs 4 verification gates, and applies changes.

**Files:**
- Modify: `apps/backend/app/services/improver.py` (add new functions)
- Test: `apps/backend/tests/test_apply_diffs.py` (extend)

- [ ] **Step 1: Write failing tests for path resolution**

Append to `apps/backend/tests/test_apply_diffs.py`:

```python
from app.services.improver import apply_diffs


# --- Fixtures ---

SAMPLE_RESUME = {
    "personalInfo": {"name": "Jane Doe", "email": "jane@example.com", "title": "Engineer", "phone": "", "location": ""},
    "summary": "Experienced backend engineer with 5 years of Python development.",
    "workExperience": [
        {
            "id": 1,
            "title": "Senior Engineer",
            "company": "Acme Corp",
            "location": "SF",
            "years": "Jan 2020 - Present",
            "description": [
                "Built REST APIs serving 10K requests/day",
                "Led migration from monolith to microservices",
                "Mentored 3 junior developers",
            ],
        },
        {
            "id": 2,
            "title": "Software Engineer",
            "company": "StartupCo",
            "location": "NY",
            "years": "Jun 2017 - Dec 2019",
            "description": [
                "Developed payment processing system",
                "Wrote unit and integration tests",
            ],
        },
    ],
    "education": [
        {"id": 1, "institution": "MIT", "degree": "B.S. CS", "years": "2013 - 2017", "description": None}
    ],
    "personalProjects": [
        {
            "id": 1,
            "name": "OSS Tool",
            "role": "Creator",
            "years": "2021 - Present",
            "description": ["CLI tool with 500+ GitHub stars"],
        }
    ],
    "additional": {
        "technicalSkills": ["Python", "Docker", "AWS", "PostgreSQL"],
        "languages": ["English"],
        "certificationsTraining": [],
        "awards": [],
    },
    "customSections": {},
}


def test_apply_replace_description_bullet() -> None:
    changes = [
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="Built REST APIs serving 10K requests/day",
            value="Designed and built REST APIs using Python and FastAPI, serving 10K requests/day",
            reason="Added keywords",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 1
    assert len(rejected) == 0
    assert result["workExperience"][0]["description"][0] == changes[0].value


def test_apply_replace_summary() -> None:
    changes = [
        ResumeChange(
            path="summary",
            action="replace",
            original="Experienced backend engineer with 5 years of Python development.",
            value="Backend engineer with 5 years building scalable Python APIs and microservices.",
            reason="Better JD alignment",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 1
    assert result["summary"] == changes[0].value


def test_apply_append_bullet() -> None:
    changes = [
        ResumeChange(
            path="workExperience[0].description",
            action="append",
            original=None,
            value="Implemented CI/CD pipelines with GitHub Actions",
            reason="Added relevant experience",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 1
    assert len(result["workExperience"][0]["description"]) == 4
    assert result["workExperience"][0]["description"][3] == changes[0].value


def test_apply_reorder_skills() -> None:
    changes = [
        ResumeChange(
            path="additional.technicalSkills",
            action="reorder",
            original=None,
            value=["AWS", "Docker", "Python", "PostgreSQL"],
            reason="Prioritized cloud skills",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 1
    assert result["additional"]["technicalSkills"] == ["AWS", "Docker", "Python", "PostgreSQL"]


def test_reject_blocked_path_personal_info() -> None:
    changes = [
        ResumeChange(
            path="personalInfo.name",
            action="replace",
            original="Jane Doe",
            value="Jane Smith",
            reason="Name change",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1
    assert result["personalInfo"]["name"] == "Jane Doe"


def test_reject_blocked_path_years() -> None:
    changes = [
        ResumeChange(
            path="workExperience[0].years",
            action="replace",
            original="Jan 2020 - Present",
            value="Jan 2019 - Present",
            reason="Extended dates",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_blocked_path_company() -> None:
    changes = [
        ResumeChange(
            path="workExperience[0].company",
            action="replace",
            original="Acme Corp",
            value="Google",
            reason="Better company",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_blocked_path_education() -> None:
    changes = [
        ResumeChange(
            path="education[0].degree",
            action="replace",
            original="B.S. CS",
            value="M.S. CS",
            reason="Upgrade degree",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_blocked_path_custom_sections() -> None:
    changes = [
        ResumeChange(
            path="customSections.volunteer",
            action="replace",
            original=None,
            value="Some volunteer work",
            reason="Add section",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_original_mismatch() -> None:
    changes = [
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="This text does not exist in the resume",
            value="New text",
            reason="Test",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_out_of_bounds_index() -> None:
    changes = [
        ResumeChange(
            path="workExperience[99].description[0]",
            action="replace",
            original="Nonexistent",
            value="New",
            reason="Test",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_reject_reorder_with_different_items() -> None:
    changes = [
        ResumeChange(
            path="additional.technicalSkills",
            action="reorder",
            original=None,
            value=["Python", "Docker", "AWS", "Kubernetes"],
            reason="Added Kubernetes",
        )
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 0
    assert len(rejected) == 1


def test_does_not_mutate_original() -> None:
    import copy
    original_copy = copy.deepcopy(SAMPLE_RESUME)
    changes = [
        ResumeChange(
            path="summary",
            action="replace",
            original="Experienced backend engineer with 5 years of Python development.",
            value="Changed summary",
            reason="Test",
        )
    ]
    result, _, _ = apply_diffs(SAMPLE_RESUME, changes)
    assert SAMPLE_RESUME == original_copy
    assert result["summary"] == "Changed summary"


def test_multiple_changes_partial_rejection() -> None:
    changes = [
        ResumeChange(
            path="summary",
            action="replace",
            original="Experienced backend engineer with 5 years of Python development.",
            value="New summary",
            reason="Good change",
        ),
        ResumeChange(
            path="personalInfo.name",
            action="replace",
            original="Jane Doe",
            value="Bad Name",
            reason="Bad change",
        ),
        ResumeChange(
            path="workExperience[0].description[1]",
            action="replace",
            original="Led migration from monolith to microservices",
            value="Led migration to microservices architecture",
            reason="Good change",
        ),
    ]
    result, applied, rejected = apply_diffs(SAMPLE_RESUME, changes)
    assert len(applied) == 2
    assert len(rejected) == 1
    assert result["summary"] == "New summary"
    assert result["personalInfo"]["name"] == "Jane Doe"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && python -m pytest tests/test_apply_diffs.py -v`
Expected: FAIL — `ImportError: cannot import name 'apply_diffs' from 'app.services.improver'`

- [ ] **Step 3: Implement path resolution helpers in `improver.py`**

Add to `apps/backend/app/services/improver.py` (after existing imports, before `improve_resume`):

```python
import copy
import re
from typing import Any

from app.schemas.models import ResumeChange

# Path resolution for diff-based improvement

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")

# Blocked path patterns — changes to these are always rejected
_BLOCKED_PATH_PREFIXES = frozenset({
    "personalInfo",
    "customSections",
    "sectionMeta",
})

_BLOCKED_FIELD_NAMES = frozenset({
    "years",
    "company",
    "institution",
    "title",
    "degree",
    "name",
    "role",
    "github",
    "website",
    "location",
    "id",
})

# Allowed path patterns (regex) — only these can be modified
_ALLOWED_PATH_PATTERNS = [
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^additional\.technicalSkills$"),
]


def _is_path_allowed(path: str) -> bool:
    """Check if a path is in the allowed whitelist."""
    return any(pattern.match(path) for pattern in _ALLOWED_PATH_PATTERNS)


def _is_path_blocked(path: str) -> bool:
    """Check if a path matches any blocked pattern."""
    # Check prefix blocks
    for prefix in _BLOCKED_PATH_PREFIXES:
        if path == prefix or path.startswith(prefix + ".") or path.startswith(prefix + "["):
            return True

    # Check if path targets a blocked field (e.g. workExperience[0].company)
    segments = path.split(".")
    if segments:
        last_segment = segments[-1]
        # Strip array index: "description[0]" -> "description"
        field_name = re.sub(r"\[\d+\]$", "", last_segment)
        if field_name in _BLOCKED_FIELD_NAMES:
            # Exception: "description" is allowed
            if field_name != "description":
                return True

    # Check education block
    if path.startswith("education"):
        return True

    return False


def _resolve_path(data: dict[str, Any], path: str) -> tuple[Any, bool]:
    """Resolve a dot+bracket path to a value in the data dict.

    Returns (value, success). On failure, returns (None, False).
    """
    current: Any = data
    for segment_match in _PATH_SEGMENT_RE.finditer(path):
        key = segment_match.group(1)
        index_str = segment_match.group(2)

        if not isinstance(current, dict) or key not in current:
            return None, False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return None, False
            current = current[index]

    return current, True


def _set_at_path(data: dict[str, Any], path: str, value: Any) -> bool:
    """Set a value at the given path. Returns True on success."""
    segments = list(_PATH_SEGMENT_RE.finditer(path))
    if not segments:
        return False

    # Navigate to parent
    current: Any = data
    for seg in segments[:-1]:
        key = seg.group(1)
        index_str = seg.group(2)

        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return False
            current = current[index]

    # Set on final segment
    last = segments[-1]
    key = last.group(1)
    index_str = last.group(2)

    if index_str is not None:
        if not isinstance(current, dict) or key not in current:
            return False
        target = current[key]
        index = int(index_str)
        if not isinstance(target, list) or index < 0 or index >= len(target):
            return False
        target[index] = value
    else:
        if not isinstance(current, dict):
            return False
        current[key] = value

    return True


def _verify_original_matches(actual: Any, expected: str | None) -> bool:
    """Verify that the original text from the diff matches the actual value."""
    if expected is None:
        return True  # No verification needed (e.g. append, reorder)
    if not isinstance(actual, str):
        return False
    return actual.strip().casefold() == expected.strip().casefold()


def apply_diffs(
    original: dict[str, Any],
    changes: list[ResumeChange],
) -> tuple[dict[str, Any], list[ResumeChange], list[ResumeChange]]:
    """Apply verified diffs to original resume.

    Each change goes through 4 gates:
    1. Path is in allowed whitelist
    2. Path is not in blocked list
    3. Path resolves to an actual value in the original
    4. Original text matches (for replace actions)

    For reorder: validates the new list contains exactly the same items.

    Returns:
        (result_dict, applied_changes, rejected_changes)
    """
    result = copy.deepcopy(original)
    applied: list[ResumeChange] = []
    rejected: list[ResumeChange] = []

    for change in changes:
        path = change.path
        action = change.action

        # Gate 1: Path must be allowed
        if not _is_path_allowed(path):
            logger.info("Diff rejected (not in allowed list): %s", path)
            rejected.append(change)
            continue

        # Gate 2: Path must not be blocked
        if _is_path_blocked(path):
            logger.info("Diff rejected (blocked path): %s", path)
            rejected.append(change)
            continue

        # Gate 3: Path must resolve
        actual_value, resolved = _resolve_path(result, path)
        if not resolved:
            logger.info("Diff rejected (path not found): %s", path)
            rejected.append(change)
            continue

        # Action-specific handling
        if action == "replace":
            # Gate 4: Original text must match
            if not _verify_original_matches(actual_value, change.original):
                logger.info(
                    "Diff rejected (original mismatch): path=%s expected=%r actual=%r",
                    path, change.original, actual_value,
                )
                rejected.append(change)
                continue

            if not _set_at_path(result, path, change.value):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "append":
            if not isinstance(actual_value, list):
                logger.info("Diff rejected (append to non-list): %s", path)
                rejected.append(change)
                continue
            actual_value.append(change.value)
            applied.append(change)

        elif action == "reorder":
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue
            # Validate same items (case-insensitive)
            orig_set = sorted(s.casefold() for s in actual_value if isinstance(s, str))
            new_set = sorted(s.casefold() for s in change.value if isinstance(s, str))
            if orig_set != new_set:
                logger.info("Diff rejected (reorder items mismatch): %s", path)
                rejected.append(change)
                continue
            if not _set_at_path(result, path, change.value):
                rejected.append(change)
                continue
            applied.append(change)

        else:
            logger.info("Diff rejected (unknown action): %s", action)
            rejected.append(change)

    return result, applied, rejected
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && python -m pytest tests/test_apply_diffs.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/improver.py apps/backend/tests/test_apply_diffs.py
git commit -m "feat: implement apply_diffs() with path resolution and 4 verification gates"
```

---

## Chunk 3: Verifier + LLM Integration

### Task 4: Implement `verify_diff_result()`

**Files:**
- Modify: `apps/backend/app/services/improver.py` (add function)
- Create: `apps/backend/tests/test_verify_diffs.py`

- [ ] **Step 1: Write failing tests for verifier**

Create `apps/backend/tests/test_verify_diffs.py`:

```python
"""Tests for verify_diff_result()."""

from app.schemas.models import ResumeChange
from app.services.improver import verify_diff_result

SAMPLE_RESUME = {
    "summary": "Backend engineer.",
    "workExperience": [
        {"title": "Engineer", "company": "Acme", "years": "2020 - Present", "description": ["Built APIs"]},
    ],
    "education": [{"institution": "MIT", "degree": "B.S.", "years": "2016 - 2020"}],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Python", "Docker"], "languages": [], "certificationsTraining": [], "awards": []},
}

JOB_KEYWORDS = {
    "required_skills": ["Python", "FastAPI"],
    "preferred_skills": ["Docker"],
    "keywords": ["microservices"],
}


def test_no_warnings_on_clean_result() -> None:
    result = {**SAMPLE_RESUME, "summary": "Updated summary."}
    applied = [
        ResumeChange(path="summary", action="replace", original="Backend engineer.", value="Updated summary.", reason="Test")
    ]
    warnings = verify_diff_result(SAMPLE_RESUME, result, applied, JOB_KEYWORDS)
    assert len(warnings) == 0


def test_warns_on_empty_changes() -> None:
    warnings = verify_diff_result(SAMPLE_RESUME, SAMPLE_RESUME, [], JOB_KEYWORDS)
    assert any("no changes" in w.lower() for w in warnings)


def test_warns_on_section_count_mismatch() -> None:
    result = {**SAMPLE_RESUME, "workExperience": []}
    applied = [ResumeChange(path="summary", action="replace", original="x", value="y", reason="z")]
    warnings = verify_diff_result(SAMPLE_RESUME, result, applied, JOB_KEYWORDS)
    assert any("work experience" in w.lower() for w in warnings)


def test_warns_on_word_count_explosion() -> None:
    long_desc = ["word " * 200] * 3
    result = {
        **SAMPLE_RESUME,
        "workExperience": [
            {**SAMPLE_RESUME["workExperience"][0], "description": long_desc},
        ],
    }
    applied = [ResumeChange(path="workExperience[0].description[0]", action="replace", original="Built APIs", value="word " * 200, reason="x")]
    warnings = verify_diff_result(SAMPLE_RESUME, result, applied, JOB_KEYWORDS)
    assert any("word count" in w.lower() for w in warnings)


def test_warns_on_invented_metric() -> None:
    applied = [
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="Built APIs",
            value="Built APIs improving throughput by 40%",
            reason="Added metric",
        )
    ]
    result = {
        **SAMPLE_RESUME,
        "workExperience": [
            {**SAMPLE_RESUME["workExperience"][0], "description": ["Built APIs improving throughput by 40%"]},
        ],
    }
    warnings = verify_diff_result(SAMPLE_RESUME, result, applied, JOB_KEYWORDS)
    assert any("metric" in w.lower() or "number" in w.lower() for w in warnings)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && python -m pytest tests/test_verify_diffs.py -v`
Expected: FAIL — `ImportError: cannot import name 'verify_diff_result'`

- [ ] **Step 3: Implement `verify_diff_result()` in `improver.py`**

Add to `apps/backend/app/services/improver.py`:

```python
_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")


def _count_description_words(data: dict[str, Any]) -> int:
    """Count total words in all description fields."""
    total = 0
    for key in ("workExperience", "personalProjects"):
        for entry in data.get(key, []):
            if isinstance(entry, dict):
                desc = entry.get("description", [])
                if isinstance(desc, list):
                    total += sum(len(str(d).split()) for d in desc)
                elif isinstance(desc, str):
                    total += len(desc.split())
    summary = data.get("summary", "")
    if isinstance(summary, str):
        total += len(summary.split())
    return total


def verify_diff_result(
    original: dict[str, Any],
    result: dict[str, Any],
    applied_changes: list[ResumeChange],
    job_keywords: dict[str, Any],
) -> list[str]:
    """Local quality checks on the diff result. Returns list of warnings.

    All checks are local (zero LLM cost). Warnings are informational —
    they don't block the response.
    """
    warnings: list[str] = []

    # Check 1: No empty result
    if not applied_changes:
        warnings.append("No changes were applied — resume returned unchanged")
        return warnings  # Skip other checks if nothing changed

    # Check 2: Section counts preserved
    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        result_count = len(result.get(key, []))
        if orig_count != result_count:
            warnings.append(
                f"Section count changed: {label} ({orig_count} → {result_count})"
            )

    # Check 3: Identity fields unchanged
    for key, id_fields in [
        ("workExperience", ["company", "title"]),
        ("education", ["institution", "degree"]),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for i, (orig, res) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig, dict) or not isinstance(res, dict):
                continue
            for field in id_fields:
                o_val = str(orig.get(field, "")).strip()
                r_val = str(res.get(field, "")).strip()
                if o_val and o_val != r_val:
                    warnings.append(
                        f"Identity field changed: {key}[{i}].{field} "
                        f"('{o_val}' → '{r_val}')"
                    )

    # Check 4: Word count ratio
    orig_words = _count_description_words(original)
    result_words = _count_description_words(result)
    if orig_words > 0 and result_words > orig_words * 1.8:
        warnings.append(
            f"Word count increased significantly: "
            f"{orig_words} → {result_words} ({result_words / orig_words:.1f}x)"
        )

    # Check 5: Invented metrics
    for change in applied_changes:
        if change.action == "replace" and isinstance(change.value, str):
            new_metrics = set(_METRIC_RE.findall(change.value))
            original_text = change.original or ""
            old_metrics = set(_METRIC_RE.findall(original_text))
            invented = new_metrics - old_metrics
            if invented:
                warnings.append(
                    f"Possible invented metric in {change.path}: "
                    f"{', '.join(invented)} (not in original)"
                )

    return warnings
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && python -m pytest tests/test_verify_diffs.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/improver.py apps/backend/tests/test_verify_diffs.py
git commit -m "feat: implement verify_diff_result() with 5 local quality checks"
```

---

### Task 5: Implement `generate_resume_diffs()` — LLM call

**Files:**
- Modify: `apps/backend/app/services/improver.py` (add function)
- Create: `apps/backend/tests/test_generate_diffs.py`

- [ ] **Step 1: Write failing test with mocked LLM**

Create `apps/backend/tests/test_generate_diffs.py`:

```python
"""Tests for generate_resume_diffs() — mocked LLM calls."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.improver import generate_resume_diffs


SAMPLE_RESUME_DATA = {
    "personalInfo": {"name": "Jane", "email": "", "title": "", "phone": "", "location": ""},
    "summary": "Backend engineer.",
    "workExperience": [
        {"id": 1, "title": "Engineer", "company": "Acme", "years": "2020 - Present", "description": ["Built APIs"]},
    ],
    "education": [],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Python"], "languages": [], "certificationsTraining": [], "awards": []},
    "customSections": {},
}


@pytest.mark.asyncio
@patch("app.services.improver.complete_json", new_callable=AsyncMock)
async def test_generate_diffs_returns_parsed_result(mock_complete: AsyncMock) -> None:
    mock_complete.return_value = {
        "changes": [
            {
                "path": "summary",
                "action": "replace",
                "original": "Backend engineer.",
                "value": "Python backend engineer.",
                "reason": "Added keyword",
            }
        ],
        "strategy_notes": "Added Python keyword",
    }

    result = await generate_resume_diffs(
        original_resume="# Resume\nBackend engineer.",
        job_description="Looking for Python engineer",
        job_keywords={"required_skills": ["Python"], "preferred_skills": [], "keywords": []},
        language="en",
        prompt_id="keywords",
        original_resume_data=SAMPLE_RESUME_DATA,
    )

    assert len(result.changes) == 1
    assert result.changes[0].path == "summary"
    assert result.strategy_notes == "Added Python keyword"
    mock_complete.assert_called_once()


@pytest.mark.asyncio
@patch("app.services.improver.complete_json", new_callable=AsyncMock)
async def test_generate_diffs_handles_empty_changes(mock_complete: AsyncMock) -> None:
    mock_complete.return_value = {"changes": [], "strategy_notes": "No changes needed"}

    result = await generate_resume_diffs(
        original_resume="# Resume",
        job_description="JD",
        job_keywords={"required_skills": [], "preferred_skills": [], "keywords": []},
        language="en",
        original_resume_data=SAMPLE_RESUME_DATA,
    )

    assert len(result.changes) == 0


@pytest.mark.asyncio
@patch("app.services.improver.complete_json", new_callable=AsyncMock)
async def test_generate_diffs_handles_missing_changes_key(mock_complete: AsyncMock) -> None:
    """LLM ignores diff format and outputs something else."""
    mock_complete.return_value = {"summary": "Some full resume output"}

    result = await generate_resume_diffs(
        original_resume="# Resume",
        job_description="JD",
        job_keywords={"required_skills": [], "preferred_skills": [], "keywords": []},
        language="en",
        original_resume_data=SAMPLE_RESUME_DATA,
    )

    assert len(result.changes) == 0
    assert "no changes key" in result.strategy_notes.lower() or result.strategy_notes != ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && python -m pytest tests/test_generate_diffs.py -v`
Expected: FAIL — `ImportError: cannot import name 'generate_resume_diffs'`

- [ ] **Step 3: Implement `generate_resume_diffs()` in `improver.py`**

Add to `apps/backend/app/services/improver.py`:

```python
import json

from app.llm import complete_json
from app.prompts import (
    DIFF_IMPROVE_PROMPT,
    DIFF_STRATEGY_INSTRUCTIONS,
    DEFAULT_IMPROVE_PROMPT_ID,
    get_language_name,
)
from app.schemas.models import ImproveDiffResult, ResumeChange


async def generate_resume_diffs(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> ImproveDiffResult:
    """Generate targeted resume diffs via LLM.

    Args:
        original_resume: Resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords
        language: Output language code
        prompt_id: Strategy id (nudge/keywords/full)
        original_resume_data: Structured resume JSON

    Returns:
        ImproveDiffResult with list of changes
    """
    keywords_str = _prepare_keywords_for_prompt(job_keywords)
    output_language = get_language_name(language)

    selected_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    strategy_instruction = DIFF_STRATEGY_INSTRUCTIONS.get(
        selected_id, DIFF_STRATEGY_INSTRUCTIONS[DEFAULT_IMPROVE_PROMPT_ID]
    )

    # LLM-011: Sanitize job description
    sanitized_jd = _sanitize_user_input(job_description)

    # Use structured JSON if available with month precision, else markdown
    if original_resume_data is not None:
        if _has_month_in_dates(original_resume_data):
            resume_input = json.dumps(original_resume_data)
        else:
            resume_input = original_resume
    else:
        resume_input = original_resume

    prompt = DIFF_IMPROVE_PROMPT.format(
        strategy_instruction=strategy_instruction,
        output_language=output_language,
        job_keywords=keywords_str,
        job_description=sanitized_jd,
        original_resume=resume_input,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON with targeted changes.",
        max_tokens=4096,
    )

    # Parse result — handle LLM ignoring diff format
    raw_changes = result.get("changes", [])
    if not isinstance(raw_changes, list):
        logger.warning("LLM returned non-list changes: %s", type(raw_changes))
        raw_changes = []

    changes: list[ResumeChange] = []
    for raw in raw_changes:
        if not isinstance(raw, dict):
            continue
        try:
            changes.append(ResumeChange(
                path=str(raw.get("path", "")),
                action=raw.get("action", "replace"),
                original=raw.get("original"),
                value=raw.get("value", ""),
                reason=str(raw.get("reason", "")),
            ))
        except Exception as e:
            logger.warning("Skipping malformed change: %s — %s", raw, e)

    strategy_notes = str(result.get("strategy_notes", ""))
    if not raw_changes and "changes" not in result:
        strategy_notes = "LLM output had no changes key — returned zero diffs"

    return ImproveDiffResult(changes=changes, strategy_notes=strategy_notes)
```

- [ ] **Step 4: Install test dependencies and run tests**

Run: `cd apps/backend && pip install pytest-asyncio && python -m pytest tests/test_generate_diffs.py -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/improver.py apps/backend/tests/test_generate_diffs.py
git commit -m "feat: implement generate_resume_diffs() — LLM diff generation"
```

---

## Chunk 4: Router Integration

### Task 6: Wire diff-based flow into `_improve_preview_flow()`

**Files:**
- Modify: `apps/backend/app/routers/resumes.py:739-746`

- [ ] **Step 1: Add import at top of `resumes.py`**

Add to imports in `apps/backend/app/routers/resumes.py`:

```python
from app.services.improver import generate_resume_diffs, apply_diffs, verify_diff_result
```

- [ ] **Step 2: Replace the `improve_resume()` call in `_improve_preview_flow()`**

In `apps/backend/app/routers/resumes.py`, replace lines 739-746:

```python
    # OLD:
    # improved_data = await improve_resume(
    #     original_resume=resume["content"],
    #     job_description=job["content"],
    #     job_keywords=job_keywords,
    #     language=language,
    #     prompt_id=prompt_id,
    #     original_resume_data=original_resume_data,
    # )
```

With:

```python
    # Diff-based improvement: generate targeted changes, apply with verification
    if original_resume_data:
        diff_result = await generate_resume_diffs(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
        )

        improved_data, applied_changes, rejected_changes = apply_diffs(
            original=original_resume_data,
            changes=diff_result.changes,
        )

        diff_warnings = verify_diff_result(
            original=original_resume_data,
            result=improved_data,
            applied_changes=applied_changes,
            job_keywords=job_keywords,
        )
        response_warnings.extend(diff_warnings)

        if rejected_changes:
            response_warnings.append(
                f"{len(rejected_changes)} change(s) rejected during verification"
            )

        logger.info(
            "Diff-based improve: %d applied, %d rejected, %d warnings",
            len(applied_changes),
            len(rejected_changes),
            len(diff_warnings),
        )
    else:
        # Fallback to full-output mode when no structured data available
        improved_data = await improve_resume(
            original_resume=resume["content"],
            job_description=job["content"],
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            original_resume_data=original_resume_data,
        )
```

- [ ] **Step 3: Apply same change to the legacy `/improve` endpoint**

The `/improve` endpoint (around line 1017) has the same `improve_resume()` call. Apply the identical diff-based replacement there, inside `_improve_full_flow()` or equivalent.

Check: `grep -n "improve_resume(" apps/backend/app/routers/resumes.py` to find all call sites.

- [ ] **Step 4: Verify the app starts without import errors**

Run: `cd apps/backend && python -c "from app.main import app; print('App loaded OK')"`
Expected: `App loaded OK`

- [ ] **Step 5: Run all tests**

Run: `cd apps/backend && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/routers/resumes.py
git commit -m "feat: wire diff-based improvement into preview and improve flows"
```

---

### Task 7: Final verification and cleanup

- [ ] **Step 1: Run full test suite**

Run: `cd apps/backend && python -m pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 2: Verify type hints on all new functions**

Check: every new function in `improver.py` has complete type hints on arguments and return values.

- [ ] **Step 3: Verify no circular imports**

Run: `cd apps/backend && python -c "from app.services.improver import generate_resume_diffs, apply_diffs, verify_diff_result; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Final commit with any cleanups**

```bash
git add -A
git commit -m "chore: final cleanup for diff-based improvement"
```
