# Create Resume (conversational Q&A wizard)

> Onboarding on-ramp for users who don't have a resume to upload. A guided
> chat interviews the user, the LLM authors polished resume content from their
> plain answers, the resume builds live beside the chat, and the result is
> saved as the master resume — then opened in the Builder.

Route: **`/create`** · Spec: `docs/superpowers/specs/2026-06-03-create-resume-wizard-design.md`

---

## Why

Before this, the only way to get a resume into Resume Matcher was to **upload** a
PDF/DOCX. A brand-new user with no document was stuck. The wizard adds the
missing "create from scratch" path next to Upload on the dashboard's no-master
state (and is also reachable any time to make another resume).

## How it works (engine = guided sections + AI authoring)

A **fixed script** runs in the frontend; the AI's job is to turn answers into
content, not to decide the conversation:

```
greet + name  ->  what do you do (title)  ->  pick a section
   [ Work ] [ Education ] [ Projects ] [ Skills ]
per section: ask 1 question -> POST /resumes/draft-section -> drafted entry
   appears in chat AND the live preview -> + Another / pick another / I'm done
contact checkpoint (typed)  ->  AI summary (accept / rewrite)  ->  Save
   -> POST /resumes (master iff none) -> router.push('/builder?id=<new>')
```

- **Minimum to finish:** a name + at least one content section (`canFinish`).
- **Personal/contact fields are typed, never AI-authored** (they are facts).
- **Live preview** reuses the Builder/print renderer (`components/dashboard/resume-component.tsx`).
- **Resilience:** the running resume autosaves to `localStorage` (`resume_create_draft`);
  on return with a saved name, the wizard resumes at the section picker.

## Backend (stateless)

Both endpoints live in `app/routers/creation.py` (`APIRouter(prefix="/resumes")`,
mounted at `/api/v1`):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/resumes/draft-section` | Author one `ResumeData` fragment from the user's answers (LLM). `400` if the LLM isn't configured. |
| POST | `/resumes` | Create a resume from structured data; becomes master iff none exists (`create_resume_atomic_master`). |

- **Service:** `app/services/creation.py::draft_section(section, answers, *, name, role, resume_context)`
  — one `complete_json` call, the result **validated against the canonical
  `ResumeData` sub-schemas** (`Experience`/`Education`/`Project`/`AdditionalInfo`/summary)
  before return. User answers are sanitized with `improver._sanitize_user_input`.
- **Prompts:** `app/prompts/creation.py` — one per section, each carrying
  anti-fabrication rules (never invent employers, dates, metrics, tools, or
  technologies; shape and lightly polish only). Output language honors
  `get_content_language()`.
- **Schemas:** `app/schemas/creation.py` — `SectionKind`, `DraftSectionRequest`,
  `DraftSectionResponse`, `WizardResumeCreate`.

## Frontend

- Route: `app/(default)/create/page.tsx` → `components/create/creation-wizard.tsx`
  (orchestrator: phases, transcript, running `ResumeData`, responsive split layout).
- `components/create/wizard-script.ts` — pure core: `emptyWizardData`, `appendDraft`
  (assigns sequential ids), `assembleResume` (→ `ProcessedResume`), `canFinish`.
- Presentational: `chat-message`, `chat-input`, `section-picker`, `contact-fields`,
  `wizard-preview`.
- API client: `lib/api/create.ts` — `draftSection`, `createResumeFromWizard`.
- i18n: `create.*` across all 5 locales (`en/es/zh/ja/pt-BR`).

## Truthfulness

There is no job description here, so the only fabrication risk is the AI inventing
facts the user didn't give. Every authoring prompt forbids inventing employers,
institutions, titles, dates, numbers, tools, or technologies; thin answers yield
fewer/shorter bullets rather than padding. This matches the maintainer's standing
policy (aggressive polishing is fine, fabrication is not).

## Tests

- `tests/unit/test_creation_schemas.py`, `tests/unit/test_creation_prompts.py`
- `tests/service/test_creation.py` (LLM mocked: per-section authoring, validation, injection sanitization, thin-answer non-fabrication)
- `tests/integration/test_create_api.py` (draft-section fragment, LLM-not-configured guard, master-iff-none invariant)
- Frontend: `tests/wizard-script.test.ts` (state machine), `tests/api-create.test.ts` (client)
