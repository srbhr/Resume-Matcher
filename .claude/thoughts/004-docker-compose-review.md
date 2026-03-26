# Code Review: docker-compose.yml

**Reviewed:** 2026-03-04
**Context:** Added commented `CORS_ORIGINS` override to docker-compose.yml

**File:** `docker-compose.yml`

---

## MEDIUM

### 1. Comment describes format incorrectly

**Lines:** 32–33

```yaml
# CORS origins (comma-separated JSON list), auto-includes FRONTEND_BASE_URL
#- CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

"comma-separated JSON list" is contradictory terminology:

- **JSON arrays** use `["a","b"]` syntax (which is what the example shows)
- **Comma-separated values** are plain text like `a,b`
- pydantic-settings v2 parses `list[str]` fields using **JSON only** — comma-separated will crash

The example format `["http://localhost:3000","http://127.0.0.1:3000"]` IS correct for pydantic-settings. Docker-compose passes the value as a literal string to the container, and pydantic parses the JSON. This works.

**Fix — clarify the comment:**

```yaml
# CORS origins (JSON array format). FRONTEND_BASE_URL is auto-included.
#- CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

---

## VERIFIED OK

### 2. YAML formatting

- Proper 2-space indentation
- Valid comment placement
- Correct list syntax for environment variables
- Valid structure overall

### 3. Comment placement

The `CORS_ORIGINS` comment is placed after the last LLM config variable and before the `restart` directive, which is a logical grouping (all env vars together). The comment correctly notes that `FRONTEND_BASE_URL` is auto-included.
