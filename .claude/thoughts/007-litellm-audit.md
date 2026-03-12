# LiteLLM Audit Notes

Date: 2026-03-06

Scope:
- No backend code changes were made.
- This document compares the LiteLLM guidance from the chat against the current implementation in `apps/backend`.

## Executive Summary

The LiteLLM feedback is directionally correct.

The backend currently does **not** use `litellm.Router`. It uses direct `litellm.acompletion(...)` calls plus custom retry / JSON parsing logic in `apps/backend/app/llm.py`.

That creates 3 important gaps:

1. OpenRouter capability logic is hardcoded and can mis-detect model support.
2. Retries are implemented in app code, not in LiteLLM Router / retry policy, so there is no built-in cooldown, error-type routing, or deployment fallback.
3. The app relies heavily on structured JSON outputs, which means fallback models must be chosen for JSON reliability, not just availability.

## Current Backend Shape

The main LLM wrapper is `apps/backend/app/llm.py`.

Current behavior:
- Every request builds a model string with `get_model_name(...)`.
- Calls are sent with direct `litellm.acompletion(...)`.
- JSON responses are enforced by prompt instructions plus optional `response_format={"type":"json_object"}`.
- JSON calls retry in app code up to 3 total attempts.
- Retries are immediate. There is no Router, no `retry_policy`, no `allowed_fails_policy`, no cooldown tracking, and no model-group fallback.

Relevant code:
- `apps/backend/app/llm.py`
- `apps/backend/app/services/parser.py`
- `apps/backend/app/services/improver.py`
- `apps/backend/app/services/refiner.py`
- `apps/backend/app/routers/enrichment.py`

## What LiteLLM Docs Say

Official docs reviewed:

- Fallbacks: https://docs.litellm.ai/docs/proxy/reliability#1-setup-fallbacks
- Reliable completions: https://docs.litellm.ai/docs/completion/reliable_completions
- Router retries / cooldowns / error-type policy: https://docs.litellm.ai/docs/routing#advanced-custom-retries-cooldowns-based-on-error-type
- Structured outputs / JSON mode: https://docs.litellm.ai/docs/completion/json_mode
- Provider-specific wildcard routing: https://docs.litellm.ai/docs/wildcard_routing

Important points from the docs:

- LiteLLM supports `num_retries` directly on completion calls.
- LiteLLM Router supports model-group `fallbacks`.
- Router supports `retry_policy` and `allowed_fails_policy` by exception type.
- Router cooldowns are deployment-specific.
- LiteLLM recommends checking model support for `response_format` instead of assuming support.
- Wildcard routing exists specifically to avoid hardcoding every provider model in config.

## Mapping The Chat Feedback To This Codebase

### 1. "You dont need to hardcode model names for a provider (openrouter)"

Assessment: **valid**

This backend hardcodes OpenRouter JSON-capable models in `OPENROUTER_JSON_CAPABLE_MODELS`.

Why this is fragile:
- New OpenRouter models will not be recognized until code is updated.
- Old model names can become stale.
- Capability is inferred from a static set, not from LiteLLM support metadata.

There is also a more specific bug risk here:

- `get_model_name()` normalizes OpenRouter requests to `openrouter/<provider>/<model>`.
- `_supports_json_mode()` checks **raw** `config.model`, not the normalized `model_name`.
- The allowlist entries are stored as values like `anthropic/claude-3.5-sonnet`, not `openrouter/anthropic/claude-3.5-sonnet`.

That means JSON-mode support for OpenRouter can depend on how the model string was saved in config:

- `anthropic/claude-3.5-sonnet` -> allowlist match
- `openrouter/anthropic/claude-3.5-sonnet` -> allowlist miss

This is the strongest evidence that custom provider/model construction is interfering with LiteLLM behavior.

Most likely affected code:
- `apps/backend/app/llm.py`: `get_model_name(...)`
- `apps/backend/app/llm.py`: `_supports_json_mode(...)`

### 2. "Since you have a list of models for openrouter, it makes sense to set up fallbacks for this array of models"

Assessment: **valid, but only after deciding fallback compatibility**

Right now there are no LiteLLM fallbacks in the app at all.

Current state:
- No `Router(...)`
- No `fallbacks=[...]`
- No per-request fallback list

The app does have multiple points where one user action can trigger several LLM calls:
- parse resume
- extract job keywords
- improve resume
- keyword injection refinement
- enrichment analysis
- enrichment regeneration
- cover letter / outreach / title generation

Fallbacks would help most on:
- OpenRouter primary model outages
- Ollama local model instability
- 429 / 500 bursts

But fallback choice is constrained by structured-output needs:
- JSON-producing steps need fallback models that support consistent JSON mode or schema-constrained output.
- Text-only steps like title / cover letter / outreach can use broader fallbacks.

So the LiteLLM recommendation is right, but the fallback graph should be split into:
- JSON-safe model groups
- text-generation model groups

### 3. "Do you rely on structured outputs?"

Assessment: **yes, heavily**

This app depends on structured outputs in most critical workflows.

Structured JSON is required for:
- resume parsing
- keyword extraction
- resume improvement
- refinement keyword injection
- enrichment analysis
- enhancement generation
- regenerate item / skills

The pattern is:
- ask model for JSON
- optionally send `response_format={"type":"json_object"}`
- extract JSON text manually
- `json.loads(...)`
- validate with Pydantic for some flows

This means structured output is not optional in the current architecture. It is a core contract.

Implication:
- Any Router fallback plan must preserve JSON reliability first.
- A generic OpenRouter -> Ollama fallback may work for plain text, but can still break JSON-sensitive endpoints if the fallback model is weaker at structured output.

### 4. "Configure retries within litellm router for both ollama & openrouter models"

Assessment: **strongly valid**

Current retry behavior is all in app code:

- `complete_json(..., retries=2)` loops in Python
- retries all exception types the same way
- retries immediately
- no LiteLLM cooldown tracking
- no error-type routing
- no deployment isolation

What this means operationally:
- 429s can create retry amplification
- 500s keep hammering the same failing upstream
- there is no built-in handoff to a different model or deployment
- OpenRouter and Ollama failures are handled exactly the same as parse failures

This is a poor fit for production traffic, especially when multiple users trigger multi-call workflows at once.

The LiteLLM Router guidance is better because it gives you:
- `num_retries`
- provider-aware retry handling
- cooldowns
- `retry_policy`
- `allowed_fails_policy`
- model-group fallbacks

## Where The Current Logic Is Probably Fighting LiteLLM

Most likely problem areas:

### A. OpenRouter JSON support is hardcoded

This is probably the clearest issue.

Instead of asking LiteLLM whether `response_format` is supported, the backend uses a static allowlist.

This can produce:
- false negatives for valid models
- false positives for outdated model names
- config-format-sensitive behavior for the same model

### B. The app re-implements retries outside LiteLLM

LiteLLM already has built-in retry / fallback / cooldown primitives.

The app instead:
- retries inside `complete_json(...)`
- mutates prompts between attempts
- never classifies errors
- never falls back to a different deployment

This limits LiteLLM’s reliability features before they can help.

### C. Model selection is direct-call based, not alias / group based

Because the app calls raw model strings directly, it does not get Router features like:
- alias-based routing
- group fallbacks
- provider wildcard routing
- per-deployment cooldowns

## Recommended Direction

No code was changed, but if you implement the LiteLLM guidance later, the safest order is:

1. Replace the OpenRouter JSON allowlist with LiteLLM capability checks.
2. Add `num_retries` directly in LiteLLM calls as a short-term improvement.
3. Move OpenRouter and Ollama traffic behind `litellm.Router`.
4. Define model aliases for logical groups, instead of calling raw provider/model strings everywhere.
5. Add separate fallback chains for:
   - JSON-critical operations
   - plain-text generation
6. Add error-type retry policy:
   - `AuthenticationError`: no retry
   - `BadRequestError`: minimal or no retry
   - `TimeoutError`: retry some
   - `RateLimitError`: retry + fallback + cooldown
   - `APIError` / `InternalServerError`: fallback sooner

## Suggested Model-Group Shape

Conceptually, the app would benefit from alias-based groups such as:

- `resume-json-primary`
- `resume-json-fallback`
- `text-gen-primary`
- `text-gen-local`

Then routes call aliases, not hardcoded provider strings.

Example intent:
- parse / improve / analyze / regenerate -> `resume-json-primary`
- title / cover letter / outreach -> `text-gen-primary`

That makes fallbacks and routing policy possible without touching every endpoint again.

## Short-Term Conclusion

If you want the shortest explanation of what the LiteLLM person was pointing at:

- yes, this backend is relying on structured outputs
- yes, the retry strategy is currently outside LiteLLM and weaker than Router-based retries
- yes, there is custom provider/model logic that can interfere with OpenRouter behavior
- the most suspicious concrete issue is the hardcoded OpenRouter JSON-capable model logic

## Files Most Relevant To Review First

- `apps/backend/app/llm.py`
- `apps/backend/app/services/improver.py`
- `apps/backend/app/services/parser.py`
- `apps/backend/app/services/refiner.py`
- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/routers/enrichment.py`

## Final Note

No implementation changes were made as requested.

This file is documentation only.
