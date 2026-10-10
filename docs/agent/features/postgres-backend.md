# PostgreSQL Backend (optional)

> **Set `DATABASE_URL` to store data in PostgreSQL instead of SQLite. Unset, nothing changes.**

## Overview

SQLite in `data/resume_matcher.db` stays the default. PostgreSQL is for durability, backups and remote or shared hosting. Both backends use the same `Database` facade, the same tables and the same invariants. There is no write-throughput gain, because writes stay serialized.

## Configuration

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | `postgres://`, `postgresql://` or `postgresql+psycopg://`; normalized to `postgresql+psycopg://`. Other schemes fail at startup. Errors and logs never show the password. |
| `DATABASE_SCHEMA` | Optional. Lowercase `[a-z_][a-z0-9_]{0,62}`. Created on startup and used as `search_path`. |

- **Driver.** `psycopg` 3 serves both engines: async for the documents and sync for `api_keys`.
- **API keys.** `data/.secret_key` still lives in `DATA_DIR`, and the encrypted API keys can't be read without it. Keep it with the database.
- **Docker.** `docker-compose.postgres.yml` is an opt-in override: a `postgres:17-alpine` service, `DATABASE_URL` and `depends_on: service_healthy`. It needs `POSTGRES_PASSWORD`.

## How It Works

1. **Write serialization** (`database.py`, `_write_lock_statements`).
   - SQLite reserves the writer with `BEGIN IMMEDIATE`.
   - PostgreSQL runs `SET LOCAL lock_timeout = 5000`, then `pg_advisory_xact_lock(0x524D, hashtext(current_schema()))`. The connections use READ COMMITTED, so every read after the lock sees the previous writer's commit. That is the same guarantee `BEGIN IMMEDIATE` gives.
   - The lock is released at commit or rollback.
   - App instances in different schemas of one database don't block each other.
2. **Contention.** SQLSTATE `55P03` (lock timeout), `40001` and `40P01` map to `DatabaseBusyError`, which becomes the existing 503 with `Retry-After: 1` (MCP: "Database is busy").
3. **Startup** (`db_engine.init_models_sync`).
   - `CREATE SCHEMA IF NOT EXISTS` and `create_all` run in one transaction under an advisory lock, so the web app and the MCP server can start together.
   - The SQLite-only `ALTER TABLE` migrations are skipped, because Postgres tables are always created current.
   - The default-master partial unique index uses `postgresql_where=is_default_master`.
4. **Status.** `GET /status` `database_stats.backend` and MCP `get_status` report `sqlite` or `postgresql`.

## Moving Existing Data

```bash
cd apps/backend
DATABASE_URL=postgresql://... uv run python -m app.scripts.copy_sqlite_to_postgres [--source data/resume_matcher.db]
```

- The script copies every table, including the `api_keys` ciphertext, in one locked transaction.
- It refuses if any target table already has rows.

## Tests

- `tests/unit/test_database_url.py` always runs. It covers URL handling, redaction, schema names, the compiled lock SQL, the SQLSTATE mapping, the partial index DDL and `copy_rows`.
- Parity mode runs the **whole backend suite** against PostgreSQL, with one throwaway schema per test:
  ```bash
  TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/scratch uv run pytest
  ```
  - `tests/integration/test_postgres_backend.py` (marker `postgres`) runs only in this mode. It covers writer waiting and lock timeout, schema isolation, the partial index, concurrent startup and an end-to-end copy.
  - Tests marked `sqlite_only` open `sqlite3` directly and are skipped in this mode.
- The suite always clears `DATABASE_URL`, so a developer's own database is never touched.

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/app/db_url.py` | URL normalization, schema validation, redaction |
| `apps/backend/app/db_engine.py` | Engines per backend, Postgres startup lock |
| `apps/backend/app/database.py` | `Database(url=, schema=)`, write lock, busy mapping |
| `apps/backend/app/scripts/copy_sqlite_to_postgres.py` | One-time data copy |
| `docker-compose.postgres.yml` | Opt-in compose override |
| `apps/backend/tests/db_helpers.py` | `same_database`, `hold_writer` for dialect-neutral contention tests |
