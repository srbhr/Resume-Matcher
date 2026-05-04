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

## App-Specific Behaviors

### `.env` is loaded by absolute path
`apps/backend/app/config.py` defines `ENV_FILE_PATH = <repo>/apps/backend/.env`
and passes it to `SettingsConfigDict(env_file=str(ENV_FILE_PATH), ...)`. This
means `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, etc. are picked up regardless
of the CWD the backend was launched from. **Don't change `env_file` back to
the bare `".env"` string** — that breaks env loading when `uvicorn` is started
outside `apps/backend/`.

### Resume Download writes to a backend-configured path
Clicking **Download Resume** on `app/(default)/resumes/[id]/page.tsx` does NOT
trigger a browser download. It POSTs to `/api/v1/resumes/{id}/save-pdf`, which
renders the PDF and writes it to the directory stored under `download_path` in
`apps/backend/data/config.json`. The user configures this path in
**Settings → Resume Download Path**.

Relevant pieces:
- `apps/backend/app/routers/config.py` — `GET/PUT /config/download-path`
  (validates existence + writability via a tempfile probe).
- `apps/backend/app/routers/resumes.py` — `POST /{resume_id}/save-pdf`
  (`_build_print_url_and_margins` is the shared helper between this and the
  legacy GET `/pdf` endpoint, which is still used by the builder flow).
- `apps/backend/app/schemas/models.py` — `DownloadPathRequest` /
  `DownloadPathResponse`.
- `apps/frontend/lib/api/resume.ts` — `saveResumePdfToPath()`.
- `apps/frontend/lib/api/config.ts` — `fetchDownloadPath` /
  `updateDownloadPath`.
- `apps/frontend/app/(default)/settings/page.tsx` — UI section.
- `apps/frontend/app/(default)/resumes/[id]/page.tsx` — `handleDownload()`.

The builder page (`components/builder/resume-builder.tsx`) still uses the old
browser-blob `downloadResumePdf` flow — leave it alone unless asked. The
"download to disk" change applies only to the tailored-resume viewer.

### Docker: download path lives inside the container
Because the backend runs in the container, the path saved in Settings must
exist *in the container*. To save to the host, bind-mount a host directory
(see the commented example in `docker-compose.yml`) and enter the container
path in Settings. This is the most common gotcha when testing the feature
under Docker.

### Anthropic Claude 4.x rejects non-default `temperature`
Anthropic's Claude 4.x models (opus-4-x, sonnet-4-x, haiku-4-x) return
`temperature is deprecated for this model` for any non-default value. LiteLLM's
`drop_params=True` does **not** catch this — it's a server-side deprecation,
not a client-side capability gap LiteLLM tracks. The gate lives in
`apps/backend/app/llm.py::_supports_temperature(model_name, temperature)`,
which queries LiteLLM's registry first and then applies provider-specific
fallbacks — including the `claude-opus-4` / `claude-sonnet-4` /
`claude-haiku-4` substring deny-list and a Moonshot `kimi-k2.6 != 1.0`
restriction. `complete()` gates the `temperature` kwarg behind this check;
`complete_json()` calls `_get_retry_temperature(model_name, attempt)` which
returns `None` to signal "skip the field". **When adding new LLM call sites,
route through `complete`/`complete_json` rather than calling
`router.acompletion` directly** so the gate applies. If a future Anthropic
release lifts the deprecation, drop the matching pattern from the tuple at
the bottom of `_supports_temperature`.

### Bullet-length cap in prompts (25 words)
Every prompt that emits or rewrites resume bullets carries a "≤25 words, one
sentence, no semicolons" rule:
- `apps/backend/app/prompts/templates.py` — `IMPROVE_RESUME_PROMPT_NUDGE`,
  `_KEYWORDS`, `_FULL`, and `DIFF_IMPROVE_PROMPT`.
- `apps/backend/app/prompts/enrichment.py` — `ENHANCE_DESCRIPTION_PROMPT`,
  `REGENERATE_ITEM_PROMPT`.
- `apps/backend/app/prompts/refinement.py` — `KEYWORD_INJECTION_PROMPT`,
  `VALIDATION_POLISH_PROMPT`.

Cover-letter and outreach prompts intentionally exclude this cap (they're
prose, not bullets). If you add a new bullet-generating prompt, add the same
rule. There's no server-side enforcement — relying on the LLM to obey is
intentional; a hard truncate would chop mid-sentence and lose metrics.

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
