# Frontend API Client

> API client layer for Resume Matcher frontend.

## Base Client (`lib/api/client.ts`)

```typescript
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const API_BASE = `${API_URL}/api/v1`;

export async function apiFetch(endpoint: string, options?: RequestInit);
export async function apiPost<T>(endpoint: string, body: T);
export async function apiPatch<T>(endpoint: string, body: T);
export async function apiPut<T>(endpoint: string, body: T);
export async function apiDelete(endpoint: string);
export function getUploadUrl(): string;
```

## Resume Operations (`lib/api/resume.ts`)

```typescript
// Job descriptions
uploadJobDescriptions(descriptions: string[], resumeId: string) → job_id

// Resume improvement
improveResume(resumeId: string, jobId: string) → ImprovedResult
previewImproveResume(resumeId, jobId, promptId?, options?: { maxBulletsPerEntry?, pageFit? }) → ImprovedResult
toPageFitSettings(settings: TemplateSettings, locale?: string) → PageFitSettings

// CRUD
fetchResume(resumeId: string) → ResumeResponse['data']
fetchResumeList(includeMaster?: boolean) → ResumeListItem[]
updateResume(resumeId: string, data: ResumeData) → ResumeResponse['data']
deleteResume(resumeId: string) → void

// Master tracks (up to MAX_MASTER_RESUMES = 5; exactly one is the default)
setDefaultMasterResume(resumeId: string) → { resume_id, is_default_master }
duplicateResume(resumeId: string) → DuplicateResumeResponse   // throws DuplicateResumeError (409 = not ready / master limit)

// PDF
downloadResumePdf(resumeId: string, settings?: TemplateSettings) → Blob
downloadCoverLetterPdf(resumeId: string, pageSize?: string) → Blob

// Content updates
updateCoverLetter(resumeId: string, content: string) → void
updateOutreachMessage(resumeId: string, content: string) → void

// On-demand generated content
generateInterviewPrep(resumeId: string) → InterviewPrepData
```

Resume upload accepts matching PDF, DOC or DOCX filename/MIME pairs. The backend
returns 400 for unsupported or mismatched types, 413 for raw/expanded/extracted
size limits, and 422 for malformed or textless/scanned documents. Upload and
retry processing return 409 when a newer processing attempt supersedes the
request, or 404 when the resume is deleted while processing.

## Master resumes (career tracks)

Up to 5 resumes can be masters (`MAX_MASTER_RESUMES`, the same constant in `app/database.py` and `lib/api/resume.ts`); the `title` is the track name. Exactly one master is the default (`is_default_master`) and is the source the tailor page preselects. `is_default_master` implies `is_master`. `ResumeListItem`, the fetch payload and the upload response carry `is_default_master`; the fetch payload also carries `is_master`.

- `POST /api/v1/resumes/upload` returns `409` with `"You can keep up to 5 master resumes. Delete one before adding another."` when 5 masters exist. The first master becomes the default. A new upload takes the default over only when the current default is `failed` or `processing`.
- `POST /api/v1/resumes/{id}/default` → `{ "resume_id", "is_default_master": true }`. `404` if the resume is missing, `400` if it is not a master.
- Deleting the default master promotes the earliest remaining master.
- `POST /api/v1/resumes/{id}/duplicate` → `201` `{ resume_id, title, is_master, is_default_master, parent_id }`. The copy is titled `"<title> (Copy)"` (capped at 80 characters). A master copy becomes a new **non-default** master (`409` with the limit message at 5). A tailored copy is a sibling with the same `parent_id` and carries the original's job link (a new `improvements` row with the same job), so `GET /{id}/job-description` and cover-letter/outreach/interview-prep generation work on the copy. `409` if the resume is not `ready`, `503` when the database is busy.
- `GET /api/v1/resumes/render-drafts/{token}` → `{ "data": { "processed_resume": ... } }`. Serves an unsaved draft to the print route (`/print/resumes/draft?draft=<token>`) so page fit can measure it. Tokens are in-memory, expire after 120 s (at most 32 kept) and `404` once gone. Only the print route calls it.

## Preview and confirmation

Preview returns `data.preview_id` and `data.preview_expires_at`; confirmation forwards `preview_id` with the unchanged proposed resume. Successful retries return the same stored response without creating another resume. An active confirmation returns 409 with `Retry-After: 1`; stale or expired input snapshots require a new preview. See [the complete contract and transaction lifecycle](../features/preview-confirmation.md).

`POST /api/v1/resumes/improve/preview` also accepts two optional fields for [bullet selection](../features/preview-confirmation.md#bullet-selection-harness-steered). Both are absent by default, which keeps the legacy behaviour (no condensing).

- `max_bullets_per_entry` (integer 1–10): keep only the top N bullets per work-experience and project entry. The tailor page sends `3`. Selection runs only when this is set.
- `page_fit` (`PageFitSettings`): the print settings used to measure page count (`template, pageSize, marginTop/Bottom/Left/Right, sectionSpacing, itemSpacing, lineHeight, fontSize, headerScale, headerFont, bodyFont, compactMode, showContactIcons, accentColor, lang`, same bounds as the PDF endpoint query). Page fit runs only when both fields are set.

The response `data.bullet_selection` is `null` unless `max_bullets_per_entry` was sent. Otherwise it is:

```json
{
  "max_per_entry": 3,
  "bullets_before": 14,
  "bullets_after": 8,
  "trimmed_for_fit": 1,
  "scoring": "llm",
  "page_fit": "trimmed",
  "final_pages": 1,
  "final_check": "ok"
}
```

`scoring` is `"llm"` or `"keyword_fallback"`; `page_fit` is `"fits" | "trimmed" | "over" | "unavailable" | "skipped"`; `final_pages` is `null` when nothing was rendered. `final_check` reports the re-render of the rewritten result after a `fits`/`trimmed` fit: `"ok"` means `final_pages` measures it, `"skipped"` means that render failed or ran out of budget (`final_pages` is then the pre-rewrite measurement and the diff modal says the fit was not re-checked), and `null` means no final check applies. `bullets_after` is the count after page-fit trimming (rewriting never adds bullets to selected entries, so it equals the count in `resume_preview`), and `trimmed_for_fit` is how many bullets that step dropped. A scoring fallback, a result still over one page and an unrenderable draft each add an entry to `data.warnings`; none of them fails the preview.

## Resume Wizard (`lib/api/resume-wizard.ts`)

```typescript
postResumeWizardTurn(payload: ResumeWizardTurnRequest) → ResumeWizardTurnResponse
finalizeResumeWizard(state: ResumeWizardState) → ResumeWizardFinalizeResponse   // throws ResumeWizardConflictError(detail) on a 409 (master limit); the wizard shows that message
createInitialResumeWizardState() → ResumeWizardState
```

Backend endpoints:

- `POST /api/v1/resume-wizard/turn` — one adaptive turn. `action` is `start | answer | skip | back | review`. `answer`/`skip` run one AI call that updates `resume_data`, returns the next `current_question`, `inferred_skills`, and a strict boolean `is_complete` flag; `back`/`review`/`start` are deterministic (no LLM). The service validates the complete model envelope before advancing history or progress. Invalid envelopes return a recoverable `422` and leave the client state unchanged. Work, education, and project entries carry stable positive IDs: a correction retains the current entry ID, while an addition uses ID `0` and receives the next available ID. Partial model echoes preserve entries they omit. Deterministic fallback questions and review copy use the configured content language. The full `ResumeWizardState` round-trips in the request and response.
- `POST /api/v1/resume-wizard/finalize` — creates a master resume from the draft (`processing_status: "ready"`); the response carries `is_master` and `is_default_master`. It no longer fails when a master already exists: the new master joins the others (and becomes the default only when none exists or the current default is stuck `failed`/`processing`). It returns `409` only at the 5-master limit, with the same message as upload. Replaying an identical, ready master returns that resume instead of creating a duplicate.

The wizard is an AI-led, one-question-at-a-time flow that builds a general master resume; it does not require a job description and does not replace the upload parser. Question and content text are produced in the configured **content language**; static UI chrome uses the `resumeWizard.*` i18n keys.

## Application Tracker (`lib/api/tracker.ts`)

Tracker patches distinguish omission from explicit null: omitted `status` keeps the current column, while `status: null` returns 422. Nullable text/date fields remain clearable. Each move from `saved` to a non-saved column stamps `applied_at` if it has no date; explicit dates (including an explicitly cleared date in the same patch) are preserved. Bulk moves use the same rule. Moving back to `saved` retains any existing date; applying again fills a missing date. Moves between non-saved columns leave cleared dates empty.

Create, move, and delete operations reserve the SQLite writer before allocating or renumbering column positions. This keeps positions contiguous across concurrent single/bulk operations and separate database connections; the resume/job pair uniqueness constraint remains independent.

```typescript
// Kanban board (7 status columns: saved | applied | no_response |
// response | interview | accepted | rejected)
listApplications() → ApplicationListResponse        // { columns: Record<status, Application[]> }
createApplication(payload: ManualApplicationCreate) → Application   // manual add from a pasted JD
getApplicationDetail(id: string) → ApplicationDetail               // embedded JD + applied resume (resume null if deleted)
updateApplication(id: string, payload: ApplicationUpdate) → Application   // status/position/notes/company/role/applied_at

// Bulk
bulkUpdateStatus(applicationIds: string[], status: ApplicationStatus) → ApplicationActionResponse
deleteApplication(id: string) → void
bulkDeleteApplications(applicationIds: string[]) → ApplicationActionResponse
```

## Config Operations (`lib/api/config.ts`)

```typescript
fetchLlmConfig() → LLMConfig
updateLlmConfig(config: LLMConfigUpdate) → LLMConfig
testLlmConnection() → LLMHealthCheck
fetchSystemStatus() → SystemStatus

// Per-provider API keys (encrypted server-side; switching the active
// provider no longer wipes another provider's key — responses always masked)
fetchApiKeyStatus() → ApiKeyStatusResponse           // { providers: [{ provider, configured, masked_key }] }
updateApiKeys(keys: ApiKeysUpdateRequest) → ApiKeysUpdateResponse
deleteApiKey(provider: ApiKeyProvider) → void
clearAllApiKeys() → void

// Feature flags
fetchFeatureConfig() → FeatureConfig
updateFeatureConfig(config: FeatureConfigUpdate) → FeatureConfig

// Language
fetchLanguageConfig() → LanguageConfig
updateLanguageConfig(language: string) → LanguageConfig
```

> `updateLlmApiKey` (`PUT /config/llm-api-key`) no longer persists a key — keys are managed per-provider via the encrypted `/config/api-keys` endpoints above.

## Provider Info

```typescript
export const PROVIDER_INFO = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5-nano-2025-08-07',
    requiresKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    requiresKey: true,
  },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'deepseek/deepseek-chat',
    requiresKey: true,
  },
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-3-flash-preview',
    requiresKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    defaultModel: 'gemma3:4b',
    requiresKey: false,
  },
};
```

## Usage

```typescript
import { fetchResume, API_BASE, PROVIDER_INFO } from '@/lib/api';
```

Legacy `.doc` files pass compound-file header validation, but the bundled MarkItDown DOCX converter does not guarantee binary Word conversion. Convert legacy Word documents to PDF or DOCX for reliable upload.

## Refinement and monitoring statistics

`refinement_stats.passes_attempted` counts attempted refinement stages. `passes_completed` counts stages that changed content; a failed or unchanged keyword injection no longer counts as completed. `keywords_eligible` counts missing source-supported candidates before injection, while `keywords_injected` counts those actually present in the final result. `alignment_violations_fixed` counts critical violations resolved by the local correction pass. Preview and legacy improve responses share the same statistics model and conversion.

Preview error logs identify the stage actually running, including cancellation and timeout. Client messages keep the existing generic error boundary. The opt-in monitor records monotonic elapsed milliseconds and explicit skipped/error/cancelled outcomes; see its [run and isolation contract](../../../apps/backend/e2e_monitor/README.md). These counters and heuristic scores do not claim commercial ATS accuracy.
