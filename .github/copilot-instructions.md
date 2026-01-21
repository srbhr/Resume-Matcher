# Repository Guidelines - GitHub CoPilot Instructions

> **First:** Read the [navigator skill](/.claude/skills/navigator/SKILL.md) for codebase orientation.

## Table of Contents

- [Documentation](#documentation)
- [Skills (AI Agent Patterns)](#skills-ai-agent-patterns)
- [Project Structure & Module Organization](#project-structure--module-organization)
- [Build, Test, and Development Commands](#build-test-and-development-commands)
- [Coding Style & Naming Conventions](#coding-style--naming-conventions)
- [Testing Guidelines](#testing-guidelines)
- [Commit & Pull Request Guidelines](#commit--pull-request-guidelines)
- [LLM & AI Workflow Notes](#llm--ai-workflow-notes)
- [Resume Template Settings](#resume-template-settings)
- [Content Language Settings](#content-language-settings)

---

## Documentation

All project documentation is located in the `docs/agent/` folder:

### Core Docs
| Document | Description |
|----------|-------------|
| [scope-and-principles.md](docs/agent/scope-and-principles.md) | Project scope and non-negotiable rules |
| [quickstart.md](docs/agent/quickstart.md) | Install, run, test commands |
| [workflow.md](docs/agent/workflow.md) | Git commits, PRs, testing guidelines |
| [coding-standards.md](docs/agent/coding-standards.md) | Frontend and backend coding conventions |
| [llm-integration.md](docs/agent/llm-integration.md) | Multi-provider AI support |

### Architecture
| Document | Description |
|----------|-------------|
| [backend-architecture.md](docs/agent/architecture/backend-architecture.md) | Backend modules, API endpoints, services |
| [backend-guide.md](docs/agent/architecture/backend-guide.md) | Backend quick reference |
| [frontend-architecture.md](docs/agent/architecture/frontend-architecture.md) | Components, pages, state |
| [frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) | User flow, page routes |

### APIs
| Document | Description |
|----------|-------------|
| [front-end-apis.md](docs/agent/apis/front-end-apis.md) | API client layer |
| [api-flow-maps.md](docs/agent/apis/api-flow-maps.md) | API request/response flows |
| [backend-requirements.md](docs/agent/apis/backend-requirements.md) | API contract specifications |

### Design & Templates
| Document | Description |
|----------|-------------|
| [style-guide.md](docs/agent/design/style-guide.md) | **Swiss International Style design system** |
| [design-system.md](docs/agent/design/design-system.md) | Extended design tokens |
| [template-system.md](docs/agent/design/template-system.md) | Resume template system |
| [pdf-template-guide.md](docs/agent/design/pdf-template-guide.md) | PDF rendering & template editing |
| [swiss-design-system-prompt.md](docs/agent/design/swiss-design-system-prompt.md) | AI prompt for Swiss style UI |

### Features
| Document | Description |
|----------|-------------|
| [custom-sections.md](docs/agent/features/custom-sections.md) | Dynamic resume sections |
| [i18n.md](docs/agent/features/i18n.md) | Internationalization overview |
| [i18n-preparation.md](docs/agent/features/i18n-preparation.md) | Detailed i18n plan |

---

## Skills (AI Agent Patterns)

Reusable patterns and guidelines for AI agents located in `.claude/skills/`:

| Skill | Description |
|-------|-------------|
| [navigator](/.claude/skills/navigator/SKILL.md) | Codebase orientation - use FIRST when exploring code |
| [tailwind-patterns](/.claude/skills/tailwind-pattern/SKILL.md) | Tailwind CSS component patterns + Swiss style overrides |
| [fastapi](/.claude/skills/fastapi/SKILL.md) | FastAPI patterns, JWT auth, Pydantic v2, async SQLAlchemy |
| [design-principles](/.claude/skills/design-principles/SKILL.md) | Swiss International Style design principles |

**Quick Start for Agents:**
1. Read `navigator` skill first for codebase orientation
2. Check `design-principles` and `tailwind-patterns` for UI work
3. Check `fastapi` skill for backend work

---

## Project Structure & Module Organization

### Backend (`apps/backend/`)
A lean FastAPI application with multi-provider AI support. See **[architecture/backend-guide.md](docs/agent/architecture/backend-guide.md)** for details.

- `app/main.py` - FastAPI entry point with CORS and router setup
- `app/config.py` - Pydantic settings loaded from environment
- `app/database.py` - TinyDB wrapper for JSON storage
- `app/llm.py` - LiteLLM wrapper with JSON mode support
- `app/routers/` - API endpoints (health, config, resumes, jobs)
- `app/services/` - Business logic (parser, improver)
- `app/schemas/` - Pydantic models
- `app/prompts/` - LLM prompt templates

### Frontend (`apps/frontend/`)
Next.js dashboard with Swiss International Style design. See **[architecture/frontend-workflow.md](docs/agent/architecture/frontend-workflow.md)** for user flow.

- `app/` - Next.js routes (dashboard, builder, tailor, resumes, settings, print)
- `components/` - Reusable UI components
- `lib/` - API clients and utilities
- `hooks/` - Custom React hooks

---

## Build, Test, and Development Commands

```bash
npm run install      # Install frontend + backend deps
npm run dev          # FastAPI :8000 + Next.js :3000
npm run dev:backend  # FastAPI only
npm run dev:frontend # Next.js only
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
```

---

## Coding Style & Naming Conventions

### Frontend (TypeScript/React)
- **Design System**: All UI changes MUST follow the **Swiss International Style** in [design/style-guide.md](docs/agent/design/style-guide.md)
- Use `font-serif` for headers, `font-mono` for metadata, `font-sans` for body
- Color palette: Canvas `#F0F0E8`, Ink `#000000`, Hyper Blue `#1D4ED8`, Signal Green `#15803D`
- Components: `rounded-none` with 1px black borders and hard shadows
- PascalCase for components, camelCase for helpers
- Run Prettier before committing

### Backend (Python/FastAPI)
- Python 3.13+, 4-space indents, type hints on all functions
- Async functions for I/O operations
- Pydantic models for all request/response schemas
- Error handling: Log details server-side, generic messages to clients

---

## Testing Guidelines
- UI: Must pass `npm run lint`; add tests in `apps/frontend/__tests__/`
- Backend: Tests in `apps/backend/tests/` with `test_*.py` naming

---

## Commit & Pull Request Guidelines
- Concise, sentence-style subjects
- Reference issues (`Fixes #123`)
- Call out schema/prompt changes in PR description
- Attach screenshots for UI changes

---

## LLM & AI Workflow Notes
- **Multi-Provider Support**: LiteLLM supports OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, Ollama
- **API Key Handling**: Keys passed directly via `api_key` parameter (not os.environ)
- **JSON Mode**: Auto-enabled for supported providers
- **Retry Logic**: 2 retries with lower temperature
- **Health Checks**: `/api/v1/health` validates LLM connectivity
- **Timeouts**: 30s (health), 120s (completion), 180s (JSON)

---

## Custom Sections System

Dynamic resume sections with customization:

| Type | Description |
|------|-------------|
| `personalInfo` | Header (always first) |
| `text` | Single text block |
| `itemList` | Items with title, subtitle, years, description |
| `stringList` | Simple string array |

Features: Rename, reorder, hide, delete, add custom sections.

---

## Resume Template Settings

| Template | Description |
|----------|-------------|
| `swiss-single` | Single-column layout |
| `swiss-two-column` | 65%/35% split |

Controls: Margins (5-25mm), spacing (1-5), font size (1-5), header scale (1-5).

---

## Internationalization (i18n)

Supported: `en`, `es`, `zh`, `ja`

- **UI Language**: Interface text (localStorage)
- **Content Language**: LLM-generated content (localStorage + backend)

```typescript
import { useTranslations } from '@/lib/i18n';
const { t } = useTranslations();
```
