# Resume Wizard Redesign — Design Spec

> **Status:** Approved design (2026-06-04). Supersedes the section-picker UX in
> `docs/superpowers/plans/2026-06-04-resume-wizard-implementation.md`. The backend
> skeleton (router mount, finalize→master-resume, schema/service/prompt file layout,
> localStorage draft, dashboard entry + choice dialog) is **reused**; the turn
> protocol, prompt, and the entire wizard page UX are **replaced**.

## Goal

Turn `/resume-wizard` from a manual, multi-zone form (intro box, a 6-button section
grid, a free-text answer area, and a stats/warnings side panel) into an **AI-led,
one-question-at-a-time** flow: one focused question at a time, the AI writes the polished
(truthful) resume content, decides what to ask next, and the user watches their real
resume build in a quiet live preview. Finalizing creates the master resume and drops
the user into the existing `/builder`.

## Why (problems with the shipped version)

- The layout puts the question on top, a wall of 6 section buttons in the middle, and
  the answer box at the bottom — the opposite of a focused flow.
- The right "Live Draft" panel shows stat counts (`Experience 1`, `Skills 0`) and an
  always-on orange warnings box — noisy and confusing, not insightful.
- It is **manual**: the user picks sections and types structured answers; the AI only
  reacts within a chosen section. Worse, answering during the post-intro picker state
  runs an AI turn against the `review` sentinel and is silently discarded.

## Locked decisions

1. **Format — one-question-at-a-time cards.** One big question per screen, single input, thin
   segmented progress bar, advance on `Enter`. No section-button grid.
2. **Right side — live resume preview.** A quiet, real resume page fills in as you
   answer. No stat counts, no always-on warnings.
3. **AI behavior — writes + adapts.** The AI rewrites casual answers into polished,
   truthful resume content AND chooses the next question from what's still thin,
   signalling when there's enough to finish.
4. **Turn architecture — one adaptive `complete_json` call per answer** (vs. a
   two-call write-then-plan split), for snappy answer→next-question latency.

## UX / Layout

Two-pane layout inside the existing Swiss shell (`bg-background`, 2px black borders,
hard offset shadows, serif headers, mono labels):

- **Left — question card** (`lg:grid-cols-[minmax(0,1fr)_360px]`, card is the `1fr`):
  - Thin **segmented progress bar** (server-computed; see Guardrails).
  - **Mono kicker** naming the current topic (e.g. `ABOUT YOUR ROLE AT ACME`).
  - **Big serif question** (the AI's `next_question.text`).
  - **One input** — `Textarea` (multi-line answers; keeps the repo's Enter-key
    `stopPropagation` pattern; `⌘/Ctrl+Enter` or the Continue button submits).
  - **Footer actions, shown per step:** `intro` → `Continue` + `Back to Dashboard`;
    `question` → `Continue` (primary) + `Skip` + `← Back` (hidden when `history` is
    empty) + `Review & finish` + `Back to Dashboard`; `review` → `Create master resume`
    (primary, success) + `Keep adding` + `Back to Dashboard`. At most one primary per
    region (Swiss rule).
- **Right — live preview** (`360px`): a real, scaled resume layout that renders
  `resume_data` (name/title, Experience, Education, Projects, Skills as chips). Empty
  state: "Your resume appears here as you answer." Newly inferred skills get a brief
  green-bordered `✓` accent. **No** counts, **no** orange warning box.
- **Mobile (`< lg`):** preview collapses to a `Peek ▸` toggle so the question stays
  full-focus; expanding slides the preview over.

The dashboard entry tile and `MasterResumeChoiceDialog` are **unchanged**.

## Flow & State Machine

`step`: `intro → question → review → complete`.

- **intro** — one card asks name + target role. Submitting runs the adaptive turn with
  `section: "intro"`: deterministically extract the name (existing `extract_intro_name`
  as a fallback), let the AI capture the target role/summary direction and produce the
  first real `next_question`.
- **question** — the adaptive loop. Each answer → one AI turn → updated `resume_data` +
  next `current_question` + `inferred_skills` + `is_complete`. Repeats until the user
  chooses review, or the server forces review at the question cap.
- **review** — deterministic (no AI call). Shows the assembled preview, gentle
  **optional** notes (the relocated warnings), and `Create master resume` /
  `Keep adding`.
- **complete** — finalize succeeded; route to `/builder?id=…`.

### Round-tripped state (`ResumeWizardState`)

The frontend holds state in React + `localStorage` ("resume_wizard_draft") and posts it
back each turn (stateless backend, as today). New shape:

| Field | Type | Notes |
|-------|------|-------|
| `step` | `'intro'\|'question'\|'review'\|'complete'` | |
| `resume_data` | `ResumeData` | unchanged shared shape |
| `current_question` | `{ text: str, section: str }` | `section` ∈ intro, workExperience, internships, education, personalProjects, skills, summary, contact, review |
| `history` | `list[{ question, answer, section, resume_data_before }]` | `resume_data_before` snapshot enables deterministic **Back** |
| `asked_count` | `int` | drives the cap + progress |
| `inferred_skills` | `list[str]` | last turn's detected skills (for the green accent) |
| `is_complete` | `bool` | AI *suggests* done; never auto-finalizes |
| `progress` | `{ current: int, total: int }` | **server-computed**, not from the model |
| `warnings` | `list[str]` | populated only at `review` |

**Removed from the old state:** `options` (section picker), `completed_sections`,
`current_section`-as-picker, `pending_questions`.

### `/turn` actions

- `start` — returns `build_initial_wizard_state()` (intro question). (Frontend may also
  build this locally; endpoint kept for parity.)
- `answer` — core adaptive AI turn (covers intro + every section).
- `skip` — one AI turn flagged skip: the AI returns the next question **without**
  modifying `resume_data`.
- `back` — **deterministic**, no AI call: pop `history`, restore the previous
  `current_question` + `resume_data_before` + `inferred_skills`.
- `review` — **deterministic**, no AI call: `step='review'`, compute `warnings`.

## Backend

### `complete_json` turn contract

One call per `answer`/`skip`, `schema_type="resume"`, in the user's **content
language** (`get_language_name(get_content_language())`) so questions *and* content
localize. The model returns:

```json
{
  "resume_data": { …full ResumeData envelope… },
  "next_question": { "text": "…", "section": "workExperience" },
  "inferred_skills": ["SQL"],
  "is_complete": false
}
```

- `resume_data` is normalized through `normalize_resume_data` + `ResumeData.model_validate`
  (same as today). The **section-scoped merge** guard is kept and **extended** so a turn
  only writes the fields for `current_question.section`, never clobbering the rest:
  `intro`/`contact` → `personalInfo` (name/title/contact); `summary` → `summary`;
  `workExperience`/`internships` → `workExperience`; `education` → `education`;
  `personalProjects` → `personalProjects`; `skills` → `additional.*`. Unknown sections
  no-op on `resume_data` (defensive).
- Skills merge via the existing case-insensitive `merge_unique_skills`.

### Truthfulness (hard rule in the prompt)

Reuse the project policy: aggressively turn the user's own facts into strong bullets,
but **never fabricate** employers, titles, dates, degrees, metrics, tools, or skills.
If a fact is missing, the model must put the ask in `next_question` rather than invent.
(Consistent with the existing `CRITICAL_TRUTHFULNESS_RULES` and the maintainer policy.)

### Server-side guardrails (don't trust the model blindly)

- **Question cap** `RESUME_WIZARD_MAX_QUESTIONS = 15`: once `asked_count >= cap`, the
  server overrides `is_complete = true`; the next `answer`/`skip` routes to review.
- **Progress computed server-side**: `total = min(cap, max(8, asked_count + (0 if is_complete else 2)))`,
  `current = asked_count`. The bar reflects this, not a model number.
- **`is_complete` only suggests** review (surfaces "Review & finish"); the user can
  always "Keep adding". Finalize is always user-initiated.
- **Fallbacks:** missing/blank `next_question` → deterministic per-section prompt
  (`_section_prompt`, retained); invalid `resume_data` → keep prior draft, return the
  same question, surface a retry (turn raises → 422/500 per the existing handler).

### Finalize — unchanged

`POST /resume-wizard/finalize` keeps current behavior: validate name present
(`ResumeWizardFinalizeRequest`), normalize, `db.create_resume_atomic_master(...)`,
reject with 409 if a ready master already exists, set the title, return
`{resume_id, processing_status:"ready", is_master}`. `build_review_warnings` is kept and
used both at the `review` step and for the gentle notes.

### Files

- `apps/backend/app/schemas/resume_wizard.py` — new state/turn/finalize models.
- `apps/backend/app/prompts/resume_wizard.py` — single adaptive writer/planner prompt.
- `apps/backend/app/services/resume_wizard.py` — adaptive turn, guards, deterministic
  back/review/skip, progress, name extraction, skill merge, warnings.
- `apps/backend/app/routers/resume_wizard.py` — `/turn` (answer/skip/back/review/start)
  + `/finalize` (unchanged). Mount unchanged.

## Frontend

- `components/resume-wizard/resume-wizard-page.tsx` — rebuilt orchestrator: holds
  state, renders `QuestionCard` + `LivePreview`, handles answer/skip/back/review/
  finalize, localStorage persistence + the existing safe-draft normalizer (kept and
  adapted to the new shape).
- `components/resume-wizard/question-card.tsx` — progress bar + kicker + question +
  textarea + footer actions; "thinking" state while a turn is in flight.
- `components/resume-wizard/live-preview.tsx` — **replaces** `draft-preview.tsx`:
  renders `resume_data` as a real resume layout (no counts/warnings); empty state;
  green accent for newly inferred skills.
- **Delete** `components/resume-wizard/section-picker.tsx`.
- `lib/api/resume-wizard.ts` — update types to the new state; helpers
  `postResumeWizardTurn`, `finalizeResumeWizard`, `createInitialResumeWizardState`
  retained with new shapes.
- `app/(default)/resume-wizard/page.tsx` — unchanged (thin wrapper).
- `messages/*.json` (all 5) — refresh `resumeWizard.*`: `kicker`, `title`, intro
  question fallback, `actions {continue, skip, back, review, keepAdding, create,
  backToDashboard}`, `preview {label, empty, unnamed}`, `review {readyTitle, note*}`,
  `errors {turnFailed, finalizeFailed}`. Dynamic question/section text comes from the
  backend (localized via content language); static chrome via these keys. Must satisfy
  the build-breaking locale-parity rule.

## Error handling

- Turn failure → inline error on the card, **state preserved**, retry the same answer
  (matches current behavior). Backend logs detail, returns generic message.
- Finalize `409` (master already exists) → explain + offer "Back to Dashboard".
- Network/timeout → the `apiFetch` 240s default + friendly "timed out" message.

## i18n

The static chrome is translated via `resumeWizard.*` in all five locales. The AI's
question text and the written resume content are produced in the **content language**
(the turn prompt takes `output_language`) — a net improvement over today's English-only
dynamic text. (Section *kickers* derived from `current_question.section` map through a
small i18n label table so they localize too.)

## Testing (anti-theater; must fail when the target breaks)

- **Backend unit** (`tests/unit/test_resume_wizard_service.py`): intro name extraction;
  adaptive turn merges only the target section (mocked `complete_json`); skill merge
  dedupe; **question cap forces `is_complete`**; **progress computed server-side**;
  deterministic `back` restores the prior snapshot; `review` builds warnings without an
  AI call; missing `next_question` falls back to the section prompt.
- **Backend integration** (`tests/integration/test_resume_wizard_api.py`): `/turn`
  `answer` with mocked LLM returns next question + updated data; `/turn` `back`/`review`
  need no LLM; `/finalize` creates a ready master; `/finalize` 409 when a master exists.
- **Frontend** (`tests/resume-wizard-api.test.ts`, `tests/resume-wizard-page.test.tsx`,
  `tests/dashboard-master-choice.test.tsx`): initial state shape; posts turns;
  full page flow (answer → next question + preview updates → Skip → Back → Review →
  Create → routes to `/builder`, sets status cache, clears draft); live-preview renders
  `resume_data`; choice dialog unchanged. Plus `i18n-locale-parity.test.ts`.

## Non-goals / out of scope

- No changes to `/builder`, the upload-parse flow, the entry dialog, or PDF/templates.
- No multi-master support; the single-master invariant stands.
- The live preview is purpose-built for the wizard; reusing the real resume render
  templates (`components/resume/*`) at small scale is explicitly **deferred** — the full
  template experience happens in `/builder` after finalize.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| One prompt does write + plan + completeness | strict JSON `schema_type="resume"`, validation, deterministic fallbacks for `next_question`/`resume_data` |
| Adaptive loop never ends / loops | question cap (15) forces review; manual "Review & finish" always available |
| Per-question latency | single call; subtle "thinking" state; no second round-trip |
| Model clobbers unrelated sections | section-scoped merge guard retained |
| `localStorage` growth from `resume_data_before` snapshots | small JSON; ~15 entries max; well under quota |
| Locale drift breaks `next build` | parity test + mirror every `resumeWizard.*` key across 5 files |
