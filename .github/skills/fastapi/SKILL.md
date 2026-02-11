---
name: fastapi
description: |
  Build Python APIs with FastAPI, Pydantic v2, and async patterns. Covers project structure, JWT auth, validation, database integration, and 7 documented error preventions. Use when creating Python APIs, implementing auth, or troubleshooting 422 validation, CORS, async blocking, or schema errors.
---

# FastAPI Skill

Production-tested patterns for FastAPI with Pydantic v2.

**Versions** (verified January 2026): FastAPI 0.128.0, Pydantic 2.11.7, SQLAlchemy 2.0.30, Uvicorn 0.35.0

## Critical Rules

### Always Do

1. **Separate Pydantic schemas from SQLAlchemy models**
2. **Use async for I/O operations**
3. **Validate with Pydantic `Field()`**
4. **Use dependency injection** via `Depends()`
5. **Return proper status codes** (201 create, 204 delete)

### Never Do

1. **Never use blocking calls in async routes** (no `time.sleep()`)
2. **Never put business logic in routes** (use service layer)
3. **Never hardcode secrets**
4. **Never skip validation**
5. **Never use `*` in CORS origins for production**

## 7 Known Issues

| # | Issue | Fix |
|---|-------|-----|
| 1 | Form Data loses `field_set` metadata | Use individual fields or JSON body |
| 2 | BackgroundTasks silently overwritten | Don't mix `BackgroundTasks` + `Response(background=)` |
| 3 | Optional Literal Form fields break | Omit field instead of passing None |
| 4 | `Json` type with Form data fails | Accept as `str`, parse manually |
| 5 | `Annotated` ForwardRef breaks OpenAPI | Don't use `__future__ annotations` in routes |
| 6 | Union path params always `str` | Avoid `int \| str` in path params |
| 7 | `ValueError` in validators returns 500 | Use `Field(gt=0)` constraints instead |

## Resume Matcher Specific

- **Type hints** on ALL functions (non-negotiable)
- **`copy.deepcopy()`** for mutable defaults
- **Log errors server-side**, generic messages to clients
- **API keys** via `api_key=` parameter, not `os.environ`
- Project uses **TinyDB** (JSON file storage), not SQLAlchemy

## Common Error Fixes

### 422 Unprocessable Entity
Check `/docs` endpoint, verify JSON matches schema, check required vs optional fields.

### CORS Errors
```python
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
```

### Async Blocking
Use `async def` + `await` for I/O. Use plain `def` for CPU-bound (runs in thread pool). Use `run_in_executor` for blocking calls in async routes.

## Full Reference

Complete skill with all code examples: `.claude/skills/fastapi/SKILL.md`
