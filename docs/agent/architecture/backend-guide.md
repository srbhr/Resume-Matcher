# Backend Guide

> Lean, local-first FastAPI app for resume tailoring.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | FastAPI |
| Database | SQLite (SQLAlchemy 2.0 async + aiosqlite) |
| AI | LiteLLM (100+ providers) |
| Doc Parsing | markitdown |
| Validation | Pydantic |
| Key encryption | Fernet (`cryptography`) |

## Directory Structure

```
apps/backend/app/
├── main.py         # Entry point (lifespan: TinyDB→SQLite import, legacy-key fold-in)
├── config.py       # Settings from env/file; encrypted API-key read/write
├── crypto.py       # Fernet encrypt/decrypt for API keys at rest
├── database.py     # Async SQLAlchemy/SQLite facade (returns plain dicts)
├── models.py       # SQLAlchemy declarative Base + ORM models
├── db_engine.py    # SQLite engine/session factories (async + sync) + PRAGMAs
├── llm.py          # Multi-provider LLM
├── routers/        # health, config, resumes, jobs, applications, enrichment
├── services/       # parser, improver, cover_letter
├── schemas/        # Pydantic models (models.py, applications.py)
├── scripts/        # migrate_tinydb_to_sqlite.py (one-time importer)
└── prompts/        # templates.py
```

## Database Operations

`database.py` is an async `Database` facade (global `db` singleton). Methods keep the
same names/signatures as the old TinyDB wrapper but return **plain dicts** (never ORM
rows). ORM models are in `models.py`; engine plumbing is in `db_engine.py`.

```python
await db.create_resume(content, content_type, filename, is_master, processed_data)
await db.get_resume(resume_id) → dict | None
await db.list_resumes() → list[dict]
await db.update_resume(resume_id, updates)
await db.delete_resume(resume_id) → bool
await db.set_master_resume(resume_id)            # Exactly one master allowed
await db.create_job(content, resume_id)
await db.create_application(...) / list_applications / bulk_update_applications
get_api_key_ciphertexts() / replace_api_keys(...)  # sync; encrypted api_keys table
```

**Tables:** `resumes`, `jobs`, `improvements`, `applications`, `api_keys` (encrypted).
DB file: `data/resume_matcher.db`.

**Two engines, one file:** a module-level **async** engine serves the document tables +
`applications`; a **sync** engine serves the encrypted `api_keys` table (read on the
synchronous LLM hot path). Both apply PRAGMAs `journal_mode=WAL`, `foreign_keys=ON`,
`busy_timeout`. The single-master invariant is held by an `asyncio.Lock` plus a partial
unique index. Jobs' dynamic pipeline fields (`preview_hash(es)`, `job_keywords`,
`company`/`role`) live in a `metadata_json` JSON column, flattened on read.

### Encrypted API keys & migration

- **Keys** (`crypto.py`): Fernet-encrypted, per-provider, in the `api_keys` table. Secret
  at `data/.secret_key` (`chmod 600`, gitignored, atomic write; plaintext only in memory).
  `config.py` injects decrypted keys at read time and strips them on save, so secrets
  never reach `config.json`. Set via `POST /config/api-keys`; `PUT /config/llm-api-key` no
  longer persists a key.
- **Migration** (`scripts/migrate_tinydb_to_sqlite.py`): runs on lifespan startup. Imports
  a legacy `data/database.json` (TinyDB) into SQLite if present, then renames it
  `database.json.migrated`. Idempotent. `migrate_legacy_keys()` likewise folds legacy
  plaintext keys into the encrypted store.

## LLM Features

| Feature | Description |
|---------|-------------|
| API Key Passing | Direct to litellm (avoids race conditions) |
| JSON Mode | Auto-enabled for supported providers |
| Retry Logic | 2 retries, temperature 0.1→0.0 |
| Timeouts | 30s (health), 120s (completion), 180s (JSON) |

## Prompt Guidelines

1. Use `{variable}` for substitution (single braces)
2. Include JSON schema examples
3. End with "Output ONLY the JSON object"

## API Endpoints Quick Ref

```
GET  /api/v1/health              # liveness probe (no LLM call)
GET  /api/v1/status              # Full status (LLM + DB isolated; 200 on partial failure)
GET/PUT /api/v1/config/llm-api-key            # no longer persists a key
GET/POST/DELETE /api/v1/config/api-keys       # per-provider encrypted keys
POST /api/v1/resumes/upload      # PDF/DOCX
POST /api/v1/resumes/improve     # Tailor (LLM)
GET  /api/v1/resumes/{id}/pdf
DELETE /api/v1/resumes/{id}
GET  /api/v1/applications        # Kanban tracker: grouped list (+ POST/PATCH/DELETE/bulk)
```

## Data Flow

**Upload:** File → markitdown → Markdown → LLM parse → JSON → SQLite (via `db`)

**Improve:** Resume + Job → Extract keywords (LLM) → Tailor (LLM) → Store. Routers call
services; services call `app/llm.py`; persistence goes through the async `db` facade.
`/improve/confirm` also best-effort auto-creates an `applied` card in the tracker.

## Error Handling

Log details server-side, generic messages to clients:
```python
except Exception as e:
    logger.error(f"Failed: {e}")
    raise HTTPException(500, "Operation failed.")
```

## Running

```bash
cd apps/backend
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

## Adding New Endpoints

1. Create router in `app/routers/`
2. Add Pydantic models to `app/schemas/models.py`
3. Register router in `app/main.py`
