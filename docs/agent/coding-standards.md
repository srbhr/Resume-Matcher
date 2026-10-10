# Coding Standards

> **Frontend and backend coding conventions.**

## Frontend (TypeScript/React)

### Design System

All UI changes MUST follow the **Swiss International Style**. The full design system is published as a portable pack at [`docs/portable/swiss-design-system/`](../portable/swiss-design-system/README.md). The non-negotiable basics:

- Use `font-serif` for headers, `font-mono` (the label face, rendered as Space Grotesk) for labels and metadata, `font-sans` for body text
- Use the semantic color tokens, never raw hex or Tailwind palette scales. The full table, with contrast figures, is in [`tokens.md`](../portable/swiss-design-system/tokens.md). Key values: Canvas `#F0F0E8`, Ink `#000000`, body text `ink-soft` `#3D424C`, Steel `#696D75` (never on a `panel` fill), `primary` `#1D4ED8`, `success` `#127E3B`, `destructive` `#D61E21`, `warning` fill `#F97316` (ink text only) with `warning-text` `#B44F02` for orange labels and icons
- Components: `rounded-none` with 1px ink borders on controls, fields, cards and dialogs (2px on alerts), hard shadows by role (`shadow-sw-sm` controls, `shadow-sw-default` cards and menus, `shadow-sw-lg` dialogs), and the shared primitives in `components/ui/`
- Motion is feedback only: `import { m } from 'motion/react'`, never `motion.*`
- See [`tokens.md`](../portable/swiss-design-system/tokens.md), [`components.md`](../portable/swiss-design-system/components.md), and [`anti-patterns.md`](../portable/swiss-design-system/anti-patterns.md) for the full rules

### Naming Conventions

- Use PascalCase for components
- Use camelCase for helpers
- Tailwind utility classes for styling

### Textarea Enter Key Fix

All textareas in forms should include `onKeyDown` with `e.stopPropagation()` for Enter key to ensure newlines work correctly:

```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};
```

### Before Committing

1. Run Prettier: `npm run format`
2. Run linter: `npm run lint`
3. Run the Swiss guard on what you touched: `npm run guard -- <path>` (see [`apps/frontend/CLAUDE.md`](../../apps/frontend/CLAUDE.md))

## Backend (Python/FastAPI)

### General Rules

- Python 3.11+
- 4-space indents
- Type hints on ALL functions
- Async functions for I/O operations (database, LLM calls)
- Pydantic models for all request/response schemas
- Prompts go in `app/prompts/templates.py`

### Error Handling

Log detailed errors server-side, return generic messages to clients:

```python
except Exception as e:
    logger.error(f"Operation failed: {e}")
    raise HTTPException(status_code=500, detail="Operation failed. Please try again.")
```

### Race Conditions

Use `asyncio.Lock()` for shared resource initialization (see `app/pdf.py` for example).

### Mutable Defaults

Always use `copy.deepcopy()` when assigning mutable default values to avoid shared state bugs:

```python
# Correct
import copy
data = copy.deepcopy(DEFAULT_DATA)

# Incorrect - shared state bug
data = DEFAULT_DATA
```

### New Service Pattern

Mirror patterns in `app/services/improver.py` for new services.

### Before Committing

1. Run formatter: `uv run ruff format`
2. Run linter: `uv run ruff check`
