# Gemini Context & Instructions for Resume Matcher

Context and instructions for Gemini agents working on Resume Matcher.

> **First:** Read the [navigator skill](/.claude/skills/navigator/SKILL.md) for codebase orientation.

## 1. Project Overview

Resume Matcher is a local-first, AI-powered application for tailoring resumes to job descriptions.

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js 16 (React 19), Tailwind CSS v4, Lucide Icons |
| **Backend** | FastAPI (Python 3.13+), TinyDB, LiteLLM |
| **Design** | Swiss International Style (Brutalist) |

## 2. Critical Mandates

1. **Linting**: Run `npm run lint` before considering a task done
2. **Swiss Style**: All UI MUST follow [design/style-guide.md](docs/agent/design/style-guide.md)
3. **Type Safety**: Strict TypeScript (frontend), Python type hints (backend)
4. **Error Handling**: Log details server-side, generic messages to client

## 3. Skills (AI Agent Patterns)

Reusable patterns in `.claude/skills/`:

| Skill | Use For |
|-------|---------|
| [navigator](/.claude/skills/navigator/SKILL.md) | **Start here** - codebase orientation |
| [tailwind-patterns](/.claude/skills/tailwind-pattern/SKILL.md) | Tailwind CSS + Swiss style overrides |
| [fastapi](/.claude/skills/fastapi/SKILL.md) | FastAPI, JWT auth, Pydantic v2, async |
| [design-principles](/.claude/skills/design-principles/SKILL.md) | Swiss International Style principles |

## 4. Documentation

Full docs in `docs/agent/`:

| Category | Key Files |
|----------|-----------|
| **Architecture** | [backend-architecture.md](docs/agent/architecture/backend-architecture.md), [frontend-architecture.md](docs/agent/architecture/frontend-architecture.md) |
| **APIs** | [front-end-apis.md](docs/agent/apis/front-end-apis.md), [api-flow-maps.md](docs/agent/apis/api-flow-maps.md) |
| **Design** | [style-guide.md](docs/agent/design/style-guide.md), [template-system.md](docs/agent/design/template-system.md) |
| **Features** | [custom-sections.md](docs/agent/features/custom-sections.md), [i18n.md](docs/agent/features/i18n.md) |

## 5. Architecture Quick Ref

### Frontend (`apps/frontend/`)
- **State**: React Context (Language, Resume Data)
- **Styling**: Tailwind CSS (app UI), CSS Modules (resume templates)
- **API Client**: Centralized in `lib/api/`
- **Components**: PascalCase, functional with hooks

### Backend (`apps/backend/`)
- **LLM**: LiteLLM multi-provider (pass API keys directly, not os.environ)
- **Database**: TinyDB (JSON file)
- **Services**: Business logic in `app/services/`

## 6. Common Workflows

### A. Modifying Resume Templates
1. Edit tokens: `components/resume/styles/_tokens.css`
2. New template: Create `components/resume/resume-{name}.tsx`
3. Register in `components/resume/index.ts`

### B. Adding Custom Section Type
1. Update `apps/backend/app/schemas/models.py`
2. Update `apps/frontend/lib/types/resume.ts`
3. Add to `DynamicResumeSection` and `ResumeForm`

### C. Internationalization
1. UI: Add keys to `apps/frontend/messages/{lang}.json`
2. Content: Use `{output_language}` in backend prompts

## 7. Commands

```bash
npm run dev           # Both servers
npm run dev:frontend  # Next.js :3000
npm run dev:backend   # FastAPI :8000
npm run lint          # ESLint
```
