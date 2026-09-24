# Application Tracker Feature

> **A Kanban board for managing the job-application pipeline, auto-populated from the tailor flow.**

## Overview

The Application Tracker (`/tracker`) gives each tailored resume a place in a
five-column Kanban pipeline. Tailoring a resume to a job auto-creates an
`applied` card; users can also add cards manually from a pasted job
description. Cards are drag-and-drop reorderable within and across columns.

## User-Facing Columns (stable keys, decoupled from i18n labels)

`saved` · `applied` · `interview` · `accepted` · `rejected`

The backend retains `no_response` and `response` in its status enum for API and
stored-data compatibility, but the current frontend does not render or offer
them for moves.

Auto-created cards from the tailor flow land in **`applied`**. Manual cards
default to `applied` but can be created as `saved`.

## How It Works

1. **Auto-create:** `POST /resumes/improve/confirm` (and the legacy
   `POST /resumes/improve`) create an `applied` card after persisting the
   tailored resume — best-effort (a tracker failure never breaks tailoring).
   Company/role come from the cached keyword-extraction pass, so there is **no
   extra LLM call** on this path.
2. **Manual add:** `POST /applications` creates the job from the pasted JD then
   the card; when company/role aren't supplied it runs one best-effort
   extraction call (falls back to blank/editable).
3. **Drag/drop:** cards reorder within a column or move across columns; the
   board updates optimistically and reverts on a failed `PATCH`.
4. **Detail modal:** shows the JD, the applied resume, interview times, and
   manually recorded interview questions. Interview times can be added, edited,
   or removed only while the card is in `interview`; other statuses show saved
   values read-only. **Edit** opens `/builder?id=<resume_id>`. Tolerates a
   deleted resume (`resume: null`).
5. **Bulk actions:** multi-select cards to move or delete in one request.
6. **Interview questions:** the board header opens a global view of every
   recorded question, including questions on applications in hidden columns.

## Data Model

`Application` (SQLite, `apps/backend/app/models.py`): `application_id` (PK),
`job_id`, `resume_id` (the applied/tailored resume), `master_resume_id`
(optional base — powers the "shared resume" badge), `status` (backend 7-value
enum; frontend exposes 5),
`company`, `role`, `applied_at`, `notes`, `position` (per-column order,
server-renumbered on PATCH), and `interview_times` (ordered local
`YYYY-MM-DDTHH:MM` strings for multiple interview rounds), `created_at`,
`updated_at`. `create_application` dedupes on `(job_id, resume_id)` to survive
double-submit. Moving a card out of `interview` preserves its interview times.

`ApplicationInterviewQuestion` is a 1:N child of `Application`. It stores
`question_id`, `application_id`, `question`, and an internal `created_at` used
only for ordering. The foreign key uses `ON DELETE CASCADE`; company and role
are read live from the parent application rather than copied into the question.
There is intentionally no interview-date field.

## API (`prefix=/applications`, mounted under `/api/v1`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/applications` | All cards grouped by column (all 7 keys present) |
| POST | `/applications` | Manual add (creates job + card; best-effort extraction) |
| GET | `/applications/{id}` | Card + embedded JD + resume (resume null if deleted) |
| POST | `/applications/{id}/interview-questions` | Add one manual interview question |
| DELETE | `/applications/{id}/interview-questions/{question_id}` | Delete one manual interview question |
| GET | `/applications/interview-questions` | List all questions with live company/role context |
| PATCH | `/applications/{id}` | Update status/position/notes/company/role/applied_at/interview_times |
| PATCH | `/applications/bulk` | Move many cards to one column |
| DELETE | `/applications/{id}` | Delete one card |
| POST | `/applications/bulk-delete` | Delete many cards |

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/app/models.py` | `Application` + interview-question ORM models |
| `apps/backend/app/schemas/applications.py` | Pydantic application/question schemas + status enum |
| `apps/backend/app/routers/applications.py` | The tracker endpoints |
| `apps/backend/app/database.py` | Facade CRUD/bulk/reorder methods |
| `apps/backend/app/routers/resumes.py` | `_auto_create_tracker_application` hook (both confirm paths) |
| `apps/backend/app/services/improver.py` + `app/prompts/templates.py` | Company/role added to keyword extraction |
| `apps/frontend/app/(default)/tracker/page.tsx` | Route |
| `apps/frontend/components/tracker/*` | Board, column, card, detail modal, bulk bar, manual-add dialog |
| `apps/frontend/components/tracker/reorder.ts` | Pure drag-end resolution (`planMove`) |
| `apps/frontend/components/tracker/interview-questions-dialog.tsx` | Global recorded-question view |
| `apps/frontend/lib/api/tracker.ts` | Typed API client |

## Tests

- Backend: `tests/integration/test_applications_api.py` (CRUD, grouping, detail
  tolerance, bulk), `tests/integration/test_tracker_autocreate.py` (confirm
  auto-creates an `applied` card), `tests/unit/test_database.py::TestApplications`.
- Frontend: `tests/tracker-reorder.test.ts` (`planMove` within/cross-column +
  empty-column drop), `tests/api-tracker.test.ts` (client payloads/URLs),
  `tests/card-detail-interview-questions.test.tsx` (manual entry), and
  `tests/interview-questions-dialog.test.tsx` (global view).
