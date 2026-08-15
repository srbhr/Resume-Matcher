# CLAUDE.md - Resume Matcher

> **Context file for Claude Code.** Full documentation at [docs/agent/README.md](../docs/agent/README.md).

---

## Project Overview

Resume Matcher is an AI-powered application for tailoring resumes to job descriptions, with an adaptive Resume Wizard for creating a master resume and a Kanban Application Tracker for managing the job-application pipeline.

| Layer | Stack |
|-------|-------|
| **Backend** | FastAPI + Python 3.13+, LiteLLM (multi-provider AI) |
| **Frontend** | Next.js 16 + React 19, Tailwind CSS v4 |
| **Database** | SQLite (SQLAlchemy 2.0 async / aiosqlite) |
| **PDF** | Headless Chromium via Playwright |

---

## First Steps

Before exploring code, read [docs/agent/README.md](../docs/agent/README.md) for project orientation.

---

## Non-Negotiable Rules

1. **All frontend UI changes** MUST follow [Swiss International Style](../docs/portable/swiss-design-system/README.md) — see [tokens](../docs/portable/swiss-design-system/tokens.md), [components](../docs/portable/swiss-design-system/components.md), [anti-patterns](../docs/portable/swiss-design-system/anti-patterns.md)
2. **All Python functions** MUST have type hints
3. **Run `npm run lint`** before committing frontend changes
4. **Run `npm run format`** (Prettier) before committing
5. **Log detailed errors server-side**, return generic messages to clients
6. **Do NOT modify** `.github/workflows/` files without explicit request
7. **Treat `apps/backend/data/**` as user data**, especially uploads. Never stage, commit, log, copy, paste into prompts, or share its contents; do not inspect it unless the task explicitly requires it. Use synthetic fixtures for tests and examples.
8. **Never reset stored user data** through the reset endpoint or backend reset helper without the user's direct confirmation after stating the exact data that will be removed.

---

## Essential Commands

```bash
# Backend (from repo root)
cd apps/backend
uv sync --extra dev                                  # Install Python deps (incl. test deps)
uv run uvicorn app.main:app --reload --port 8000     # FastAPI on :8000
uv run pytest                                        # Run backend tests (LLM evals excluded)

# Frontend (from repo root, in a separate terminal)
cd apps/frontend
npm install                                          # Install Node.js dependencies
npm run dev                                          # Next.js on :3000
npm run test                                         # Run frontend tests (vitest)

# Quality checks (from apps/frontend)
npm run lint          # Lint frontend
npm run format        # Format with Prettier

# Build (from apps/frontend)
npm run build
```

---

## Project Structure

```
apps/
├── backend/                 # FastAPI + Python
│   ├── app/
│   │   ├── main.py          # Entry point
│   │   ├── config.py        # Environment settings
│   │   ├── database.py      # Async SQLAlchemy/SQLite facade
│   │   ├── models.py        # SQLAlchemy ORM models (Resume/Job/Improvement/Application/ApiKey)
│   │   ├── db_engine.py     # Async + sync SQLite engines (WAL/FK pragmas)
│   │   ├── crypto.py        # Fernet encrypt/decrypt for API keys at rest
│   │   ├── llm.py           # LiteLLM wrapper
│   │   ├── routers/         # API endpoints (incl. tracker + Resume Wizard)
│   │   ├── services/        # Business logic (incl. adaptive Resume Wizard flow)
│   │   ├── schemas/         # Pydantic models (incl. tracker + wizard contracts)
│   │   ├── prompts/         # LLM prompt templates (incl. wizard turn prompt)
│   │   └── scripts/         # One-time TinyDB→SQLite migration (runs on startup)
│   └── data/                # resume_matcher.db (SQLite) + encrypted API keys + .secret_key
│
└── frontend/                # Next.js + React
    ├── app/                 # Pages (dashboard, builder, tailor, tracker, resume-wizard, print)
    ├── components/          # UI components (incl. tracker/, resume-wizard/)
    ├── lib/                 # Utilities, API client (incl. api/tracker.ts, api/resume-wizard.ts)
    ├── hooks/               # Custom React hooks
    └── messages/            # i18n translations (en, es, zh, ja, ko, pt-BR, fr)
```

---

## Documentation by Task

### For Backend Changes
1. [Backend guide](../docs/agent/architecture/backend-guide.md) - Architecture, modules, services
2. [API contracts](../docs/agent/apis/front-end-apis.md) - API specifications
3. [LLM integration](../docs/agent/llm-integration.md) - Multi-provider AI support

### For Frontend Changes
1. [Frontend workflow](../docs/agent/architecture/frontend-workflow.md) - User flow, components
2. [Swiss design system pack](../docs/portable/swiss-design-system/README.md) - **REQUIRED** Swiss International Style (portable pack)
3. [Next.js performance pack](../docs/portable/nextjs-performance/README.md) - **REQUIRED** performance patterns; check version-specific advice against this app's Next.js 16 code
4. [Coding standards](../docs/agent/coding-standards.md) - Frontend conventions

### For Testing
1. [Testing strategy](../docs/agent/testing-strategy.md) - Current-state assessment, framework, phased plan, how to run + how we verify (anti-theater)

### For Template/PDF Changes
1. [PDF template guide](../docs/agent/design/pdf-template-guide.md) - PDF rendering
2. [Template system](../docs/agent/design/template-system.md) - Resume templates
3. [Resume templates](../docs/agent/features/resume-templates.md) - Template types & controls

### For Features
| Feature | Documentation |
|---------|---------------|
| Application tracker | [application-tracker.md](../docs/agent/features/application-tracker.md) |
| Resume Wizard | [API contracts](../docs/agent/apis/front-end-apis.md) (Resume Wizard section) |
| Custom sections | [custom-sections.md](../docs/agent/features/custom-sections.md) |
| Resume templates | [resume-templates.md](../docs/agent/features/resume-templates.md) |
| i18n | [i18n.md](../docs/agent/features/i18n.md) |
| AI enrichment | [enrichment.md](../docs/agent/features/enrichment.md) |
| JD matching | [jd-match.md](../docs/agent/features/jd-match.md) |

---

## Testing

Both apps have real test suites, and **tests are in scope** (deliberate testing initiative — full plan in [docs/agent/testing-strategy.md](../docs/agent/testing-strategy.md)).

| Suite | Stack | Run |
|-------|-------|-----|
| Backend | pytest + pytest-asyncio + httpx + respx | `cd apps/backend && uv run pytest` |
| Frontend | vitest + Testing Library (jsdom) | `cd apps/frontend && npm run test` |

- **Backend layers:** `tests/unit` (pure logic), `tests/service` (mocked LLM), `tests/integration` (real routers via httpx ASGI), `tests/evals` (prompt-quality scorers + a gated LLM-judge — excluded by default; run with `uv run pytest -m eval`).
- **Local push gate (not CI):** a `pre-push` hook (`.githooks/pre-push`) runs the backend suite, Python locale-parity check, frontend Vitest suite, and a `tsc --noEmit` typecheck when Node and the corresponding local binaries are available. It blocks red pushes. Activate once per clone: `git config core.hooksPath .githooks`. We deliberately avoid a GitHub Actions PR gate (high external-PR volume) — see [`.githooks/README.md`](../.githooks/README.md).
- Keep tests **deterministic and anti-theater**: a test must fail when its target breaks, and the default suites make no real network/LLM calls.

---

## Design System Quick Reference

| Element | Value |
|---------|-------|
| Canvas background | `#F0F0E8` |
| Ink (text) | `#000000` |
| Hyper Blue (links) | `#1D4ED8` |
| Signal Green (success) | `#15803D` |
| Alert Orange (warning) | `#F97316` |
| Alert Red (error) | `#DC2626` |
| Headers font | `font-serif` |
| Body font | `font-sans` |
| Metadata font | `font-mono` |
| Borders | `rounded-none`, 1px black, hard shadows |

---

## Definition of Done

Before completing a task, run the checks that match the change and state any relevant check not run:

- [ ] Docs or instruction changes: verify affected links and review the diff.
- [ ] Frontend behaviour: run `npm run lint` and relevant Vitest specs; run `npm run build` when routes, types, or i18n change.
- [ ] Backend behaviour: run relevant `uv run pytest` tests; run the broader suite for shared pipeline changes.
- [ ] Cross-app or API changes: exercise both affected client and server contracts.
- [ ] UI changes follow Swiss International Style; Python changes include type hints.
- [ ] New behaviour has deterministic coverage that fails when the behaviour breaks.

---

## Out of Scope

Do NOT modify without explicit request:
- `.github/workflows/` files
- CI/CD configuration
- Docker build behavior
- Existing tests: do not remove, disable, or weaken them merely to make checks pass. Update them only when intended behaviour changes, with deterministic coverage retained or added.

---

> **Full agent documentation**: [docs/agent/README.md](../docs/agent/README.md)
