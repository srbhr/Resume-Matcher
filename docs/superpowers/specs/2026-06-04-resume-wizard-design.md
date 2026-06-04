# Resume Wizard Design

## Goal

Add a general-master-resume creation pipeline for users who do not already have a PDF or DOCX resume. The existing upload path remains the fast path, while the new wizard helps users create a truthful structured master resume from scratch through a hybrid one-question-at-a-time Q&A.

## Current Context

The dashboard currently treats the missing master resume state as the entry point for setup. Uploading a PDF or DOCX calls `POST /api/v1/resumes/upload`, creates a normal resume record, marks the resume as master when no healthy master exists, stores `master_resume_id` in local storage, and routes users into the rest of the app.

The new wizard should produce the same downstream shape as an uploaded and parsed master resume: a persisted resume with `is_master=True`, `processing_status="ready"`, `content_type="json"`, and `processed_data` compatible with `ResumeData`.

## Product Flow

When no master resume exists, the dashboard setup tile opens a choice surface with two options:

- Upload an existing resume.
- Create one from scratch with the AI Wizard.

The wizard lives at `/resume-wizard`. It builds a general master resume first, without requiring a pasted target job description. Job-specific tailoring remains a separate flow through the existing tailor pipeline.

The wizard starts with a short AI-guided intro:

1. Ask who the user is and what general role area they are aiming for.
2. Extract the user's name even when the answer is conversational, such as "Hi, I'm James."
3. Personalize the next prompt, for example: "So James, where would you like to begin?"
4. Present section choices: Work Experience, Internships, Education, Projects, Skills, and Review.

After the intro, the user chooses which section to work on. Inside each section, the AI-led conversation asks focused follow-up questions, but the app still owns the section state, resume schema, and validation rules.

## Section Behavior

Work Experience and Internships share the same `workExperience` resume schema. Internship entries can use titles, companies, dates, and bullets just like jobs.

Education maps to `education`.

Projects map to `personalProjects`.

Skills map to `additional.technicalSkills`, with optional user-confirmed languages, certifications, and awards stored in the existing `additional` fields.

The baseline output is:

- Three bullets per work experience or internship entry.
- Two bullets per side project.
- Skills inferred continuously from the user's answers and visible in the skills section before finalization.

The wizard should allow users to skip sections and return to them before finalization. The review step should identify missing but useful information, such as no contact method, no education, no dates, no project impact, or thin bullet details.

## AI Harness

The backend exposes a new `resume-wizard` API namespace. The harness accepts current wizard state plus the latest user action or answer. It returns a structured response, never only free-form prose.

Each turn returns:

- Updated `resume_data`.
- Updated wizard progress and current section.
- Inferred skills and skill suggestions.
- The next assistant message.
- Optional selectable options.
- Optional clarifying questions.
- Validation warnings.
- A completion status for the current section and for the whole resume.

The app controls the schema and allowed section actions. AI can write bullets, extract facts, infer skills, reformat phrasing, and ask clarifying questions, but every returned resume draft is validated through `ResumeData` before the client receives it.

If the model returns invalid JSON, the backend retries using the existing `complete_json` behavior and prompt-only JSON repair instructions. If the response is still invalid, the backend logs detailed errors server-side and returns a generic client error.

## Prompting

Add resume-wizard prompt templates that make the model behave as a structured resume-writing assistant.

The prompts should enforce these rules:

- Build a general master resume, not a job-specific tailored resume.
- Do not invent companies, dates, metrics, tools, degrees, awards, or skills.
- Ask clarifying questions when answers are vague or missing important facts.
- Prefer concise action-oriented bullets grounded in user-provided facts.
- Use the configured content language.
- Output only the requested JSON object.
- Preserve existing draft data unless the user explicitly changes it.

The first prompts should guide the intro and section handoff:

- "Hi, I'll help you create your master resume. What is your name, and what kind of role are you aiming for?"
- "So {name}, where would you like to begin?"
- "Would you like to start with work experience, internships, education, projects, or skills?"

Section prompts should ask for practical facts before drafting. For example, work experience should ask for title, company, dates, responsibilities, tools, scale, and impact. Projects should ask what was built, why it mattered, technologies used, user or usage context, and links when available.

## Backend API

Create `apps/backend/app/routers/resume_wizard.py` and mount it under `/api/v1`.

Planned endpoints:

- `POST /api/v1/resume-wizard/turn`: accepts a wizard state and the latest user answer or section selection, returns the next structured wizard state.
- `POST /api/v1/resume-wizard/finalize`: validates the final draft and creates the master resume.

The finalize endpoint should create a regular resume record through the existing database facade. The created resume should behave like an uploaded parsed master resume:

- `content` is canonical JSON.
- `content_type` is `"json"`.
- `filename` is a generated name such as `"AI Resume Wizard - James.json"`.
- `processed_data` is the validated `ResumeData`.
- `processing_status` is `"ready"`.
- `is_master` is true when there is no current healthy master resume.

If a master resume already exists, the finalize endpoint should reject creation with a clear non-destructive error. An explicit replacement flow is outside this implementation scope.

## Frontend UI

Create a new `/resume-wizard` route under the default app group. The page is a client component.

The layout follows the existing Swiss International Style:

- Canvas background `#F0F0E8`.
- Square corners.
- Black borders.
- Hard offset shadows.
- Serif headers, sans body, monospace metadata.
- No decorative gradients, rounded cards, or marketing hero layout.

The screen should feel like a focused tool, not a landing page. The first viewport should be the wizard itself:

- Left or top progress rail showing Intro, selected sections, and Review.
- Main Q&A panel with assistant prompt, answer textarea, and selectable section buttons.
- Live structured preview or compact summary panel showing collected facts, bullets, and inferred skills.
- Footer actions for Back, Skip, Continue, and Finalize.

The dashboard missing-master tile should open a Swiss-style dialog with two clear choices: upload or AI wizard. Upload keeps using `ResumeUploadDialog`; wizard routes to `/resume-wizard`.

## Frontend Data Contract

Add frontend API helpers in `apps/frontend/lib/api/resume-wizard.ts`.

The wizard page should keep local draft state while calling the backend each turn. It should persist draft state to local storage for refresh recovery. On finalize, it stores the returned `resume_id` in `master_resume_id`, updates the status cache, and routes to `/builder?id=<resume_id>` for review and final manual edits.

The final builder review is intentional. The AI wizard creates a strong first draft, but the user should still be able to inspect and edit before using the resume for tailoring.

## Error Handling

Backend errors should log detailed context and return generic messages. Client errors should appear as Swiss-style alerts with recovery actions:

- Retry AI turn.
- Continue editing the current answer.
- Return to dashboard.
- Open upload path instead.

No model exception details, provider secrets, or raw stack traces should reach the browser.

## Testing

Backend tests should cover:

- Wizard schema validation and coercion through `ResumeData`.
- Intro answers extracting a name and producing section choices.
- Section updates creating baseline bullet counts.
- Skill inference only using user-provided facts.
- Finalize creating a ready master resume when no master exists.
- Finalize rejecting when a master resume already exists.

Frontend tests should cover:

- Dashboard no-master choice between upload and wizard.
- `/resume-wizard` initial render.
- Section picker transition.
- API helper request and response shapes.
- Finalize storing `master_resume_id` and routing to the builder.
- Locale parity for all new translation keys.

Before completion, frontend changes must run `npm run lint` and `npm run format` from `apps/frontend`. Backend changes should run targeted pytest tests for the new router and service.

## Out of Scope

This design does not add job-description-specific tailoring to the wizard. It does not replace the existing upload parser, tailor flow, enrichment flow, or builder. It does not modify CI, Docker, or GitHub workflow files.
