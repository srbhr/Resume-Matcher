# Agent Documentation Index

> **Complete reference for AI agents working with Resume Matcher.**

This folder contains modular documentation for AI agents (GitHub Copilot, Claude, etc.) working on the Resume Matcher codebase. Start with the entrypoint at [/AGENTS.md](/AGENTS.md), then dive into specific topics below.

---

## Quick Navigation

### Getting Started

| Document | Description |
|----------|-------------|
| [00-scope-and-principles.md](00-scope-and-principles.md) | Non-negotiable rules, what's in/out of scope |
| [10-quickstart.md](10-quickstart.md) | Install, run, test commands |
| [20-workflow.md](20-workflow.md) | Git commits, PRs, testing guidelines |
| [25-coding-standards.md](25-coding-standards.md) | Frontend and backend coding conventions |

### Architecture

| Document | Description |
|----------|-------------|
| [30-architecture/backend-guide.md](30-architecture/backend-guide.md) | Backend modules, API endpoints, services |
| [30-architecture/backend-architecture.md](30-architecture/backend-architecture.md) | Backend architecture diagrams |
| [30-architecture/frontend-workflow.md](30-architecture/frontend-workflow.md) | User flow, page routes, components |
| [30-architecture/frontend-architecture.md](30-architecture/frontend-architecture.md) | Frontend architecture diagrams |

### APIs

| Document | Description |
|----------|-------------|
| [40-apis/front-end-apis.md](40-apis/front-end-apis.md) | API contract between frontend and backend |
| [40-apis/api-flow-maps.md](40-apis/api-flow-maps.md) | API request/response flow diagrams |
| [40-apis/backend-requirements.md](40-apis/backend-requirements.md) | API contract specifications |

### Design & Templates

| Document | Description |
|----------|-------------|
| [50-design-and-templates/style-guide.md](50-design-and-templates/style-guide.md) | Swiss International Style design system |
| [50-design-and-templates/design-system.md](50-design-and-templates/design-system.md) | Extended design system documentation |
| [50-design-and-templates/swiss-design-system-prompt.md](50-design-and-templates/swiss-design-system-prompt.md) | Design system AI prompt |
| [50-design-and-templates/template-system.md](50-design-and-templates/template-system.md) | Resume template system |
| [50-design-and-templates/pdf-template-guide.md](50-design-and-templates/pdf-template-guide.md) | PDF rendering & template editing |
| [50-design-and-templates/print-pdf-design-spec.md](50-design-and-templates/print-pdf-design-spec.md) | PDF generation specifications |
| [50-design-and-templates/resume-template-design-spec.md](50-design-and-templates/resume-template-design-spec.md) | Resume template design specifications |

### Docker

| Document | Description |
|----------|-------------|
| [60-docker/docker.md](60-docker/docker.md) | Docker deployment guide |
| [60-docker/docker-ollama.md](60-docker/docker-ollama.md) | Docker + Ollama setup guide |

### Features

| Document | Description |
|----------|-------------|
| [70-features/custom-sections.md](70-features/custom-sections.md) | Dynamic resume sections system |
| [70-features/resume-templates.md](70-features/resume-templates.md) | Template types and formatting controls |
| [70-features/i18n.md](70-features/i18n.md) | Internationalization overview |
| [70-features/i18n-preparation.md](70-features/i18n-preparation.md) | Detailed i18n extraction plan |
| [70-features/enrichment.md](70-features/enrichment.md) | AI resume enrichment wizard |
| [70-features/jd-match.md](70-features/jd-match.md) | JD keyword matching feature |

### LLM & AI

| Document | Description |
|----------|-------------|
| [80-llm-integration.md](80-llm-integration.md) | Multi-provider AI support, prompts, JSON handling |

### Maintenance

| Document | Description |
|----------|-------------|
| [maintainer-guide.md](maintainer-guide.md) | Maintainer responsibilities and release process |
| [review-todo.md](review-todo.md) | Review checklist and TODOs |

---

## How to Use These Docs

### For New Tasks

1. Read [00-scope-and-principles.md](00-scope-and-principles.md) first
2. Check [10-quickstart.md](10-quickstart.md) for build/run commands
3. Review [20-workflow.md](20-workflow.md) for commit/PR conventions
4. Dive into specific architecture or feature docs as needed

### For Backend Changes

1. [30-architecture/backend-guide.md](30-architecture/backend-guide.md)
2. [40-apis/front-end-apis.md](40-apis/front-end-apis.md)
3. [80-llm-integration.md](80-llm-integration.md) (if touching AI features)

### For Frontend Changes

1. [30-architecture/frontend-workflow.md](30-architecture/frontend-workflow.md)
2. [50-design-and-templates/style-guide.md](50-design-and-templates/style-guide.md) ← **REQUIRED**
3. [25-coding-standards.md](25-coding-standards.md)

### For Template/PDF Changes

1. [50-design-and-templates/pdf-template-guide.md](50-design-and-templates/pdf-template-guide.md)
2. [50-design-and-templates/template-system.md](50-design-and-templates/template-system.md)
3. [70-features/resume-templates.md](70-features/resume-templates.md)

---

## Project Structure Reference

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
