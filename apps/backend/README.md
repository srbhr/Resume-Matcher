# Backend Developer Notes

This document captures recent test and infrastructure conventions.

## Test Database Strategy

By default tests force a SQLite fallback (file `test_app.db`) even if environment variables point to Postgres. This is accomplished by setting `FORCE_SQLITE_FOR_TESTS=true` (see `tests/conftest.py`) before `app.core.database` creates engines. This keeps local test runs fast and avoids asyncpg event loop teardown issues.

To exercise Postgres & Alembic migrations locally:

```bash
# Powershell / Bash
$env:FORCE_SQLITE_FOR_TESTS="false"  # or unset
$env:ASYNC_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/resume_matcher"
$env:SYNC_DATABASE_URL="postgresql://user:pass@localhost:5432/resume_matcher"
poetry run alembic upgrade head
pytest -k postgres_only
```

(Adjust credentials as needed.)

## OpenAPI Snapshot

A helper script regenerates the OpenAPI snapshot used in tests:

```bash
python scripts/update_openapi_snapshot.py
```

This writes `tests/openapi.snapshot.json` with stable, sorted keys & UTF-8 encoding (no BOM). Snapshot tests tolerate a BOM if introduced by other tooling.

## Schema Drift Detection

Run the lightweight drift detector to ensure models and migrations are in sync:

```bash
python -m scripts.detect_schema_drift
```

It exits with code 1 if Alembic autogeneration would produce changes (i.e. drift present). Integrate in CI before creating a new migration.

## Performance Index Migration

Migration `0003_add_performance_indexes` adds several helpful indexes:

- `resumes.content_hash` for duplicate detection
- `processed_resumes.resume_id` & `processed_jobs.job_id` for joins
- Composite `(created_at, ttl_seconds)` on `llm_cache` to accelerate batch expiry queries

Apply via `alembic upgrade head`.

## Log Redaction

PII redaction utilities (`app/core/redaction.py`) and an attached logger filter mask emails and phone numbers in log messages automatically. When logging structured data, prefer masking before interpolation for defense-in-depth:

```python
from app.core.redaction import redact
logger.info("User signup %s", redact(user.email))
```

## Makefile Shortcuts

Top-level `Makefile` now includes convenience targets:

- `backend-test` (SQLite fast path)
- `backend-test-pg` (requires Postgres env vars; skips snapshot)
- `backend-migrate` (Alembic upgrade head)
- `backend-drift` (schema drift check)
- `openapi-snapshot` (regenerate spec snapshot)

Example:

```bash
make backend-drift && make backend-test
```

## Linting & Type Checking

Ruff and mypy configs (`ruff.toml`, `mypy.ini`) are included. Run locally:

```bash
python -m ruff check app
python -m mypy app
```

CI executes Ruff (fail-fast) and mypy (non-blocking for now) plus schema drift check before tests.

## Global Warning Suppression

We suppress the recurring `pydub` ffmpeg availability warning in `app/base.py` since audio conversion is not a core backend path. Remove the filter if future features rely on audio/video processing.

## Planned Postgres CI Job

A dedicated GitHub Actions workflow (to be added) will spin up Postgres, run Alembic migrations (`alembic upgrade head`), then execute the test subset that should run against Postgres (LLM cache, migrations, matching). This complements the default fast SQLite run.

## Background Tasks in Tests

`DISABLE_BACKGROUND_TASKS=true` disables scheduling of background extraction to avoid stray event-loop tasks & simplifies deterministic assertions.

## Duplicate Resume Detection
## Neon Migration Quickstart (Neon-only)

1) Set Neon URLs in `.env` (see `.env.sample`) with `?sslmode=require`. Only Postgres/Neon is supported.
2) Smoke test connection:
	- PowerShell: set `$env:ASYNC_DATABASE_URL` and run `python scripts/smoke_test_neon_async.py`.
3) Run migrations:
	- `alembic upgrade head` (requires `DATABASE_URL` set to the same value as `SYNC_DATABASE_URL` and using `postgresql+psycopg://`).
4) Optionally migrate SQLite data:
	- Set `$env:SOURCE_SQLITE=app.db` and `$env:TARGET_PG=postgresql://…` then `python scripts/sqlite_to_postgres_migrate.py`.

Keep pool sizes small on Neon (see env vars DB_POOL_SIZE, DB_MAX_OVERFLOW, DB_POOL_TIMEOUT).


`content_hash` auto-populates via SQLAlchemy `before_insert` listener (SHA-256 of raw content) enabling fast duplicate detection & reuse metrics.

## Deploying to Railway (Recommended, Neon-only)

Railway runs your FastAPI app as a long-running web service. This fits file parsing, SSE streaming, and background cleanup.

### 1) Prepare environment

- Ensure `.env` (or Railway variables) includes:
	- `SESSION_SECRET_KEY` (strong random)
	- `SYNC_DATABASE_URL` must use `postgresql+psycopg://...` and `ASYNC_DATABASE_URL` must use `postgresql+asyncpg://...`, both pointing to Neon with `?sslmode=require`.
	- `DATABASE_URL` must equal `SYNC_DATABASE_URL` for Alembic.
	- `LLM_PROVIDER=openai`, `LLM_API_KEY`, `LL_MODEL` (e.g. `gpt-4o-mini`)
	- `ALLOWED_ORIGINS` with your Vercel domain, e.g. `["https://<your-app>.vercel.app"]`
	- `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT` (e.g. 5/2/30)

### 2) Procfile

We include a `Procfile` that Railway will detect:

```
web: uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Alternatively, use a repo-root `railway.toml` (preferred) to run migrations before start:

```
[build]
builder = "nixpacks"
buildCommand = "cd apps/backend && pip install -r requirements.txt"

[deploy]
preDeploy = "cd apps/backend && alembic upgrade head"
startCommand = "cd apps/backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
```

### 3) Deploy from GitHub

1. Create a new Railway project → Deploy from GitHub → pick this repo.
2. Set root directory to `apps/backend` if prompted.
3. Add environment variables from `.env.sample` (do not commit secrets).
4. Set Deploy Command to `alembic upgrade head` so migrations run before start. Trigger a deploy. Railway will build and run the migration, then start the web process.

### 4) Health check & CORS

- Health: `GET /healthz` returns `{ "status": "ok" }` and lightly checks DB.
	Legacy: `GET /api/v1/health/ping` returns `{ "message": "pong" }`.
- CORS: verify your Vercel domain is present in `ALLOWED_ORIGINS`.

### 5) Frontend integration

- In Next.js (Vercel), set `NEXT_PUBLIC_API_URL` to your Railway URL (e.g., `https://<service>.up.railway.app`).
- Ensure `connect-src` in frontend CSP allows the Railway origin.

### 6) Notes

- Background cleanup loop runs under Railway. If you later move to serverless, set `DISABLE_BACKGROUND_TASKS=true` and schedule a cron call to a cleanup endpoint.
- Keep DB pools small to respect Neon connection limits.
