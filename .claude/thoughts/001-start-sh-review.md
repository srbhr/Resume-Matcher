# Code Review: docker/start.sh

**Reviewed:** 2026-03-04
**Context:** Graceful shutdown rewrite — replaced `exec node server.js` with backgrounded node + `wait -n`

---

## CRITICAL

### 1. `warn()` writes to stdout, corrupting `$(normalize_log_level ...)` return value

**Lines:** 56–57 (warn function), 100 (warn call inside normalize_log_level), 163–164 (callers)

`warn()` writes to stdout with no redirection:

```bash
warn() {
    echo -e "${YELLOW}[!]${NC} $1"    # stdout, not stderr
}
```

`normalize_log_level` calls `warn` from inside a `$(...)` subshell:

```bash
APP_LOG_LEVEL="$(normalize_log_level "${LOG_LEVEL}" "INFO" "LOG_LEVEL")"
LLM_LOG_LEVEL="$(normalize_log_level "${LOG_LLM}" "WARNING" "LOG_LLM")"
```

When an invalid level is supplied, the captured value includes the full ANSI escape warning line concatenated with the fallback string:

```
APP_LOG_LEVEL value: [[1;33m[!][0m Invalid LOG_LEVEL=BADLEVEL, using INFO
INFO]
```

This garbage string is then passed to uvicorn:

```bash
UVICORN_LOG_LEVEL="$(echo "${APP_LOG_LEVEL}" | tr '[:upper:]' '[:lower:]')"
# expands to: --log-level "[1;33m[!][0m invalid log_level=badlevel, using info\ninfo"
```

Uvicorn validates its `--log-level` argument and rejects this, causing the backend to die on startup. The container then spends 30 seconds timing out in the health-check loop and exits with code 1.

**Fix:** Redirect all helper functions to stderr:

```bash
warn() {
    echo -e "${YELLOW}[!]${NC} $1" >&2
}
```

Same fix applies to `status()`, `info()`, and `error()` — all four should write to stderr so they never pollute `$(...)` callers.

---

### 2. `wait -n` exit code masked — container always exits 0

**Lines:** 107–125 (cleanup), 235–237

```bash
wait -n $BACKEND_PID $FRONTEND_PID 2>/dev/null || true   # exit code thrown away
warn "A process exited unexpectedly, shutting down..."
cleanup                                                   # always exits 0 (line 124)
```

Inside `cleanup`:

```bash
exit 0    # line 124 — unconditional
```

When uvicorn crashes with exit code 1 or node crashes with 137, Docker/Compose/Kubernetes all receive exit code 0. This is indistinguishable from a clean shutdown:

- `docker run` returns 0
- Compose `restart: on-failure` never triggers
- Kubernetes `restartPolicy: OnFailure` never triggers
- Health-check failures are silenced at the container boundary

**Fix:** Capture the failed PID exit status and propagate:

```bash
FAILED_EXIT=1   # default if unknown

wait -n $BACKEND_PID $FRONTEND_PID 2>/dev/null
FAILED_EXIT=$?

cleanup() {
    trap '' SIGTERM SIGINT SIGQUIT
    # ... kill children ...
    exit "${FAILED_EXIT:-1}"
}
```

---

## MEDIUM

### 3. Health-check loop doesn't detect backend crash mid-loop

**Lines:** 206–216

```bash
for i in {1..30}; do
    if curl -s "http://127.0.0.1:${BACKEND_PORT}/api/v1/health" > /dev/null 2>&1; then
        status "Backend is ready (PID: $BACKEND_PID)"
        break
    fi
    if [ $i -eq 30 ]; then
        error "Backend failed to start within 30 seconds"
        exit 1
    fi
    sleep 1
done
```

If the backend crashes at iteration 5 (e.g., bad `UVICORN_LOG_LEVEL` from issue #1, or missing Python dependency), the loop continues for 25 more seconds with no output indicating the process is already dead. The loop never calls `kill -0 "$BACKEND_PID"` to confirm liveness.

**Fix:** Add liveness check inside the loop:

```bash
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    error "Backend process (PID: $BACKEND_PID) died during startup"
    exit 1
fi
```

---

### 4. `wait -n` returns 127 when both PIDs are already dead

**Line:** 235

`wait -n` with already-reaped PIDs returns 127. The `|| true` masks this identically to a normal exit. The script cannot distinguish "both children died before we got here" from "one child just exited normally."

A more robust approach uses `wait -p` (available in bash 5.1+, bookworm has bash 5.2):

```bash
wait -n -p EXITED_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
```

---

### 5. Signal race between `&` and `PID=$!`

**Lines:** 201–202, 230–231

```bash
python -m uvicorn ... &
BACKEND_PID=$!                  # one-instruction window
```

Between the `&` and the assignment, `BACKEND_PID` is still `""`. If SIGTERM arrives in that exact window, `cleanup` runs with empty PID and the backend process becomes an orphan. The same race exists for `FRONTEND_PID`.

In practice this window is extremely narrow, but it is a real race.

**Fix:** Disable trap across critical section:

```bash
trap '' SIGTERM SIGINT SIGQUIT
python -m uvicorn ... &
BACKEND_PID=$!
trap cleanup SIGTERM SIGINT SIGQUIT
```

---

### 6. `cleanup` doesn't reset trap — double-entry possible

**Lines:** 107–125, 237

`cleanup` can be entered from two paths simultaneously:

1. The `wait -n` path (line 237: explicit `cleanup` call)
2. A SIGTERM arriving while path 1 is executing

The second entry causes `kill`/`wait` to be called twice on the same PIDs.

**Fix:** Reset trap at the top of cleanup:

```bash
cleanup() {
    trap '' SIGTERM SIGINT SIGQUIT
    # ... rest of function
}
```

---

## LOW

### 7. ShellCheck SC2086: unquoted variables

**Line:** 201

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} ...
```

`${BACKEND_PORT}` is unquoted. Since it's hardcoded to `"8000"` on line 14, this is not exploitable now, but would become a word-splitting vector if ever made user-configurable.

**Fix:** Quote all variable expansions:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT}" --log-level "${UVICORN_LOG_LEVEL}" &
```

---

### 8. Playwright install stderr suppressed

**Lines:** 191–193

```bash
cd /app/backend && python -m playwright install chromium 2>/dev/null || {
    warn "Playwright installation had warnings (this is usually OK)"
}
```

`2>/dev/null` suppresses all stderr including fatal errors (network error, disk full). The `warn` message says "this is usually OK" even for real failures, causing silent PDF generation failures at runtime.

The `cd /app/backend` is also unnecessary — `playwright install` doesn't require a specific working directory.

**Fix:**

```bash
python -m playwright install chromium || warn "Playwright install failed — PDF export may not work"
```

---

### 9. ShellCheck SC2163: `export "$var"="$val"` form

**Line:** 86

```bash
export "$var"="$val"
```

ShellCheck flags this pattern. In practice, since `var` is always one of the known env var names (never user-supplied), this is a style issue.

---

## INFO

### 10. `wait -n` portability

`wait -n` is available in bash 4.3+ (2014). The runtime container uses bash 5.2.15 (bookworm). No portability issue. The `2>/dev/null` hides useful diagnostic info for debugging.

---

### 11. ANSI colors emitted without tty detection

**Lines:** 19, 44–61

No `[ -t 1 ]` check before emitting ANSI codes. Docker logs renders them fine, but log aggregators (Fluentd, CloudWatch, Loki) will see raw escape sequences.

**Fix:**

```bash
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    # ...
else
    GREEN=''
    # all colors empty
fi
```
