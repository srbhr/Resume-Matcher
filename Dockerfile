FROM python:3.12-slim

# Prevent Python from writing .pyc files and ensure unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies that are commonly needed for Python packages
# (kept minimal; add more if runtime errors indicate missing libs)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pre-copy requirements to leverage Docker layer caching
COPY apps/backend/requirements.txt /app/apps/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/apps/backend/requirements.txt

# Copy the full repo
COPY . /app

# Default port (Railway injects PORT env and startCommand from railway.toml)
EXPOSE 8000
