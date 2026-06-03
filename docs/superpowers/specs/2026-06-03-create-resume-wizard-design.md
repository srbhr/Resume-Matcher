# Design Spec — Create-Resume Wizard (conversational Q&A → master resume)

> **Status:** Approved design (2026-06-03). Next step: implementation plan via `writing-plans`.
> **Branch:** `feat/create-resume-wizard`
> **Route:** `/create`

---

## 1. Context & problem

Resume Matcher's entire value chain assumes the user **already has a resume** (PDF/DOCX) to upload. A
brand-new user with no document is stuck at the front door: the dashboard's no-master state offers only
an **Upload** card (`apps/frontend/app/(default)/dashboard/page.tsx` ~L352, `ResumeUploadDialog`).

This spec adds the missing on-ramp: a **conversational Q&A wizard** that interviews the user, has the AI
**author** polished resume content from their plain answers, shows the resume **building live**, and saves
the result as the **master resume** — completing the "I have nothing → I have a tailored, downloadable
resume" loop.

## 2. Goals / non-goals

**Goals**
- A guided, personalized Q&A flow that produces a valid `ResumeData` and persists it as the master resume.
- AI turns plain spoken answers into resume bullets/sections; user never has to write resume-speak.
- Short by default, personal in feel (uses the user's name; user chooses what to cover and in what order).
- Live resume preview that fills in section-by-section beside the chat.
- Lands the user in the existing Builder, prefilled, to fine-tune + export.

**Non-goals (v1 — deliberate YAGNI)**
- No voice input.
- No document import *into* the wizard (Upload already covers that).
- No server-side conversation sessions / resumable-across-devices state.
- No changes to multi-resume management or the tailor pipeline.
- Summary is AI-generated once (accept/redo), not a multi-turn back-and-forth.

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Wizard engine** | **Guided sections + AI writing.** Fixed skeleton (intro → section picker → per-section Q → AI draft → next); AI authors content, light name/choice personalization. | Predictable, cheap (one LLM call per section), reliable on weak local models; matches the requested "James, where shall we begin?" flow exactly. |
| **Live preview** | **Live responsive side panel.** Resume preview beside the chat on desktop, fills in as the user answers; collapses to a "Preview" drawer on mobile. | The "watch it build" payoff; reuses the existing resume renderer as one responsive component. |
| **Finish line** | **Save as master → open in Builder prefilled.** | Builder already owns detailed editing, templates, and PDF; the wizard stays intentionally light. |
| **Route name** | **`/create`** | Short, clear. |
| **Availability** | Available from the dashboard no-master state **and** as a general entry when a master already exists (creates a normal non-master resume). | One feature serves both onboarding and "make another from scratch." |
| **Orchestration** | **Frontend-orchestrated script + stateless backend draft endpoints** (Approach 1). | Per-section authoring feeds the live preview; mirrors the existing stateless `enrichment` analyze/enhance pattern; resilient via localStorage; easy to test. |

### Approaches considered (and rejected)
- **Stateful backend conversation session** — overkill; the script is fixed, so the backend never needs to
  decide the next question. Adds session storage/lifecycle for a local single-user app. YAGNI.
- **One big final LLM call** — breaks the live preview (can only show raw text, not drafted bullets, until
  the end) and is more truncation-prone.

## 4. Conversation skeleton (fixed script, AI fills the words)

```
1. Greet + name            "Hi! What's your name?"        -> personalInfo.name   [typed]
2. What they do            "James, what do you do?"       -> personalInfo.title  [typed, optional]
3. Section picker          "Where should we start?
                            [ Work ] [ Education ] [ Projects ] [ Skills ]"
4. Per chosen section:
       ask 1 focused question (+ at most 1 follow-up if the answer is thin)
       -> POST /resumes/draft-section -> validated fragment
       -> drafted entry appears in chat AND the live preview
       "[ + Another ]   [ Pick another section ]   [ I'm done ]"
5. Contact checkpoint       compact bubble: location, phone, email, LinkedIn/GitHub  [typed]
6. Summary                  AI auto-writes from everything so far     [accept / redo]
7. Review                   full preview -> "Save as master -> open in Builder"
```

- **Minimum to finish:** `name` + at least one content section. Everything else skippable → keeps it short.
- **Personal/contact fields are typed, never AI-authored** (they are facts). The AI authors only the *content*
  sections: work, education, projects, skills, summary.
- **Inline redo is lightweight:** after a draft, "Want me to tweak anything?" → free text → one re-author
  call. Deep editing is the Builder's job (where we land).
- **Sections offered:** Work Experience, Education, Projects, Skills (each repeatable / skippable). Summary is
  auto-generated at the end. (Custom sections are a Builder concern, out of scope for the wizard.)

## 5. Data model & schema mapping

No DB schema change. The wizard assembles a standard `ResumeData` dict (the exact shape produced by
`parse_resume_to_json`) and persists it via the existing facade with `content_type="json"`.

Canonical target shape (`apps/backend/app/schemas/models.py`):

| Wizard step | `ResumeData` path | Author? |
|---|---|---|
| Name / title / contact | `personalInfo.{name,title,email,phone,location,website,linkedin,github}` | typed (no LLM) |
| Work answers | `workExperience[]` = `{id,title,company,location,years,description[]}` | **AI** |
| Education answers | `education[]` = `{id,institution,degree,years,description}` | **AI** |
| Projects answers | `personalProjects[]` = `{id,name,role,years,github,website,description[]}` | **AI** |
| Skills answers | `additional.technicalSkills[]` (+ optionally `languages[]`) | **AI** (structure/dedupe) |
| End | `summary` | **AI** (from assembled resume) |

- `id` fields are assigned client-side (sequential per section), consistent with the parser's convention.
- `sectionMeta` / `customSections` are left to defaults (`normalize_resume_data` fills section meta on read).
- Dates: the AI must **copy the user's stated dates verbatim** (same month-precision discipline as the rest of
  the app); no `restore_dates_from_markdown` needed (there is no source markdown — the user's typed answer is
  the source of truth, so we keep it as given).

## 6. Backend design

All new code: type hints on every function; log details server-side, return generic client messages.

### 6.1 Endpoints (mounted under `/api/v1`)
- **`POST /resumes/draft-section`** — body `DraftSectionRequest`; returns `DraftSectionResponse` (a validated
  fragment). Stateless. Requires LLM configured (503 with a clear, generic message if not — the frontend
  gates before reaching this, mirroring the tailor flow).
- **`POST /resumes`** — create a resume from structured data (`WizardResumeCreate`: `processed_data`, optional
  `title`). Uses **`create_resume_atomic_master`** so it becomes master iff none exists (the upload invariant);
  otherwise a normal non-master resume. Returns the created resume id + master flag.

> These live in `app/routers/resumes.py` (or a small `app/routers/creation.py` mounted in
> `routers/__init__.py`) — decide at implementation time; keep `resumes.py` from growing unwieldy.

### 6.2 Service — `app/services/creation.py`
```python
async def draft_section(
    section: SectionKind,
    answers: str,
    context: DraftContext,   # name, title, language, + assembled resume for summary
    language: str,
) -> dict[str, Any]:
    """One complete_json call -> a fragment validated against the ResumeData sub-schema."""
```
- One `complete_json` call per section using a section-specific prompt.
- Validate the fragment against the relevant Pydantic sub-model (`Experience`, `Education`, `Project`,
  `AdditionalInfo` slice, or a `summary` string) before returning — never hand back unvalidated LLM output.
- **Sanitize prompt-injection in user answers** the same way `improver.py` already does (reuse its helper).

### 6.3 Prompts — `app/prompts/creation.py`
- `DRAFT_WORK_PROMPT`, `DRAFT_EDUCATION_PROMPT`, `DRAFT_PROJECT_PROMPT`, `DRAFT_SKILLS_PROMPT`,
  `DRAFT_SUMMARY_PROMPT` (or one parametric template). Each:
  - Takes `{output_language}` so output respects the content language.
  - Carries **anti-fabrication rules** (see §8). Pattern mirrors `app/prompts/enrichment.py`
    (`ENHANCE_DESCRIPTION_PROMPT` already turns Q&A answers into bullets — strong precedent).
  - Double-brace literal JSON examples (`{{ }}`) per the repo's `.format()` convention.

### 6.4 Schemas — `app/schemas/creation.py`
`SectionKind` (enum: `work|education|project|skills|summary`), `DraftSectionRequest`,
`DraftContext`, `DraftSectionResponse`, `WizardResumeCreate`. Register in `schemas/__init__.py`.

## 7. Frontend design (Swiss International Style throughout)

- **Route** `app/(default)/create/page.tsx` (`'use client'`) — inherits providers from `(default)/layout.tsx`
  (language, status cache, error boundary).
- **Entry points:**
  - Dashboard no-master state: a **"Create from scratch"** `Card` beside the existing Upload card. If the LLM
    is not configured, it routes to `/settings` (mirroring today's logic at dashboard L325).
  - A secondary entry (e.g., dashboard footer / "New resume" affordance) for when a master already exists.
- **`components/create/`:**
  - `creation-wizard.tsx` — orchestrator: the step state machine, chat transcript, running `ResumeData`,
    selection/dialog state (local state, no new context), owns the responsive split layout.
  - `wizard-script.ts` — pure step/question definitions + transition logic (the testable core).
  - `chat-message.tsx`, `chat-input.tsx` (Textarea with the Enter-`stopPropagation` pattern),
    `section-picker.tsx` (the `[Work][Education][Projects][Skills]` buttons),
    `contact-fields.tsx` (compact typed mini-form bubble),
    `wizard-preview.tsx` (wraps the **existing resume renderer** used by the Builder preview).
- **State & persistence:** React state holds running `ResumeData` + transcript; **localStorage autosave**
  (same pattern as the Builder draft key) to survive refresh; the DB row is created **once at the end** via
  `createResumeFromWizard`, then `router.push('/builder?id=<new>')`.
- **API client** `lib/api/create.ts`: `draftSection(req)`, `createResumeFromWizard(data)` — typed wrappers
  over `apiPost` (never raw fetch).
- **i18n:** new `create.*` tree (greeting/question copy, section labels, buttons, contact prompts, review,
  errors) mirrored across **all 5 locales** (`en/es/zh/ja/pt-BR`) — identical structure or `npm run build` +
  the locale-parity pre-push gate fails. Also add `nav.createResume` if a nav affordance is added.

## 8. Truthfulness guardrails

Aligns with the maintainer policy: **aggressive polishing is fine, fabrication is not.** There is no JD here,
so the only risk is the AI inventing facts the user didn't give. Each authoring prompt MUST:
- Never invent employers, institutions, job titles, dates, metrics/numbers, tools, or technologies not present
  in the user's answer.
- Shape and lightly polish the user's actual statements into resume phrasing; expand only by rephrasing what
  was said, not by adding new claims.
- If an answer is too thin to draft, ask **one** optional follow-up; if the user skips, draft conservatively
  from what exists (or leave the entry minimal) — **do not pad with invented content**.
- No em dashes (repo-wide writing convention).

## 9. Testing strategy (deterministic, anti-theater)

**Backend**
- `tests/service/test_creation.py` (LLM mocked via the existing pattern): each section authors a
  schema-valid fragment; thin answers don't fabricate; injection patterns in answers are sanitized.
- `tests/integration/test_create_api.py`: `POST /resumes/draft-section` returns a valid fragment;
  `POST /resumes` persists and **becomes master iff none exists** (single-master invariant holds); the
  LLM-not-configured path returns the generic guarded error.
- Reuse `conftest.py::isolated_db` (temp-file SQLite) + `respx`/mock-LLM helpers.

**Frontend**
- `wizard-script` state machine unit tests: section branching, skip, repeat, minimum-to-finish gate,
  assemble-to-`ResumeData` correctness.
- `lib/api/create` client tests; the final assemble → create → navigate path.

Every test must fail when its target breaks. No real network/LLM calls in the default suites.

## 10. Skills (invoked via the Skill tool at the matching phase)
- `superpowers:writing-plans` — turn this spec into the implementation plan (next step).
- `superpowers:test-driven-development` (rigid, red/green/refactor) — per workstream.
- `python-development:*` — async patterns, type-safety, testing patterns.
- `backend-development:api-design-principles` — the new endpoints.
- `agent-skills:security-and-hardening` — the authoring/injection path.
- UI/Swiss skills — the wizard components.
- `superpowers:verification-before-completion`, `superpowers:finishing-a-development-branch` — before PR.

## 11. File map

**New (backend):** `app/services/creation.py`, `app/prompts/creation.py`, `app/schemas/creation.py`,
(maybe) `app/routers/creation.py`, tests `tests/service/test_creation.py`,
`tests/integration/test_create_api.py`.

**Modified (backend):** `app/routers/resumes.py` and/or `routers/__init__.py` (mount), `schemas/__init__.py`,
`app/prompts/__init__.py` (re-export + placeholder validation), relevant `docs/agent/` docs.

**New (frontend):** `app/(default)/create/page.tsx`, `components/create/*` (7 files),
`lib/api/create.ts`, colocated `*.test.ts(x)` / `tests/*`.

**Modified (frontend):** `app/(default)/dashboard/page.tsx` (+ maybe `components/home/swiss-grid.tsx`) for the
entry card, `messages/{en,es,zh,ja,pt-BR}.json`.

**Docs:** new `docs/agent/features/create-resume.md`; update backend API contract docs + `apps/backend/CLAUDE.md`
endpoint list.

## 12. Open items to settle during planning
- Router placement: extend `resumes.py` vs a new `creation.py` (lean toward a new small router to keep
  `resumes.py` bounded).
- Exact contact-checkpoint placement in the script (single bubble vs woven in) — refine against the live
  preview UX.
- Whether skills authoring also captures `languages`/`certifications` or only `technicalSkills` in v1
  (default: technicalSkills only; the rest stay Builder-added).
