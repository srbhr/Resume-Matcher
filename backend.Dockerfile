# ===========================
# Backend Dockerfile
# ===========================

# Base image for Python
FROM python:3.13-slim AS backend

# Environment configurations to optimize runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies for Python and Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
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
    libgtk-3-0 && \
    rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Install backend dependencies
COPY apps/backend/pyproject.toml /app/backend/
COPY apps/backend/app /app/backend/app

WORKDIR /app/backend

RUN pip install -e .

# Install Playwright dependencies
RUN python -m playwright install-deps chromium 2>/dev/null || true
RUN python -m playwright install chromium

# Create data directory with proper permissions BEFORE creating the user
RUN mkdir -p /app/backend/data && chmod 755 /app/backend/data

# Create a non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose the port for the backend
EXPOSE 8000

# Define default CMD to start the backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]