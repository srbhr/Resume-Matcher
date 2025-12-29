# Repository Guidelines

## Table of Contents

- [Documentation](#documentation)
- [Project Structure & Module Organization](#project-structure--module-organization)
- [Build, Test, and Development Commands](#build-test-and-development-commands)
- [Coding Style & Naming Conventions](#coding-style--naming-conventions)
- [Testing Guidelines](#testing-guidelines)
- [Commit & Pull Request Guidelines](#commit--pull-request-guidelines)
- [LLM & AI Workflow Notes](#llm--ai-workflow-notes)

---

## Documentation

All project documentation is located in the `docs/` folder:

| Document | Description |
|----------|-------------|
| [backend-guide.md](docs/backend-guide.md) | Backend architecture, modules, and API endpoints |
| [frontend-workflow.md](docs/frontend-workflow.md) | User flow, page routes, and component architecture |
| [front-end-apis.md](docs/front-end-apis.md) | API contract between frontend and backend |
| [style-guide.md](docs/style-guide.md) | Swiss International Style design system |
| [backend-architecture.md](docs/backend-architecture.md) | Detailed backend architecture diagrams |
| [frontend-architecture.md](docs/frontend-architecture.md) | Detailed frontend architecture diagrams |
| [api-flow-maps.md](docs/api-flow-maps.md) | API request/response flow diagrams |
| [design-system.md](docs/design-system.md) | Extended design system documentation |
| [template-system.md](docs/template-system.md) | Resume template system documentation |
| [print_pdf_design_spec.md](docs/print_pdf_design_spec.md) | PDF generation specifications |
| [resume_template_design_spec.md](docs/resume_template_design_spec.md) | Resume template design specifications |
| [i18n-preparation.md](docs/i18n-preparation.md) | Internationalization preparation notes |
| [backend-requirements.md](docs/backend-requirements.md) | API contract specifications |
| [review-todo.md](docs/review-todo.md) | Review checklist and TODOs |

## Project Structure & Module Organization

### Backend (`apps/backend/`)
A lean FastAPI application with multi-provider AI support. See **[docs/backend-guide.md](docs/backend-guide.md)** for detailed architecture documentation.

- `app/main.py` - FastAPI entry point with CORS and router setup
- `app/config.py` - Pydantic settings loaded from environment
- `app/database.py` - TinyDB wrapper for JSON storage
- `app/llm.py` - LiteLLM wrapper with JSON mode support, retry logic, and robust JSON extraction
- `app/routers/` - API endpoints (health, config, resumes, jobs)
- `app/services/` - Business logic (parser, improver)
- `app/schemas/` - Pydantic models matching frontend contracts
- `app/prompts/` - Simplified LLM prompt templates

### Frontend (`apps/frontend/`)
Next.js dashboard with Swiss International Style design. See **[docs/frontend-workflow.md](docs/frontend-workflow.md)** for user flow and **[docs/front-end-apis.md](docs/front-end-apis.md)** for API contracts.

- `app/` - Next.js routes (dashboard, builder, tailor, resumes, settings, print)
- `components/` - Reusable UI components (including `ConfirmDialog` with danger/success variants)
- `lib/` - API clients and utilities (`lib/api/resume.ts` includes CRUD operations)
- `hooks/` - Custom React hooks

**Key Features:**
- Dashboard auto-refreshes on window focus (handles deletions from other pages)
- `ConfirmDialog` component supports `danger`, `warning`, `success`, and `default` variants
- Delete flow includes confirmation before and success message after deletion

### Root Tooling
- `package.json` - Workflow coordination and scripts

## Build, Test, and Development Commands
- `npm run install` provisions the frontend and, via `uv`, the backend virtual environment.
- `npm run dev` launches FastAPI on `:8000` and the UI on `:3000`; use `npm run dev:backend` or `npm run dev:frontend` to focus on a single tier.
- Production builds: `npm run build` for both stacks, `npm run build:frontend` for UI-only.
- Quality checks: `npm run lint` for the UI, `npm run format` to apply Prettier.

## Coding Style & Naming Conventions

### Frontend (TypeScript/React)
- **Design System**: All UI changes MUST follow the **Swiss International Style** in [docs/style-guide.md](docs/style-guide.md).
    - Use `font-serif` for headers, `font-mono` for metadata, `font-sans` for body text.
    - Color palette: `#F0F0E8` (Canvas), `#000000` (Ink), `#1D4ED8` (Hyper Blue), `#15803D` (Signal Green), `#F97316` (Alert Orange), `#DC2626` (Alert Red), `#4B5563` (Steel Grey).
    - Components: `rounded-none` with 1px black borders and hard shadows.
- Use PascalCase for components, camelCase for helpers.
- Tailwind utility classes for styling; run Prettier before committing.

### Backend (Python/FastAPI)
- Python 3.11+, 4-space indents, type hints on all functions.
- Async functions for I/O operations (database, LLM calls).
- Mirror patterns in `app/services/improver.py` for new services.
- Pydantic models for all request/response schemas.
- Prompts go in `app/prompts/templates.py`.

### Environment Files
- Backend: Copy `apps/backend/.env.example` to `.env`
- Frontend: Copy to `apps/frontend/.env.local`
- Only templates (`.example`, `.env.local.example`) belong in Git.

## Testing Guidelines
- UI contributions must pass `npm run lint`; add Jest or Playwright suites beneath `apps/frontend/__tests__/` named `*.test.tsx` as functionality expands.
- Backend tests belong in `apps/backend/tests/` using `test_*.py` naming. Execute them with `uv run python -m pytest` once `pytest` is added, and seed anonymised resume/job fixtures.

## Commit & Pull Request Guidelines
- History shows concise, sentence-style subjects (e.g., `Add custom funding link to FUNDING.yml`) and GitHub merge commits; keep messages short and, if using prefixes, stick to `type: summary` in the imperative.
- Reference issues (`Fixes #123`) and call out schema or prompt changes in the PR description so reviewers can smoke-test downstream agents.
- List local verification commands and attach screenshots for UI or API changes.

## LLM & AI Workflow Notes
- **Multi-Provider Support**: Backend uses LiteLLM to support OpenAI, Anthropic, OpenRouter, Gemini, DeepSeek, and Ollama through a unified API.
- **JSON Mode**: The `complete_json()` function automatically enables `response_format={"type": "json_object"}` for providers that support it (OpenAI, Anthropic, Gemini, DeepSeek, and major OpenRouter models).
- **Retry Logic**: JSON completions include 2 automatic retries with progressively lower temperature (0.1 → 0.0) to improve reliability.
- **JSON Extraction**: Robust bracket-matching algorithm in `_extract_json()` handles malformed responses, markdown code blocks, and edge cases.
- **Adding Prompts**: Add new prompt templates to `apps/backend/app/prompts/templates.py`. Keep prompts simple and direct—avoid complex escaping.
- **Prompt Guidelines**:
  - Use `{variable}` for substitution (single braces)
  - Include example JSON schemas for structured outputs
  - Keep instructions concise: "Output ONLY the JSON object, no other text"
- **Provider Configuration**: Users configure their preferred AI provider via the Settings page (`/settings`) or `PUT /api/v1/config/llm-api-key`.
- **Health Checks**: The `/api/v1/status` endpoint validates LLM connectivity on app startup.
- **Timeouts**: All LLM calls have configurable timeouts (30s for health checks, 120s for completions, 180s for JSON operations).
