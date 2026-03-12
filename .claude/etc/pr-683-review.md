# PR #683 Review: Switch to Single Public Port and Adjust API Routing

> **Branch:** `docker-revamp`
> **Author:** @webysther (Webysther Sperandio)
> **Related:** PR #681 (CORS/remote Docker fix), Issue #682 (versioned multi-arch images)
> **Review date:** 2026-02-24

---

## What This PR Does

Switches the deployment model from two exposed ports (3000 for frontend, 8000 for backend) to a **single public port (3000)** where Next.js proxies all `/api/*` requests to the backend internally. Also adds configurable logging, Docker secrets support, pre-built multi-arch images, and updated documentation.

### Changed Files (12 total)

| File | Purpose |
|------|---------|
| `.github/workflows/docker-publish.yml` | **NEW** - CI workflow for multi-arch Docker image publishing to GHCR + Docker Hub |
| `Dockerfile` | Bookworm base images, copy Node binary instead of installing via nodesource, single EXPOSE 3000, faster healthcheck |
| `README.md` | Updated Docker section with single-port model, registry info, version pinning |
| `SETUP.md` | Replaced FRONTEND_PORT/BACKEND_PORT with PORT, added secrets/logging docs, `docker compose` v2 syntax |
| `apps/backend/.env.example` | Added LOG_LEVEL and LOG_LLM vars |
| `apps/backend/app/config.py` | Added `log_level` and `log_llm` Settings fields with validators, ALLOWED_LOG_LEVELS constant |
| `apps/backend/app/llm.py` | Added `_configure_litellm_logging()` to align LiteLLM logger levels with settings |
| `apps/backend/app/main.py` | Added `_configure_application_logging()` to set process-wide log level |
| `apps/frontend/lib/api/client.ts` | Refactored API URL resolution: defaults to `/`, SSR-aware with `INTERNAL_API_ORIGIN`, three-branch `apiFetch()` |
| `apps/frontend/next.config.ts` | Rewrites changed from `/api_be/:path*` to `/api/:path*`, added `/docs`, `/redoc`, `/openapi.json` proxies |
| `docker-compose.yml` | Pre-built image from GHCR, single PORT variable, removed build context, commented-out secrets support |
| `docker/start.sh` | Hardcoded internal ports, `file_env()` for Docker secrets, `normalize_log_level()`, frontend runs in foreground |

---

## Architecture: Single-Port Proxy Model

```
Browser (port 3000)
  |
  |-- /                     --> Next.js (serves frontend)
  |-- /api/:path*           --> rewrite to http://127.0.0.1:8000/api/:path*
  |-- /docs                 --> rewrite to http://127.0.0.1:8000/docs
  |-- /redoc                --> rewrite to http://127.0.0.1:8000/redoc
  |-- /openapi.json         --> rewrite to http://127.0.0.1:8000/openapi.json
  |
  Backend (port 8000, internal only, never exposed to host)
```

**Benefits:** No CORS issues, single port to expose, works behind reverse proxies, remote Docker access works out of the box.

**How the frontend API client works (client.ts):**
- `NEXT_PUBLIC_API_URL` defaults to `/` (was `http://localhost:8000`)
- Browser-side: `API_BASE` = `/api/v1` (same-origin, proxied by Next.js rewrites)
- Server-side (SSR/print pages): `API_BASE` = `http://127.0.0.1:8000/api/v1` (direct internal)
- Detection via `typeof window !== 'undefined'` (standard Next.js SSR pattern)

**apiFetch() has three branches:**
1. Absolute URL (`http://...`) -> pass through unchanged
2. Already starts with `/api/` -> use as-is (prevents double `/api/v1/api/v1/...` prefix)
3. Relative path (e.g., `/resumes`) -> prepend `API_BASE`

---

## The `/api_be/` Question

**Q (from PR comments):** Is `/api_be/` used? Is renaming it to `/api/` a breaking change?

**A: No, `/api_be/` was dead code.** Zero references exist anywhere in the codebase. The old `client.ts` made direct requests to `http://localhost:8000/api/v1/...`, completely bypassing the Next.js rewrite that had `source: '/api_be/:path*'`. Renaming to `/api/:path*` is correct and NOT a breaking change.

---

## Issues Found (Prioritized)

### Critical

#### 1. Root Logger Too Broad (`apps/backend/app/main.py:25`)

```python
def _configure_application_logging() -> None:
    numeric_level = getattr(logging, settings.log_level, logging.INFO)
    logging.getLogger().setLevel(numeric_level)  # <-- ROOT logger
```

`logging.getLogger()` with no arguments returns the **root logger**. This affects ALL loggers: uvicorn, httpx, playwright, asyncio, every third-party library.

- `LOG_LEVEL=ERROR` suppresses warnings from all libraries silently
- `LOG_LEVEL=DEBUG` floods logs with httpx request internals, asyncio details, etc.

**Fix:** Change to `logging.getLogger("app").setLevel(numeric_level)` and ensure application code uses `logging.getLogger("app.module_name")`.

#### 2. Docker Hub Workflow Missing Guard (`.github/workflows/docker-publish.yml`)

The Docker Hub login step has no `if:` condition:

```yaml
- name: Login to Docker Hub
  uses: docker/login-action@v3
  with:
    username: ${{ secrets.DOCKERHUB_USERNAME }}
    password: ${{ secrets.DOCKERHUB_TOKEN }}
```

Forks and contributors without these secrets will see workflow failures. Needs:

```yaml
if: secrets.DOCKERHUB_USERNAME != ''
```

Or limit the entire workflow to the upstream repo.

### Medium

#### 3. No `build:` Context in docker-compose.yml

The compose file only has `image: ghcr.io/srbhr/resume-matcher` with no `build:` key. `docker compose up --build` fails. Contributors building locally must use `docker build` directly.

**Fix:** Add both:
```yaml
image: ghcr.io/srbhr/resume-matcher
build: .
```

This allows `docker compose build` for local dev AND `docker compose pull` for pre-built images.

#### 4. Frontend `.env.sample` Stale (`apps/frontend/.env.sample`)

Still contains `NEXT_PUBLIC_API_URL=http://localhost:8000`. Developers copying this get old direct-to-backend behavior, bypassing the proxy model.

**Fix:** Update to `NEXT_PUBLIC_API_URL=/` or comment it out with explanation.

#### 5. `/api/v1` Endpoint Listed in Docs Doesn't Exist

README.md and SETUP.md list `http://localhost:3000/api/v1` as "Backend API root" but no handler exists at that exact path -- returns 404. Should reference `/api/v1/health` or note it's a prefix.

#### 6. Localized Docs Not Updated

`SETUP.es.md`, `SETUP.ja.md`, `SETUP.zh-CN.md` still use:
- `docker-compose` (v1 hyphenated syntax)
- Old FRONTEND_PORT/BACKEND_PORT model
- Missing new sections (secrets, logging, single-port)

### Low

#### 7. Healthcheck Start Period (`Dockerfile:123`)

```dockerfile
HEALTHCHECK --interval=10s --timeout=10s --start-period=10s --retries=10
```

`start-period=10s` is too short for Python+Playwright startup (old was 60s). The 10 retries compensate (total window ~110s), but `--start-period=30s --retries=5` would be more conventional and give a more realistic grace period.

#### 8. Empty Env Var Crash (`config.py` validators)

`LOG_LEVEL=` (empty string) in `.env` causes `ValueError` crash. The validators check `if v is None` but empty string is `""`, not `None`. In Docker, `start.sh` pre-validates, but local dev hits this directly.

**Fix:** Change `"WARNING" if v is None` to `"WARNING" if not v` to catch both `None` and empty string.

#### 9. Frontend Signal Handling (`docker/start.sh:206`)

```bash
node server.js "$@"
```

Runs Node in foreground. Works because Docker sends SIGTERM to all PIDs in the namespace, but `exec node server.js "$@"` would be cleaner -- replaces bash with Node as PID 1 for direct signal handling.

#### 10. Missing `CRITICAL` Log Level

`ALLOWED_LOG_LEVELS` only has `("ERROR", "WARNING", "INFO", "DEBUG")`. Python's `CRITICAL` is omitted. Power users may expect it to work. Minor.

#### 11. Potential `/api/` Route Conflict (`next.config.ts`)

If someone adds `app/api/route.ts` in the future, Next.js serves filesystem routes before rewrites, so it would shadow the backend proxy. Not an issue today (no `app/api/` exists), but worth a code comment.

#### 12. Docker Secrets Docs Incomplete

`start.sh` supports `*_FILE` for 6 vars (LOG_LEVEL, LOG_LLM, LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_API_BASE) but SETUP.md only documents `LLM_API_KEY_FILE`.

#### 13. LiteLLM `LITELLM_LOG` Interaction

LiteLLM internally reads `LITELLM_LOG` env var (handler levels). The PR's `LOG_LLM` sets logger levels. Both must pass for a message to appear. Undocumented interaction -- could confuse users who set `LITELLM_LOG` from litellm docs.

---

## Confirmed Safe / No Issues

| Area | Verdict |
|------|---------|
| Node binary copy in Dockerfile | Correct -- standalone bundles all deps, only `node` needed. Bookworm-to-Bookworm ABI compatible. |
| Bookworm pinning | Good practice -- ensures ABI compatibility across stages |
| `file_env()` in start.sh | Well-implemented, matches PostgreSQL Docker convention |
| `resolveRuntimeApiBase()` SSR detection | Standard `typeof window` pattern, correct for Next.js |
| `apiFetch()` three branches | All usage patterns handled correctly, no double-prefix bugs |
| PDF generation flow | Not affected -- print pages fetch server-side from `127.0.0.1:8000` directly |
| CI permissions (`contents: read, packages: write`) | Minimal and correct |
| Semver tag strategy | `docker/metadata-action@v5` correctly parses `v1.2.3` tags |
| All defaults consistent | `.env.example`, `docker-compose.yml`, `start.sh`, `config.py`, `SETUP.md` all agree |
| `normalize_log_level()` shell function | Correct, bash 4+ syntax fine in container |
| LiteLLM logger names | Verified against `litellm/_logging.py` source -- exact match |
| LITELLM_LOG rename to LOG_LLM | Clean -- zero stale references in project-owned files |
| Config.py Literal + validator pattern | Intentional -- validator normalizes case, Literal provides type safety |
| Double validation (shell + Python) | Intentional defense-in-depth for Docker path |

---

## Recommended Actions Before Merge

### Must-do
1. Scope root logger in `main.py` to `logging.getLogger("app")`
2. Add `if:` guard on Docker Hub login step in workflow
3. Add `build: .` to `docker-compose.yml`

### Should-do
4. Update `apps/frontend/.env.sample` to use `/` as default
5. Fix `/api/v1` endpoint reference in README.md and SETUP.md

### Nice-to-have (follow-up PR)
6. Adjust healthcheck to `--start-period=30s --retries=5`
7. Use `exec node server.js "$@"` in start.sh
8. Handle empty string in config.py validators
9. Update localized SETUP docs
10. Document `*_FILE` support for all 6 env vars
11. Add comment in `next.config.ts` about `/api/` route conflict potential

---

## PR Comments Summary

- **@kiloconnect (bot):** Flagged `/api_be/` -> `/api/` as breaking change WARNING. **Verdict: Not actually breaking (dead code).**
- **@webysther:** Asked for help setting up GitHub secrets for GHCR/Docker Hub. Offered to accept direct edits. Fixed a loop issue. Provided test build command: `docker build -t ghcr.io/srbhr/resume-matcher:pr683 . && docker push ghcr.io/srbhr/resume-matcher:pr683`
- **@srbhr:** Acknowledged, will test.

---

## Context Links

- PR: https://github.com/srbhr/Resume-Matcher/pull/683
- Related PR (CORS fix): https://github.com/srbhr/Resume-Matcher/pull/681
- Issue (multi-arch images): https://github.com/srbhr/Resume-Matcher/issues/682
