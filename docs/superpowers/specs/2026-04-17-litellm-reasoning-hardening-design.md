# LiteLLM reasoning hardening + Settings reasoning UX

**Date:** 2026-04-17
**Issues:** #747 (primary), partial #751 (api_base stripping half)
**Branch:** `dev` (PR dev → main to follow)

## Problem

Three entangled pain points in the current LLM layer:

1. **gpt-5 connection tests fail.** `check_llm_health()` hardcodes `reasoning_effort="minimal"` for any model name containing `"gpt-5"` and uses `max_tokens=16`. Some gpt-5 variants reject `reasoning_effort=minimal`; others need a larger token budget. Both failure modes return HTTP 200 with `healthy=false`, which is confusing.
2. **Thinking models return "empty" content.** Models like DeepSeek-R1 and OpenAI o1 place their answer in `message.reasoning_content` or `message.thinking` rather than `message.content`. Current code treats this as an empty response and fails.
3. **OpenAI-compatible endpoints are broken.** `_normalize_api_base()` strips trailing `/v1` even when the user wants to target a custom OpenAI-compatible server (e.g. llama.cpp at `http://localhost:8080/v1`). The user-supplied URL becomes `http://localhost:8080` and the request 404s.

## Goals

- `check_llm_health()` succeeds for both reasoning and non-reasoning models out of the box.
- Reasoning-only responses are surfaced as valid content.
- Users can target any OpenAI-compatible endpoint by pasting the full base URL.
- `reasoning_effort` becomes a user-controllable setting, not a hardcoded policy.
- Existing gpt-5 users keep their current behavior without touching config.

## Non-goals

- Adding a new `"openai_compatible"` entry to the provider dropdown (tracked in PR #751 follow-up).
- Rewriting prompt templates for cover letter / cold email (tracked in PR #749 follow-up).
- Settings page error-card overflow styling (tracked in PR #754 follow-up).
- Per-model capability allowlists (obsoleted by `drop_params=True`).

## Design

### Backend

**1. Global LiteLLM params policy (`apps/backend/app/llm.py` module init)**

```python
litellm.drop_params = True
litellm.modify_params = True
```

- `drop_params` lets LiteLLM silently discard params the selected provider rejects (`reasoning_effort`, non-default `temperature`, etc.). Replaces every hardcoded compatibility branch we wrote.
- `modify_params` lets LiteLLM auto-drop `thinking_blocks` when tool-call assistant messages are missing them. Applied defensively; no current tool-call path uses thinking, but this future-proofs the Router.

**2. Remove hardcoded compatibility branches**

Delete `_get_reasoning_effort()` and `_supports_temperature()`. Their call sites (`complete`, `complete_json`, `check_llm_health`) stop invoking them. `temperature` is always passed; `reasoning_effort` is passed only when the user has configured it.

**3. New `reasoning_effort` setting**

`apps/backend/app/config.py`:

```python
reasoning_effort: Literal["minimal", "low", "medium", "high"] | None = None
```

Read from `REASONING_EFFORT` env var and from `config.json`. `None` means "do not send the param". `LLMConfig` gains the same field so callers pass it through.

**4. Health-check token bump**

`check_llm_health()`: `max_tokens=16` → `max_tokens=64`. Matches the issue author's proposed minimum.

**5. Thinking-model content fallback in `_extract_choice_text()`**

Extraction order:
1. `message.content` (existing)
2. `message.reasoning_content` (new — DeepSeek, OpenAI o1)
3. `message.thinking` (new — Anthropic extended thinking)
4. `<think>...</think>` tags inside `message.content` (existing, via `_strip_thinking_tags`)

Return the first non-empty. Unchanged if none match.

`complete()` and `check_llm_health()` stop treating "reasoning present but content empty" as unhealthy — if extraction returns text, it is content.

**6. `_normalize_api_base` — preserve `/v1` for OpenAI**

Current code strips `/v1` for `anthropic`, `gemini`, `openrouter`, `ollama` because LiteLLM's provider handlers for those re-append path segments. For `openai` the OpenAI client handles `/v1` correctly, so **stop stripping when `provider == "openai"`**. The llama.cpp-style case `http://localhost:8080/v1` now round-trips intact.

Keep stripping for the other four providers — that behavior is correct and covered by existing users.

**7. Expose `reasoning_effort` through config API**

`apps/backend/app/routers/config.py`: GET `/api/v1/config/llm` includes the field; PUT accepts it. `schemas/models.py` adds the field to the request/response models.

**8. Health-check response carries `reasoning_content`**

`check_llm_health(include_details=True)` adds a `reasoning_content` key (code-block-wrapped string, empty when absent) alongside `model_output`. Schema update in `schemas/models.py`.

### Frontend

**9. Reasoning-effort dropdown (`apps/frontend/app/(default)/settings/page.tsx` + `components/settings/api-key-menu.tsx`)**

New select labeled "Reasoning effort" under the model field. Options: **Auto** (sends nothing, default), Minimal, Low, Medium, High. Swiss-styled: `rounded-none`, 1px black border, hard shadow on focus, monospace for the options. Shown for all providers — with `drop_params=True` the backend will safely drop the param where unsupported, so restricting by provider is unnecessary and misleading.

**10. Model-thinking block in Test Connection result**

When `reasoning_content` is non-empty in the health-check response, render a second code block under the main output, labeled "Model thinking" in a smaller monospace caption. Collapsible by default (closed).

### Regression mitigation (auto-migration)

**11. One-shot silent migration in `get_llm_config()`**

Pseudocode:

```python
stored = _load_stored_config()
provider = stored.get("provider", settings.llm_provider)
model = stored.get("model", settings.llm_model)
if (
    provider == "openai"
    and "gpt-5" in model.lower()
    and "reasoning_effort" not in stored  # absent, not empty string
):
    stored["reasoning_effort"] = "minimal"
    save_config_file(stored)
    logging.info(
        "Migrated gpt-5 config to preserve reasoning_effort=minimal "
        "(set REASONING_EFFORT= or clear in Settings to disable)"
    )
```

Condition-gated on **absent key** rather than "empty or missing". Once a user explicitly clears the field (empty string persisted), the migration does not re-apply.

The migration runs lazily: first `get_llm_config()` call after process start on an affected config. No blocking startup hook.

### PR description callout

```markdown
### Behavior change for gpt-5 users

Previously, any model containing "gpt-5" silently received reasoning_effort=minimal.
That default has been removed. Existing gpt-5 configs are auto-migrated on first
load to preserve the "minimal" setting — you will see a one-line INFO log. To
disable, open Settings → LLM → Reasoning effort and pick "Auto", or set
REASONING_EFFORT= (empty) in .env.
```

## Data flow

```
.env / config.json
        │
        ▼
  Settings (reasoning_effort=None|minimal|low|medium|high)
        │
  LLMConfig (forward through)
        │
  get_router() / check_llm_health()
        │
  kwargs["reasoning_effort"] only if set
        │
  litellm.acompletion  ── drop_params=True ──►  provider API
        │
  response.choices[0].message
        │
  _extract_choice_text:  content → reasoning_content → thinking → <think>-tags
        │
  caller (complete/complete_json/check_llm_health)
```

## Error handling

| Failure | Before | After |
|---|---|---|
| `UnsupportedParamsError: reasoning_effort=minimal not supported` | Health-check fails | `drop_params` drops it, call succeeds |
| `max_tokens or model output limit reached` at 16 tokens | Health-check fails | Budget is 64, succeeds for reasoning-capable models |
| Reasoning-only response (empty content, populated reasoning_content) | `empty_content` unhealthy | Extracted as content, healthy |
| `api_base` with `/v1` for openai → llama.cpp | 404 (stripped) | 200 (preserved) |
| `api_base` with `/v1` for anthropic/gemini/openrouter/ollama | Works (stripped) | Works (still stripped) |
| Provider rejects `temperature != 1` | Raised before | Dropped by LiteLLM, call succeeds |

Unchanged: Router retry policy, timeout logic, JSON extraction, config file write semantics.

## Files touched

| File | Change |
|---|---|
| `apps/backend/app/llm.py` | Module init flags; delete 2 helpers; fallback extraction; api_base branch; health-check max_tokens |
| `apps/backend/app/config.py` | Add `reasoning_effort` setting |
| `apps/backend/app/routers/config.py` | Expose `reasoning_effort` in LLM config GET/PUT |
| `apps/backend/app/schemas/models.py` | Add `reasoning_effort` field + `reasoning_content` in health response |
| `apps/backend/.env.example` | Document `REASONING_EFFORT` |
| `apps/frontend/app/(default)/settings/page.tsx` | Reasoning-effort dropdown + Model thinking block |
| `apps/frontend/components/settings/api-key-menu.tsx` | Thread the new field through |
| `apps/frontend/messages/{en,es,ja,zh,pt-BR}.json` | i18n strings for new UI elements |

Estimated ~250 LOC net across ~8-9 files.

## Risks

- **`drop_params=True` is process-global.** Any future code path that relied on a provider surfacing "unsupported param" as an error will now fail silently. Acceptable — we don't have such a path today.
- **Thinking-model fallback can change output shape.** A deepseek-r1 response that previously returned "empty" now returns the reasoning content. Downstream JSON extraction (`complete_json`) is unaffected because `_strip_thinking_tags` already handles inline `<think>` and the fallback returns clean text.
- **Auto-migration writes user config on first call.** Single idempotent write. If the write fails (disk full, permission), we log-and-continue — the next call will retry.

## Rollback

Pure backward-compatible at the data level. Reverting the commit restores old behavior. Migrated `reasoning_effort="minimal"` in config.json is now honored by new code; if we revert, the hardcoded branch is restored and the stored value is harmlessly redundant.
