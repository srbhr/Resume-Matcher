# Repository Guidelines

## Table of Contents

- [Documentation](#documentation)
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

All project documentation is located in the `docs/` folder:

| Document | Description |
|----------|-------------|
| [backend-guide.md](docs/backend-guide.md) | Backend architecture, modules, and API endpoints |
| [docker-ollama.md](docs/docker-ollama.md) | Docker + Ollama setup guide |
| [frontend-workflow.md](docs/frontend-workflow.md) | User flow, page routes, and component architecture |
| [front-end-apis.md](docs/front-end-apis.md) | API contract between frontend and backend |
| [style-guide.md](docs/style-guide.md) | Swiss International Style design system |
| [backend-architecture.md](docs/backend-architecture.md) | Detailed backend architecture diagrams |
| [frontend-architecture.md](docs/frontend-architecture.md) | Detailed frontend architecture diagrams |
| [api-flow-maps.md](docs/api-flow-maps.md) | API request/response flow diagrams |
| [design-system.md](docs/design-system.md) | Extended design system documentation |
| [template-system.md](docs/template-system.md) | Resume template system documentation |
| [pdf-template-guide.md](docs/pdf-template-guide.md) | **PDF rendering & template editing guide** |
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
- **Textarea Enter Key**: All textareas in forms should include `onKeyDown` with `e.stopPropagation()` for Enter key to ensure newlines work correctly:
  ```tsx
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };
  ```

### Backend (Python/FastAPI)
- Python 3.11+, 4-space indents, type hints on all functions.
- Async functions for I/O operations (database, LLM calls).
- Mirror patterns in `app/services/improver.py` for new services.
- Pydantic models for all request/response schemas.
- Prompts go in `app/prompts/templates.py`.
- **Error Handling**: Log detailed errors server-side, return generic messages to clients:
  ```python
  except Exception as e:
      logger.error(f"Operation failed: {e}")
      raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
  ```
- **Race Conditions**: Use `asyncio.Lock()` for shared resource initialization (see `app/pdf.py` for example).
- **Mutable Defaults**: Always use `copy.deepcopy()` when assigning mutable default values to avoid shared state bugs.

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
- **API Key Handling**: API keys are passed directly to `litellm.acompletion()` via the `api_key` parameter (not via `os.environ`) to avoid race conditions in async contexts.
- **JSON Mode**: The `complete_json()` function automatically enables `response_format={"type": "json_object"}` for providers that support it (OpenAI, Anthropic, Gemini, DeepSeek, and major OpenRouter models).
- **Retry Logic**: JSON completions include 2 automatic retries with progressively lower temperature (0.1 → 0.0) to improve reliability.
- **JSON Extraction**: Robust bracket-matching algorithm in `_extract_json()` handles malformed responses, markdown code blocks, and edge cases. Includes infinite recursion protection when content starts with `{` but matching fails.
- **Error Handling Pattern**: LLM functions log detailed errors server-side but return generic messages to clients to avoid exposing internal details. Example:
  ```python
  except Exception as e:
      logger.error(f"LLM completion failed: {e}")
      raise ValueError("LLM completion failed. Please check your API configuration.")
  ```
- **Adding Prompts**: Add new prompt templates to `apps/backend/app/prompts/templates.py`. Keep prompts simple and direct—avoid complex escaping.
- **Prompt Guidelines**:
  - Use `{variable}` for substitution (single braces)
  - Include example JSON schemas for structured outputs
  - Keep instructions concise: "Output ONLY the JSON object, no other text"
- **Provider Configuration**: Users configure their preferred AI provider via the Settings page (`/settings`) or `PUT /api/v1/config/llm-api-key`.
- **Health Checks**: The `/api/v1/health` endpoint validates LLM connectivity. Note: Docker health checks must use `/api/v1/health` (not `/health`).
- **Timeouts**: All LLM calls have configurable timeouts (30s for health checks, 120s for completions, 180s for JSON operations).

## Custom Sections System

The application supports dynamic resume sections with full customization.

### Section Types
| Type | Description | Example Uses |
|------|-------------|--------------|
| `personalInfo` | Special type for header (always first) | Name, contact details |
| `text` | Single text block | Summary, objective, statement |
| `itemList` | Array of items with title, subtitle, years, description | Experience, projects, publications |
| `stringList` | Simple array of strings | Skills, languages, hobbies |

### Section Features
- **Rename sections**: Change display names (e.g., "Education" → "Academic Background")
- **Reorder sections**: Up/down buttons to change section order
- **Hide sections**: Toggle visibility (hidden sections still editable, just not in PDF)
- **Delete sections**: Remove custom sections entirely
- **Add custom sections**: Create new sections with any name and type

### Section Controls (UI)
Each section (except Personal Info) has these controls in the header:
| Control | Icon | Function |
|---------|------|----------|
| Visibility | 👁 Eye / EyeOff | Toggle show/hide in PDF preview |
| Move Up | ⬆ ChevronUp | Move section earlier in order |
| Move Down | ⬇ ChevronDown | Move section later in order |
| Rename | ✏️ Pencil | Edit section display name |
| Delete | 🗑 Trash | Hide (default) or delete (custom) |

### Hidden Section Behavior
- Hidden sections appear in the form with:
  - Dashed border and 60% opacity
  - "Hidden from PDF" badge (amber)
- Hidden sections are still editable
- Only PDF/preview hides them (uses `getSortedSections` which filters by visibility)
- Form shows all sections (uses `getAllSections`)

### Key Files
| File | Purpose |
|------|---------|
| `apps/backend/app/schemas/models.py` | `SectionType`, `SectionMeta`, `CustomSection` models |
| `apps/frontend/lib/utils/section-helpers.ts` | Section management utilities (`getAllSections`, `getSortedSections`) |
| `apps/frontend/components/builder/section-header.tsx` | Section controls UI with visibility toggle |
| `apps/frontend/components/builder/add-section-dialog.tsx` | Add custom section dialog |
| `apps/frontend/components/builder/resume-form.tsx` | Dynamic form rendering with all sections |
| `apps/frontend/components/resume/dynamic-resume-section.tsx` | Renders custom sections in templates |

### Data Structure
```typescript
interface ResumeData {
  // ... existing fields (personalInfo, summary, etc.)
  sectionMeta?: SectionMeta[];  // Section order, names, visibility
  customSections?: Record<string, CustomSection>;  // Custom section data
}
```

### Migration
Existing resumes are automatically migrated via lazy normalization - default section metadata is added when a resume is fetched if `sectionMeta` is missing.

**Important**: The `normalize_resume_data()` function uses `copy.deepcopy(DEFAULT_SECTION_META)` to avoid shared mutable reference bugs. Always use deep copies when assigning default mutable values.

---

## Resume Template Settings

The application supports multiple resume templates with extensive formatting controls.

### Template Types
| Template | Description |
|----------|-------------|
| `swiss-single` | Traditional single-column layout with maximum content density |
| `swiss-two-column` | 65%/35% split with experience in main column, skills in sidebar |

### Formatting Controls
| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Margins | 5-25mm | 8mm | Page margins |
| Section Spacing | 1-5 | 3 | Gap between major sections |
| Item Spacing | 1-5 | 2 | Gap between items within sections |
| Line Height | 1-5 | 3 | Text line height |
| Base Font Size | 1-5 | 3 | Overall text scale (11-16px) |
| Header Scale | 1-5 | 3 | Name/section header size multiplier |
| Header Font | serif/sans-serif/mono | serif | Font family for headers |
| Body Font | serif/sans-serif/mono | sans-serif | Font family for body text |
| Compact Mode | boolean | false | Apply 0.6x spacing multiplier (spacing only; margins unchanged) |
| Contact Icons | boolean | false | Show icons next to contact info |

### Key Files
| File | Purpose |
|------|---------|
| `apps/frontend/lib/types/template-settings.ts` | Type definitions, defaults, CSS variable mapping |
| `apps/frontend/app/(default)/css/globals.css` | CSS custom properties for resume styling |
| `apps/frontend/components/builder/formatting-controls.tsx` | UI controls for template settings |
| `apps/frontend/components/resume/resume-single-column.tsx` | Single column template |
| `apps/frontend/components/resume/resume-two-column.tsx` | Two column template |

### CSS Variables
Templates use CSS custom properties for styling:
- `--section-gap`, `--item-gap`, `--line-height` - Spacing
- `--font-size-base`, `--header-scale`, `--section-header-scale` - Typography
- `--header-font` - Header font family
- `--body-font` - Body text font family
- `--margin-top/bottom/left/right` - Page margins
Templates should use the `resume-*` helper classes in `apps/frontend/app/(default)/css/globals.css` to ensure all spacing and typography respond to template settings.
Formatting controls include an "Effective Output" summary that reflects compact-mode adjustments for spacing/line-height.

---

## Internationalization (i18n)

The application supports multi-language UI and content generation.

### Supported Languages
| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English |
| `es` | Spanish | Español |
| `zh` | Chinese (Simplified) | 中文 |
| `ja` | Japanese | 日本語 |

### Two Language Settings
1. **UI Language** - Interface text (buttons, labels, navigation)
2. **Content Language** - LLM-generated content (resumes, cover letters)

Both are configured independently in the Settings page.

### How It Works
- **UI translations**: Simple JSON import approach, no external dependencies
- **Content generation**: Backend receives language, passes to LLM prompts via `{output_language}`
- **Existing content** in database remains in original language

### Key Files
| File | Purpose |
|------|---------|
| `apps/frontend/messages/*.json` | UI translation files (en, es, zh, ja) |
| `apps/frontend/lib/i18n/translations.ts` | `useTranslations` hook |
| `apps/frontend/lib/context/language-context.tsx` | LanguageProvider (UI + content) |
| `apps/backend/app/prompts/templates.py` | LLM prompts with `{output_language}` |

### Using Translations
```typescript
import { useTranslations } from '@/lib/i18n';

const { t } = useTranslations();
<button>{t('common.save')}</button>
```

### Storage
| Key | Purpose |
|-----|---------|
| `resume_matcher_ui_language` | UI language (localStorage only) |
| `resume_matcher_content_language` | Content language (localStorage + backend) |

### Adding a New Language
1. Create `apps/frontend/messages/{code}.json` with all translations
2. Add locale to `apps/frontend/i18n/config.ts`
3. Add language name to `apps/backend/app/prompts/templates.py`
4. Update `SUPPORTED_LANGUAGES` in backend config router

---

## Resume Enrichment Feature

The application includes an AI-powered resume enrichment feature that helps users improve their master resume with more detailed content.

### How It Works
1. User clicks "Enhance Resume" on the master resume page
2. AI analyzes the resume and identifies weak/generic descriptions
3. User answers targeted questions (max 6 questions total) about their experience
4. AI generates additional bullet points based on user answers
5. New bullets are **added** to existing content (not replaced)

### Key Design Decisions
- **Maximum 6 questions**: To avoid overwhelming users, the AI generates at most 6 questions across all items
- **Additive enhancement**: Original bullet points are preserved; new enhanced bullets are appended after them
- **Question prioritization**: AI prioritizes the most impactful questions that will yield the best improvements

### Key Files
| File | Purpose |
|------|---------|
| `apps/backend/app/prompts/enrichment.py` | AI prompts for analysis and enhancement |
| `apps/backend/app/routers/enrichment.py` | API endpoints for enrichment workflow |
| `apps/frontend/hooks/use-enrichment-wizard.ts` | React state management for wizard flow |
| `apps/frontend/components/enrichment/*.tsx` | UI components for enrichment modal |

### API Endpoints
| Endpoint | Description |
|----------|-------------|
| `POST /enrichment/analyze/{resume_id}` | Analyze resume and generate questions |
| `POST /enrichment/enhance` | Generate enhanced descriptions from answers |
| `POST /enrichment/apply/{resume_id}` | Apply enhancements to resume |

---

## JD Match Feature

The Resume Builder includes a "JD Match" tab that shows how well a tailored resume matches the original job description.

### How It Works
1. User tailors a resume against a job description
2. Opens the tailored resume in the Builder
3. "JD MATCH" tab appears (only for tailored resumes)
4. Shows side-by-side comparison:
   - **Left panel**: Original job description (read-only)
   - **Right panel**: Resume with matching keywords highlighted in yellow

### Features
- **Keyword extraction**: Extracts significant keywords from JD (filters common stop words)
- **Case-insensitive matching**: Matches keywords regardless of case
- **Match statistics**: Shows total keywords, matches found, and match percentage
- **Color-coded percentage**: Green (≥50%), yellow (≥30%), red (<30%)

### Key Files
| File | Purpose |
|------|---------|
| `apps/frontend/lib/utils/keyword-matcher.ts` | Keyword extraction and matching utilities |
| `apps/frontend/components/builder/jd-comparison-view.tsx` | Main split-view component |
| `apps/frontend/components/builder/jd-display.tsx` | Read-only JD display |
| `apps/frontend/components/builder/highlighted-resume-view.tsx` | Resume with keyword highlighting |
| `apps/backend/app/routers/resumes.py` | `GET /{resume_id}/job-description` endpoint |

### API Endpoint
| Endpoint | Description |
|----------|-------------|
| `GET /resumes/{resume_id}/job-description` | Fetch JD used to tailor a resume |
