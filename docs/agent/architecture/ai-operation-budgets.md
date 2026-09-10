# AI operation budgets

`AIOperationRoute` wraps POST requests in the resume, enrichment and wizard routers. The deadline starts before FastAPI validation and includes database preloads, model calls, retries and persistence. GET/PDF routes use their own export lifecycle. POST actions in these routers that do not call AI also receive the same total deadline.

`REQUEST_TIMEOUT_SECONDS` remains 240 seconds by default, configurable from 30 to 1,800 seconds. Keep the frontend `NEXT_PUBLIC_REQUEST_TIMEOUT_MS` and proxy timeout aligned when increasing it for local models. This is an operation budget, not an extra allowance for each stage.

`app/ai_budget.py` stores an absolute monotonic deadline in a ContextVar. Nested budgets retain the earliest deadline. Completion and JSON calls cap their existing model/token-dependent transport timeout to the remaining budget. Content retries recalculate remaining time. Enrichment analysis no longer imposes a separate fixed 180-second ceiling. The outer task cancels provider retries and queued item work when the operation expires; HTTP clients receive a generic 504 and server logs identify the route and elapsed time. Explicit caller cancellation propagates unchanged.

Cancellation is cooperative. Synchronous validation or a noninterruptible converter thread cannot be forcibly stopped by an asyncio timer. Owned resource cleanup may finish after the work deadline; upload and PDF cleanup policies retain their capacity reservations until those resources have actually stopped. A cancelled upload/retry settles any in-flight processing claim and marks only its owned attempt failed. It cannot recreate a deleted row or retire a newer retry.

Upload/retry waits at most five additional seconds for processing-claim retirement, including repeated caller cancellation. A stalled database action stays in a tracked background task, holding its transaction until it settles; a late claim's task also retires the returned token. The request can return while cleanup continues, and cleanup still cannot overwrite a newer attempt.

SQLite contention during completion returns retryable HTTP 503 and starts the same owned retirement. Its background task retries only database-busy failures, releasing each failed transaction before an exponential backoff; the caller's five-second cleanup limit remains unchanged. Retirement makes at most three write attempts and ends earlier when the attempt is marked failed, deleted, or superseded. If contention persists through that budget, the row can remain `processing`; the terminal failure is logged and the same row remains available to the explicit retry endpoint after the lock clears. A claim that fails before acquiring a token does not retire another worker's existing ownership.

Application shutdown gives tracked retirement tasks one second to finish, then cancels and reaps them before closing the database. Reaping is intentionally not wrapped in another timeout: an in-flight SQLite operation retains its connection until cancellation has fully unwound. Shutdown therefore never disposes the database underneath an owned cleanup task, while permanent external contention still relies on a later explicit retry after restart.

If the first claim of a newly inserted upload is busy, retirement targets only that new row while its status is still `processing` and its token is `NULL`. A competing claim or completed save makes the cleanup stale; it cannot reset the new owner. A missing token permits failed retirement only, never publishing a ready result.

After an upload row is created, HTTP 422 prompt-limit, HTTP 504 operation-deadline, and HTTP 503 database-busy responses include its `resume_id` and `is_master` alongside the existing generic `detail`. HTTP 503 retains `Retry-After: 1`. This request-scoped receipt lets the client retrieve or retry that exact row instead of creating another upload. Error responses omit `processing_status`: bounded retirement can still be running, or a newer owner may already have saved it. Failures before row creation and errors from other requests have no upload receipt. Explicit client cancellation still propagates without an HTTP error response.

## Input policy

Oversized input is rejected rather than silently truncated. Schema and stored-source failures return 422 before the relevant AI stage.

| Input | Limit |
| --- | --- |
| Regeneration items | 20 per request |
| Active regeneration workers | 4 per request |
| Enhancement answers | 40 per request |
| Answer / regeneration content leaf | 6,000 characters |
| Original enhancement question | 2,000 characters |
| Regeneration content entries | 100 per item |
| Regeneration instruction | 2,000 characters |
| Enhancement / regeneration request JSON | 200,000 serialized characters |
| Resume source / confirmation improved resume | 200,000 serialized characters |
| Confirmation suggestions and identifier envelope | 200,000 serialized characters, independently of the resume |
| Job description | 100,000 characters |
| Final LLM prompt plus system text | 512,000 characters |
| Wizard history | 15 entries; each resume snapshot bounded to 200,000 serialized characters |
| Wizard question / history answer | 2,000 / 6,000 characters |
| Inferred wizard skills | 100 entries, 200 characters each |

JSON bounds count the Unicode characters in `json.dumps(..., ensure_ascii=False)`, including structure. They are distinct from the document ingestion byte limits. The final prompt check is a defense at the LLM boundary; source-specific route/schema checks provide the useful 422 response earlier.

Enhancement generation also retains successful items when another item's final prompt is oversized; an entirely failed attempt retains HTTP 422 if it includes a prompt-limit failure. Request-wide validation and legacy analysis failures still abort the request. The shared total deadline always aborts, rather than returning a partial preview.

Regeneration keeps ordinary item failures alongside successful items. Expiry or caller cancellation cancels active and queued work instead of returning a partial success from an abandoned operation. This concurrency limit is per request, not a global provider rate limiter.

## Verification

`tests/integration/test_ai_operation_budgets.py` exercises the real ASGI routes with slow synthetic preloads/model stages, upload cancellation before persistence, external cancellation, oversized saved sources, request bounds, nested budget restoration, declining transport timeout values, and bounded regeneration with item failures and cancellation. No provider credentials or live paid calls are needed.
