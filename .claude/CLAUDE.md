# CLAUDE.md - Resume Matcher

> **Context file for Claude Code.** Full documentation at [docs/agent/README.md](../docs/agent/README.md).

---

## Project Overview

Resume Matcher is an AI-powered application for tailoring resumes to job descriptions.

| Layer | Stack |
|-------|-------|
| **Backend** | FastAPI + Python 3.13+, LiteLLM (multi-provider AI) |
| **Frontend** | Next.js 16 + React 19, Tailwind CSS v4 |
| **Database** | TinyDB (JSON file storage) |
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

---

## Essential Commands

```bash
# Backend (from repo root)
cd apps/backend
uv sync                                              # Install Python dependencies
uv run uvicorn app.main:app --reload --port 8000     # FastAPI on :8000

# Frontend (from repo root, in a separate terminal)
cd apps/frontend
npm install                                          # Install Node.js dependencies
npm run dev                                          # Next.js on :3000

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
│   │   ├── database.py      # TinyDB wrapper
│   │   ├── llm.py           # LiteLLM wrapper
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── schemas/         # Pydantic models
│   │   └── prompts/         # LLM prompt templates
│   └── data/                # Database storage
│
└── frontend/                # Next.js + React
    ├── app/                 # Pages (dashboard, builder, tailor, print)
    ├── components/          # UI components
    ├── lib/                 # Utilities, API client
    ├── hooks/               # Custom React hooks
    └── messages/            # i18n translations (en, es, zh, ja)
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
3. [Next.js performance pack](../docs/portable/nextjs-performance/README.md) - **REQUIRED** Next.js 15 perf patterns (portable pack)
4. [Coding standards](../docs/agent/coding-standards.md) - Frontend conventions

### For Template/PDF Changes
1. [PDF template guide](../docs/agent/design/pdf-template-guide.md) - PDF rendering
2. [Template system](../docs/agent/design/template-system.md) - Resume templates
3. [Resume templates](../docs/agent/features/resume-templates.md) - Template types & controls

### For Features
| Feature | Documentation |
|---------|---------------|
| Custom sections | [custom-sections.md](../docs/agent/features/custom-sections.md) |
| Resume templates | [resume-templates.md](../docs/agent/features/resume-templates.md) |
| i18n | [i18n.md](../docs/agent/features/i18n.md) |
| AI enrichment | [enrichment.md](../docs/agent/features/enrichment.md) |
| JD matching | [jd-match.md](../docs/agent/features/jd-match.md) |

---

## Code Patterns

### Backend Error Handling
```python
except Exception as e:
    logger.error(f"Operation failed: {e}")
    raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
```

### Frontend Textarea Fix
All textareas need Enter key handling:
```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};
```

### Mutable Defaults (Python)
Always use `copy.deepcopy()` for mutable defaults:
```python
import copy
data = copy.deepcopy(DEFAULT_DATA)  # Correct
# data = DEFAULT_DATA  # Wrong - shared state bug
```

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

Before completing a task:

- [ ] Code compiles without errors
- [ ] `npm run lint` passes
- [ ] UI changes follow Swiss International Style
- [ ] Python functions have type hints
- [ ] Schema/prompt changes documented

---

## Out of Scope

Do NOT modify without explicit request:
- `.github/workflows/` files
- CI/CD configuration
- Docker build behavior
- Existing tests (removal/disabling)

---

> **Full agent documentation**: [docs/agent/README.md](../docs/agent/README.md)
