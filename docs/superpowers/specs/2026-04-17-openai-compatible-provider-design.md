# OpenAI-compatible provider entry

**Date:** 2026-04-17
**Issue:** #751 (completes the dropdown half; `/v1` preservation shipped with #747)
**Branch:** `dev` (bundle into PR with #754 and #749)

## Problem

Local OpenAI-compatible servers (llama.cpp, vLLM, LM Studio, Ollama's OpenAI endpoint, etc.) already work when the user selects `provider=openai` and sets `api_base` to their local URL — after the `_normalize_api_base` fix in #747. But that path is discoverable only by reading code: the Settings UI exposes six providers (openai, anthropic, openrouter, gemini, deepseek, ollama) and none is labeled "OpenAI-compatible". New users trying to connect llama.cpp pick "Ollama" (because it's local), misconfigure the base URL, and hit 404s.

## Goals

- Add an explicit `"openai_compatible"` provider option to the Settings UI with clear labeling for local servers.
- Route requests via LiteLLM's `openai/` prefix (the documented way to hit OpenAI-compatible endpoints).
- Keep the existing `provider=openai + custom api_base` path working — no silent migration, no forced switch.
- API keys for `openai_compatible` are stored under their own namespace so they don't leak into real OpenAI (and vice versa).

## Non-goals

- Auto-detection of the backend's capabilities (streaming, tools, etc.).
- A Settings "provider profile" abstraction — one provider, one config.
- Migrating existing users from `openai + api_base`.

## Design

### Backend

**1. Provider enum (`apps/backend/app/config.py`)**

```python
llm_provider: Literal[
    "openai",
    "openai_compatible",
    "anthropic",
    "openrouter",
    "gemini",
    "deepseek",
    "ollama",
] = "openai"
```

**2. Provider key map (`apps/backend/app/llm.py`)**

Add an entry so stored keys are scoped separately:

```python
_PROVIDER_KEY_MAP: dict[str, str] = {
    "openai": "openai",
    "openai_compatible": "openai_compatible",
    "anthropic": "anthropic",
    "gemini": "google",
    "openrouter": "openrouter",
    "deepseek": "deepseek",
    "ollama": "ollama",
}
```

**3. Model routing (`get_model_name` in `apps/backend/app/llm.py`)**

LiteLLM's documented way to hit an OpenAI-compatible endpoint is `model="openai/<model_name>"` + `api_base=<URL>`. So `openai_compatible` uses the same prefix as `openai`:

```python
provider_prefixes = {
    "openai": "",
    "openai_compatible": "openai/",  # explicit — user's model names usually lack the prefix
    "anthropic": "anthropic/",
    ...
}
```

And in the OpenRouter-style special-case block, extend the "already prefixed" check to recognize `openai/`:

```python
known_prefixes = [
    "openrouter/", "anthropic/", "gemini/", "deepseek/",
    "ollama/", "ollama_chat/", "openai/",
]
```

**4. URL normalization (`_normalize_api_base`)**

Preserve the URL just like `openai` does — no stripping:

```python
if provider in ("openai", "openai_compatible"):
    return base or None
```

**5. API-key requirement**

Real `openai` requires a key. `openai_compatible` often does not (llama.cpp, LM Studio). But OpenAI's python client [requires](https://github.com/openai/openai-python/blob/main/README.md) some key to be set (it validates the string is non-empty). The health-check currently gates API-key presence with:

```python
if config.provider != "ollama" and not config.api_key:
    return {... "error_code": "api_key_missing" ...}
```

Change to:

```python
if config.provider not in ("ollama", "openai_compatible") and not config.api_key:
    ...
```

And in the actual completion call, if `config.api_key` is empty for `openai_compatible`, pass a sentinel `"sk-no-key"` string to satisfy the OpenAI client's empty-string check without leaking a real credential.

### Frontend

**6. Provider list (`apps/frontend/lib/api/config.ts`)**

```ts
export type LLMProvider =
  | 'openai'
  | 'openai_compatible'
  | 'anthropic'
  | 'openrouter'
  | 'gemini'
  | 'deepseek'
  | 'ollama';
```

**7. `PROVIDERS` array + `PROVIDER_INFO` dict (`config.ts`)**

```ts
openai_compatible: {
  name: 'OpenAI-Compatible',
  description: 'llama.cpp, vLLM, LM Studio, self-hosted OpenAI-API servers',
  defaultModel: 'custom-model',
  requiresKey: false,
},
```

**8. Segmented-button UI (`settings/page.tsx`)**

The button row auto-wraps as long as `PROVIDERS` grows. With 7 providers the row flows to 2 lines on narrow viewports — acceptable.

**9. API-base hint**

When the user selects `openai_compatible`, pre-populate `api_base` to `http://localhost:8080/v1` if the field is empty (matches llama.cpp default).

**10. i18n**

Add `settings.providers.openai_compatible` name + description string in all 5 locales (en/es/ja/zh/pt-BR).

### Docs

**11. `.env.example`**

Extend the `LLM_PROVIDER` comment to list `openai_compatible` as a valid value.

**12. SETUP.md + translations**

One-liner mention in the LLM configuration section: "Use OpenAI-Compatible for llama.cpp, vLLM, LM Studio."

## Data flow

```
User picks "OpenAI-Compatible" in Settings
  └─ api_base pre-filled to http://localhost:8080/v1
  └─ API key field optional (requiresKey: false)
      └─ PUT /api/v1/config/llm-api-key {provider: "openai_compatible", model: "llama-3.1-8b", api_base: "...", api_key: ""}
          └─ stored.api_keys["openai_compatible"] = ""  (own namespace)
          └─ get_llm_config → LLMConfig(provider="openai_compatible", ...)
              └─ get_model_name → "openai/llama-3.1-8b"
              └─ _normalize_api_base → "http://localhost:8080/v1" (preserved)
              └─ check_llm_health → passes api_key="sk-no-key" sentinel if empty
              └─ litellm.acompletion(model="openai/llama-3.1-8b", api_base="...", api_key="sk-no-key")
                  └─ LiteLLM routes via OpenAI client → http://localhost:8080/v1/chat/completions
```

## Error handling

| Failure | Behavior |
|---|---|
| Empty api_key for `openai_compatible` | Allowed. Sentinel passed to LiteLLM; server decides whether to auth. |
| Server returns 404 on `/v1/chat/completions` | Health check surfaces `not_found_404` error code. |
| `api_base` includes `/v1/v1` | Handled by normal LiteLLM behavior; no extra stripping. |
| Model name includes `openai/` already | Respected, not double-prefixed. |

## Files touched

| File | Change |
|---|---|
| `apps/backend/app/config.py` | Add `openai_compatible` to `llm_provider` Literal |
| `apps/backend/app/llm.py` | Provider map, prefix, normalize, health-check gate |
| `apps/backend/app/.env.example` | Document the option |
| `apps/frontend/lib/api/config.ts` | Add to `LLMProvider`, `PROVIDERS`, `PROVIDER_INFO` |
| `apps/frontend/app/(default)/settings/page.tsx` | Pre-fill api_base hint on provider change |
| `apps/frontend/messages/{en,es,ja,zh,pt-BR}.json` | i18n strings |
| `SETUP.md`, `SETUP.es.md`, `SETUP.ja.md`, `SETUP.zh-CN.md` | One-line mention |

Estimated ~8 files, ~80-120 LOC.

## Risks

- **Sentinel key `"sk-no-key"`**: cosmetic; the OpenAI client treats it as a literal string and passes it in the `Authorization` header. Local servers that don't check auth ignore it. Servers that DO check auth will reject it — but those users will set a real key, so no regression.
- **Key namespace overlap**: users who already have a stored key under `openai` will not see it auto-populated when switching to `openai_compatible` — they have to paste it (or leave blank). This is by design: they're logically different providers.
- **New failure code paths**: none added; reuses existing `not_found_404` / `duplicate_v1_path` / `html_response` heuristics.

## Rollback

Pure additive. Revert removes the option from the dropdown; users who configured `openai_compatible` revert to seeing "unknown provider" error on next config load (handled by existing `set_default_provider` validator in `config.py`, which falls back to `"openai"`). Their stored `api_base` survives, so switching to `openai + api_base=...` gives them back the working path.

## Verification

Manual (no test infrastructure):
1. Start llama.cpp locally on port 8080 with an OpenAI server enabled.
2. In Settings, pick OpenAI-Compatible. `api_base` pre-fills to `http://localhost:8080/v1`.
3. Leave API key blank. Pick model `llama-3.1-8b`. Test Connection → healthy, shows model output.
4. Switch back to `openai` with a real key. Test Connection still works for OpenAI's API.
5. Saved keys are separate: clearing the `openai` key does not blank the `openai_compatible` setting.
