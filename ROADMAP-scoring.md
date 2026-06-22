# Resume Scoring Feature — Roadmap

## Goal

Add a resume-vs-job scoring endpoint to Resume Matcher by adapting the logic from `scorer.py`, replacing its direct OpenAI/Anthropic SDK calls with the project's existing LiteLLM wrapper (`app.llm`), and caching results in TinyDB.

---

## Source Script Analysis (`scorer.py`)

| Component | What it does | Adaptation needed |
|-----------|-------------|-------------------|
| `_talk_to_ai` / `_talk_fast` | Direct OpenAI/Anthropic SDK calls | **Replace** with `llm.complete()` and `llm.complete_json()` |
| `extract_text_and_image_from_pdf` | pytesseract + pdf2image | **Drop** — resumes already exist as parsed markdown/JSON in DB |
| `_unify_resume` | Normalize raw text to structured markdown | Simplify — resume text already structured in `processed_data` |
| `extract_job_requirements` | Parse JD into weighted requirements JSON | Keep, use `llm.complete_json()` |
| `_compute_ai_match` | Score 7 criteria with weights | Keep, use `llm.complete()` per criterion |
| `assess_resume_quality` | Vision-based quality score from PDF image | **Drop** — no image pipeline in Resume Matcher |
| `get_score_details` | Map int → (emoji, color, label) | Keep as-is |
| Final score formula | `ai_score * 0.75 + quality_score * 0.25` | Simplify to `ai_score` only (no quality score) |

---

## Implementation Steps

### Step 1 — Database: add `scores` table

- Add `scores` property to `app/database.py` → `db.table("scores")`
- Add `create_score(resume_id, job_id, result)` and `get_score(resume_id, job_id)` methods
- Schema: `{ score_id, resume_id, job_id, score, ai_score, match_reasons, red_flags, website, label, emoji, color, created_at }`

### Step 2 — Scoring service (`app/services/scorer.py`)

Port the pure-logic functions from `scorer.py`, replacing the AI layer:

```
extract_job_requirements(job_desc: str) -> dict | None
    Uses: llm.complete_json(prompt)

_compute_ai_match(resume_text: str, job_desc: str) -> dict
    Uses: llm.complete(criterion_prompt) per criterion (7 calls)
          llm.complete(reasons_prompt)
          llm.complete(website_prompt)

get_score_details(score: int) -> tuple[str, str, str]
    Pure function — copy as-is

async score_resume(resume_id: str, job_id: str) -> dict
    1. Load resume text from db.get_resume(resume_id)["processed_data"]
    2. Load job text from db.get_job(job_id)["content"]
    3. Call _compute_ai_match(resume_text, job_desc)
    4. Compute final score (= ai_score, no quality component)
    5. Return full result dict
```

All functions must be `async` and have full type hints.

### Step 3 — Pydantic schemas (`app/schemas/scoring.py`)

```python
class ScoreRequest(BaseModel):
    resume_id: str
    job_id: str

class ScoreResult(BaseModel):
    score_id: str
    resume_id: str
    job_id: str
    score: int
    ai_score: int
    match_reasons: str
    red_flags: dict[str, list[str]]
    website: str
    label: str
    emoji: str
    color: str
    cached: bool
    created_at: str
```

### Step 4 — Router (`app/routers/scoring.py`)

```
POST /api/scores
    Body: ScoreRequest { resume_id, job_id }
    1. Check cache: db.get_score(resume_id, job_id) → return if hit
    2. Validate resume + job exist; raise 404 otherwise
    3. Call await score_resume(resume_id, job_id)
    4. Persist via db.create_score(...)
    5. Return ScoreResult

GET /api/scores/{resume_id}/{job_id}
    Return cached score or 404
```

Register router in `app/main.py` with prefix `/api`.

### Step 5 — Wire up

- Import and include `scoring.router` in `app/main.py`
- Export new schemas from `app/schemas/__init__.py`

---

## What is NOT included

| Excluded | Reason |
|----------|--------|
| PDF parsing (pytesseract, pdf2image, PyPDF2) | Resumes already structured in DB |
| Visual quality scoring (`assess_resume_quality`) | Requires image pipeline not present |
| `set_api()` / provider switching | LiteLLM handles provider via existing config |
| tiktoken token counting | LiteLLM + Router handle limits internally |
| Frontend UI | Out of scope for this roadmap |

---

## File Checklist

```
apps/backend/app/
├── database.py              # Add scores table + CRUD
├── schemas/
│   └── scoring.py           # ScoreRequest, ScoreResult
├── services/
│   └── scorer.py            # Ported + adapted scoring logic
├── routers/
│   └── scoring.py           # POST /api/scores, GET /api/scores/{r}/{j}
└── main.py                  # Register scoring router
```

---

## Key Constraints

- All async — no blocking calls (scorer uses sync SDK; adapted version uses `await llm.complete()`)
- All Python functions must have type hints (project rule)
- Log detailed errors server-side, return generic messages to client
- Never log personal data (resume content, candidate name, contact info, job description text) or security-sensitive data (API keys, tokens, internal IDs in error traces)
- Cache lookup must happen before any LLM call to avoid unnecessary cost
