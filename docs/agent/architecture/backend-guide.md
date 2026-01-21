# Backend Guide

> Lean, local-first FastAPI app for resume tailoring.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | FastAPI |
| Database | TinyDB (JSON file) |
| AI | LiteLLM (100+ providers) |
| Doc Parsing | markitdown |
| Validation | Pydantic |

## Directory Structure

```
apps/backend/app/
├── main.py         # Entry point
├── config.py       # Settings from env/file
├── database.py     # TinyDB wrapper
├── llm.py          # Multi-provider LLM
├── routers/        # health, config, resumes, jobs
├── services/       # parser, improver, cover_letter
├── schemas/        # Pydantic models
└── prompts/        # templates.py
```

## Database Operations

```python
db.create_resume(content, content_type, filename, is_master, processed_data)
db.get_resume(resume_id) → dict | None
db.list_resumes() → list[dict]
db.update_resume(resume_id, updates)
db.delete_resume(resume_id) → bool
db.set_master_resume(resume_id)
db.create_job(content, resume_id)
```

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
GET  /api/v1/health          # LLM check
GET  /api/v1/status          # Full status
GET/PUT /api/v1/config/llm-api-key
POST /api/v1/resumes/upload  # PDF/DOCX
POST /api/v1/resumes/improve # Tailor (LLM)
GET  /api/v1/resumes/{id}/pdf
DELETE /api/v1/resumes/{id}
```

## Data Flow

**Upload:** File → markitdown → Markdown → LLM parse → JSON → TinyDB

**Improve:** Resume + Job → Extract keywords (LLM) → Tailor (LLM) → Store

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
