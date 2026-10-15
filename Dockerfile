# Resume Matcher Docker Image
# Multi-stage build for optimized image size

# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:24-bookworm AS frontend-builder

# Build argument for API URL (allows customization at build time)
# Default routes requests through Next.js rewrites on the same origin.
ARG NEXT_PUBLIC_API_URL=/
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

WORKDIR /app/frontend

# Copy package files first for better caching
COPY apps/frontend/package*.json ./

# Install dependencies (npm download cache kept between builds)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy frontend source
COPY apps/frontend/ ./

# Build the frontend (Next.js build cache kept between builds; it is not part of the
# standalone output)
RUN --mount=type=cache,target=/app/frontend/.next/cache \
    npm run build

# ============================================
# Stage 2: Final Image
# ============================================
FROM python:3.13-slim-bookworm

# Set environment variables
# PIP_NO_CACHE_DIR is deliberately not set: the pip steps below use a BuildKit cache
# mount (kept out of the image), and that mount only helps while pip's cache is on.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    IN_CONTAINER=1

# Optional Debian mirrors for slow networks, e.g.
#   docker build --build-arg DEBIAN_MIRROR=https://mirrors.edge.kernel.org/debian .
# DEBIAN_MIRROR is the mirror's /debian URL (packages and updates). Most mirrors do not
# carry debian-security, so that stays on the stock deb.debian.org unless you also set
# DEBIAN_SECURITY_MIRROR (a /debian-security URL). Both are empty by default: the image's
# stock sources are used unchanged. esc() backslash-escapes `&`, `|` (the sed delimiter)
# and `\` so any URL is inserted literally into the sed replacement.
ARG DEBIAN_MIRROR
ARG DEBIAN_SECURITY_MIRROR
RUN esc() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; } \
    && if [ -n "${DEBIAN_MIRROR}" ]; then \
        sed -i "s|^URIs: http://deb.debian.org/debian\$|URIs: $(esc "${DEBIAN_MIRROR%/}")|" \
            /etc/apt/sources.list.d/debian.sources; \
    fi \
    && if [ -n "${DEBIAN_SECURITY_MIRROR}" ]; then \
        sed -i "s|^URIs: http://deb.debian.org/debian-security|URIs: $(esc "${DEBIAN_SECURITY_MIRROR%/}")|" \
            /etc/apt/sources.list.d/debian.sources; \
    fi

# Install system dependencies. BuildKit cache mounts keep the downloaded .debs between
# builds (docker-clean would delete them after install), so a re-run of this layer
# does not download everything again. The mounts are not part of the image.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    # CJK fonts for Chinese/Japanese/Korean PDF rendering via Playwright
    fonts-noto-cjk

# ============================================
# Python dependencies + Chromium (cached across code changes)
# ============================================
# These layers only depend on pyproject.toml, so editing app code or the frontend
# never re-downloads dependencies or Chromium.
WORKDIR /app/backend
COPY apps/backend/pyproject.toml /app/backend/

# Optional Python package index mirror for slow networks, e.g.
#   docker build --build-arg PIP_INDEX_URL=https://pypi.mirrors.ustc.edu.cn/simple .
# pip reads PIP_INDEX_URL from the environment (an empty value is ignored), so both pip
# installs below use it when set and the default PyPI otherwise.
ARG PIP_INDEX_URL

# Install the dependency list from pyproject.toml (read with tomllib so it never
# drifts), without the package itself. The package is installed after the code copy.
RUN --mount=type=cache,target=/root/.cache/pip \
    python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# Chromium for PDF export, installed once into a shared path (root-owned, readable by
# appuser) so the layer survives code changes. Only the headless shell is installed:
# app/pdf.py launches headless, which Playwright 1.49+ serves from the headless shell.
# Optional build arg for a mirror when the default CDN is slow:
#   docker build --build-arg PLAYWRIGHT_DOWNLOAD_HOST=https://<mirror> .
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ARG PLAYWRIGHT_DOWNLOAD_HOST
RUN python -m playwright install --only-shell chromium \
    && chmod -R a+rX /ms-playwright

WORKDIR /app

# Copy Node.js runtime from frontend builder for reproducible runtime behavior.
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node

# ============================================
# Backend Setup
# ============================================
COPY apps/backend/app /app/backend/app

WORKDIR /app/backend

# Install the backend package itself (dependencies are already installed above)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-deps .

# ============================================
# Frontend Setup
# ============================================
WORKDIR /app/frontend

# Copy standalone frontend runtime from builder stage
COPY --from=frontend-builder /app/frontend/.next/standalone ./
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /app/frontend/public ./public

# ============================================
# Startup Script
# ============================================
COPY docker/start.sh /app/start.sh
# Convert CRLF to LF (fixes Windows line ending issues) and make executable
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

# ============================================
# Data Directory & Volume
# ============================================
RUN mkdir -p /app/backend/data

# Create a non-root user for security
RUN useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app

USER appuser

# Expose the public port (backend remains internal on 8000)
EXPOSE 3000

# Volume for persistent data
VOLUME ["/app/backend/data"]

# Set working directory
WORKDIR /app

# Health check on internal backend port only (independent of host port mapping).
HEALTHCHECK --interval=10s --timeout=10s --start-period=30s --retries=5 \
    CMD curl -f http://127.0.0.1:8000/api/v1/health || exit 1

# Start the application
CMD ["/app/start.sh"]
