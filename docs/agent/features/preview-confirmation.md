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

## Transactions and retries

`TailoringPreview` holds input/output hashes, timestamps, claim ownership, the resulting resume ID, and the response snapshot. It is a new table created by the existing schema initialization; existing resume/job tables need no destructive migration.

Registration and confirmation reserve the SQLite writer with `BEGIN IMMEDIATE`. Registration merges legacy job hash metadata against the current row. General job metadata updates reserve the writer before their read/merge/write, preventing disjoint concurrent changes from overwriting one another.

Confirmation obtains a random, leased ownership token. The generation timeout is `REQUEST_TIMEOUT_SECONDS`; the lease adds 15 seconds for finalization. No writer transaction stays open during AI calls. Another process can recover an expired claim, but an old owner cannot release or commit a newer claim. The final transaction inserts the tailored resume, required improvement relation, and replay response together. An insert failure leaves none of them committed.

Successful replays and concurrent attempts do not duplicate auxiliary generation. A failed, cancelled, or crashed attempt that did not commit may generate again on retry. This is not an exactly-once guarantee for an external provider that continues work after cancellation. Tracker-card creation remains best effort after the required transaction and is pair-idempotent; replay reconciles a missing card using the saved resume title.

Deleting a confirmed result clears its cached response content and retains a content-free consumed marker so retry cannot recreate it. Deleting the source or job removes associated preview operations. Full data reset removes all operations and response content. New registrations prune expired, unconsumed operations with no active claim. Consumed snapshots remain until one of these deletion paths runs because they provide durable replay.

## File map and verification

| File | Responsibility |
| --- | --- |
| `apps/backend/app/preview.py` | Fingerprints, claim value, curated domain errors |
| `apps/backend/app/models.py` | SQLite preview-operation table |
| `apps/backend/app/database.py` | Registration, ownership, atomic completion, replay/deletion lifecycle |
| `apps/backend/app/routers/resumes.py` | Preview registration; confirmation orchestration and HTTP mapping |
| `apps/backend/app/schemas/models.py` | Request/response operation IDs and expiry |
| `apps/frontend/app/(default)/tailor/page.tsx` | Forward the selected preview ID on confirm |
| `apps/frontend/lib/api/resume.ts` | Confirmation request type |
| `apps/frontend/components/common/resume_previewer_context.tsx` | Preview response type |
| `apps/backend/tests/integration/test_confirmation_transactions.py` | Real ASGI/SQLite concurrency, faults, expiry, cancellation, reset and replay |
| `apps/backend/tests/integration/test_tracker_autocreate.py` | Two actual confirmation requests retain one result/card |

Tests use synthetic resumes and replace only AI boundaries. They include separate database instances, barrier-controlled concurrent operations, ORM insert faults, and stored-response equality. No live provider calls are needed.

Consumed preview responses deliberately remain durable while their source/job/result exists so delayed retries cannot create duplicates. This stores an additional response snapshot; deleting a source, job, result or resetting the database clears its replay payload. Expiring consumed operations requires an explicit API retention policy and is not inferred from the unconsumed preview TTL.
