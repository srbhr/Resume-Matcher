# AGENTS.md – Resume Matcher

> **Entrypoint for AI agents.** For complete documentation, see [docs/agent/README.md](docs/agent/README.md).

---

## What This Repo Is

Resume Matcher is an AI-powered application for tailoring resumes to job descriptions:

- **Backend**: FastAPI + Python 3.11+ with multi-provider LLM support (LiteLLM)
- **Frontend**: Next.js 15 + React 19 with Swiss International Style design
- **Database**: TinyDB (JSON file storage)
- **PDF Generation**: Headless Chromium via Playwright

---

## Non-Negotiable Rules

1. **All frontend changes** MUST follow the [Swiss International Style](docs/agent/50-design-and-templates/style-guide.md)
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
| **Scope & principles** | [docs/agent/00-scope-and-principles.md](docs/agent/00-scope-and-principles.md) |
| **Quickstart** | [docs/agent/10-quickstart.md](docs/agent/10-quickstart.md) |
| **Workflow & PRs** | [docs/agent/20-workflow.md](docs/agent/20-workflow.md) |
| **Coding standards** | [docs/agent/25-coding-standards.md](docs/agent/25-coding-standards.md) |

### Backend

| Document | Description |
|----------|-------------|
| [Backend guide](docs/agent/30-architecture/backend-guide.md) | Architecture, modules, services |
| [API contracts](docs/agent/40-apis/front-end-apis.md) | API specifications |
| [LLM integration](docs/agent/80-llm-integration.md) | Multi-provider AI support |

### Frontend

| Document | Description |
|----------|-------------|
| [Frontend workflow](docs/agent/30-architecture/frontend-workflow.md) | User flow, components |
| [Style guide](docs/agent/50-design-and-templates/style-guide.md) | **REQUIRED** for UI changes |
| [Design system](docs/agent/50-design-and-templates/design-system.md) | Extended design docs |

### Templates & PDF

| Document | Description |
|----------|-------------|
| [Template system](docs/agent/50-design-and-templates/template-system.md) | Resume template architecture |
| [PDF template guide](docs/agent/50-design-and-templates/pdf-template-guide.md) | PDF rendering guide |

### Features

| Document | Description |
|----------|-------------|
| [Custom sections](docs/agent/70-features/custom-sections.md) | Dynamic resume sections |
| [Resume templates](docs/agent/70-features/resume-templates.md) | Template formatting controls |
| [i18n](docs/agent/70-features/i18n.md) | Internationalization |
| [Enrichment](docs/agent/70-features/enrichment.md) | AI resume enhancement |
| [JD Match](docs/agent/70-features/jd-match.md) | Keyword matching feature |

### Docker

| Document | Description |
|----------|-------------|
| [Docker setup](docs/agent/60-docker/docker.md) | Docker deployment |
| [Docker + Ollama](docs/agent/60-docker/docker-ollama.md) | Local AI setup |

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
- [ ] UI changes follow [Swiss International Style](docs/agent/50-design-and-templates/style-guide.md)
- [ ] Schema/prompt changes called out in PR description
- [ ] Screenshots attached for UI changes

---

## Quick Reference

| Need | Go to |
|------|-------|
| Backend architecture | [30-architecture/backend-guide.md](docs/agent/30-architecture/backend-guide.md) |
| Frontend architecture | [30-architecture/frontend-workflow.md](docs/agent/30-architecture/frontend-workflow.md) |
| API specs | [40-apis/front-end-apis.md](docs/agent/40-apis/front-end-apis.md) |
| UI design rules | [50-design-and-templates/style-guide.md](docs/agent/50-design-and-templates/style-guide.md) |
| LLM/AI patterns | [80-llm-integration.md](docs/agent/80-llm-integration.md) |
| Docker setup | [60-docker/docker.md](docs/agent/60-docker/docker.md) |

---

> **Full documentation**: [docs/agent/README.md](docs/agent/README.md)
