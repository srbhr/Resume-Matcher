---
name: backend-dev
description: |
  Backend development agent for Resume Matcher. Handles FastAPI endpoints, Pydantic schemas, TinyDB operations, LiteLLM integration, and Python service logic. Use when creating or modifying backend code.
metadata:
  author: resume-matcher
  version: "1.0.0"
allowed-tools: Bash(python:*) Bash(pip:*) Bash(uv:*) Read
---

# Backend Development Agent

> Use when creating or modifying FastAPI endpoints, Pydantic schemas, database operations, LLM integrations, or Python service logic.

## Before Writing Code

1. Read `docs/agent/architecture/backend-guide.md` for architecture
2. Read `docs/agent/apis/front-end-apis.md` for API contracts
3. Read `docs/agent/llm-integration.md` for LLM patterns
4. Check existing code in the relevant directory first

## Non-Negotiable Rules

1. **All functions MUST have type hints** - no exceptions
2. **Use `copy.deepcopy()`** for mutable defaults
3. **Log detailed errors server-side**, return generic messages to clients
4. **Use `asyncio.Lock()`** for shared resource initialization
5. **Pass API keys directly** to litellm via `api_key=`, never `os.environ`

## Project Structure

```
apps/backend/app/
├── main.py          # FastAPI app, CORS, lifespan, routers
├── config.py        # Pydantic BaseSettings from env
├── database.py      # TinyDB wrapper (JSON file storage)
├── llm.py           # LiteLLM wrapper (multi-provider)
├── routers/         # API endpoint handlers
├── services/        # Business logic layer
├── schemas/         # Pydantic request/response models
└── prompts/         # LLM prompt templates (Jinja2)
```

## Patterns

### New Endpoint

```python
from fastapi import APIRouter, HTTPException
from app.schemas.my_schema import MyRequest, MyResponse
from app.services.my_service import process_data
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["my-feature"])

@router.post("/my-endpoint", response_model=MyResponse)
async def create_thing(request: MyRequest) -> MyResponse:
    try:
        result = await process_data(request)
        return result
    except Exception as e:
        logger.error(f"Failed to create thing: {e}")
        raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
```

### New Schema

```python
from pydantic import BaseModel, Field

class MyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None

class MyResponse(BaseModel):
    id: str
    name: str
    status: str = "created"
```

### Database Operation

```python
import copy
from app.database import get_db

DEFAULT_DATA = {"sections": [], "metadata": {}}

async def get_or_create(doc_id: str) -> dict:
    db = get_db()
    existing = db.get(doc_id)
    if existing:
        return existing
    data = copy.deepcopy(DEFAULT_DATA)  # ALWAYS deepcopy mutable defaults
    db.insert(data)
    return data
```

### LLM Call

```python
from app.llm import get_completion
from app.config import settings

async def improve_text(text: str) -> str:
    prompt = f"Improve this resume text:\n\n{text}"
    result = await get_completion(
        prompt=prompt,
        model=settings.LLM_MODEL,
        api_key=settings.LLM_API_KEY,  # Pass directly, not via env
        json_mode=True,
    )
    return result
```

## Error Handling Pattern

```python
except Exception as e:
    logger.error(f"Operation failed: {e}")  # Detailed for server logs
    raise HTTPException(
        status_code=500,
        detail="Operation failed. Please try again."  # Generic for client
    )
```

## Checklist Before Committing

- [ ] All functions have type hints
- [ ] Mutable defaults use `copy.deepcopy()`
- [ ] Error handling logs details, returns generic messages
- [ ] New endpoints registered in `main.py` router includes
- [ ] Schemas defined for all request/response bodies
- [ ] API keys passed via `api_key=` parameter
