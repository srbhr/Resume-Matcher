# ATS Resume Screener — Design Spec
**Date:** 2026-04-29
**Status:** Approved

## Overview

Add an ATS (Applicant Tracking System) Resume Screener to resume-matcher. The feature compares a Job Description (JD) with a candidate resume and predicts whether the resume would pass ATS screening, inspired by platforms such as Greenhouse, Lever, SuccessFactors, Taleo, and SmartRecruiters.

The system is implemented as a **two-pass LLM pipeline** added cleanly alongside the existing tailor/improve workflow.

---

## User Flow

### Entry Point A — Before Tailoring (Tailor Page)

When the user has a resume and JD selected on the existing tailor page (`/tailor`):

1. An **"ATS Pre-Screen"** button appears at the top of the tailor page.
2. User clicks → `POST /api/v1/ats/screen` is called with the stored `resume_id` + `job_id`.
3. Result renders as a collapsible `ats-screen-panel` above the existing tailor controls.
4. User can save the optimized resume (one-click) or proceed to tailor the original.

### Entry Point B — Standalone Quick Screen (`/ats` page)

A dedicated page accessible from the sidebar nav ("ATS Screen"):

1. **Hybrid resume input**: tab toggle between "Select existing resume" (dropdown from stored resumes) and "Paste resume text".
2. **JD input**: always a paste text area.
3. User clicks "Run ATS Screen" → same API call.
4. Full report renders below the inputs.

---

## Approach: Two-Pass LLM Pipeline

Chosen for focused context per pass, debuggability, and consistency with existing `improver.py` patterns.

```
POST /ats/screen
  │
  ├─ Resolve inputs (fetch from DB or use raw text)
  ├─ Normalize text via synonyms.py
  │
  ├─ Pass 1: ats_scorer.py → complete_json(ATS_SCORE_PROMPT)
  │     Returns: score breakdown, decision, keyword table,
  │              missing keywords, warning flags
  │
  ├─ Pass 2: ats_optimizer.py → complete_json(ATS_OPTIMIZE_PROMPT)
  │     Input: original resume + Pass 1 gap analysis
  │     Returns: optimized ResumeData, optimization suggestions
  │
  ├─ if save_optimized=true → db.create_resume(optimized_data)
  │
  └─ Return ATSScreeningResult
```

Passes run **sequentially** (Pass 2 needs Pass 1's gap analysis). If Pass 2 fails, Pass 1 result is still returned with `optimized_resume: null`.

---

## Backend Architecture

### New Files

```
apps/backend/app/
  routers/ats.py              # POST /api/v1/ats/screen endpoint
  services/ats_scorer.py      # Pass 1: extract + score
  services/ats_optimizer.py   # Pass 2: optimize resume
  prompts/ats.py              # ATS-specific prompt templates
  schemas/ats.py              # Pydantic input/output models
  utils/synonyms.py           # Static synonym dict + normalize()
```

### Registration

Add to `apps/backend/app/main.py`:
```python
from app.routers import ats_router
app.include_router(ats_router, prefix="/api/v1")
```

### API Endpoint

```
POST /api/v1/ats/screen
```

**Request:**
```json
{
  "resume_id": "abc123",       // optional — stored resume
  "resume_text": "...",        // optional — raw paste
  "job_id": "def456",          // optional — stored JD
  "job_description": "...",    // optional — raw paste
  "save_optimized": false      // if true, saves optimized resume as new version
}
```

At least one of `resume_id`/`resume_text` and one of `job_id`/`job_description` required.

**Response:** Full `ATSScreeningResult`.

---

## Schemas (`schemas/ats.py`)

```python
class ATSScreenRequest(BaseModel):
    resume_id: str | None = None
    resume_text: str | None = None
    job_id: str | None = None
    job_description: str | None = None
    save_optimized: bool = False

class ScoreBreakdown(BaseModel):
    skills_match: float       # max 30
    experience_match: float   # max 25
    domain_match: float       # max 20
    tools_match: float        # max 15
    achievement_match: float  # max 10
    total: float              # 0-100

class KeywordRow(BaseModel):
    keyword: str
    found_in_resume: bool
    section: str | None       # e.g. "workExperience", "summary", null

class ATSScreeningResult(BaseModel):
    score: ScoreBreakdown
    decision: Literal["PASS", "BORDERLINE", "REJECT"]
    keyword_table: list[KeywordRow]
    missing_keywords: list[str]
    warning_flags: list[str]           # >= 10 items when decision == REJECT
    optimization_suggestions: list[str]
    optimized_resume: ResumeData | None
    saved_resume_id: str | None        # populated if save_optimized=true
```

---

## Synonym Normalization (`utils/synonyms.py`)

Applied to both JD and resume text **before** either LLM pass (case-insensitive, whole-word match). ~30 domain mappings covering:

- Role titles: "product owner" → "product manager", "po" → "product manager"
- Methodologies: "scrum master" → "agile coach"
- Abbreviations: "ml" → "machine learning", "ai" → "artificial intelligence", "ux" → "user experience"
- Business terms: "kpi" → "key performance indicator", "okr" → "objective and key result", "gtm" → "go-to-market", "b2b" → "business to business", "b2c" → "business to consumer"

```python
def normalize(text: str) -> str:
    """Apply synonym normalization to text."""
    ...
```

---

## Prompts (`prompts/ats.py`)

### Pass 1 — `ATS_SCORE_PROMPT`

Instructs the LLM to act as an ATS engine. Input: normalized JD + normalized resume text.

Output JSON structure:
```json
{
  "score_breakdown": {
    "skills_match": 28,
    "experience_match": 20,
    "domain_match": 15,
    "tools_match": 12,
    "achievement_match": 7
  },
  "total_score": 82,
  "decision": "PASS",
  "keyword_table": [
    {"keyword": "roadmap", "found_in_resume": true, "section": "workExperience"},
    {"keyword": "A/B testing", "found_in_resume": false, "section": null}
  ],
  "missing_keywords": ["A/B testing", "OKRs", "sprint planning"],
  "warning_flags": [
    "Missing quantified achievements in most recent role",
    "..."
  ]
}
```

**Decision thresholds** (enforced in prompt + validated in Python):
- `total >= 75` → PASS
- `60–74` → BORDERLINE
- `< 60` → REJECT (prompt instructs ≥ 10 warning flags)

### Pass 2 — `ATS_OPTIMIZE_PROMPT`

Input: original resume JSON + Pass 1 gap analysis (missing keywords, warning flags, score breakdown).

- Inherits `CRITICAL_TRUTHFULNESS_RULES` from `prompts/templates.py` — no invented skills, no fabricated metrics.
- Core PM skills (product judgment, operating in ambiguity, structured thinking, data-driven decision making) are **preserved if found** in the original resume, **never injected** if absent.
- Missing keywords are woven in only where existing experience supports them (same contract as `IMPROVE_RESUME_PROMPT_KEYWORDS`).

Output JSON:
```json
{
  "optimized_resume": { /* full ResumeData schema */ },
  "optimization_suggestions": [
    "Add 'A/B testing' to your analytics bullet in Role X",
    "Quantify the outcome of the roadmap initiative"
  ]
}
```

### Score Validation (Python layer, `services/ats_scorer.py`)

- Clamps each breakdown value to its max (30/25/20/15/10)
- Recalculates `total = sum(breakdown)` after clamping
- Pads `warning_flags` to ≥ 10 items with generic fallbacks when decision is REJECT and LLM returns fewer

---

## Frontend Architecture

### New Files

```
apps/frontend/
  app/(default)/ats/page.tsx              # Standalone quick-screen page
  components/ats/ats-screen-panel.tsx     # Embedded collapsible panel (tailor flow)
  components/ats/ats-score-card.tsx       # Score breakdown + decision badge
  components/ats/ats-keyword-table.tsx    # Keyword match table
  components/ats/ats-missing-keywords.tsx # Missing keywords list
  components/ats/ats-warning-flags.tsx    # Warning flags (>=10 for REJECT)
  components/ats/ats-optimization-panel.tsx # Suggestions + editable optimized resume
  components/ats/ats-resume-input.tsx     # Hybrid input (dropdown or paste)
```

### Optimized Resume — Edit Mode

The optimized resume supports inline editing before save or download:

```
ATS analysis completes
  │
  ├─ Optimized resume renders in read mode (formatted, scannable)
  ├─ "Edit" button → switches to resume-form.tsx in edit mode
  │     user adjusts bullets, summary, skills inline
  ├─ Two action buttons:
  │     [Save as new resume] → re-calls /ats/screen with save_optimized=true
  │                            OR posts edited ResumeData to confirm endpoint
  │     [Download PDF]       → reuses existing print/resumes/[id] route (after save)
  └─ Changes are local state only until user explicitly saves/downloads
```

`ats-optimization-panel.tsx` manages:
- `mode: "view" | "edit"` — toggled by Edit button
- `editedResume: ResumeData` — initialized from `optimized_resume`, mutated by form

Reuses without modification: `resume-form.tsx`, `print/resumes/[id]/page.tsx`, existing resume confirm API.

### Navigation

Add **"ATS Screen"** entry to the existing sidebar nav (alongside Dashboard, Builder, Tailor, Settings).

### State Management

No new global state store. ATS result is local component state (`useState`), consistent with how the tailor page manages improvement results.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Neither `resume_id` nor `resume_text` provided | 422 validation error |
| `resume_id` not found in DB | 404 with clear message |
| Pass 1 LLM fails | 500, no partial result |
| Pass 2 LLM fails | Return Pass 1 result with `optimized_resume: null` |
| LLM returns score caps exceeded | Python clamps, recalculates total silently |
| LLM returns < 10 warning flags on REJECT | Python pads with generic fallbacks |
| `save_optimized=true` but Pass 2 failed | 409 "Optimization unavailable, cannot save" |
| Resume text < 100 chars | 400 "Resume text too short to analyze" |

---

## Edge Cases

- **Raw text path**: resume text used as-is for Pass 1; Pass 2 output validated via `ResumeData.model_validate()`, returns null on failure.
- **Non-PM JDs**: Scoring weights are universal; core PM skill preservation only activates when those phrases exist in the original text.
- **Ephemeral results**: ATS reports are not persisted. Re-running always produces a fresh analysis.

---

## Testing Plan

### Backend Unit Tests (`tests/unit/test_ats_scorer.py`)
- Score clamping logic (each dimension cap enforced)
- Warning flag padding (< 10 → padded to 10 on REJECT)
- `normalize()` synonym replacement (case-insensitive, whole-word)
- Decision threshold boundaries (59→REJECT, 60→BORDERLINE, 75→PASS)

### Backend Integration Tests (`tests/integration/test_ats_api.py`)
- Valid request with `resume_id` + `job_id` → 200 with full result
- Valid request with raw `resume_text` + `job_description` → 200
- Missing both resume inputs → 422
- `resume_id` not found → 404
- `save_optimized=true` → new resume appears in resume list

### Frontend
- Manual golden-path: tailor page panel (Entry Point A)
- Manual golden-path: standalone `/ats` page (Entry Point B)
- Edit mode: modify optimized resume, save, verify new resume in system
- Download PDF after save
