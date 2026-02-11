---
name: codebase-navigator
description: |
  Navigate, search, and understand the Resume Matcher codebase using ripgrep, ack, or grep. Find functions, classes, components, API endpoints, trace data flows, and understand architecture. Use FIRST when exploring code, finding files, or understanding project structure.
metadata:
  author: resume-matcher
  version: "1.0.0"
allowed-tools: Bash(rg:*) Bash(ack:*) Bash(grep:*) Bash(find:*) Bash(tree:*) Read
---

# Codebase Navigator

> **Use this skill FIRST** when exploring code, finding files, or understanding project structure.

## Quick Start

### Search scripts (preferred)

Run the bundled scripts for common searches:

```bash
# Find functions/methods
./scripts/search.sh functions <pattern>

# Find React components
./scripts/search.sh components <pattern>

# Find API endpoints
./scripts/search.sh endpoints

# Trace an API flow end-to-end
./scripts/trace.sh api-flow <endpoint>

# Trace a data field from backend to UI
./scripts/trace.sh data-flow <field_name>

# Find component hierarchy
./scripts/trace.sh component-tree <ComponentName>
```

Scripts are at: `.agents/skills/codebase-navigator/scripts/`

### Direct ripgrep patterns

When you need something the scripts don't cover:

```bash
# Find any symbol
rg --no-heading -n '\bMySymbol\b' apps/

# Python function definitions
rg --no-heading -n '(def|async def) my_function' apps/backend/ --type py

# React component usage
rg --no-heading -n '<MyComponent' apps/frontend/ --glob '*.tsx'

# Type definitions
rg --no-heading -n '(type|interface) MyType' apps/frontend/ --glob '*.ts'

# Pydantic models
rg --no-heading -n 'class My.*BaseModel' apps/backend/ --type py

# API route handlers
rg --no-heading -n '@(router|app)\.(get|post|put|patch|delete)' apps/backend/ --type py

# Imports of a module
rg --no-heading -n 'from.*my_module.*import|import.*my_module' apps/
```

## Architecture Overview

Read these docs for full understanding:

| Need | Document |
|------|----------|
| Backend architecture | `docs/agent/architecture/backend-architecture.md` |
| Frontend architecture | `docs/agent/architecture/frontend-architecture.md` |
| API contracts | `docs/agent/apis/front-end-apis.md` |
| API flow maps | `docs/agent/apis/api-flow-maps.md` |
| Full doc index | `docs/agent/README.md` |

## Project Layout

```
apps/
├── backend/app/
│   ├── main.py              # FastAPI entry, CORS, routers
│   ├── config.py            # Pydantic settings from env
│   ├── database.py          # TinyDB wrapper
│   ├── llm.py               # LiteLLM wrapper (multi-provider AI)
│   ├── routers/             # API endpoints
│   │   ├── config_router.py # GET/PUT /api/v1/config
│   │   ├── health_router.py # GET /api/v1/health
│   │   ├── resume_router.py # CRUD /api/v1/resumes
│   │   └── jobs_router.py   # CRUD /api/v1/jobs
│   ├── services/            # Business logic
│   │   ├── parser.py        # Resume parsing
│   │   └── improver.py      # AI resume improvement
│   ├── schemas/             # Pydantic request/response models
│   └── prompts/             # LLM prompt templates
│
└── frontend/
    ├── app/                 # Next.js pages (dashboard, builder, tailor, print)
    ├── components/          # Reusable UI components
    ├── lib/                 # API client, utilities, i18n
    ├── hooks/               # Custom React hooks
    └── messages/            # i18n translations (en, es, zh, ja)
```

## Common Search Workflows

### "Where is X defined?"
```bash
./scripts/search.sh functions my_function
./scripts/search.sh components MyComponent
./scripts/search.sh classes MyClass
./scripts/search.sh types MyType
```

### "What calls X?"
```bash
./scripts/search.sh usage my_function
./scripts/search.sh deps my_file.py
```

### "How does data flow for feature X?"
```bash
./scripts/trace.sh api-flow resumes
./scripts/trace.sh data-flow personalInfo
./scripts/trace.sh component-tree ResumeEditor
```

### "What API routes exist?"
```bash
./scripts/search.sh api-routes
```

### "What environment config is used?"
```bash
./scripts/search.sh config
```

### "What needs fixing?"
```bash
./scripts/search.sh todos
```

## Key Entry Points

| What | File |
|------|------|
| Backend startup | `apps/backend/app/main.py` |
| Frontend pages | `apps/frontend/app/` |
| API client | `apps/frontend/lib/api.ts` or `lib/api-client.ts` |
| Design tokens | `apps/frontend/app/globals.css` |
| Resume schemas | `apps/backend/app/schemas/` |
| LLM prompts | `apps/backend/app/prompts/` |

## Tips

- Always check `docs/agent/` before deep-diving into code
- Use `rg --type py` for Python, `rg --glob '*.tsx'` for React components
- When tracing a feature, start from the API route and follow imports
- Check `apps/frontend/components/` for reusable UI patterns
- Check `apps/backend/app/services/` for business logic
