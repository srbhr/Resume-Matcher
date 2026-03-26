# Code Review: Python Config — `effective_cors_origins`

**Reviewed:** 2026-03-04
**Context:** Added `effective_cors_origins` property to `Settings` class to auto-include `frontend_base_url` in CORS origins for production deployments.

**Files:**
- `apps/backend/app/config.py` (lines 170–176)
- `apps/backend/app/main.py` (line 63)

---

## MEDIUM

### 1. Whitespace-only `FRONTEND_BASE_URL` passes truthiness check

**File:** `config.py`, line 174

```python
if self.frontend_base_url and self.frontend_base_url not in origins:
    origins.append(self.frontend_base_url)
```

The truthiness check passes for any non-empty string, including `"   "`. A whitespace-only env var like `FRONTEND_BASE_URL="   "` would inject `"   "` into the allowed origins list. CORSMiddleware performs exact string matching, so this would never match a real browser `Origin` header, but it signals a misconfiguration that goes undetected.

The existing validators for `llm_provider` (line 136) and `log_llm` (line 144) both use `.strip()` to guard against this. `frontend_base_url` has no such validator.

**Fix — inline guard:**

```python
url = self.frontend_base_url.strip()
if url and url not in origins:
    origins.append(url)
```

**Or add a field_validator:**

```python
@field_validator("frontend_base_url", mode="before")
@classmethod
def normalize_frontend_base_url(cls, v: Any) -> str:
    if isinstance(v, str):
        return v.strip()
    return v
```

---

### 2. Trailing slash creates a dead duplicate entry

**File:** `config.py`, line 174

If `FRONTEND_BASE_URL=http://localhost:3000/` (trailing slash), the `not in origins` check fails to match `"http://localhost:3000"` (no slash), so both strings end up in the list:

```python
['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3000/']
```

Per RFC 6454, browsers send the `Origin` header as scheme + authority only (e.g., `http://localhost:3000`), never with a trailing slash or path. CORSMiddleware performs exact string matching, so `"http://localhost:3000/"` will **never** match any real browser request.

This doesn't cause a security hole, but the CORS configuration will silently fail for the intended URL if the user sets `FRONTEND_BASE_URL` with a trailing slash and forgets to include the bare URL in `CORS_ORIGINS`.

**Fix — strip trailing slashes:**

```python
@property
def effective_cors_origins(self) -> list[str]:
    """CORS origins including frontend_base_url for production deployments."""
    origins = list(self.cors_origins)
    url = self.frontend_base_url.strip().rstrip("/")
    if url and url not in origins:
        origins.append(url)
    return origins
```

---

### 3. `CORS_ORIGINS` env var requires strict JSON array format

**File:** `config.py`, lines 165–168

```python
cors_origins: list[str] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
```

pydantic-settings v2 parses `list[str]` fields from environment variables using JSON. Only JSON array syntax is accepted:

| Env var value | Result |
|---|---|
| `["http://a.com","http://b.com"]` | Accepted |
| `http://a.com,http://b.com` | **`SettingsError` crash at startup** |
| `http://a.com` | **`SettingsError` crash at startup** |

The `.env.example` correctly documents JSON format, but there is no `field_validator` that gives a friendly error message. A user who sets `CORS_ORIGINS=http://localhost:3000,http://localhost:4000` will see a raw `SettingsError`.

**Fix — add a friendly validator:**

```python
@field_validator("cors_origins", mode="before")
@classmethod
def parse_cors_origins(cls, v: Any) -> Any:
    if isinstance(v, str):
        stripped = v.strip()
        if not stripped.startswith("["):
            raise ValueError(
                f"CORS_ORIGINS must be a JSON array, e.g. "
                f'["http://localhost:3000"]. Got: {stripped!r}'
            )
    return v
```

---

## LOW

### 4. Source list is mutable

**File:** `config.py`, line 173

```python
origins = list(self.cors_origins)  # shallow copy
```

The `list()` call creates a new list, so mutations of the returned list don't affect `self.cors_origins`. However, pydantic v2 doesn't freeze `list[str]` fields — `settings.cors_origins` returns the same mutable list on every access (`settings.cors_origins is settings.cors_origins` is `True`). Any code holding a reference that mutates it directly would corrupt future calls.

No caller does this currently. `list()` is adequate for the current usage pattern.

---

## INFO / VERIFIED OK

### 5. `@property` is called once — no per-request cost

The call site in `main.py` is at module level:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.effective_cors_origins,  # evaluated ONCE at import
)
```

CORSMiddleware stores `allow_origins` in `self.allow_origins` during `__init__`. The property is never called again per-request. Confirmed by inspecting starlette source.

### 6. `@property` on pydantic `BaseSettings` works correctly

In pydantic v2, a plain `@property` is a standard Python descriptor. It's not part of `model_fields`, doesn't appear in `model_dump()` or `model_json_schema()`, and doesn't interfere with validation. This is consistent with the existing `db_path` and `config_path` properties in the same class.

If ever needed in serialized output, it would require `@computed_field` from pydantic v2.

### 7. Type consistency

Return type `list[str]` is compatible with `CORSMiddleware`'s expected `Sequence[str]`. No issue.

### 8. Pattern consistency

The `@property` approach is already established in this file for `db_path` (line 181) and `config_path` (line 187). Stylistically consistent.
