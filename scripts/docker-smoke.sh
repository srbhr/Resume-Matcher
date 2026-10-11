#!/usr/bin/env bash
#
# Docker smoke test for Resume Matcher: builds the image (with the build cache),
# runs it, and checks that the app actually works inside the container.
#
#   ./scripts/docker-smoke.sh                  build + test
#   ./scripts/docker-smoke.sh --no-build       test an existing image tag
#   ./scripts/docker-smoke.sh --tag my:tag     use a different image tag
#   ./scripts/docker-smoke.sh --keep           leave the container running afterwards
#   ./scripts/docker-smoke.sh --clean          also remove the image afterwards
#
# Environment:
#   SMOKE_PORT            host port to start looking from (default 3100; the next
#                         free port is used if it is taken)
#   SMOKE_HEALTH_TIMEOUT  seconds to wait for the app to become healthy (default 120)
#   DEBIAN_MIRROR, PLAYWRIGHT_DOWNLOAD_HOST
#                         forwarded to the build as --build-arg when set (slow networks)
#
# Safe by design: the container gets a throwaway named volume for
# /app/backend/data (your real data is never touched), has no LLM key configured,
# and /api/v1/status (which runs a live LLM health check) is never called.
# Works with the bash 3.2 that ships with macOS.

set -euo pipefail

cd "$(dirname "$0")/.."

TAG="resume-matcher:smoke"
PORT="${SMOKE_PORT:-3100}"
HEALTH_TIMEOUT="${SMOKE_HEALTH_TIMEOUT:-120}"
BUILD=1
KEEP=0
CLEAN=0

usage() {
    sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --no-build) BUILD=0 ;;
        --keep) KEEP=1 ;;
        --clean) CLEAN=1 ;;
        --tag)
            if [ $# -lt 2 ]; then
                echo "--tag needs a value" >&2
                exit 2
            fi
            TAG="$2"
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
    shift
done

CONTAINER="resume-matcher-smoke-$$"
VOLUME="resume-matcher-smoke-data-$$"
CONTAINER_CREATED=0

cleanup() {
    local rc=$?
    trap - EXIT INT TERM
    if [ "$KEEP" = 1 ] && [ "$CONTAINER_CREATED" = 1 ]; then
        echo ""
        echo "Kept running (--keep): http://localhost:${PORT}"
        echo "Remove with: docker rm -f ${CONTAINER} && docker volume rm ${VOLUME}"
    else
        docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
        docker volume rm -f "$VOLUME" > /dev/null 2>&1 || true
    fi
    if [ "$CLEAN" = 1 ]; then
        docker rmi "$TAG" > /dev/null 2>&1 || true
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running or not reachable." >&2
    exit 1
fi

# --- 1. Build ---------------------------------------------------------------
if [ "$BUILD" = 1 ]; then
    echo "==> Building ${TAG} (uses the build cache)"
    BUILD_START=$SECONDS
    BUILD_ARGS=()
    for var in DEBIAN_MIRROR PLAYWRIGHT_DOWNLOAD_HOST; do
        if [ -n "${!var:-}" ]; then
            BUILD_ARGS+=(--build-arg "${var}=${!var}")
            echo "    (forwarding ${var}=${!var})"
        fi
    done
    docker build ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} -t "$TAG" .
    BUILD_SECONDS=$((SECONDS - BUILD_START))
    echo "==> Build finished in ${BUILD_SECONDS}s"
else
    BUILD_SECONDS=""
    if ! docker image inspect "$TAG" > /dev/null 2>&1; then
        echo "Image ${TAG} not found (drop --no-build to build it)." >&2
        exit 1
    fi
    echo "==> Skipping build, testing existing image ${TAG}"
fi

# --- 2. Run -----------------------------------------------------------------
port_in_use() {
    (exec 3<> "/dev/tcp/127.0.0.1/$1") 2> /dev/null
}

tries=0
while port_in_use "$PORT"; do
    tries=$((tries + 1))
    if [ "$tries" -gt 50 ]; then
        echo "No free host port found starting at ${SMOKE_PORT:-3100}." >&2
        exit 1
    fi
    PORT=$((PORT + 1))
done

echo "==> Starting ${CONTAINER} on http://localhost:${PORT} (throwaway volume ${VOLUME})"
CONTAINER_CREATED=1
docker run -d --name "$CONTAINER" \
    -p "127.0.0.1:${PORT}:3000" \
    -v "${VOLUME}:/app/backend/data" \
    "$TAG" > /dev/null

# --- Checks -----------------------------------------------------------------
PASSED=0
FAILED=0

# check "<name>" <command...>: runs the command, records PASS/FAIL, never aborts.
check() {
    local name="$1"
    shift
    local out
    if out="$("$@" 2>&1)"; then
        PASSED=$((PASSED + 1))
        printf '  [PASS] %s%s\n' "$name" "${out:+ - $out}"
    else
        FAILED=$((FAILED + 1))
        printf '  [FAIL] %s%s\n' "$name" "${out:+ - $out}"
    fi
}

backend_health() {
    local body
    body="$(docker exec "$CONTAINER" curl -sf --max-time 5 http://127.0.0.1:8000/api/v1/health)" || return 1
    case "$body" in *healthy*) echo "$body" ;; *) echo "unexpected body: $body"; return 1 ;; esac
}

# Retries for up to $2 seconds until $1 answers 200 (the frontend starts after the backend).
http_200() {
    local url="$1" wait="${2:-30}" code="" start=$SECONDS
    while :; do
        code="$(curl -sL -o /dev/null -w '%{http_code}' --max-time 20 "$url" 2> /dev/null || true)"
        if [ "$code" = "200" ]; then
            echo "HTTP 200"
            return 0
        fi
        if [ $((SECONDS - start)) -ge "$wait" ]; then
            echo "HTTP ${code:-no response}"
            return 1
        fi
        sleep 1
    done
}

proxy_health() {
    local body
    body="$(curl -sfL --max-time 20 "http://127.0.0.1:${PORT}/api/v1/health")" || return 1
    case "$body" in *healthy*) echo "$body" ;; *) echo "unexpected body: $body"; return 1 ;; esac
}

pdf_render() {
    docker exec -i -u appuser "$CONTAINER" python - << 'PY'
import asyncio
from playwright.async_api import async_playwright


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content("<h1>Resume Matcher smoke test</h1><p>PDF check</p>")
        pdf = await page.pdf()
        await browser.close()
    assert pdf.startswith(b"%PDF"), "output is not a PDF"
    assert len(pdf) > 1000, f"PDF too small: {len(pdf)} bytes"
    print(f"PDF rendered, {len(pdf)} bytes")


asyncio.run(main())
PY
}

container_user() {
    local user
    user="$(docker exec "$CONTAINER" id -un)" || return 1
    [ "$user" = "appuser" ] || { echo "runs as ${user}, expected appuser"; return 1; }
    echo "$user (uid $(docker exec "$CONTAINER" id -u))"
}

# --- 3. Wait for health ------------------------------------------------------
echo "==> Waiting up to ${HEALTH_TIMEOUT}s for /api/v1/health"
HEALTHY=0
WAIT_START=$SECONDS
while [ $((SECONDS - WAIT_START)) -lt "$HEALTH_TIMEOUT" ]; do
    if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2> /dev/null)" != "true" ]; then
        break
    fi
    if docker exec "$CONTAINER" curl -sf --max-time 5 http://127.0.0.1:8000/api/v1/health > /dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    sleep 2
done

echo "==> Running checks"
if [ "$HEALTHY" = 1 ]; then
    echo "  (backend healthy after $((SECONDS - WAIT_START))s)"
else
    FAILED=$((FAILED + 1))
    echo "  [FAIL] backend did not become healthy within ${HEALTH_TIMEOUT}s"
fi

if [ "$HEALTHY" = 1 ]; then
    check "backend /api/v1/health (inside container)" backend_health
    check "frontend serves /" http_200 "http://127.0.0.1:${PORT}/"
    check "frontend serves /dashboard" http_200 "http://127.0.0.1:${PORT}/dashboard"
    check "/api/v1/health through the frontend proxy" proxy_health
    check "PDF rendering (Playwright Chromium as appuser)" pdf_render
    check "container runs as appuser" container_user
fi

# --- 7. Summary ---------------------------------------------------------------
SIZE_BYTES="$(docker image inspect -f '{{.Size}}' "$TAG" 2> /dev/null || echo 0)"
SIZE_MB="$(awk -v b="$SIZE_BYTES" 'BEGIN { printf "%.0f", b / 1000000 }')"

echo ""
if [ "$FAILED" -gt 0 ]; then
    echo "--- last container logs ---"
    docker logs --tail 50 "$CONTAINER" 2>&1 || true
    echo "---------------------------"
fi
echo "Image:  ${TAG} (${SIZE_MB} MB)"
if [ -n "$BUILD_SECONDS" ]; then
    echo "Build:  ${BUILD_SECONDS}s"
fi
if [ "$FAILED" -eq 0 ]; then
    echo "RESULT: PASS (${PASSED} checks passed)"
    exit 0
fi
echo "RESULT: FAIL (${FAILED} failed, ${PASSED} passed)"
exit 1
