# Code Review Index

**Date:** 2026-03-04
**Scope:** Docker build fix (ESLint/eslint-config-next), graceful shutdown rewrite, CORS auto-include, docker-compose updates.

---

## Files Changed

| File | What Changed |
|------|-------------|
| `apps/frontend/package.json` | `eslint` ^10→^9, `eslint-config-next` ^15→^16 |
| `apps/frontend/eslint.config.mjs` | Replaced `FlatCompat` with native flat config imports |
| `apps/frontend/package-lock.json` | Regenerated — 0 vulnerabilities |
| `apps/frontend/lib/utils/download.ts` | Prettier formatting |
| `apps/frontend/tests/download-utils.test.ts` | Prettier formatting |
| `docker/start.sh` | Graceful shutdown: backgrounded node + `wait -n` |
| `apps/backend/app/config.py` | Added `effective_cors_origins` property |
| `apps/backend/app/main.py` | Uses `effective_cors_origins` for CORS |
| `docker-compose.yml` | Documented `CORS_ORIGINS` override |

---

## Review Reports

| # | File | Findings | Critical | Medium | Low |
|---|------|----------|----------|--------|-----|
| [001](001-start-sh-review.md) | `docker/start.sh` | 11 | 2 | 4 | 3 |
| [002](002-eslint-config-review.md) | ESLint config + `package.json` | 12 | 1 | 2 | 3 |
| [003](003-python-config-review.md) | Python config + CORS | 8 | 0 | 3 | 1 |
| [004](004-docker-compose-review.md) | `docker-compose.yml` | 3 | 0 | 1 | 0 |
| [005](005-package-lock-review.md) | `package-lock.json` | 4 | 0 | 0 | 0 |

---

## Priority Fix List

### Critical (must fix before merge)

1. ~~**`warn()` writes to stdout** → corrupts `normalize_log_level` return value~~ **FIXED** — all helpers redirect to `>&2`
2. ~~**Exit code always 0** → Docker/K8s can't detect crashes~~ **FIXED** — `EXIT_CODE=$?` captured from `wait -n`, propagated in `cleanup`
3. ~~**`--ext` flag is no-op**~~ **FIXED** — lint script changed to `eslint .`

### Medium (should fix)

4. ~~Health-check loop has no PID liveness check~~ **FIXED** — added `kill -0` check inside loop
5. ~~`cleanup` doesn't reset trap — double-entry possible~~ **FIXED** — `trap '' SIGTERM SIGINT SIGQUIT` at top of cleanup
6. ~~Wrong import: `eslint-config-prettier`~~ **FIXED** — changed to `eslint-config-prettier/flat`
7. ~~`@eslint/eslintrc` is dead dependency~~ **FIXED** — removed from package.json
8. ~~Whitespace-only `FRONTEND_BASE_URL` passes guard~~ **FIXED** — `.strip()` added
9. ~~Trailing slash creates dead CORS entry~~ **FIXED** — `.rstrip("/")` added
10. `CORS_ORIGINS` format not validated — raw crash on comma-separated input (**deferred** — pydantic-settings behavior, low risk since .env.example documents format)
11. ~~docker-compose comment contradicts example format~~ **FIXED** — clarified to "JSON array format"

### Low (also fixed)

12. ~~Signal race between `&` and `PID=$!`~~ **FIXED** — trap disabled across critical sections
13. ~~Playwright `2>/dev/null` masks errors~~ **FIXED** — stderr no longer suppressed
14. ~~Unquoted `${BACKEND_PORT}` in uvicorn command~~ **FIXED** — all vars quoted
