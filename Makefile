.SHELL := /usr/bin/env bash

.PHONY: all help setup dev build clean

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
