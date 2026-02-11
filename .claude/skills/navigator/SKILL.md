---
name: navigator
description: Codebase orientation. Use FIRST when exploring code, finding files, or understanding project structure. For advanced search, see the codebase-navigator skill.
---

## Codebase Navigator

For advanced code search with ripgrep scripts, use the **codebase-navigator** skill instead.

Quick search: `.agents/skills/codebase-navigator/scripts/search.sh <command> [pattern]`

## Before searching code

1. Read `docs/agent/architecture/backend-architecture.md` for backend structure
2. Read `docs/agent/architecture/frontend-architecture.md` for frontend structure
3. Check `docs/agent/apis/api-flow-maps.md` for endpoint mappings

## Quick paths

- Backend routers: `apps/backend/app/routers/`
- Backend services: `apps/backend/app/services/`
- Backend schemas: `apps/backend/app/schemas/`
- Frontend pages: `apps/frontend/app/`
- Frontend components: `apps/frontend/components/`
- Frontend hooks: `apps/frontend/hooks/`
- Design specs: `docs/agent/design/`
- Full doc index: `docs/agent/README.md`

## Available Agents

| Agent | Use for |
|-------|---------|
| codebase-navigator | Search code, trace flows, find definitions |
| backend-dev | FastAPI endpoints, schemas, services |
| frontend-dev | Next.js pages, React components, Swiss style |
| ui-review | Swiss International Style compliance check |
| code-review | Code quality, security, conventions |
| full-stack | Features spanning backend + frontend |
