# ATS Resume Screener Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an ATS (Applicant Tracking System) resume screener to resume-matcher — a two-pass LLM pipeline that scores a resume against a job description, identifies gaps, and generates an optimized resume with an inline edit-before-save flow.

**Architecture:** Pass 1 extracts keywords and produces a weighted ATS score (0–100) with a PASS/BORDERLINE/REJECT decision. Pass 2 takes the gap analysis from Pass 1 and generates an optimized resume. Both passes are new FastAPI router/service/prompt modules added alongside the existing tailor workflow.

**Tech Stack:** Python 3.13 / FastAPI / Pydantic / LiteLLM (`complete_json`) / TinyDB / Next.js 15 / TypeScript / Tailwind CSS / lucide-react

---

## File Map

### Backend (new files)
```
apps/backend/app/utils/synonyms.py          # normalize() — synonym expansion
apps/backend/app/schemas/ats.py             # ATSScreenRequest, ATSScreeningResult, ScoreBreakdown, KeywordRow
apps/backend/app/prompts/ats.py             # ATS_SCORE_PROMPT, ATS_OPTIMIZE_PROMPT
apps/backend/app/services/ats_scorer.py     # run_pass1() — score + keyword gap
apps/backend/app/services/ats_optimizer.py  # run_pass2() — optimized resume
apps/backend/app/routers/ats.py             # POST /api/v1/ats/screen
```

### Backend (modified)
```
apps/backend/app/routers/__init__.py        # export ats_router
apps/backend/app/main.py                   # register ats_router
```

### Backend (new tests)
```
apps/backend/tests/unit/test_synonyms.py
apps/backend/tests/unit/test_ats_scorer.py
apps/backend/tests/integration/test_ats_api.py
```

### Frontend (new files)
```
apps/frontend/lib/api/ats.ts                         # screenResume() + TypeScript types
apps/frontend/components/ats/ats-score-card.tsx       # score breakdown + decision badge
apps/frontend/components/ats/ats-keyword-table.tsx    # keyword match table
apps/frontend/components/ats/ats-missing-keywords.tsx # missing keywords list
apps/frontend/components/ats/ats-warning-flags.tsx    # warning flags
apps/frontend/components/ats/ats-optimization-panel.tsx  # suggestions + editable resume
apps/frontend/components/ats/ats-resume-input.tsx     # hybrid input (dropdown or paste)
apps/frontend/components/ats/ats-screen-panel.tsx     # orchestrator panel
apps/frontend/app/(default)/ats/page.tsx              # standalone /ats page
```

### Frontend (modified)
```
apps/frontend/lib/api/index.ts                  # export from ats.ts
apps/frontend/app/(default)/tailor/page.tsx     # add ATS pre-screen panel
apps/frontend/app/(default)/dashboard/page.tsx  # add ATS nav card in SwissGrid
```

---

## Task 1: Synonym Normalization Utility

**Files:**
- Create: `apps/backend/app/utils/__init__.py`
- Create: `apps/backend/app/utils/synonyms.py`
- Create: `apps/backend/tests/unit/test_synonyms.py`

- [ ] **Step 1: Create the utils package**

```bash
# Run from apps/backend/
mkdir -p app/utils
```

Create `app/utils/__init__.py` (empty):
```python
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/test_synonyms.py`:
```python
"""Unit tests for synonym normalization."""
import pytest
from app.utils.synonyms import normalize


class TestNormalize:
    def test_product_owner_to_product_manager(self):
        result = normalize("We need a Product Owner with 3 years")
        assert "product manager" in result.lower()

    def test_case_insensitive_ml(self):
        result = normalize("ML experience required")
        assert "machine learning" in result.lower()

    def test_kpi_expansion(self):
        result = normalize("Must track KPIs quarterly")
        assert "key performance indicator" in result.lower()

    def test_okr_expansion(self):
        result = normalize("Set OKRs with the team")
        assert "objective and key result" in result.lower()

    def test_b2b_expansion(self):
        result = normalize("B2B SaaS background preferred")
        assert "business to business" in result.lower()

    def test_gtm_expansion(self):
        result = normalize("Lead the GTM strategy")
        assert "go-to-market" in result.lower()

    def test_ux_expansion(self):
        result = normalize("Strong UX skills needed")
        assert "user experience" in result.lower()

    def test_does_not_mangle_unrelated_text(self):
        text = "Experienced software engineer building great products"
        result = normalize(text)
        assert "software engineer building great products" in result.lower()

    def test_empty_string(self):
        assert normalize("") == ""

    def test_po_abbreviation(self):
        result = normalize("Hiring a PO for our team")
        assert "product manager" in result.lower()
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/backend && uv run pytest tests/unit/test_synonyms.py -v
```

Expected: `ImportError` — `app.utils.synonyms` does not exist yet.

- [ ] **Step 4: Implement `synonyms.py`**

Create `app/utils/synonyms.py`:
```python
"""Synonym normalization for ATS keyword matching."""

import re

# Pattern → canonical form (case-insensitive, whole-word match where applicable)
_SYNONYM_PAIRS: list[tuple[str, str]] = [
    (r"\bproduct owner\b", "product manager"),
    (r"\bpo\b", "product manager"),
    (r"\bprogram manager\b", "product manager"),
    (r"\bproduct mgr\b", "product manager"),
    (r"\bscrum master\b", "agile coach"),
    (r"\bml\b", "machine learning"),
    (r"\bai\b", "artificial intelligence"),
    (r"\bux\b", "user experience"),
    (r"\bui\b", "user interface"),
    (r"\bkpi\b", "key performance indicator"),
    (r"\bokr\b", "objective and key result"),
    (r"\bgtm\b", "go-to-market"),
    (r"\bb2b\b", "business to business"),
    (r"\bb2c\b", "business to consumer"),
    (r"\bsaas\b", "software as a service"),
    (r"\bcrm\b", "customer relationship management"),
    (r"\berp\b", "enterprise resource planning"),
    (r"\bqa\b", "quality assurance"),
    (r"\broi\b", "return on investment"),
    (r"\bnps\b", "net promoter score"),
    (r"\bdau\b", "daily active users"),
    (r"\bmau\b", "monthly active users"),
    (r"\bsme\b", "subject matter expert"),
    (r"\bci/cd\b", "continuous integration continuous deployment"),
    (r"\bsql\b", "structured query language"),
    (r"\bapi\b", "application programming interface"),
]

# Pre-compile for performance
_COMPILED: list[tuple[re.Pattern[str], str]] = [
    (re.compile(pattern, re.IGNORECASE), replacement)
    for pattern, replacement in _SYNONYM_PAIRS
]


def normalize(text: str) -> str:
    """Apply synonym normalization to text.

    Replaces abbreviations and role title variants with canonical forms
    so the LLM sees consistent terminology across JD and resume.
    """
    result = text
    for pattern, replacement in _COMPILED:
        result = pattern.sub(replacement, result)
    return result
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/backend && uv run pytest tests/unit/test_synonyms.py -v
```

Expected: all 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd apps/backend
git add app/utils/__init__.py app/utils/synonyms.py tests/unit/test_synonyms.py
git commit -m "feat(ats): add synonym normalization utility"
```

---

## Task 2: ATS Schemas

**Files:**
- Create: `apps/backend/app/schemas/ats.py`

- [ ] **Step 1: Create `app/schemas/ats.py`**

```python
"""Pydantic schemas for ATS screening."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.models import ResumeData


class ATSScreenRequest(BaseModel):
    """Request body for POST /api/v1/ats/screen."""

    resume_id: str | None = None
    resume_text: str | None = None
    job_id: str | None = None
    job_description: str | None = None
    save_optimized: bool = False


class ScoreBreakdown(BaseModel):
    """Weighted ATS score per dimension."""

    skills_match: float      # max 30
    experience_match: float  # max 25
    domain_match: float      # max 20
    tools_match: float       # max 15
    achievement_match: float # max 10
    total: float             # 0-100


class KeywordRow(BaseModel):
    """One row in the keyword match table."""

    keyword: str
    found_in_resume: bool
    section: str | None = None  # e.g. "workExperience", "summary", null if not found


class ATSScreeningResult(BaseModel):
    """Full ATS screening report returned by the endpoint."""

    score: ScoreBreakdown
    decision: Literal["PASS", "BORDERLINE", "REJECT"]
    keyword_table: list[KeywordRow]
    missing_keywords: list[str]
    warning_flags: list[str]           # >= 10 items when decision == "REJECT"
    optimization_suggestions: list[str]
    optimized_resume: ResumeData | None = None
    saved_resume_id: str | None = None  # populated when save_optimized=True
```

- [ ] **Step 2: Verify schemas import cleanly**

```bash
cd apps/backend && uv run python -c "from app.schemas.ats import ATSScreenRequest, ATSScreeningResult, ScoreBreakdown, KeywordRow; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/schemas/ats.py
git commit -m "feat(ats): add ATS Pydantic schemas"
```

---

## Task 3: ATS Prompt Templates

**Files:**
- Create: `apps/backend/app/prompts/ats.py`

- [ ] **Step 1: Create `app/prompts/ats.py`**

```python
"""Prompt templates for the ATS two-pass pipeline."""

ATS_SCORE_PROMPT = """You are an ATS (Applicant Tracking System) engine. Analyze the job description and resume below.

Score using these weighted categories. Do NOT exceed the listed maximum for each:
- skills_match: 0-30 points  (explicit hard skills: programming languages, domain skills, certifications)
- experience_match: 0-25 points  (years of experience, seniority level, role progression match)
- domain_match: 0-20 points  (industry knowledge, domain terminology, sector-specific language)
- tools_match: 0-15 points  (specific tools, platforms, software, technologies named in JD)
- achievement_match: 0-10 points  (quantified results, measurable impacts, specific accomplishments)

Decision rules (apply AFTER scoring):
- total_score >= 75 → decision = "PASS"
- 60 <= total_score < 75 → decision = "BORDERLINE"
- total_score < 60 → decision = "REJECT" — you MUST provide at least 10 distinct warning_flags

For keyword_table: extract the 20-30 most important keywords/phrases from the JD. For each, state whether it appears in the resume and in which section. Use section names: "summary", "workExperience", "education", "additional", or null if not found.

For warning_flags: be concrete and specific. Write "Missing 3+ years of product management experience — resume shows 1 year" not "lacks experience". Every flag must name a specific gap.

Output ONLY the following JSON object. No explanation, no markdown:
{{
  "score_breakdown": {{
    "skills_match": <integer 0-30>,
    "experience_match": <integer 0-25>,
    "domain_match": <integer 0-20>,
    "tools_match": <integer 0-15>,
    "achievement_match": <integer 0-10>
  }},
  "total_score": <integer 0-100>,
  "decision": "PASS" | "BORDERLINE" | "REJECT",
  "keyword_table": [
    {{"keyword": "...", "found_in_resume": true, "section": "workExperience"}},
    {{"keyword": "...", "found_in_resume": false, "section": null}}
  ],
  "missing_keywords": ["keyword1", "keyword2"],
  "warning_flags": ["Specific flag 1", "Specific flag 2"]
}}

Job Description:
{job_description}

Resume:
{resume_text}"""


ATS_OPTIMIZE_PROMPT = """You are an ATS resume optimizer. Improve the resume below to better match the job description, guided by the gap analysis.

{critical_truthfulness_rules}

Gap Analysis:
Missing Keywords: {missing_keywords}

Warning Flags:
{warning_flags}

Score Breakdown: {score_breakdown}

Optimization rules:
- Weave missing keywords into existing bullets ONLY where the candidate's actual experience supports them
- If the resume contains any of these exact phrases — "product judgment", "operating in ambiguity", "structured thinking", "data-driven decision making" — preserve them verbatim in the output
- Do NOT add those PM phrases if they do not appear anywhere in the original resume text
- Strengthen vague action verbs ("worked on" → "led", "helped with" → "drove")
- Improve the summary to lead with the most JD-relevant experience
- Provide 5-10 specific, actionable optimization_suggestions explaining what changed and why

Job Description:
{job_description}

Original Resume (JSON):
{resume_json}

Output ONLY this JSON. The optimized_resume field must match the schema exactly:
{{
  "optimized_resume": {schema},
  "optimization_suggestions": ["suggestion1", "suggestion2"]
}}"""
```

- [ ] **Step 2: Verify import**

```bash
cd apps/backend && uv run python -c "from app.prompts.ats import ATS_SCORE_PROMPT, ATS_OPTIMIZE_PROMPT; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/prompts/ats.py
git commit -m "feat(ats): add ATS prompt templates"
```

---

## Task 4: ATS Scorer Service + Unit Tests

**Files:**
- Create: `apps/backend/app/services/ats_scorer.py`
- Create: `apps/backend/tests/unit/test_ats_scorer.py`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/test_ats_scorer.py`:
```python
"""Unit tests for ATS scorer service — pure logic, no LLM calls."""

import pytest
from app.services.ats_scorer import (
    _clamp_scores,
    _determine_decision,
    _pad_warning_flags,
)
from app.schemas.ats import ScoreBreakdown


class TestClampScores:
    def test_clamps_skills_match_to_30(self):
        result = _clamp_scores({
            "skills_match": 40, "experience_match": 0,
            "domain_match": 0, "tools_match": 0, "achievement_match": 0,
        })
        assert result.skills_match == 30.0

    def test_clamps_experience_match_to_25(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 35,
            "domain_match": 0, "tools_match": 0, "achievement_match": 0,
        })
        assert result.experience_match == 25.0

    def test_clamps_domain_match_to_20(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 99, "tools_match": 0, "achievement_match": 0,
        })
        assert result.domain_match == 20.0

    def test_clamps_tools_match_to_15(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 0, "tools_match": 50, "achievement_match": 0,
        })
        assert result.tools_match == 15.0

    def test_clamps_achievement_match_to_10(self):
        result = _clamp_scores({
            "skills_match": 0, "experience_match": 0,
            "domain_match": 0, "tools_match": 0, "achievement_match": 99,
        })
        assert result.achievement_match == 10.0

    def test_recalculates_total_after_clamping(self):
        result = _clamp_scores({
            "skills_match": 30, "experience_match": 25,
            "domain_match": 20, "tools_match": 15, "achievement_match": 10,
        })
        assert result.total == 100.0

    def test_handles_missing_keys_as_zero(self):
        result = _clamp_scores({})
        assert result.total == 0.0

    def test_returns_score_breakdown_instance(self):
        result = _clamp_scores({
            "skills_match": 10, "experience_match": 10,
            "domain_match": 10, "tools_match": 5, "achievement_match": 5,
        })
        assert isinstance(result, ScoreBreakdown)
        assert result.total == 40.0


class TestDetermineDecision:
    def test_75_is_pass(self):
        assert _determine_decision(75.0) == "PASS"

    def test_100_is_pass(self):
        assert _determine_decision(100.0) == "PASS"

    def test_74_is_borderline(self):
        assert _determine_decision(74.0) == "BORDERLINE"

    def test_60_is_borderline(self):
        assert _determine_decision(60.0) == "BORDERLINE"

    def test_59_is_reject(self):
        assert _determine_decision(59.0) == "REJECT"

    def test_0_is_reject(self):
        assert _determine_decision(0.0) == "REJECT"


class TestPadWarningFlags:
    def test_pads_to_10_on_reject_with_few_flags(self):
        flags = ["flag1", "flag2"]
        result = _pad_warning_flags(flags, "REJECT")
        assert len(result) >= 10

    def test_does_not_pad_on_pass(self):
        flags = ["flag1"]
        result = _pad_warning_flags(flags, "PASS")
        assert result == ["flag1"]

    def test_does_not_pad_on_borderline(self):
        flags = ["flag1", "flag2"]
        result = _pad_warning_flags(flags, "BORDERLINE")
        assert result == ["flag1", "flag2"]

    def test_does_not_duplicate_existing_flags(self):
        flags = ["Missing quantified achievements in work experience"]
        result = _pad_warning_flags(flags, "REJECT")
        lower = [f.lower() for f in result]
        assert lower.count("missing quantified achievements in work experience") == 1

    def test_does_not_pad_when_already_10_or_more(self):
        flags = [f"flag{i}" for i in range(12)]
        result = _pad_warning_flags(flags, "REJECT")
        assert len(result) == 12

    def test_preserves_original_flags_at_start(self):
        flags = ["original flag 1", "original flag 2"]
        result = _pad_warning_flags(flags, "REJECT")
        assert result[0] == "original flag 1"
        assert result[1] == "original flag 2"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && uv run pytest tests/unit/test_ats_scorer.py -v
```

Expected: `ImportError` — module does not exist yet.

- [ ] **Step 3: Implement `app/services/ats_scorer.py`**

```python
"""ATS Pass 1 — extract keywords and score resume vs job description."""

import logging

from app.llm import complete_json
from app.prompts.ats import ATS_SCORE_PROMPT
from app.schemas.ats import KeywordRow, ScoreBreakdown
from app.utils.synonyms import normalize

logger = logging.getLogger(__name__)

_SCORE_CAPS: dict[str, float] = {
    "skills_match": 30.0,
    "experience_match": 25.0,
    "domain_match": 20.0,
    "tools_match": 15.0,
    "achievement_match": 10.0,
}

_FALLBACK_WARNING_FLAGS: list[str] = [
    "Missing quantified achievements in work experience",
    "Low keyword density compared to job description",
    "Role title does not closely match job description requirements",
    "Insufficient domain-specific terminology",
    "Missing required tools or technologies from the job description",
    "Action verbs are weak or passive in several bullet points",
    "No evidence of cross-functional collaboration mentioned",
    "Missing product lifecycle ownership or end-to-end delivery examples",
    "Insufficient years of directly relevant experience",
    "Missing industry-specific language and sector keywords",
]


def _clamp_scores(raw: dict) -> ScoreBreakdown:
    """Clamp each score dimension to its maximum and recalculate total."""
    clamped = {
        k: min(float(raw.get(k, 0.0)), cap)
        for k, cap in _SCORE_CAPS.items()
    }
    total = sum(clamped.values())
    return ScoreBreakdown(**clamped, total=total)


def _determine_decision(total: float) -> str:
    """Map numeric total score to PASS / BORDERLINE / REJECT."""
    if total >= 75.0:
        return "PASS"
    if total >= 60.0:
        return "BORDERLINE"
    return "REJECT"


def _pad_warning_flags(flags: list[str], decision: str) -> list[str]:
    """Ensure at least 10 warning flags when decision is REJECT."""
    if decision != "REJECT" or len(flags) >= 10:
        return flags
    existing_lower = {f.lower() for f in flags}
    extras = [f for f in _FALLBACK_WARNING_FLAGS if f.lower() not in existing_lower]
    needed = max(0, 10 - len(flags))
    return flags + extras[:needed]


async def run_pass1(resume_text: str, job_text: str) -> dict:
    """Pass 1: Normalize inputs, call LLM, validate and return scored result.

    Returns a dict with keys: score, decision, keyword_table,
    missing_keywords, warning_flags.
    """
    norm_resume = normalize(resume_text)
    norm_job = normalize(job_text)

    prompt = ATS_SCORE_PROMPT.format(
        resume_text=norm_resume,
        job_description=norm_job,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an ATS scoring engine. Output only valid JSON, no explanations.",
        max_tokens=4096,
    )

    score = _clamp_scores(result.get("score_breakdown", {}))
    decision = _determine_decision(score.total)

    raw_flags = result.get("warning_flags", [])
    if not isinstance(raw_flags, list):
        raw_flags = []
    warning_flags = _pad_warning_flags([str(f) for f in raw_flags], decision)

    raw_keywords = result.get("keyword_table", [])
    keyword_table = [
        KeywordRow(
            keyword=str(row.get("keyword", "")),
            found_in_resume=bool(row.get("found_in_resume", False)),
            section=row.get("section"),
        )
        for row in raw_keywords
        if isinstance(row, dict)
    ]

    missing = result.get("missing_keywords", [])
    if not isinstance(missing, list):
        missing = []

    return {
        "score": score,
        "decision": decision,
        "keyword_table": keyword_table,
        "missing_keywords": [str(k) for k in missing],
        "warning_flags": warning_flags,
    }
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
cd apps/backend && uv run pytest tests/unit/test_ats_scorer.py -v
```

Expected: all 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/services/ats_scorer.py apps/backend/tests/unit/test_ats_scorer.py
git commit -m "feat(ats): add Pass 1 scorer service with unit tests"
```

---

## Task 5: ATS Optimizer Service

**Files:**
- Create: `apps/backend/app/services/ats_optimizer.py`

- [ ] **Step 1: Create `app/services/ats_optimizer.py`**

```python
"""ATS Pass 2 — generate an optimized resume from the gap analysis."""

import json
import logging

from app.llm import complete_json
from app.prompts.ats import ATS_OPTIMIZE_PROMPT
from app.prompts.templates import CRITICAL_TRUTHFULNESS_RULES, RESUME_SCHEMA_EXAMPLE
from app.schemas.models import ResumeData

logger = logging.getLogger(__name__)


async def run_pass2(
    resume_json: dict,
    job_text: str,
    score_data: dict,
) -> dict:
    """Pass 2: Generate an ATS-optimized resume from the gap analysis.

    Args:
        resume_json: The candidate's structured resume (ResumeData-compatible dict).
        job_text: The raw job description text.
        score_data: The dict returned by run_pass1 (score, decision, missing_keywords,
                    warning_flags).

    Returns:
        Dict with keys: optimized_resume (ResumeData), optimization_suggestions (list[str]).
    """
    missing_keywords = ", ".join(score_data.get("missing_keywords", [])) or "none identified"
    warning_flags_text = "\n".join(
        f"- {f}" for f in score_data.get("warning_flags", [])
    ) or "- none"

    score_obj = score_data.get("score")
    score_breakdown_text = (
        json.dumps(score_obj.model_dump(), indent=2)
        if hasattr(score_obj, "model_dump")
        else json.dumps(score_obj or {}, indent=2)
    )

    prompt = ATS_OPTIMIZE_PROMPT.format(
        critical_truthfulness_rules=CRITICAL_TRUTHFULNESS_RULES["keywords"],
        missing_keywords=missing_keywords,
        warning_flags=warning_flags_text,
        score_breakdown=score_breakdown_text,
        job_description=job_text,
        resume_json=json.dumps(resume_json, indent=2),
        schema=RESUME_SCHEMA_EXAMPLE,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an ATS resume optimizer. Output only valid JSON.",
        max_tokens=8192,
    )

    optimized_raw = result.get("optimized_resume", {})
    if not isinstance(optimized_raw, dict):
        optimized_raw = {}

    optimized_resume = ResumeData.model_validate(optimized_raw)

    suggestions = result.get("optimization_suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []

    return {
        "optimized_resume": optimized_resume,
        "optimization_suggestions": [str(s) for s in suggestions if s],
    }
```

- [ ] **Step 2: Verify import**

```bash
cd apps/backend && uv run python -c "from app.services.ats_optimizer import run_pass2; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/services/ats_optimizer.py
git commit -m "feat(ats): add Pass 2 optimizer service"
```

---

## Task 6: ATS Router + Integration Tests

**Files:**
- Create: `apps/backend/app/routers/ats.py`
- Create: `apps/backend/tests/integration/test_ats_api.py`

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/test_ats_api.py`:
```python
"""Integration tests for POST /api/v1/ats/screen."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


SAMPLE_RESUME = {
    "personalInfo": {"name": "Jane Doe", "title": "Product Manager", "email": "jane@example.com",
                     "phone": "", "location": "SF, CA"},
    "summary": "PM with 5 years experience driving product roadmaps.",
    "workExperience": [
        {"id": 1, "title": "Product Manager", "company": "Acme", "location": "SF",
         "years": "2020 - Present",
         "description": ["Led roadmap for core product", "Worked with engineering teams"]}
    ],
    "education": [{"id": 1, "institution": "UC Berkeley", "degree": "B.S. Business", "years": "2016 - 2020"}],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Jira", "Figma"], "languages": [], "certificationsTraining": [], "awards": []},
    "customSections": {},
    "sectionMeta": [],
}

PASS1_RESULT = {
    "score": {"skills_match": 25, "experience_match": 22, "domain_match": 18,
              "tools_match": 12, "achievement_match": 5, "total": 82},
    "decision": "PASS",
    "keyword_table": [{"keyword": "roadmap", "found_in_resume": True, "section": "workExperience"}],
    "missing_keywords": ["A/B testing"],
    "warning_flags": ["Missing quantified achievements"],
}

PASS2_RESULT = {
    "optimized_resume": SAMPLE_RESUME,
    "optimization_suggestions": ["Add metrics to bullet points"],
}


class TestATSScreen:
    """POST /api/v1/ats/screen"""

    @patch("app.routers.ats.db")
    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_screen_with_resume_id_and_job_id(
        self, mock_pass1, mock_pass2, mock_db, client
    ):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "Product manager resume with 5 years...",
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = {"job_id": "j1", "content": "PM role at startup..."}

        from app.schemas.ats import ScoreBreakdown, KeywordRow
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=25, experience_match=22, domain_match=18,
                                    tools_match=12, achievement_match=5, total=82),
            "decision": "PASS",
            "keyword_table": [KeywordRow(keyword="roadmap", found_in_resume=True, section="workExperience")],
            "missing_keywords": ["A/B testing"],
            "warning_flags": ["Missing quantified achievements"],
        }
        from app.schemas.models import ResumeData
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": ["Add metrics"],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "j1",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["decision"] == "PASS"
        assert data["score"]["total"] == 82
        assert len(data["keyword_table"]) == 1
        assert data["optimized_resume"] is not None

    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_screen_with_raw_text(self, mock_pass1, mock_pass2, client):
        from app.schemas.ats import ScoreBreakdown
        from app.schemas.models import ResumeData
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=15, experience_match=10, domain_match=10,
                                    tools_match=5, achievement_match=3, total=43),
            "decision": "REJECT",
            "keyword_table": [],
            "missing_keywords": ["Python", "Agile"],
            "warning_flags": [f"flag{i}" for i in range(10)],
        }
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": [],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "I am a product manager " * 20,
                "job_description": "We are looking for a senior PM " * 10,
            })

        assert resp.status_code == 200
        assert resp.json()["decision"] == "REJECT"

    async def test_missing_both_resume_inputs_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "job_description": "Some JD text",
            })
        assert resp.status_code == 422

    async def test_missing_both_job_inputs_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "Some resume text " * 10,
            })
        assert resp.status_code == 422

    @patch("app.routers.ats.db")
    async def test_resume_id_not_found_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "nonexistent",
                "job_description": "Some JD text",
            })
        assert resp.status_code == 404

    @patch("app.routers.ats.db")
    async def test_job_id_not_found_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "x" * 200,
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = None
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "nonexistent",
            })
        assert resp.status_code == 404

    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_short_resume_text_returns_400(self, mock_pass1, mock_pass2, client):
        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_text": "short",
                "job_description": "Senior PM role",
            })
        assert resp.status_code == 400

    @patch("app.routers.ats.db")
    @patch("app.routers.ats.run_pass2", new_callable=AsyncMock)
    @patch("app.routers.ats.run_pass1", new_callable=AsyncMock)
    async def test_save_optimized_creates_new_resume(
        self, mock_pass1, mock_pass2, mock_db, client
    ):
        mock_db.get_resume.return_value = {
            "resume_id": "r1",
            "content": "Product manager resume " * 20,
            "processed_data": SAMPLE_RESUME,
        }
        mock_db.get_job.return_value = {"job_id": "j1", "content": "PM role " * 20}
        mock_db.create_resume.return_value = {"resume_id": "new-r1"}

        from app.schemas.ats import ScoreBreakdown
        from app.schemas.models import ResumeData
        mock_pass1.return_value = {
            "score": ScoreBreakdown(skills_match=25, experience_match=22, domain_match=18,
                                    tools_match=12, achievement_match=5, total=82),
            "decision": "PASS",
            "keyword_table": [],
            "missing_keywords": [],
            "warning_flags": [],
        }
        mock_pass2.return_value = {
            "optimized_resume": ResumeData.model_validate(SAMPLE_RESUME),
            "optimization_suggestions": [],
        }

        async with client:
            resp = await client.post("/api/v1/ats/screen", json={
                "resume_id": "r1",
                "job_id": "j1",
                "save_optimized": True,
            })

        assert resp.status_code == 200
        assert resp.json()["saved_resume_id"] == "new-r1"
        mock_db.create_resume.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && uv run pytest tests/integration/test_ats_api.py -v
```

Expected: `ImportError` or 404 — router not registered yet.

- [ ] **Step 3: Implement `app/routers/ats.py`**

```python
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

    if request.resume_id:
        resume = db.get_resume(request.resume_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found.")
        resume_json = resume.get("processed_data") or {}
        resume_text = resume.get("content", resume_text)

    if len(resume_text.strip()) < 100:
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
```

- [ ] **Step 4: Run integration tests — they should still fail (router not wired yet)**

```bash
cd apps/backend && uv run pytest tests/integration/test_ats_api.py -v
```

Expected: 404 on all route tests — router is not mounted yet.

- [ ] **Step 5: Wire up the router (see Task 7) then re-run**

After Task 7 is complete:
```bash
cd apps/backend && uv run pytest tests/integration/test_ats_api.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Commit (after Task 7 wiring and passing tests)**

```bash
git add apps/backend/app/routers/ats.py apps/backend/tests/integration/test_ats_api.py
git commit -m "feat(ats): add ATS router with integration tests"
```

---

## Task 7: Wire Up Router

**Files:**
- Modify: `apps/backend/app/routers/__init__.py`
- Modify: `apps/backend/app/main.py`

- [ ] **Step 1: Export the router from `routers/__init__.py`**

Edit `apps/backend/app/routers/__init__.py` — add the ats import:
```python
"""API routers."""

from app.routers.ats import router as ats_router
from app.routers.config import router as config_router
from app.routers.enrichment import router as enrichment_router
from app.routers.health import router as health_router
from app.routers.jobs import router as jobs_router
from app.routers.resumes import router as resumes_router

__all__ = [
    "ats_router",
    "resumes_router",
    "jobs_router",
    "config_router",
    "health_router",
    "enrichment_router",
]
```

- [ ] **Step 2: Register the router in `main.py`**

In `apps/backend/app/main.py`, update the import line and add the router registration:

Replace this import:
```python
from app.routers import config_router, enrichment_router, health_router, jobs_router, resumes_router
```

With:
```python
from app.routers import ats_router, config_router, enrichment_router, health_router, jobs_router, resumes_router
```

Add after the existing `app.include_router(enrichment_router, ...)` line:
```python
app.include_router(ats_router, prefix="/api/v1")
```

- [ ] **Step 3: Run the full integration test suite**

```bash
cd apps/backend && uv run pytest tests/integration/test_ats_api.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 4: Run entire test suite to check for regressions**

```bash
cd apps/backend && uv run pytest -v
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/routers/__init__.py apps/backend/app/main.py
git commit -m "feat(ats): register ATS router in application"
```

---

## Task 8: Frontend API Client

**Files:**
- Create: `apps/frontend/lib/api/ats.ts`
- Modify: `apps/frontend/lib/api/index.ts`

- [ ] **Step 1: Create `lib/api/ats.ts`**

```typescript
/**
 * ATS screening API client and TypeScript types.
 */

import { apiPost } from './client';
import type { ResumeData } from '@/components/dashboard/resume-component';

export interface ScoreBreakdown {
  skills_match: number;
  experience_match: number;
  domain_match: number;
  tools_match: number;
  achievement_match: number;
  total: number;
}

export interface KeywordRow {
  keyword: string;
  found_in_resume: boolean;
  section: string | null;
}

export type ATSDecision = 'PASS' | 'BORDERLINE' | 'REJECT';

export interface ATSScreeningResult {
  score: ScoreBreakdown;
  decision: ATSDecision;
  keyword_table: KeywordRow[];
  missing_keywords: string[];
  warning_flags: string[];
  optimization_suggestions: string[];
  optimized_resume: ResumeData | null;
  saved_resume_id: string | null;
}

export interface ATSScreenRequest {
  resume_id?: string;
  resume_text?: string;
  job_id?: string;
  job_description?: string;
  save_optimized?: boolean;
}

export async function screenResume(
  request: ATSScreenRequest
): Promise<ATSScreeningResult> {
  const resp = await apiPost('/ats/screen', request, 120_000);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'ATS screening failed' }));
    throw new Error(err.detail ?? 'ATS screening failed');
  }
  return resp.json();
}
```

- [ ] **Step 2: Export from `lib/api/index.ts`**

Add to the end of `apps/frontend/lib/api/index.ts`:
```typescript
// ATS screening
export {
  screenResume,
  type ScoreBreakdown,
  type KeywordRow,
  type ATSDecision,
  type ATSScreeningResult,
  type ATSScreenRequest,
} from './ats';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/lib/api/ats.ts apps/frontend/lib/api/index.ts
git commit -m "feat(ats): add frontend ATS API client"
```

---

## Task 9: ATS Display Components

**Files:**
- Create: `apps/frontend/components/ats/ats-score-card.tsx`
- Create: `apps/frontend/components/ats/ats-keyword-table.tsx`
- Create: `apps/frontend/components/ats/ats-missing-keywords.tsx`
- Create: `apps/frontend/components/ats/ats-warning-flags.tsx`

- [ ] **Step 1: Create `components/ats/ats-score-card.tsx`**

```tsx
'use client';

import React from 'react';
import type { ScoreBreakdown, ATSDecision } from '@/lib/api/ats';

interface ATSScoreCardProps {
  score: ScoreBreakdown;
  decision: ATSDecision;
}

const DECISION_STYLES: Record<ATSDecision, { bg: string; text: string; label: string }> = {
  PASS: { bg: 'bg-green-700', text: 'text-white', label: 'PASS' },
  BORDERLINE: { bg: 'bg-amber-500', text: 'text-black', label: 'BORDERLINE' },
  REJECT: { bg: 'bg-red-600', text: 'text-white', label: 'REJECT' },
};

const SCORE_DIMS = [
  { key: 'skills_match' as const, label: 'Skills Match', max: 30 },
  { key: 'experience_match' as const, label: 'Experience', max: 25 },
  { key: 'domain_match' as const, label: 'Domain', max: 20 },
  { key: 'tools_match' as const, label: 'Tools', max: 15 },
  { key: 'achievement_match' as const, label: 'Achievements', max: 10 },
];

export function ATSScoreCard({ score, decision }: ATSScoreCardProps) {
  const style = DECISION_STYLES[decision];

  return (
    <div className="border border-black p-6 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-1">
            ATS Score
          </p>
          <p className="font-serif text-6xl font-bold text-black">
            {Math.round(score.total)}
            <span className="text-2xl text-muted-foreground">/100</span>
          </p>
        </div>
        <div className={`${style.bg} ${style.text} px-6 py-3 font-mono text-lg font-bold uppercase tracking-widest border border-black`}>
          {style.label}
        </div>
      </div>

      <div className="space-y-3">
        {SCORE_DIMS.map(({ key, label, max }) => {
          const value = score[key];
          const pct = Math.round((value / max) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between font-mono text-xs uppercase mb-1">
                <span>{label}</span>
                <span>{Math.round(value)}/{max}</span>
              </div>
              <div className="h-2 bg-secondary border border-black">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/ats/ats-keyword-table.tsx`**

```tsx
'use client';

import React from 'react';
import type { KeywordRow } from '@/lib/api/ats';

interface ATSKeywordTableProps {
  rows: KeywordRow[];
}

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  workExperience: 'Experience',
  education: 'Education',
  additional: 'Skills',
};

export function ATSKeywordTable({ rows }: ATSKeywordTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Keyword Match Table
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="border-b border-black bg-secondary">
              <th className="text-left px-4 py-2 uppercase text-xs">JD Keyword</th>
              <th className="text-left px-4 py-2 uppercase text-xs">Found</th>
              <th className="text-left px-4 py-2 uppercase text-xs">Section</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-black last:border-0 ${row.found_in_resume ? '' : 'bg-red-50'}`}
              >
                <td className="px-4 py-2">{row.keyword}</td>
                <td className="px-4 py-2">
                  {row.found_in_resume ? (
                    <span className="text-green-700 font-bold">YES</span>
                  ) : (
                    <span className="text-red-600 font-bold">NO</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {row.section ? SECTION_LABELS[row.section] ?? row.section : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/ats/ats-missing-keywords.tsx`**

```tsx
'use client';

import React from 'react';

interface ATSMissingKeywordsProps {
  keywords: string[];
}

export function ATSMissingKeywords({ keywords }: ATSMissingKeywordsProps) {
  if (keywords.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Missing Keywords ({keywords.length})
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <span
            key={i}
            className="border border-red-600 text-red-700 font-mono text-xs px-2 py-1 bg-red-50"
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/ats/ats-warning-flags.tsx`**

```tsx
'use client';

import React from 'react';

interface ATSWarningFlagsProps {
  flags: string[];
}

export function ATSWarningFlags({ flags }: ATSWarningFlagsProps) {
  if (flags.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-red-600 text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Warning Flags ({flags.length})
      </div>
      <ol className="divide-y divide-black">
        {flags.map((flag, i) => (
          <li key={i} className="flex gap-3 px-4 py-3 font-mono text-sm">
            <span className="text-red-600 font-bold shrink-0">{i + 1}.</span>
            <span>{flag}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/ats/
git commit -m "feat(ats): add ATS display components (score card, keyword table, missing keywords, warnings)"
```

---

## Task 10: ATS Optimization Panel with Edit Mode

**Files:**
- Create: `apps/frontend/components/ats/ats-optimization-panel.tsx`

- [ ] **Step 1: Create `components/ats/ats-optimization-panel.tsx`**

This component shows:
- Optimization suggestions list
- Optimized resume in view or edit mode
- Save and Download buttons

```tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from '@/components/builder/resume-form';
import { screenResume } from '@/lib/api/ats';

interface ATSOptimizationPanelProps {
  suggestions: string[];
  optimizedResume: ResumeData;
  resumeId: string | null;
  jobId: string | null;
  jobDescription: string | null;
  resumeText: string | null;
  onSaved: (newResumeId: string) => void;
}

export function ATSOptimizationPanel({
  suggestions,
  optimizedResume,
  resumeId,
  jobId,
  jobDescription,
  resumeText,
  onSaved,
}: ATSOptimizationPanelProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedResume, setEditedResume] = useState<ResumeData>(optimizedResume);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await screenResume({
        resume_id: resumeId ?? undefined,
        resume_text: resumeText ?? undefined,
        job_id: jobId ?? undefined,
        job_description: jobDescription ?? undefined,
        save_optimized: true,
      });
      if (result.saved_resume_id) {
        onSaved(result.saved_resume_id);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Optimization Suggestions */}
      {suggestions.length > 0 && (
        <div className="border border-black">
          <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
            Optimization Suggestions
          </div>
          <ul className="divide-y divide-black">
            {suggestions.map((s, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 font-mono text-sm">
                <span className="text-blue-700 font-bold shrink-0">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optimized Resume */}
      <div className="border border-black">
        <div className="flex items-center justify-between bg-black text-white px-4 py-2">
          <span className="font-mono text-xs uppercase tracking-widest">
            ATS Optimized Resume
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
              className="font-mono text-xs uppercase tracking-widest px-3 py-1 border border-white hover:bg-white hover:text-black transition-colors"
            >
              {mode === 'view' ? 'Edit' : 'Preview'}
            </button>
          </div>
        </div>

        <div className="p-4">
          {mode === 'edit' ? (
            <ResumeForm
              data={editedResume}
              onChange={(updated) => setEditedResume(updated as ResumeData)}
            />
          ) : (
            <div className="font-mono text-sm whitespace-pre-wrap text-muted-foreground bg-secondary p-4 border border-black max-h-96 overflow-y-auto">
              {JSON.stringify(editedResume, null, 2)}
            </div>
          )}
        </div>

        <div className="border-t border-black px-4 py-3 flex gap-3 items-center">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {isSaving ? 'Saving...' : 'Save as New Resume'}
          </Button>
          {saveError && (
            <p className="font-mono text-xs text-red-600">{saveError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors. If `ResumeForm` doesn't have an `onChange` prop matching this signature, inspect `components/builder/resume-form.tsx` and adjust the prop name to match the actual interface.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/ats/ats-optimization-panel.tsx
git commit -m "feat(ats): add optimization panel with inline edit mode"
```

---

## Task 11: ATS Resume Input (Hybrid)

**Files:**
- Create: `apps/frontend/components/ats/ats-resume-input.tsx`

- [ ] **Step 1: Create `components/ats/ats-resume-input.tsx`**

Hybrid input: tab toggle between "Select stored resume" (dropdown) and "Paste text".

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';

export interface ResumeInputValue {
  resumeId: string | null;
  resumeText: string | null;
}

interface ATSResumeInputProps {
  value: ResumeInputValue;
  onChange: (value: ResumeInputValue) => void;
}

type InputMode = 'stored' | 'paste';

export function ATSResumeInput({ value, onChange }: ATSResumeInputProps) {
  const [mode, setMode] = useState<InputMode>('stored');
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(false);

  useEffect(() => {
    setLoadingResumes(true);
    fetchResumeList()
      .then(setResumes)
      .catch(() => setResumes([]))
      .finally(() => setLoadingResumes(false));
  }, []);

  const handleModeSwitch = (newMode: InputMode) => {
    setMode(newMode);
    onChange({ resumeId: null, resumeText: null });
  };

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex border border-black font-mono text-xs uppercase">
        {(['stored', 'paste'] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeSwitch(m)}
            className={`flex-1 py-2 tracking-widest transition-colors ${
              mode === m
                ? 'bg-black text-white'
                : 'bg-background text-black hover:bg-secondary'
            }`}
          >
            {m === 'stored' ? 'Select Stored Resume' : 'Paste Resume Text'}
          </button>
        ))}
      </div>

      {mode === 'stored' ? (
        <div>
          {loadingResumes ? (
            <p className="font-mono text-xs text-muted-foreground">Loading resumes...</p>
          ) : resumes.length === 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              No stored resumes found. Switch to Paste mode.
            </p>
          ) : (
            <select
              className="w-full border border-black px-3 py-2 font-mono text-sm bg-background focus:outline-none focus:ring-1 focus:ring-black"
              value={value.resumeId ?? ''}
              onChange={(e) =>
                onChange({ resumeId: e.target.value || null, resumeText: null })
              }
            >
              <option value="">— Select a resume —</option>
              {resumes.map((r) => (
                <option key={r.resume_id} value={r.resume_id}>
                  {r.filename ?? r.resume_id}
                  {r.is_master ? ' (master)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <Textarea
          placeholder="Paste your resume text here..."
          value={value.resumeText ?? ''}
          onChange={(e) =>
            onChange({ resumeId: null, resumeText: e.target.value })
          }
          rows={10}
          className="font-mono text-sm border-black"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/ats/ats-resume-input.tsx
git commit -m "feat(ats): add hybrid resume input component"
```

---

## Task 12: ATS Screen Panel (Orchestrator)

**Files:**
- Create: `apps/frontend/components/ats/ats-screen-panel.tsx`

- [ ] **Step 1: Create `components/ats/ats-screen-panel.tsx`**

This is the main container used both by the standalone page and the tailor page integration.

```tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { screenResume, type ATSScreeningResult } from '@/lib/api/ats';
import { ATSScoreCard } from './ats-score-card';
import { ATSKeywordTable } from './ats-keyword-table';
import { ATSMissingKeywords } from './ats-missing-keywords';
import { ATSWarningFlags } from './ats-warning-flags';
import { ATSOptimizationPanel } from './ats-optimization-panel';

interface ATSScreenPanelProps {
  /** Stored resume ID (from tailor flow) */
  resumeId?: string;
  /** Stored job ID (from tailor flow) */
  jobId?: string;
  /** Raw JD text (from standalone mode) */
  jobDescription?: string;
  /** Raw resume text (from standalone mode) */
  resumeText?: string;
}

export function ATSScreenPanel({
  resumeId,
  jobId,
  jobDescription,
  resumeText,
}: ATSScreenPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ATSScreeningResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedResumeId, setSavedResumeId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const handleRun = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setSavedResumeId(null);
    setElapsed(0);

    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const data = await screenResume({
        resume_id: resumeId,
        resume_text: resumeText,
        job_id: jobId,
        job_description: jobDescription,
        save_optimized: false,
      });
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'ATS screening failed');
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  const canRun =
    (Boolean(resumeId) || Boolean(resumeText?.trim())) &&
    (Boolean(jobId) || Boolean(jobDescription?.trim()));

  return (
    <div className="space-y-6">
      {/* Run button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleRun}
          disabled={isLoading || !canRun}
          className="font-mono text-xs uppercase tracking-widest"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing... {elapsed > 0 && `(${elapsed}s)`}
            </>
          ) : (
            'Run ATS Screen'
          )}
        </Button>
        {!canRun && (
          <p className="font-mono text-xs text-muted-foreground">
            Resume and job description are required.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-600 bg-red-50 px-4 py-3 font-mono text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <ATSScoreCard score={result.score} decision={result.decision} />
          <ATSKeywordTable rows={result.keyword_table} />
          <ATSMissingKeywords keywords={result.missing_keywords} />
          <ATSWarningFlags flags={result.warning_flags} />

          {result.optimized_resume && (
            <ATSOptimizationPanel
              suggestions={result.optimization_suggestions}
              optimizedResume={result.optimized_resume}
              resumeId={resumeId ?? null}
              jobId={jobId ?? null}
              jobDescription={jobDescription ?? null}
              resumeText={resumeText ?? null}
              onSaved={(id) => setSavedResumeId(id)}
            />
          )}

          {savedResumeId && (
            <div className="border border-green-700 bg-green-50 px-4 py-3 font-mono text-sm text-green-800">
              Optimized resume saved. Resume ID: {savedResumeId}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/ats/ats-screen-panel.tsx
git commit -m "feat(ats): add ATS screen panel orchestrator"
```

---

## Task 13: Standalone ATS Page

**Files:**
- Create: `apps/frontend/app/(default)/ats/page.tsx`

- [ ] **Step 1: Create `app/(default)/ats/page.tsx`**

```tsx
'use client';

import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { ATSResumeInput, type ResumeInputValue } from '@/components/ats/ats-resume-input';
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';

export default function ATSPage() {
  const [resumeInput, setResumeInput] = useState<ResumeInputValue>({
    resumeId: null,
    resumeText: null,
  });
  const [jobDescription, setJobDescription] = useState('');

  return (
    <div
      className="min-h-screen w-full flex justify-center items-start py-12 px-4 md:px-8 bg-background"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-4xl border border-black bg-background shadow-sw-lg">
        {/* Header */}
        <div className="border-b border-black p-8 md:p-10">
          <h1 className="font-serif text-4xl md:text-5xl text-black tracking-tight uppercase">
            ATS Screen
          </h1>
          <p className="mt-3 text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
            {'// '}
            Predict your resume pass rate before applying
          </p>
        </div>

        <div className="p-8 md:p-10 space-y-8">
          {/* Inputs */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Resume input */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest font-bold">
                Resume
              </label>
              <ATSResumeInput value={resumeInput} onChange={setResumeInput} />
            </div>

            {/* Job description input */}
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-widest font-bold">
                Job Description
              </label>
              <Textarea
                placeholder="Paste the job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={12}
                className="font-mono text-sm border-black"
              />
            </div>
          </div>

          {/* ATS Panel (run button + results) */}
          <ATSScreenPanel
            resumeId={resumeInput.resumeId ?? undefined}
            resumeText={resumeInput.resumeText ?? undefined}
            jobDescription={jobDescription || undefined}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/app/(default)/ats/
git commit -m "feat(ats): add standalone /ats page"
```

---

## Task 14: Tailor Page Integration

**Files:**
- Modify: `apps/frontend/app/(default)/tailor/page.tsx`

- [ ] **Step 1: Add ATS panel import and state to tailor page**

In `apps/frontend/app/(default)/tailor/page.tsx`, add the import near the top with the other imports:

```typescript
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';
```

- [ ] **Step 2: Add ATS panel state to the component**

Inside `TailorPage`, add this state after the existing state declarations:

```typescript
const [showAtsPanel, setShowAtsPanel] = useState(false);
const [jobIdForAts, setJobIdForAts] = useState<string | null>(null);
```

- [ ] **Step 3: Wire job ID capture**

In the `TailorPage` component, locate where `uploadJobDescriptions` is called and the `job_id` is returned. After that call succeeds and you have a `job_id`, set it:

```typescript
// After receiving job_ids from uploadJobDescriptions:
if (job_ids && job_ids.length > 0) {
  setJobIdForAts(job_ids[0]);
}
```

The exact location depends on the tailor page implementation — search for `uploadJobDescriptions` usage and add the `setJobIdForAts` call alongside it.

- [ ] **Step 4: Add the ATS pre-screen UI block**

In the JSX of `TailorPage`, add this block ABOVE the existing tailoring controls (before the prompt selector / tailor button). Place it after the job description textarea and before the "Tailor Resume" button:

```tsx
{/* ATS Pre-Screen — appears once a JD is uploaded */}
{masterResumeId && jobIdForAts && (
  <div className="border border-black">
    <button
      onClick={() => setShowAtsPanel(!showAtsPanel)}
      className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs uppercase tracking-widest bg-background hover:bg-secondary transition-colors border-b border-black"
    >
      <span className="font-bold">ATS Pre-Screen</span>
      <span className="text-muted-foreground">{showAtsPanel ? '▲ collapse' : '▼ expand'}</span>
    </button>
    {showAtsPanel && (
      <div className="p-4">
        <ATSScreenPanel
          resumeId={masterResumeId}
          jobId={jobIdForAts}
        />
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/app/(default)/tailor/page.tsx
git commit -m "feat(ats): integrate ATS pre-screen panel into tailor page"
```

---

## Task 15: Dashboard Navigation Card

**Files:**
- Modify: `apps/frontend/app/(default)/dashboard/page.tsx`

- [ ] **Step 1: Add ATS card import**

In `apps/frontend/app/(default)/dashboard/page.tsx`, the `Link`, `Card`, `CardTitle`, `CardDescription` components are already imported. No new imports are needed.

- [ ] **Step 2: Add the ATS navigation card inside SwissGrid**

Locate the `<SwissGrid>` JSX block in `dashboard/page.tsx`. Inside the `<SwissGrid>` children (after the last existing navigation card and before any filler divs), add:

```tsx
{/* ATS Screen card */}
<Link href="/ats" className="block h-full">
  <Card
    variant="interactive"
    className="aspect-square h-full hover:bg-[#1D4ED8] hover:text-white"
  >
    <div className="flex-1 flex flex-col justify-between pointer-events-none">
      <div className="w-14 h-14 border-2 border-current flex items-center justify-center mb-4">
        <span className="font-mono text-xl font-bold">ATS</span>
      </div>
      <div>
        <CardTitle className="text-xl uppercase">ATS Screen</CardTitle>
        <CardDescription className="mt-2 opacity-60 group-hover:opacity-100 text-current">
          {'// '}
          Score your resume against any JD
        </CardDescription>
      </div>
    </div>
  </Card>
</Link>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/app/(default)/dashboard/page.tsx
git commit -m "feat(ats): add ATS Screen navigation card to dashboard"
```

---

## Final Verification

- [ ] **Start the backend**

```bash
cd apps/backend && uv run app
```

Verify `GET http://localhost:8000/docs` shows `POST /api/v1/ats/screen` in the Swagger UI.

- [ ] **Start the frontend**

```bash
cd apps/frontend && npm run dev
```

- [ ] **Golden path — standalone page**

1. Navigate to `http://localhost:3000/ats`
2. Select a stored resume OR paste resume text
3. Paste a job description
4. Click "Run ATS Screen"
5. Verify: score card renders with PASS/BORDERLINE/REJECT badge
6. Verify: keyword table shows matched/missing keywords
7. Verify: missing keywords section renders
8. Verify: warning flags list renders
9. Verify: optimized resume shows in view mode
10. Click "Edit" → resume form renders, editable
11. Click "Save as New Resume" → success confirmation appears

- [ ] **Golden path — tailor page**

1. Navigate to `/tailor` with a master resume loaded
2. Paste a job description and upload it
3. Verify: "ATS Pre-Screen" collapsible bar appears
4. Expand it → "Run ATS Screen" button visible
5. Run → results appear inline above the tailor controls

- [ ] **Run full backend test suite**

```bash
cd apps/backend && uv run pytest -v
```

Expected: all tests pass (unit + integration).

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(ats): complete ATS Resume Screener — two-pass pipeline, standalone page, tailor integration"
```
