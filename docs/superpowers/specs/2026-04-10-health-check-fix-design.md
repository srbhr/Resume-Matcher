# Health Check Fix — Stop LLM Calls on Docker Liveness Probe

**Date:** 2026-04-10
**Issue:** [#746](https://github.com/srbhr/Resume-Matcher/issues/746)
**Approach:** A (Minimal)

## Problem

The Docker `HEALTHCHECK` pings `GET /api/v1/health` every 10 seconds. That endpoint calls `check_llm_health()`, which fires a real `litellm.acompletion()` request to the configured LLM provider. This burns ~8,640 billable API calls per day, costing ~$1.50/day on GPT-5.4 via OpenRouter.

## Fix

Make `/health` a zero-cost liveness check. The LLM connectivity check remains available via `/status` (user-initiated only).

### Changes

**`apps/backend/app/routers/health.py`**
- Remove `check_llm_health` import (keep `get_llm_config` import for `/status`)
- `/health` handler returns `HealthResponse(status="healthy")` with no LLM call
- `/status` handler unchanged — it still calls `check_llm_health()` for the settings UI

**`apps/backend/app/schemas/models.py`**
- `HealthResponse`: remove the `llm: dict[str, Any]` field, keep only `status: str`

### What stays the same

- Dockerfile `HEALTHCHECK` command and interval — no changes needed
- `/status` endpoint — still calls `check_llm_health()`, used by frontend settings page
- Frontend `StatusCacheProvider` and all `useStatusCache` consumers — unaffected
- `check_llm_health()` function in `llm.py` — untouched

## Verification

- `GET /health` returns `{"status": "healthy"}` without making any external calls
- `GET /status` still returns `llm_healthy: true/false` with a real LLM check
- Settings page still shows LLM health status correctly
