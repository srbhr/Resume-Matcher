# Frontend Workflow

> User flows and state management for Resume Matcher.

## Core User Flow

```
Dashboard → Upload Master Resume → Tailor for Job → View/Edit → Download PDF
```

## Pages

### 1. Dashboard (`/dashboard`)

- **No master:** "Initialize Master Resume" card
- **Has master(s):** the default master card (title, DEFAULT badge) + a tile per other master track (title, status, "Set as default", Duplicate) + tailored tiles
- **Up to 5 masters:** an "Add master track" tile opens the upload/wizard choice. It shows only when a default master exists, the LLM is configured (system status loaded with `llm_configured`), and there are fewer than 5 masters. Duplicate on a master tile is also hidden at the limit.
- An upload only adopts the new id as the local default when no master existed; otherwise the list reloads and the server decides the default. The exception is "Delete and re-upload" on the default: the completed re-upload is made the default with `setDefaultMasterResume` (closing that dialog without uploading ends the replacement).
- The upload dialog confirms "set as master" only for the default master: `is_default_master`, or `becomesDefault` from the dashboard during "Delete and re-upload". An extra track gets "uploaded as a new master track". A `409` (master limit) shows the server's `detail`; other failures keep the status message.
- **Create:** "+" card opens `/tailor`; enabled when any master is ready and the LLM is configured (a failed default does not block ready tracks)
- Auto-refreshes on window focus
- List and status results are applied only while their request and master identity are current. Late responses cannot replace newer cards or clear a different master.
- Pending/processing master status is polled serially with a 3–30 second backoff, for at most 12 polls. Hidden tabs skip polling. Polling stops on ready/failed, missing master, or unmount; focus refresh and Retry provide recovery after a failure.

### 2. Resume Viewer (`/resumes/[id]`)

- Read-only display at 250mm width
- Actions: Back, Edit, Download PDF, Duplicate, Delete
- Master status (`is_master`, `is_default_master`) comes from the server. Masters can be renamed (the title is the track name) and show a DEFAULT badge, or a "Set as default" button when not default
- Duplicate calls `POST /resumes/{id}/duplicate` and opens the copy; a 409 (not ready, master limit) shows the server's message
- Delete shows confirmation + success dialogs

### 3. Tailor (`/tailor`)

- Job description textarea (min 50 chars)
- Source picker (`tailor.selectResume`) appears when more than one master is ready; the default master is preselected, then the stored `master_resume_id`, then the first ready master. The source id is pinned when a preview starts and confirm uses the pinned id
- Process: Upload JD → Improve → Redirect to viewer
- Preview sends `max_bullets_per_entry: 3` and `page_fit` built from the stored template settings (`readStoredTemplateSettings()` + `toPageFitSettings()`); the diff modal shows a one-line selection summary. See [bullet selection](../features/preview-confirmation.md#bullet-selection-harness-steered)

### 4. Builder (`/builder`)

- **Left panel:** Editor (forms + formatting)
- **Right panel:** WYSIWYG preview
- **Tabs:** Resume | Cover Letter | Outreach
- An editor instance belongs to one URL resume ID. Changing the ID remounts
  editor state, including its save queue, dirty/version state and Reset baseline.
  Requests already sent may finish for their original ID; their abandoned editor
  cannot update state, remove drafts, or dispatch queued saves after unmount.
- With an ID, only a usable processed resume or raw JSON resume establishes an
  editable server baseline. A failed GET, malformed response, or pending/failed
  processing state blocks Save/autosave and retains the local draft. Context from
  another resume never substitutes for the unavailable server snapshot.
- Once that baseline loads, a differing scoped draft requires explicit restore
  confirmation before autosave can persist it. Without an ID, context, a new-resume
  local draft and defaults remain the fallbacks; server saves require an ID.

### 5. Settings (`/settings`)

- System status (cached)
- LLM configuration (6 providers)
- Last fetched indicator + manual refresh

## Pagination Rules

- Sections CAN span pages
- Individual items stay together
- Pages ≥50% full before break
- Headers never orphaned

## State Management

### localStorage

| Key | Purpose |
| --- | --- |
| `master_resume_id` | Default master resume UUID (a cache; the server decides the default) |
| `resume_builder_draft:<resumeId>` / `resume_builder_draft:new` | Resume-scoped recovery draft; a failed write is shown as unavailable and never described as saved |
| `resume_builder_settings` | Template prefs |
| `resume_wizard_draft` | Versioned wizard state; nested resume/history values are normalized before restoration |

### StatusCache Context

- Initial fetch on app start
- 30-min auto-refresh
- Optimistic counter updates

## Delete Flow

1. Click Delete → Confirmation dialog
2. API: `DELETE /resumes/{id}`
3. Clear localStorage if master
4. Success dialog → Redirect to dashboard

## Section Management

| Action    | Result                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| Rename    | Click pencil icon                                                                                   |
| Reorder   | Up/down arrows                                                                                      |
| Hide      | Eye icon (hidden sections still editable)                                                           |
| Delete    | Hides default, removes custom                                                                       |
| Add       | "Add Section" button                                                                                |
| Duplicate | Copy icon (custom sections only), see [custom sections](../features/custom-sections.md#duplicating) |

## API Client

```typescript
import { fetchResume, updateResume } from '@/lib/api/resume';

const response = await fetchResume(resumeId);
if (response.processed_resume) {
  await updateResume(resumeId, response.processed_resume);
}
```

## Async ownership and acknowledged saves

`use-operation-owner.ts` invalidates late enrichment/regeneration results after reset, a resume change, or unmount. Generation, apply, and refresh are separate stages. Once regeneration or enrichment apply is acknowledged, a failed viewer refresh shows a saved-but-refresh-failed notice; Retry refresh fetches the saved resume without applying the changes again. Closing that notice or changing the viewer identity invalidates the pending refresh without undoing the durable save. Enrichment previews retain failed-item identities alongside successful enhancements, including after an apply failure and retry.

The tailor page records a confirmed server response before navigation and optimistic counters. Retrying navigation reuses that acknowledgement. Confirmation failure retries the same stored job and preview; the Generate action intentionally uploads a new job before making a new preview. Closing/rejecting the preview or leaving the route prevents late results from updating the current UI.

See the [reliability map](reliability-map.md) for file ownership, deterministic checks and the actual browser script. The browser fixture covers Next navigation and per-tab draft separation with synthetic API responses; backend transaction tests cover persistence separately.
