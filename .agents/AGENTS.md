# AGENTS.md – Resume Matcher

> **Entrypoint for AI agents.** For complete documentation, see [docs/agent/README.md](docs/agent/README.md).

---

## What This Repo Is

Resume Matcher is an AI-powered application for tailoring resumes to job descriptions:

- **Backend**: FastAPI + Python 3.13+ with multi-provider LLM support (LiteLLM)
- **Frontend**: Next.js 16 + React 19 with Swiss International Style design
- **Database**: TinyDB (JSON file storage)
- **PDF Generation**: Headless Chromium via Playwright

---

## Available Agents

| Agent | Location | Use for |
|-------|----------|---------|
| **codebase-navigator** | `.agents/skills/codebase-navigator/` | Search code, trace flows, find definitions (use FIRST) |
| **backend-dev** | `.agents/skills/backend-dev/` | FastAPI endpoints, schemas, services, LLM integration |
| **frontend-dev** | `.agents/skills/frontend-dev/` | Next.js pages, React components, Swiss style |
| **ui-review** | `.agents/skills/ui-review/` | Swiss International Style compliance check |
| **code-review** | `.agents/skills/code-review/` | Code quality, security, conventions review |

### VS Code / GitHub Copilot

| Agent | Prompt |
|-------|--------|
| Codebase Navigator | `.github/agents/codebase-navigator.agent.md` |
| Backend Dev | `.github/agents/backend-dev.agent.md` |
| Frontend Dev | `.github/agents/frontend-dev.agent.md` |
| Full Stack Dev | `.github/agents/full-stack.agent.md` |
| UI Review | `.github/agents/ui-review.agent.md` |
| Code Review | `.github/agents/code-review.agent.md` |
| Opus (general) | `.github/agents/opus.agent.md` |

### VS Code Prompts

| Prompt | Description |
|--------|-------------|
| `navigate-code` | Search and explore codebase |
| `backend-dev` | Backend development tasks |
| `frontend-dev` | Frontend development tasks |
| `full-stack` | Cross-layer features |
| `review-ui` | Swiss style compliance |
| `review-code` | Code quality review |
| `ask-opus` | General queries via Opus |

### Codebase Search Scripts

```bash
# Search for functions, classes, components, etc.
.agents/skills/codebase-navigator/scripts/search.sh <command> [pattern]

# Trace API flows, component trees, data paths
.agents/skills/codebase-navigator/scripts/trace.sh <command> [args]

# Available search commands:
#   functions, classes, components, endpoints, imports, exports,
#   types, hooks, todos, deps, tree, files, usage, api-routes, schema, config
```

---

## Non-Negotiable Rules

1. **All frontend changes** MUST follow the [Swiss International Style](docs/agent/design/style-guide.md)
2. **All Python functions** MUST have type hints
3. **Run `npm run lint`** before committing frontend changes
4. **Run `npm run format`** (Prettier) before committing
5. **Log detailed errors server-side**, return generic messages to clients
6. **Do NOT modify** `.github/workflows/` files without explicit request

---

## Essential Commands

```bash
# Install all dependencies
npm run install

# Development (both servers)
npm run dev

# Individual servers
npm run dev:backend   # FastAPI on :8000
npm run dev:frontend  # Next.js on :3000

# Quality checks
npm run lint          # Lint frontend
npm run format        # Format with Prettier

# Build
npm run build
```

---

## Read Before Making Changes

| Topic | Document |
|-------|----------|
| **Full agent docs index** | [docs/agent/README.md](docs/agent/README.md) |
| **Scope & principles** | [docs/agent/scope-and-principles.md](docs/agent/scope-and-principles.md) |
| **Quickstart** | [docs/agent/quickstart.md](docs/agent/quickstart.md) |
| **Workflow & PRs** | [docs/agent/workflow.md](docs/agent/workflow.md) |
| **Coding standards** | [docs/agent/coding-standards.md](docs/agent/coding-standards.md) |

### Backend

| Document | Description |
|----------|-------------|
| [Backend guide](docs/agent/architecture/backend-guide.md) | Architecture, modules, services |
| [API contracts](docs/agent/apis/front-end-apis.md) | API specifications |
| [LLM integration](docs/agent/llm-integration.md) | Multi-provider AI support |

### Frontend

| Document | Description |
|----------|-------------|
| [Frontend workflow](docs/agent/architecture/frontend-workflow.md) | User flow, components |
| [Style guide](docs/agent/design/style-guide.md) | **REQUIRED** for UI changes |
| [Design system](docs/agent/design/design-system.md) | Extended design docs |

### Templates & PDF

| Document | Description |
|----------|-------------|
| [Template system](docs/agent/design/template-system.md) | Resume template architecture |
| [PDF template guide](docs/agent/design/pdf-template-guide.md) | PDF rendering guide |

### Features

| Document | Description |
|----------|-------------|
| [Custom sections](docs/agent/features/custom-sections.md) | Dynamic resume sections |
| [Resume templates](docs/agent/features/resume-templates.md) | Template formatting controls |
| [i18n](docs/agent/features/i18n.md) | Internationalization |
| [Enrichment](docs/agent/features/enrichment.md) | AI resume enhancement |
| [JD Match](docs/agent/features/jd-match.md) | Keyword matching feature |

---

## Skills (Reusable Patterns)

| Skill | Description |
|-------|-------------|
| [codebase-navigator](.agents/skills/codebase-navigator/SKILL.md) | Code search with ripgrep scripts |
| [backend-dev](.agents/skills/backend-dev/SKILL.md) | FastAPI development patterns |
| [frontend-dev](.agents/skills/frontend-dev/SKILL.md) | Next.js + Swiss style patterns |
| [ui-review](.agents/skills/ui-review/SKILL.md) | Swiss style compliance checker |
| [code-review](.agents/skills/code-review/SKILL.md) | Code review guidelines |
| [design-principles](.agents/skills/design-principles/skill.md) | Swiss International Style |
| [fastapi](.agents/skills/fastapi/SKILL.md) | FastAPI, Pydantic v2, JWT auth |
| [tailwind-pattern](.agents/skills/tailwind-pattern/SKILL.md) | Tailwind CSS patterns |
| [nextjs-performance](.agents/skills/nextjs-performance/SKILL.md) | Next.js performance fixes |

---

## Project Structure

```
apps/
├── backend/                 # FastAPI + Python
│   ├── app/
│   │   ├── main.py          # Entry point
│   │   ├── config.py        # Environment settings
│   │   ├── database.py      # TinyDB wrapper
│   │   ├── llm.py           # LiteLLM wrapper
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── schemas/         # Pydantic models
│   │   └── prompts/         # LLM prompt templates
│   └── data/                # Database storage
│
└── frontend/                # Next.js + React
    ├── app/                 # Pages
    ├── components/          # UI components
    ├── lib/                 # Utilities, API client
    ├── hooks/               # Custom React hooks
    └── messages/            # i18n translations
```

---

## Definition of Done

Before marking a PR as ready:

- [ ] Code compiles without errors
- [ ] `npm run lint` passes
- [ ] New features have tests (or documented reason why not)
- [ ] UI changes follow [Swiss International Style](docs/agent/design/style-guide.md)
- [ ] Schema/prompt changes called out in PR description
- [ ] Screenshots attached for UI changes

---

## Quick Reference

| Need | Go to |
|------|-------|
| Search codebase | `.agents/skills/codebase-navigator/scripts/search.sh` |
| Backend architecture | [architecture/backend-guide.md](docs/agent/architecture/backend-guide.md) |
| Frontend architecture | [architecture/frontend-workflow.md](docs/agent/architecture/frontend-workflow.md) |
| API specs | [apis/front-end-apis.md](docs/agent/apis/front-end-apis.md) |
| UI design rules | [design/style-guide.md](docs/agent/design/style-guide.md) |
| LLM/AI patterns | [llm-integration.md](docs/agent/llm-integration.md) |

---

> **Full documentation**: [docs/agent/README.md](docs/agent/README.md)
