---
name: codebase-navigator
description: |
  Navigate, search, and understand the Resume Matcher codebase using ripgrep, ack, or grep. Find functions, classes, components, API endpoints, trace data flows, and understand architecture. Use FIRST when exploring code, finding files, or understanding project structure.
---

# Codebase Navigator

> **Use this skill FIRST** when exploring code, finding files, or understanding project structure.

## Search Scripts

Run from the repo root:

```bash
# Find functions/methods
.github/skills/codebase-navigator/scripts/search.sh functions <pattern>

# Find React components
.github/skills/codebase-navigator/scripts/search.sh components <pattern>

# Find API endpoints
.github/skills/codebase-navigator/scripts/search.sh endpoints

# Find classes, types, schemas
.github/skills/codebase-navigator/scripts/search.sh classes <pattern>
.github/skills/codebase-navigator/scripts/search.sh types <pattern>
.github/skills/codebase-navigator/scripts/search.sh schema <pattern>

# Find imports, exports, hooks, config
.github/skills/codebase-navigator/scripts/search.sh imports <module>
.github/skills/codebase-navigator/scripts/search.sh exports <pattern>
.github/skills/codebase-navigator/scripts/search.sh hooks <pattern>
.github/skills/codebase-navigator/scripts/search.sh config

# Find usages and dependents
.github/skills/codebase-navigator/scripts/search.sh usage <symbol>
.github/skills/codebase-navigator/scripts/search.sh deps <file>

# List API routes, TODOs, files, project tree
.github/skills/codebase-navigator/scripts/search.sh api-routes
.github/skills/codebase-navigator/scripts/search.sh todos
.github/skills/codebase-navigator/scripts/search.sh files <pattern>
.github/skills/codebase-navigator/scripts/search.sh tree [dir]
```

## Trace Scripts

```bash
# Trace an API endpoint from route -> service -> schema -> frontend
.github/skills/codebase-navigator/scripts/trace.sh api-flow <endpoint>

# Find component hierarchy (parents and children)
.github/skills/codebase-navigator/scripts/trace.sh component-tree <ComponentName>

# Trace a data field across all layers
.github/skills/codebase-navigator/scripts/trace.sh data-flow <field_name>

# List all middleware
.github/skills/codebase-navigator/scripts/trace.sh middleware

# Trace state management for a key
.github/skills/codebase-navigator/scripts/trace.sh state <key>
```

## Direct Ripgrep Patterns

When scripts don't cover your need:

```bash
# Find any symbol
rg --no-heading -n '\bMySymbol\b' apps/

# Python functions
rg --no-heading -n '(def|async def) my_function' apps/backend/ --type py

# React component usage
rg --no-heading -n '<MyComponent' apps/frontend/ --glob '*.tsx'

# Pydantic models
rg --no-heading -n 'class My.*BaseModel' apps/backend/ --type py

# API routes
rg --no-heading -n '@(router|app)\.(get|post|put|patch|delete)' apps/backend/ --type py
```

## Architecture Docs

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
│   ├── routers/             # API endpoint handlers
│   ├── services/            # Business logic layer
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

## Key Entry Points

| What | File |
|------|------|
| Backend startup | `apps/backend/app/main.py` |
| Frontend pages | `apps/frontend/app/` |
| API client | `apps/frontend/lib/api.ts` or `lib/api-client.ts` |
| Design tokens | `apps/frontend/app/globals.css` |
| Resume schemas | `apps/backend/app/schemas/` |
| LLM prompts | `apps/backend/app/prompts/` |

## Reference

See [references/REFERENCE.md](references/REFERENCE.md) for the full ripgrep cheat sheet and advanced patterns.
