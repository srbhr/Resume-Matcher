.SHELL := /usr/bin/env bash

.PHONY: all help setup dev build clean backend-test backend-test-pg backend-migrate backend-drift openapi-snapshot

all: help

help:
	@echo "Usage: make [target]"
	@echo "Available targets:"
	@echo "  setup        Run the setup script to configure the project"
	@echo "  run-dev      Setup and start the development server (with graceful shutdown)"
	@echo "  build-prod   Build the project for production"
	@echo "  start-prod   Start the production server (after building)"
	@echo "  run-prod     Build and start the production server"
	@echo "  clean        Clean up generated artifacts"
	@echo "  backend-test Run backend test suite (SQLite)"
	@echo "  backend-test-pg Run backend tests against Postgres (requires POSTGRES_* env vars)"
	@echo "  backend-migrate Apply Alembic migrations"
	@echo "  backend-drift Detect schema drift (fail if drift)"
	@echo "  openapi-snapshot Regenerate OpenAPI snapshot"

setup:
	@echo "🔧 Running setup.sh…"
	@bash setup.sh

run-dev:
	@echo "🚀 Starting development server…"
	@bash -c 'trap "echo "\n🛑 Development server stopped"; exit 0" SIGINT; npm run dev'

build-prod:
	@echo "📦 Building for production…"
	@npm run build

start-prod:
	@echo "🚀 Starting production server…"
	@bash -c 'trap "echo "\n🛑 Production server stopped"; exit 0" SIGINT; npm run start'

run-prod: build-prod
	@echo "🚀 Starting production server…"
	@bash -c 'trap "echo "\n🛑 Production server stopped"; exit 0" SIGINT; npm run start'

clean:
	@echo "🧹 Cleaning artifacts…"
	# Add commands to clean build and temp files, e.g.:
	# rm -rf node_modules apps/backend/.venv apps/frontend/node_modules

backend-test:
	@echo "🧪 Backend tests (SQLite)…"
	@cd apps/backend && python -m pytest -q

backend-test-pg:
	@echo "🧪 Backend tests (Postgres)…"
	@cd apps/backend && FORCE_SQLITE_FOR_TESTS=0 python -m pytest -q -k "not snapshot"

backend-migrate:
	@echo "📜 Applying migrations…"
	@cd apps/backend && alembic upgrade head

backend-drift:
	@echo "🔍 Checking schema drift…"
	@cd apps/backend && python -m scripts.detect_schema_drift

openapi-snapshot:
	@echo "📘 Regenerating OpenAPI snapshot…"
	@cd apps/backend && python -m scripts.update_openapi_snapshot
