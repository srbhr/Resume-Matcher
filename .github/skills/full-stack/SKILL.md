---
name: full-stack
description: |
  Full-stack development skill that coordinates backend and frontend changes together. Use for features that span both layers: new API endpoint + UI, data model changes, end-to-end flows.
---

# Full-Stack Development

> Use for features that span both FastAPI backend and Next.js frontend.

## Architecture

- **Backend**: FastAPI + Python 3.13+, TinyDB, LiteLLM
- **Frontend**: Next.js 16 + React 19, Tailwind CSS v4, Swiss International Style
- **API**: REST endpoints at `/api/v1/*`

## Workflow

### 1. Design the API contract first

```
Route:     POST /api/v1/my-feature
Request:   { field: string, ... }
Response:  { id: string, result: ... }
```

### 2. Backend implementation

- Schema in `apps/backend/app/schemas/`
- Service in `apps/backend/app/services/`
- Router in `apps/backend/app/routers/`
- Register router in `apps/backend/app/main.py`

### 3. Frontend implementation

- API call in `apps/frontend/lib/`
- Component in `apps/frontend/components/`
- Page integration in `apps/frontend/app/`

### 4. Verify end-to-end

- Backend serves correct data
- Frontend displays correctly with Swiss style
- Error states handled on both sides

## Non-Negotiable Rules

### Backend

- Type hints on all functions
- `copy.deepcopy()` for mutable defaults
- Log errors server-side, generic messages to clients
- API keys via `api_key=` parameter

### Frontend

- Swiss International Style (`rounded-none`, hard shadows, Swiss palette)
- `npm run lint && npm run format`
- Enter key handling on textareas
- `Promise.all()` for independent fetches

## Key Files

| Layer | Entry Point |
|-------|------------|
| Backend startup | `apps/backend/app/main.py` |
| Backend config | `apps/backend/app/config.py` |
| Frontend pages | `apps/frontend/app/` |
| API client | `apps/frontend/lib/` |

## References

- API contracts: `docs/agent/apis/front-end-apis.md`
- Backend guide: `docs/agent/architecture/backend-guide.md`
- Frontend workflow: `docs/agent/architecture/frontend-workflow.md`
- Style guide: `docs/agent/design/style-guide.md`
