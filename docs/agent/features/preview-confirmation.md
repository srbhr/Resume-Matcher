# Preview and confirmation

Tailoring preview and confirmation use durable SQLite operations. A preview binds one proposed resume to the exact source resume and job description that produced it. Confirmation consumes that operation once and stores its response so a lost HTTP response can be retried safely.

## API contract

`POST /api/v1/resumes/improve/preview` accepts `resume_id`, `job_id`, and the existing prompt options. Its `data` now includes `preview_id` and `preview_expires_at` alongside `resume_preview` and `improvements`. The operation is registered before returning 200; failed registration returns an error.

`POST /api/v1/resumes/improve/confirm` accepts:

```json
{
  "preview_id": "UUID returned by preview",
  "resume_id": "source resume UUID",
  "job_id": "job UUID",
  "improved_data": {},
  "improvements": []
}
```

The example abbreviates `improved_data`: send the complete, unchanged `resume_preview` returned by preview. The frontend forwards the operation ID. For older clients omitting it, the server first prefers the newest consumed operation matching the source, job, and canonical payload hash; only when none exists does it select the newest unexpired, unconsumed operation. This preserves retry identity rather than treating an ambiguous retry as acceptance of a new identical proposal. Metadata-only previews created before this upgrade must be recomputed. Clients should always send the ID to distinguish identical previews.

If a matched consumed operation refers to a deleted result, a tokenless confirmation returns 409 even when a new identical preview exists. To deliberately create a replacement, request a new preview and send its new `preview_id` on confirmation. The new explicit operation succeeds independently; the old consumed marker remains content-free and cannot recreate the deleted result.

| Outcome | HTTP behavior |
| --- | --- |
| First successful confirmation | 200 with a new tailored resume and request ID |
| Repeat confirmation of the same consumed operation | 200 with the exact stored response and IDs; no new generation or required rows |
| Another worker currently owns confirmation | 409 with `Retry-After: 1`; retry the same request after the current attempt settles |
| Source/JD changed, preview expired, wrong input IDs, or confirmed result deleted | 409; recompute preview |
| No matching registered preview or payload changed | 400; recompute preview |
| Source or job missing at initial lookup | 404; deletion or change during confirmation returns 409 |
| Auxiliary generation exceeds its timeout | 504; uncommitted claim released |
| Required database operation fails | Generic 500; transaction rolled back |

Unconsumed previews expire after 24 hours by default. `PREVIEW_TTL_SECONDS` permits 60–604800 seconds. Expiry and source/JD checks run before a claim; inputs are checked again at commit to reject edits made while generation was running. Fingerprints cover source content, processed resume data, original markdown, and job content. Attachment/title-only changes do not invalidate a preview.

A completed operation remains replayable after its original expiry or subsequent source/JD edits, provided the referenced records still exist. Later changes to request `improvements` do not change the stored response. A new preview is a new operation and can deliberately create another tailored resume.

## Bullet selection (harness-steered)

Masters are long bullet pools; a tailored resume is a condensed child. When a preview request sets `max_bullets_per_entry` (the tailor page sends `3`), the backend condenses the source before any rewriting. Only `workExperience` and `personalProjects` are selectable; other sections and the entries themselves are never dropped. Without the field the preview behaves exactly as before.

1. **The LLM only scores.** One call (`BULLET_RELEVANCE_PROMPT`, see [LLM integration](../llm-integration.md)) returns a 0–100 relevance score per bullet path. It never rewrites, merges or chooses bullets.
2. **Code selects.** `select_bullets` keeps the top N bullets per entry by `(score desc, index asc)` and preserves their original order. `descriptionStyles` stays index-aligned; entries at or under N are untouched.
3. **Code fits the page** (only when `page_fit` is also sent). The condensed draft is rendered through the real print pipeline (Playwright against `/print/resumes/draft?draft=<token>`, page count from pdfminer). If it spills past one page, the lowest-ranked bullets are dropped, least relevant entry first, found by binary search for the smallest number of drops that fits. At least 1 bullet per entry is always kept, and the fit search uses at most 6 renders (`MAX_FIT_RENDERS`); the post-rewrite final check (below) can add one more, so a preview renders at most 7 times. Fitting may render for at most `min(60 s, 25% of the remaining operation budget)` in total; once that is spent, it keeps the smallest known-fitting trim (or reports `unavailable`) so the later LLM stages keep their budget. Every render, the final check included, must also finish 10 s before the operation budget runs out (`FINAL_CHECK_RESERVE_SECONDS`); the final check does not count against the fitting time cap. The status is `fits`, `trimmed`, `over` (still too long at 1 bullet per entry), `unavailable` (render failed) or `skipped`.

The condensed source replaces the full master for every later step (targeted diffs, refinement, `finalize_ai_resume`, grounding warnings, the diff shown to the user). Rewriting cannot add bullets to the selected entries: the diff prompt tells the LLM not to append to `workExperience`/`personalProjects` (`generate_resume_diffs(..., fixed_row_sections=...)`), `append` diffs there are still rejected (logged server-side; they do not count toward the "N change(s) rejected" warning, which other rejections still raise), and every `finalize_ai_resume` pass on this path (the two inside `refine_resume` and the router's final one, all given the same `fixed_row_sections`) keeps no appended rows there and collapses a multi-line rewrite of a selected bullet into one row. A multi-line rewrite of a selected bullet therefore stays one row, possibly reworded, whether the diff LLM or the keyword-injection writer produced it. Known limitation: if the keyword-injection writer inserts a separate list item into a selected entry, the entry stays at the cap but the last selected bullet can be displaced (only a grounding-review warning flags it); the diff LLM cannot do this because `replace` is string-only and appends are refused. The condensed source is stored in the nullable `tailoring_previews.source_data` JSON column; `NULL` means the full source was used. Confirmation validates the payload against `source_data` when present, so a condensed preview confirms exactly as previewed, and the diff does not list dropped bullets as removed. The refiner still grounds against the **full** source master (`_grounding_master_data`: the source itself when it is a master; otherwise its `parent_id` when that is an existing master, else the default master, else the source itself), because dropped bullets remain true facts.

Recoverable failures degrade rather than fail the preview. An operation deadline (`AIOperationDeadlineExceeded`) that expires during scoring or during a render, or a `PromptSizeError` from scoring, still ends the request (`504` and `422` respectively):

- If the scoring call fails recoverably (provider error, or invalid output after the content retries), each bullet scores `min(100, 20 × distinct JD terms found)` from the job's required/preferred skills, keywords and key responsibilities, matched as whole terms (CJK terms as substrings) by the refiner's `_keyword_in_text`. The response has `scoring: "keyword_fallback"` and a warning. `AIOperationDeadlineExceeded` and `PromptSizeError` are re-raised instead of falling back.
- If rendering fails (no Chromium, frontend down, renderer busy), page fit is skipped with `page_fit: "unavailable"` and a warning; the top-N result still stands. When the print route cannot load a draft (missing or expired token), it renders a `[data-print-error]` marker instead of `.resume-print`, and the measurement fails at once rather than waiting out the renderer timeout.
- After rewriting, one extra render of the tailored result only adds a warning if it still exceeds one page. It never trims. `bullet_selection.final_check` is `"ok"` when it ran and `"skipped"` when it could not render in budget, so the fit is not reported as verified.

`data.bullet_selection` reports what happened (see [front-end APIs](../apis/front-end-apis.md#preview-and-confirmation)). The tailor page shows a source picker when more than one master is ready, pins the chosen source when the preview starts, and shows a one-line selection summary in the diff modal.

## Transactions and retries

`TailoringPreview` holds input/output hashes, timestamps, claim ownership, the resulting resume ID, and the response snapshot. It is a new table created by the existing schema initialization; existing resume/job tables need no destructive migration. Databases created before bullet selection gain the nullable `source_data` column from the idempotent `ALTER TABLE` in `init_models_sync`.

Registration and confirmation reserve the SQLite writer with `BEGIN IMMEDIATE`. Registration merges legacy job hash metadata against the current row. General job metadata updates reserve the writer before their read/merge/write, preventing disjoint concurrent changes from overwriting one another.

Confirmation obtains a random, leased ownership token. The generation timeout is `REQUEST_TIMEOUT_SECONDS`; the lease adds 15 seconds for finalization. No writer transaction stays open during AI calls. Another process can recover an expired claim, but an old owner cannot release or commit a newer claim. The final transaction inserts the tailored resume, required improvement relation, and replay response together. An insert failure leaves none of them committed.

Successful replays and concurrent attempts do not duplicate auxiliary generation. A failed, cancelled, or crashed attempt that did not commit may generate again on retry. This is not an exactly-once guarantee for an external provider that continues work after cancellation. Tracker-card creation remains best effort after the required transaction and is pair-idempotent; replay reconciles a missing card using the saved resume title.

Confirmation clears the condensed `source_data` in the same transaction (a confirmed preview replays from `response_data` only). Deleting a confirmed result clears its cached response content and any remaining `source_data`, and retains a content-free consumed marker so retry cannot recreate it. Deleting the source or job removes associated preview operations. Full data reset removes all operations and response content. New registrations prune expired, unconsumed operations with no active claim. Consumed snapshots remain until one of these deletion paths runs because they provide durable replay.

## File map and verification

| File | Responsibility |
| --- | --- |
| `apps/backend/app/preview.py` | Fingerprints, claim value, curated domain errors |
| `apps/backend/app/models.py` | SQLite preview-operation table |
| `apps/backend/app/database.py` | Registration, ownership, atomic completion, replay/deletion lifecycle |
| `apps/backend/app/routers/resumes.py` | Preview registration; confirmation orchestration and HTTP mapping |
| `apps/backend/app/schemas/models.py` | Request/response operation IDs and expiry; `max_bullets_per_entry`, `PageFitSettings`, `BulletSelectionSummary` |
| `apps/backend/app/services/bullet_selector.py` | Pure top-N selection, trim order and page-fit search |
| `apps/backend/app/services/bullet_scoring.py` | LLM bullet scoring, validator and keyword fallback |
| `apps/backend/app/services/page_fit.py` | Draft render store and page counting |
| `apps/backend/app/services/tailor_selection.py` | Orchestrates score → select → fit for the preview flow |
| `apps/frontend/app/(default)/tailor/page.tsx` | Forward the selected preview ID on confirm |
| `apps/frontend/lib/api/resume.ts` | Confirmation request type |
| `apps/frontend/components/common/resume_previewer_context.tsx` | Preview response type |
| `apps/backend/tests/integration/test_confirmation_transactions.py` | Real ASGI/SQLite concurrency, faults, expiry, cancellation, reset and replay |
| `apps/backend/tests/integration/test_tracker_autocreate.py` | Two actual confirmation requests retain one result/card |
| `apps/backend/tests/integration/test_bullet_selection_flow.py` | Preview with `max_bullets_per_entry=3` keeps at most 3 bullets per role and confirm accepts exactly that payload |
| `apps/backend/tests/unit/test_bullet_selector.py`, `test_page_fit.py`, `test_tailor_selection.py` | Selection, trim order and fit search (fake measure), draft store, orchestration |
| `apps/backend/tests/service/test_bullet_scoring.py` | Scoring validator and keyword fallback with a mocked `complete_json` |

Tests use synthetic resumes and replace only AI boundaries. They include separate database instances, barrier-controlled concurrent operations, ORM insert faults, and stored-response equality. No live provider calls are needed.

Consumed preview responses deliberately remain durable while their source/job/result exists so delayed retries cannot create duplicates. This stores an additional response snapshot; deleting a source, job, result or resetting the database clears its replay payload. Expiring consumed operations requires an explicit API retention policy and is not inferred from the unconsumed preview TTL.
