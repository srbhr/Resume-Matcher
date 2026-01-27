# Coding Standards

> **Frontend and backend coding conventions.**

## Frontend (TypeScript/React)

### Design System

All UI changes MUST follow the **Swiss International Style** in [style-guide.md](design/style-guide.md):

- Use `font-serif` for headers, `font-mono` for metadata, `font-sans` for body text
- Color palette: `#F0F0E8` (Canvas), `#000000` (Ink), `#1D4ED8` (Hyper Blue), `#15803D` (Signal Green), `#F97316` (Alert Orange), `#DC2626` (Alert Red), `#4B5563` (Steel Grey)
- Components: `rounded-none` with 1px black borders and hard shadows

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
