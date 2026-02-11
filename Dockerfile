# Resume Matcher Docker Image
# Multi-stage build for optimized image size

# ============================================
# Stage 1: Build Frontend
# ============================================
FROM node:22 AS frontend-builder

# Build argument for API URL (allows customization at build time)
# Default matches the default BACKEND_PORT in docker-compose.yml
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/frontend

# Copy package files first for better caching
COPY apps/frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY apps/frontend/ ./

# Set environment variable for production build
# This gets baked into the JavaScript bundle at build time
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build the frontend
RUN npm run build

# ============================================
# Stage 2: Final Image
# ============================================
FROM python:3.13-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Node.js installer dependencies
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
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ============================================
# Backend Setup
# ============================================
COPY apps/backend/pyproject.toml /app/backend/
COPY apps/backend/app /app/backend/app

WORKDIR /app/backend

# Install Python dependencies
RUN pip install .

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

# Install Playwright Chromium as appuser (so browsers are in correct location)
RUN python -m playwright install chromium

# Expose ports
EXPOSE 3000 8000

# Volume for persistent data
VOLUME ["/app/backend/data"]

# Set working directory
WORKDIR /app

# Health check (endpoint is at /api/v1/health per backend router configuration)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Start the application
CMD ["/app/start.sh"]
