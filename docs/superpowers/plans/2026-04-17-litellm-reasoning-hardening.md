# LiteLLM Reasoning Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **User-specific overrides:** Per user memory, this plan does NOT include test-writing or `npm run lint`/`npm run format` steps. Verification is done via Python import checks, backend process smoke tests, and visual inspection of diffs. The user will run linters and manual UI tests.

**Goal:** Make LiteLLM integration robust across reasoning and non-reasoning models, unblock OpenAI-compatible local endpoints, and add a `reasoning_effort` control in Settings — with a silent auto-migration preserving existing gpt-5 behavior.

**Architecture:** Module-level LiteLLM flags (`drop_params`, `modify_params`) replace hardcoded provider/model compatibility branches. A new `reasoning_effort` setting flows env → config.json → LLMConfig → kwargs. `_extract_choice_text` gains a reasoning-content fallback. `_normalize_api_base` preserves `/v1` for OpenAI. Frontend adds a dropdown and a "Model thinking" display block. Auto-migration on first config load preserves old gpt-5 behavior for existing users.

**Tech Stack:** FastAPI, pydantic-settings, LiteLLM Python SDK v1.63+, Next.js 16, React 19, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-04-17-litellm-reasoning-hardening-design.md`

---

## Phase A — Backend core

### Task 1: Enable `drop_params` and `modify_params` at LiteLLM module init

**Files:**
- Modify: `apps/backend/app/llm.py:1-30`

- [ ] **Step 1: Add the flags right after the `import litellm` block**

Change the top of the file so that immediately after `_configure_litellm_logging()` is called, we set the two flags. Place them at module scope so they apply to every subsequent call.

```python
import litellm
from litellm import Router
from litellm.router import RetryPolicy
from pydantic import BaseModel

from app.config import settings

LITELLM_LOGGER_NAMES = ("LiteLLM", "LiteLLM Router", "LiteLLM Proxy")


def _configure_litellm_logging() -> None:
    """Align LiteLLM logger levels with application settings."""
    numeric_level = getattr(logging, settings.log_llm, logging.WARNING)
    for logger_name in LITELLM_LOGGER_NAMES:
        logging.getLogger(logger_name).setLevel(numeric_level)


_configure_litellm_logging()

# Let LiteLLM drop provider-unsupported params (reasoning_effort, non-default
# temperature, etc.) instead of raising UnsupportedParamsError. This replaces
# the hardcoded per-model compatibility branches this module used to carry.
litellm.drop_params = True

# Let LiteLLM auto-drop `thinking_blocks` from assistant messages when required
# for a given turn (e.g., tool-call turns missing the blocks). Defensive; no
# current code path sends thinking, but future-proofs the Router.
litellm.modify_params = True
```

- [ ] **Step 2: Verify the module still imports**

Run from `apps/backend`:

```bash
uv run python -c "import app.llm; print('ok')"
```

Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "feat(backend): enable litellm.drop_params and modify_params globally

Replaces per-model hardcoded compatibility branches in later commits. With
drop_params=True, LiteLLM silently drops provider-unsupported params (like
reasoning_effort=minimal on non-supporting models) instead of raising
UnsupportedParamsError."
```

---

### Task 2: Add `reasoning_effort` to Settings and LLMConfig

**Files:**
- Modify: `apps/backend/app/config.py:149-153`
- Modify: `apps/backend/app/llm.py:38-44` (LLMConfig model)
- Modify: `apps/backend/.env.example:42-45`

- [ ] **Step 1: Extend the `Literal` import and add the field to Settings**

Edit `apps/backend/app/config.py`. Add a `reasoning_effort` field in the Server Configuration block, right after `reload`:

```python
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False
    log_level: Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"] = "INFO"
    frontend_base_url: str = "http://localhost:3000"

    # Reasoning effort for models that support it (OpenAI gpt-5 family, Anthropic
    # Claude 3.7+, DeepSeek R1, etc.). None means "do not send the param" — the
    # default for maximum compatibility.
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None
```

- [ ] **Step 2: Add the field to `LLMConfig` in `llm.py`**

Edit `apps/backend/app/llm.py` around the `LLMConfig` definition (currently lines 38-44):

```python
class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None
    reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None
```

Also add `Literal` to the `typing` import at the top of `llm.py`:

```python
from typing import Any, Literal
```

- [ ] **Step 3: Document the env var in `.env.example`**

Edit `apps/backend/.env.example` inside the Server Configuration block:

```
HOST=0.0.0.0
PORT=8000
# Set RELOAD=true for `uv run app` to auto-reload on file changes (dev only)
RELOAD=false
# Reasoning effort for models that support it: minimal | low | medium | high
# Leave unset (or blank) for maximum provider compatibility. LiteLLM will
# drop this parameter for providers that don't support it.
# REASONING_EFFORT=
LOG_LEVEL=INFO
LOG_LLM=WARNING
```

- [ ] **Step 4: Verify the Settings class parses**

```bash
uv run python -c "from app.config import settings; print(settings.reasoning_effort)"
```

Expected: prints `None`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/app/config.py apps/backend/app/llm.py apps/backend/.env.example
git commit -m "feat(backend): add reasoning_effort setting and LLMConfig field

Optional env/config/request-level control for reasoning-capable models. Defaults
to None; LiteLLM's drop_params handles providers that reject the param, so it is
safe to always forward when set."
```

---

### Task 3: Remove `_get_reasoning_effort` and `_supports_temperature`, wire up the new config field

**Files:**
- Modify: `apps/backend/app/llm.py:371-394` (delete both helpers)
- Modify: `apps/backend/app/llm.py:420-435` (health-check kwargs)
- Modify: `apps/backend/app/llm.py:500-550` (complete() kwargs)
- Modify: `apps/backend/app/llm.py:748-800` (complete_json() kwargs)
- Modify: `apps/backend/app/llm.py:242-257` (get_llm_config)

- [ ] **Step 1: Delete both helper functions**

Remove the entire block currently at `apps/backend/app/llm.py:371-394`:

```python
def _supports_temperature(provider: str, model: str) -> bool:
    """..."""
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return False
    return True


def _get_reasoning_effort(provider: str, model: str) -> str | None:
    """..."""
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return "minimal"
    return None
```

After deletion, the lines between `get_model_name` / Router helpers and `check_llm_health` should be contiguous.

- [ ] **Step 2: Update `get_llm_config()` to load `reasoning_effort` from config.json**

Edit `apps/backend/app/llm.py` around lines 242-257:

```python
def get_llm_config() -> LLMConfig:
    """Get current LLM configuration.

    Priority for api_key: top-level api_key > api_keys[provider] > env/settings
    Priority for reasoning_effort: config.json > env/settings
    """
    stored = _load_stored_config()
    provider = stored.get("provider", settings.llm_provider)
    api_key = resolve_api_key(stored, provider)

    raw_re = stored.get("reasoning_effort", settings.reasoning_effort)
    # Normalize empty string to None — user may have explicitly cleared it.
    reasoning_effort = raw_re if raw_re else None

    return LLMConfig(
        provider=provider,
        model=stored.get("model", settings.llm_model),
        api_key=api_key,
        api_base=stored.get("api_base", settings.llm_api_base),
        reasoning_effort=reasoning_effort,
    )
```

- [ ] **Step 3: Update `check_llm_health` to use `config.reasoning_effort`**

Inside the `try:` block of `check_llm_health`, replace the `reasoning_effort` handling (currently lines 430-433):

```python
        kwargs: dict[str, Any] = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 64,
            "api_key": config.api_key,
            "api_base": _normalize_api_base(config.provider, config.api_base),
            "timeout": LLM_TIMEOUT_HEALTH_CHECK,
        }
        if config.reasoning_effort:
            kwargs["reasoning_effort"] = config.reasoning_effort
```

Note: this step also bumps `max_tokens` 16 → 64 as required by the spec (Task 6 merged in to avoid re-editing the same block).

- [ ] **Step 4: Update `complete()` to use `config.reasoning_effort` and always pass temperature**

Find the kwargs block inside `complete()` (currently lines ~519-531). Replace with:

```python
    try:
        kwargs: dict[str, Any] = {
            "model": "primary",
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "timeout": LLM_TIMEOUT_COMPLETION,
        }
        if config.reasoning_effort:
            kwargs["reasoning_effort"] = config.reasoning_effort

        response = await router.acompletion(**kwargs)
```

- [ ] **Step 5: Update `complete_json()` to use `config.reasoning_effort` and always pass temperature**

Find the kwargs block inside the `for attempt in range(retries + 1):` loop of `complete_json()` (currently lines ~776-794). Replace with:

```python
        try:
            kwargs: dict[str, Any] = {
                "model": "primary",
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": _get_retry_temperature(attempt),
                "timeout": _calculate_timeout("json", max_tokens, config.provider),
            }
            if config.reasoning_effort:
                kwargs["reasoning_effort"] = config.reasoning_effort

            # Add JSON mode if supported
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await router.acompletion(**kwargs)
```

- [ ] **Step 6: Verify imports and function signatures**

```bash
uv run python -c "from app.llm import get_llm_config, check_llm_health, complete, complete_json; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "refactor(backend): delete hardcoded reasoning/temperature branches

_get_reasoning_effort and _supports_temperature exist only to work around
missing LiteLLM features that drop_params now handles. Remove them, wire the
user-controlled config.reasoning_effort into check_llm_health, complete, and
complete_json. temperature is always passed; unsupported providers drop it.

Bumps health-check max_tokens 16 -> 64 (addresses #747 case 2).

Closes #747."
```

---

### Task 4: Add thinking-model content fallback in `_extract_choice_text`

**Files:**
- Modify: `apps/backend/app/llm.py:152-190`

- [ ] **Step 1: Update `_extract_message_text` to try reasoning_content and thinking**

Replace the existing function:

```python
def _extract_message_text(message: Any) -> str | None:
    """Extract plain text from a LiteLLM message object across providers.

    Fallback order:
      1. message.content (standard)
      2. message.reasoning_content (DeepSeek R1, OpenAI o1/o3)
      3. message.thinking (Anthropic extended thinking)

    Reasoning-only responses are treated as valid content — this makes thinking
    models usable without special-casing them in every call site.
    """
    content: Any = None

    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    text = _join_text_parts(_extract_text_parts(content))
    if text:
        return text

    # Fallback to reasoning_content (DeepSeek R1, OpenAI o1/o3 via LiteLLM's
    # standardized field).
    reasoning = _safe_get(message, "reasoning_content")
    text = _join_text_parts(_extract_text_parts(reasoning))
    if text:
        return text

    # Fallback to thinking (Anthropic extended thinking).
    thinking = _safe_get(message, "thinking")
    return _join_text_parts(_extract_text_parts(thinking))
```

Note: `_safe_get` is defined at line 164-170 of the current file — the new code is consistent with existing helpers. Keep `_safe_get` where it is; move or hoist nothing.

- [ ] **Step 2: Simplify `check_llm_health` empty-content branch**

Currently `check_llm_health` has a fallback path checking `reasoning_content`/`thinking` when `content` is empty (lines 436-459). Remove it — `_extract_choice_text` now covers this. Replace:

```python
        response = await litellm.acompletion(**kwargs)
        content = _extract_choice_text(response.choices[0])
        if not content:
            # LLM-003: Empty response should mark health check as unhealthy
            logging.warning(
                "LLM health check returned empty content",
                extra={"provider": config.provider, "model": config.model},
            )
            result: dict[str, Any] = {
                "healthy": False,
                "provider": config.provider,
                "model": config.model,
                "response_model": response.model if response else None,
                "error_code": "empty_content",
                "message": "LLM returned empty response",
            }
            if include_details:
                result["test_prompt"] = _to_code_block(prompt)
                result["model_output"] = _to_code_block(None)
            return result

        result = {
            "healthy": True,
            ...
        }
```

- [ ] **Step 3: Verify the module still imports**

```bash
uv run python -c "from app.llm import _extract_choice_text, check_llm_health; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "feat(backend): extract reasoning_content as fallback for thinking models

DeepSeek R1, OpenAI o1/o3, and Anthropic extended thinking surface the answer
in reasoning_content / thinking rather than message.content. Treat both as
valid content so thinking models don't fail the health check or return empty
to complete()/complete_json(). Simplifies check_llm_health by removing its
redundant reasoning-check branch."
```

---

### Task 5: Fix `_normalize_api_base` to preserve `/v1` for OpenAI provider

**Files:**
- Modify: `apps/backend/app/llm.py:47-87`

- [ ] **Step 1: Add an inline comment clarifying the openai branch**

Replace the body of `_normalize_api_base` with this version — it is identical to the current logic EXCEPT it adds a clear explanatory note at the top and does NOT strip for `openai`:

```python
def _normalize_api_base(provider: str, api_base: str | None) -> str | None:
    """Normalize api_base for LiteLLM provider-specific expectations.

    When using proxies/aggregators, users often paste a base URL that already
    includes a version segment (e.g., `/v1`). Some LiteLLM provider handlers
    append those segments internally, which can lead to duplicated paths like
    `/v1/v1/...` and cause 404s.

    For the `openai` provider, LiteLLM uses the upstream OpenAI client which
    handles `/v1` correctly — we MUST preserve whatever the user pasted so
    that OpenAI-compatible endpoints like llama.cpp (http://localhost:8080/v1)
    round-trip intact. See issue #751.
    """
    if not api_base:
        return None

    base = api_base.strip()
    if not base:
        return None

    base = base.rstrip("/")

    # OpenAI / OpenAI-compatible: preserve the URL as-is. The OpenAI client
    # library resolves paths correctly whether the base includes /v1 or not.
    if provider == "openai":
        return base or None

    # Anthropic handler appends '/v1/messages'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/messages'.
    if provider == "anthropic" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Gemini handler appends '/v1/models/...'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/models/...'.
    if provider == "gemini" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # OpenRouter base is https://openrouter.ai/api/v1. LiteLLM appends /v1
    # internally, so strip it to avoid /v1/v1.
    if provider == "openrouter" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Ollama doesn't use /v1 paths. Strip common suffixes users might paste:
    # /v1, /api/chat, /api/generate
    if provider == "ollama":
        for suffix in ("/v1", "/api/chat", "/api/generate", "/api"):
            if base.endswith(suffix):
                base = base[: -len(suffix)].rstrip("/")
                break

    return base or None
```

- [ ] **Step 2: Update the duplicate-v1 error code logic**

The `check_llm_health` exception handler uses `/v1/v1/` as a heuristic for the duplicate-path error. With openai no longer being stripped, that heuristic is still correct — it only fires when the duplication actually occurs.

Verify the existing logic at `apps/backend/app/llm.py` around line 481:

```python
        if "404" in message and "/v1/v1/" in message:
            error_code = "duplicate_v1_path"
```

No change needed — leave as-is.

- [ ] **Step 3: Verify the module still imports and `_normalize_api_base` behaves**

```bash
uv run python -c "
from app.llm import _normalize_api_base
assert _normalize_api_base('openai', 'http://localhost:8080/v1') == 'http://localhost:8080/v1', 'openai /v1 must be preserved'
assert _normalize_api_base('openai', 'http://localhost:8080/v1/') == 'http://localhost:8080/v1', 'trailing slash only'
assert _normalize_api_base('anthropic', 'https://api.anthropic.com/v1') == 'https://api.anthropic.com', 'anthropic strips /v1'
assert _normalize_api_base('openrouter', 'https://openrouter.ai/api/v1') == 'https://openrouter.ai/api', 'openrouter strips /v1'
assert _normalize_api_base('ollama', 'http://localhost:11434/v1') == 'http://localhost:11434', 'ollama strips /v1'
print('ok')
"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "fix(backend): preserve /v1 in api_base for openai provider (#751 partial)

LiteLLM uses the upstream OpenAI client for openai-routed requests. That
client handles /v1 correctly on both sides. Stripping it broke users who
pointed at OpenAI-compatible local servers like llama.cpp. Anthropic,
Gemini, OpenRouter, and Ollama continue to strip as before — those handlers
re-append path segments internally.

Partial fix for #751; the openai_compatible dropdown entry stays for its
own PR."
```

---

### Task 6: Auto-migration for existing gpt-5 users

**Files:**
- Modify: `apps/backend/app/llm.py:242-270` (get_llm_config)

- [ ] **Step 1: Add the migration block inside `get_llm_config`**

Update the function to run a one-shot migration *before* returning the LLMConfig:

```python
_GPT5_MIGRATION_KEY = "reasoning_effort"


def get_llm_config() -> LLMConfig:
    """Get current LLM configuration.

    Priority for api_key: top-level api_key > api_keys[provider] > env/settings
    Priority for reasoning_effort: config.json > env/settings

    Runs a one-shot migration for existing gpt-5 users: if provider is openai,
    model contains 'gpt-5', and reasoning_effort is ABSENT from config.json
    (not merely empty), persist reasoning_effort='minimal' to preserve the
    behavior the old hardcoded branch provided. Users who clear the field
    explicitly (empty string) will not have it restored.
    """
    stored = _load_stored_config()
    provider = stored.get("provider", settings.llm_provider)
    model = stored.get("model", settings.llm_model)

    # One-shot migration: preserve old gpt-5 reasoning_effort behavior for
    # existing configs. Gated on absent key so users can opt out by clearing
    # the field (which persists an empty string).
    if (
        provider == "openai"
        and "gpt-5" in model.lower()
        and _GPT5_MIGRATION_KEY not in stored
    ):
        stored[_GPT5_MIGRATION_KEY] = "minimal"
        try:
            save_config_file_llm(stored)
            logging.info(
                "Migrated gpt-5 config to preserve reasoning_effort=minimal "
                "(set REASONING_EFFORT= or clear in Settings to disable)"
            )
        except Exception as e:
            # Non-fatal — retry on next call.
            logging.warning("Failed to persist gpt-5 migration: %s", e)

    api_key = resolve_api_key(stored, provider)

    raw_re = stored.get("reasoning_effort", settings.reasoning_effort)
    reasoning_effort = raw_re if raw_re else None

    return LLMConfig(
        provider=provider,
        model=model,
        api_key=api_key,
        api_base=stored.get("api_base", settings.llm_api_base),
        reasoning_effort=reasoning_effort,
    )
```

- [ ] **Step 2: Add the `save_config_file_llm` helper at the top of the module**

Add this near `_load_stored_config` (around line 201-209):

```python
def save_config_file_llm(config: dict) -> None:
    """Persist LLM config.json changes from within llm.py.

    Thin wrapper around app.config.save_config_file so llm.py doesn't need
    to re-implement path resolution.
    """
    from app.config import save_config_file as _save
    _save(config)
```

- [ ] **Step 3: Smoke test the migration logic**

```bash
uv run python -c "
import json
from pathlib import Path
from app.config import settings

# Backup existing config.json if present
cp = settings.config_path
backup = None
if cp.exists():
    backup = cp.read_text()

# Scenario: existing gpt-5 config without reasoning_effort
cp.parent.mkdir(parents=True, exist_ok=True)
cp.write_text(json.dumps({'provider': 'openai', 'model': 'gpt-5-nano'}))

from app.llm import get_llm_config
cfg = get_llm_config()
assert cfg.reasoning_effort == 'minimal', f'expected minimal, got {cfg.reasoning_effort}'

# Verify persisted
persisted = json.loads(cp.read_text())
assert persisted.get('reasoning_effort') == 'minimal'
print('migration ok')

# Restore backup
if backup is not None:
    cp.write_text(backup)
else:
    cp.unlink()
"
```

Expected: prints `migration ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/app/llm.py
git commit -m "feat(backend): auto-migrate existing gpt-5 configs to reasoning_effort=minimal

One-shot silent migration in get_llm_config: when provider=openai, model
contains 'gpt-5', and reasoning_effort key is absent from config.json
(not empty), persist reasoning_effort='minimal' so existing users retain
the behavior the removed _get_reasoning_effort hardcoding provided. Users
who clear the field in Settings (persists empty string) won't have it
restored."
```

---

### Task 7: Expose `reasoning_effort` in config API and health-check response

**Files:**
- Modify: `apps/backend/app/schemas/models.py`
- Modify: `apps/backend/app/routers/config.py`
- Modify: `apps/backend/app/llm.py` (health-check response)

- [ ] **Step 1: Identify the relevant schema models**

Read `apps/backend/app/schemas/models.py` and find the LLM-config request/response models. Look for names like `LLMConfigRequest`, `LLMConfigResponse`, `LLMTestResponse`. If the field name differs, adapt the edits below accordingly.

```bash
grep -nE "class.*Config|class.*Test|class.*Health" apps/backend/app/schemas/models.py
```

- [ ] **Step 2: Add `reasoning_effort` to the LLM-config schemas**

In `apps/backend/app/schemas/models.py`, add the field to the GET response model and the PUT request model that represent the stored LLM configuration. Use Optional typing so existing consumers remain backward-compatible:

```python
from typing import Literal, Optional  # ensure these are imported

# Inside the LLM-config response model:
reasoning_effort: Optional[Literal["minimal", "low", "medium", "high"]] = None

# Inside the LLM-config update/request model:
reasoning_effort: Optional[Literal["minimal", "low", "medium", "high"]] = None
```

Empty string from the frontend → `None` in the model; handled by the router in the next step.

- [ ] **Step 3: Thread the field through `routers/config.py`**

Read the router file and locate the GET and PUT endpoints for `/api/v1/config/llm`:

```bash
grep -nE "llm_config|llm-config|/config/llm" apps/backend/app/routers/config.py
```

In the GET handler, include `reasoning_effort` in the response body (read from stored config, defaulting to `None`).

In the PUT handler, accept `reasoning_effort` from the request body. Normalize empty string to `None`, then persist the value (or its absence) to config.json. Do NOT delete the key on update — write an empty string when the user clears it, so the migration condition (`not in stored`) does not re-fire.

Concretely, wherever the router currently builds the stored-config dict for writing, add:

```python
if payload.reasoning_effort is not None:
    stored["reasoning_effort"] = payload.reasoning_effort
else:
    # User cleared the field → persist empty string to prevent re-migration
    stored["reasoning_effort"] = ""
```

- [ ] **Step 4: Add `reasoning_content` to the health-check response**

In `apps/backend/app/llm.py`, inside `check_llm_health`, after extracting `content`, also extract reasoning separately for display (the same fields, but kept distinct from `model_output`):

Find the block that builds `result` in the success path and extend it when `include_details=True`:

```python
        reasoning_text = None
        msg = response.choices[0].message
        reasoning_text = (
            _join_text_parts(_extract_text_parts(_safe_get(msg, "reasoning_content")))
            or _join_text_parts(_extract_text_parts(_safe_get(msg, "thinking")))
        )

        result = {
            "healthy": True,
            "provider": config.provider,
            "model": config.model,
            "response_model": response.model if response else None,
        }
        if include_details:
            result["test_prompt"] = _to_code_block(prompt)
            result["model_output"] = _to_code_block(content)
            result["reasoning_content"] = _to_code_block(reasoning_text) if reasoning_text else None
        return result
```

Add `reasoning_content: Optional[str] = None` to the health-test response schema in `schemas/models.py`.

- [ ] **Step 5: Verify the backend starts and the endpoint schema is valid**

```bash
uv run python -c "
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
r = c.get('/api/v1/config/llm')
print(r.status_code, 'reasoning_effort' in r.json() if r.status_code == 200 else r.json())
"
```

Expected: `200 True` (field present in response).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/app/schemas/models.py apps/backend/app/routers/config.py apps/backend/app/llm.py
git commit -m "feat(backend): expose reasoning_effort in LLM config API + reasoning_content in health response

LLM config GET/PUT now round-trips reasoning_effort. PUT persists an empty
string when cleared so the gpt-5 auto-migration doesn't re-fire. Health check
response carries reasoning_content as a distinct code-block field so the UI
can render 'Model thinking' separately from the main output."
```

---

## Phase B — Frontend

### Task 8: Add reasoning-effort dropdown to Settings

**Files:**
- Modify: `apps/frontend/app/(default)/settings/page.tsx`
- Modify: `apps/frontend/components/settings/api-key-menu.tsx` (if the LLM config form lives here)
- Modify: `apps/frontend/lib/` (the API client that calls `/api/v1/config/llm`)

- [ ] **Step 1: Locate the LLM settings form**

```bash
grep -rnE "api/v1/config/llm|llmConfig|reasoning_effort" apps/frontend/ --include="*.tsx" --include="*.ts"
```

Note the file that renders the provider, model, and api_base inputs — the dropdown goes alongside those.

- [ ] **Step 2: Extend the client-side LLM config type**

In the file(s) that define the LLMConfig type (look under `apps/frontend/lib/` or `types/`), add:

```ts
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface LLMConfig {
  // ...existing fields
  reasoning_effort?: ReasoningEffort | null;
}
```

- [ ] **Step 3: Render the dropdown in the Settings form**

Below the Model input field, add:

```tsx
<div className="mb-4">
  <label
    htmlFor="reasoning-effort"
    className="block font-mono text-xs uppercase tracking-wider mb-1"
  >
    Reasoning effort
  </label>
  <select
    id="reasoning-effort"
    className="w-full rounded-none border border-black bg-canvas font-mono text-sm px-3 py-2 focus:outline-none focus:shadow-[4px_4px_0_0_#000]"
    value={config.reasoning_effort ?? ''}
    onChange={(e) =>
      setConfig({
        ...config,
        reasoning_effort: (e.target.value || null) as ReasoningEffort | null,
      })
    }
  >
    <option value="">Auto (no reasoning_effort sent)</option>
    <option value="minimal">Minimal</option>
    <option value="low">Low</option>
    <option value="medium">Medium</option>
    <option value="high">High</option>
  </select>
  <p className="mt-1 font-mono text-xs text-neutral-600">
    Only affects reasoning-capable models (gpt-5, claude-3.7+, deepseek-r1).
    Unsupported providers drop this value automatically.
  </p>
</div>
```

Swiss-system styling: 1px black border, `rounded-none`, hard shadow on focus, monospace text. Match the styling of the adjacent Provider/Model selects exactly — if they use a different primitive (e.g. `<Dropdown>` from `components/ui/dropdown.tsx`), use that instead of a raw `<select>` for consistency.

- [ ] **Step 4: Thread `reasoning_effort` through the PUT-to-backend call**

In the save handler (wherever `fetch('/api/v1/config/llm', {method: 'PUT', ...})` lives), ensure `reasoning_effort` is included in the JSON body. An empty string clears the field on the backend.

- [ ] **Step 5: Visual check**

Start the dev servers and visit the Settings page:

```bash
# Terminal 1
cd apps/backend && RELOAD=true uv run app

# Terminal 2
cd apps/frontend && npm run dev
```

Navigate to `http://localhost:3000/settings`. Confirm the dropdown renders under Model, default is "Auto", and saving persists the selection (reload the page → selection survives).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/
git commit -m "feat(frontend): add reasoning_effort dropdown to LLM settings

Swiss-styled select with Auto (default), Minimal, Low, Medium, High.
Helper copy explains which providers use it. Empty string persisted on
clear so the backend auto-migration doesn't re-fire."
```

---

### Task 9: Show `reasoning_content` in Test Connection result

**Files:**
- Modify: the frontend component that renders the `llm-test` response (likely `apps/frontend/components/settings/api-key-menu.tsx` or a sibling)

- [ ] **Step 1: Locate the Test Connection result block**

```bash
grep -rnE "model_output|test_prompt|llm-test|Test Connection" apps/frontend/ --include="*.tsx"
```

- [ ] **Step 2: Add a "Model thinking" collapsible below the main output**

Below the existing `model_output` block, add:

```tsx
{result.reasoning_content && (
  <details className="mt-3">
    <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-neutral-600 hover:text-black">
      Model thinking
    </summary>
    <pre className="mt-2 whitespace-pre-wrap border border-black bg-canvas p-3 font-mono text-xs">
      {result.reasoning_content}
    </pre>
  </details>
)}
```

Use `<details>` for native collapsibility — matches Swiss "utilitarian" preference over custom accordion widgets.

- [ ] **Step 3: Add `reasoning_content` to the Test response TS type**

Wherever the `LLMHealthResponse` / `LLMTestResult` type is defined:

```ts
export interface LLMTestResult {
  healthy: boolean;
  // ...existing fields
  reasoning_content?: string | null;
}
```

- [ ] **Step 4: Visual check**

With the backend running, go to Settings → Test Connection with a reasoning-capable model (e.g. `gpt-5-nano` + `REASONING_EFFORT=low`). Confirm a "Model thinking" collapsible appears when the model returns reasoning content, and is absent otherwise.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/
git commit -m "feat(frontend): render reasoning_content in Test Connection result

Collapsible 'Model thinking' block below the main output, shown only when the
health check response includes reasoning_content. Native <details> element —
no custom accordion machinery."
```

---

### Task 10: Add i18n strings for the new UI

**Files:**
- Modify: `apps/frontend/messages/en.json`
- Modify: `apps/frontend/messages/es.json`
- Modify: `apps/frontend/messages/ja.json`
- Modify: `apps/frontend/messages/pt-BR.json`
- Modify: `apps/frontend/messages/zh.json`

- [ ] **Step 1: Identify the i18n keys used by the Settings page**

```bash
grep -rnE "useTranslations|getTranslations|t\\(" apps/frontend/app/\\(default\\)/settings/ --include="*.tsx"
```

This shows which key namespace the Settings page uses (e.g. `settings.llm.*`).

- [ ] **Step 2: Add the new keys to each locale file**

For each of `en.json`, `es.json`, `ja.json`, `pt-BR.json`, `zh.json`, add (under the settings/llm namespace):

```json
{
  "settings": {
    "llm": {
      "reasoningEffort": "Reasoning effort",
      "reasoningEffortAuto": "Auto (no reasoning_effort sent)",
      "reasoningEffortMinimal": "Minimal",
      "reasoningEffortLow": "Low",
      "reasoningEffortMedium": "Medium",
      "reasoningEffortHigh": "High",
      "reasoningEffortHelp": "Only affects reasoning-capable models (gpt-5, claude-3.7+, deepseek-r1). Unsupported providers drop this value automatically.",
      "modelThinking": "Model thinking"
    }
  }
}
```

Translate into the target language for each file. For JSON correctness, keep quoting, escape sequences, and trailing commas consistent with the surrounding file.

- [ ] **Step 3: Replace the hardcoded strings in the Settings components**

In the dropdown JSX from Task 8, replace the literal strings with `t('reasoningEffort')`, `t('reasoningEffortAuto')`, etc. Similarly in the Task 9 "Model thinking" summary.

- [ ] **Step 4: Visual check**

Switch the UI language via the locale toggle (or `?locale=es` query param) and confirm the new strings render in the chosen language.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/messages/ apps/frontend/
git commit -m "i18n(frontend): translations for reasoning_effort and Model thinking

en, es, ja, pt-BR, zh locales. Helper copy explains provider behavior."
```

---

## Phase C — Finalization

### Task 11: Update CLAUDE.md agent context

**Files:**
- Modify: `.claude/CLAUDE.md` (if the quick-reference section mentions LLM config)

- [ ] **Step 1: Search for references to reasoning_effort or llm config in CLAUDE.md**

```bash
grep -nE "reasoning_effort|LLM config|llm config" .claude/CLAUDE.md
```

If there are no matches, skip this task — no docs drift to fix.

- [ ] **Step 2: If a Code Patterns section is relevant, add a note about reasoning_effort being settings-driven**

(Only if Step 1 found a relevant section. Otherwise skip.)

- [ ] **Step 3: Commit (only if edits made)**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(claude): note reasoning_effort is now settings-driven"
```

---

### Task 12: Manual end-to-end verification

**Files:** none

- [ ] **Step 1: Run the backend with a fresh .env**

```bash
cd apps/backend
cp .env.example .env  # if you don't already have one
RELOAD=true uv run app
```

Expected: Server starts on :8000 without errors. No `_get_reasoning_effort`-related log lines.

- [ ] **Step 2: Run the frontend**

```bash
cd apps/frontend
npm run dev
```

- [ ] **Step 3: Verify reasoning_effort dropdown round-trip**

1. Open `http://localhost:3000/settings`.
2. Pick provider OpenAI, model `gpt-4o`, set API key.
3. In the Reasoning effort dropdown, pick `Low`.
4. Save.
5. Reload the page. Dropdown still says `Low`. → PASS.
6. Pick `Auto`. Save. Reload. Still `Auto`. → PASS.

- [ ] **Step 4: Verify gpt-5 auto-migration**

1. Stop the backend.
2. `cat apps/backend/data/config.json` — note the current state.
3. Manually edit: set `"provider": "openai"`, `"model": "gpt-5-nano"`, remove `reasoning_effort` key entirely.
4. Start the backend.
5. Open Settings. Reasoning effort should show `Minimal` (auto-migrated).
6. Check backend logs for the INFO line `Migrated gpt-5 config to preserve reasoning_effort=minimal`.

- [ ] **Step 5: Verify thinking-model fallback (if DeepSeek key available)**

1. In Settings, switch provider to DeepSeek with `deepseek-reasoner` or DeepSeek-R1.
2. Click Test Connection.
3. The Test Connection result should show a main output AND a "Model thinking" collapsible.

If no DeepSeek key is available, skip; the logic is unit-verifiable via the import smoke test in Task 4.

- [ ] **Step 6: Verify OpenAI-compatible local endpoint round-trip (if a local server is available)**

1. Start a local llama.cpp server on `http://localhost:8080` with an OpenAI-compatible endpoint.
2. In Settings, provider = OpenAI, api_base = `http://localhost:8080/v1`, model = whatever llama.cpp is serving.
3. Click Test Connection. It should not 404 with `/v1/v1/` in the error.

Skip if no local server available — the assertion is covered by Task 5 step 3.

- [ ] **Step 7: If everything passes, push the dev branch**

```bash
git push origin dev
```

---

### Task 13: Open the PR

**Files:** none

- [ ] **Step 1: Since PR #756 already exists for dev → main, confirm whether these commits should extend it or land in a separate PR**

Per the user's earlier decision, option A: open a new PR per issue on top of dev. PR #756 stays for the Bun/console-script changes; this new PR covers the LiteLLM reasoning hardening.

Check whether PR #756 is still open against dev→main. If so, it will automatically include these new commits (since they all landed on dev). Either:

- **Option A-1:** Merge PR #756 first, then open a new PR with just these commits.
- **Option A-2:** Keep #756 open and add a comment that the LiteLLM changes are piggy-backing.

Ask the user which they prefer before opening a new PR or forcing a merge of #756.

- [ ] **Step 2: If opening a new PR, use the body below**

```bash
gh pr create --base main --head dev --title "LiteLLM reasoning hardening + Settings reasoning UX (#747)" --body "$(cat <<'EOF'
## Summary

Closes #747. Partial fix for #751 (the /v1 preservation half).

- Enable `litellm.drop_params=True` and `modify_params=True` globally — LiteLLM now silently drops provider-unsupported params (reasoning_effort, non-default temperature) instead of raising UnsupportedParamsError.
- Delete hardcoded \`_get_reasoning_effort\` and \`_supports_temperature\` branches. They existed only to work around what \`drop_params\` handles.
- New \`reasoning_effort\` setting (env: \`REASONING_EFFORT\`, Settings UI dropdown: Auto / Minimal / Low / Medium / High). Default: Auto (nothing sent).
- Thinking-model content fallback in \`_extract_choice_text\`: \`content\` → \`reasoning_content\` → \`thinking\` → \`<think>\` tags. DeepSeek R1 / OpenAI o1 / Claude extended thinking stop returning 'empty' to callers.
- \`_normalize_api_base\` preserves \`/v1\` for \`openai\` so llama.cpp-style endpoints round-trip. Other providers unchanged.
- Health-check \`max_tokens\` 16 → 64. Addresses the 'output limit reached' failure on reasoning-capable models.
- Health-check response now exposes \`reasoning_content\` separately; UI renders it as a collapsible 'Model thinking' block.

### Behavior change for gpt-5 users

Previously, any model containing 'gpt-5' silently received \`reasoning_effort=minimal\`. That default has been removed. **Existing gpt-5 configs are auto-migrated on first load to preserve the 'minimal' setting** — you will see a one-line INFO log on startup. To disable, open Settings → LLM → Reasoning effort and pick 'Auto', or set \`REASONING_EFFORT=\` (empty) in .env.

## Test plan

- [ ] Dropdown round-trips value across reload
- [ ] gpt-5 auto-migration fires exactly once on startup for legacy configs
- [ ] llama.cpp at \`http://localhost:8080/v1\` connects without 404
- [ ] DeepSeek R1 health check returns both \`model_output\` and \`reasoning_content\`
- [ ] Non-reasoning model (gpt-4o) health check unchanged, no regression

Spec: docs/superpowers/specs/2026-04-17-litellm-reasoning-hardening-design.md
Plan: docs/superpowers/plans/2026-04-17-litellm-reasoning-hardening.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| `litellm.drop_params = True` at module init | 1 |
| `litellm.modify_params = True` at module init | 1 |
| Delete `_get_reasoning_effort` | 3 |
| Delete `_supports_temperature` | 3 |
| `reasoning_effort` setting (env + config + LLMConfig) | 2, 3 |
| Health-check `max_tokens` 16 → 64 | 3 |
| Thinking-model content fallback in `_extract_choice_text` | 4 |
| `_normalize_api_base` preserves `/v1` for openai | 5 |
| Config API GET/PUT round-trips `reasoning_effort` | 7 |
| Health-check response includes `reasoning_content` | 7 |
| Settings UI dropdown | 8 |
| Test Connection UI shows "Model thinking" | 9 |
| i18n strings added to all 5 locales | 10 |
| Auto-migration for existing gpt-5 users | 6 |
| PR description "Behavior change" callout | 13 |
| `.env.example` documents `REASONING_EFFORT` | 2 |

All spec requirements are covered. No placeholders remain.
