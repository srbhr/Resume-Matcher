.SHELL := /usr/bin/env bash

.PHONY: all help setup start-redis redis-status run-dev run-prod clean

all: help

help:
	@echo "Usage: make [target]"
	@echo "Available targets:"
	@echo "  setup        Run the setup script to configure the project"
	@echo "  run-dev      Start Redis and development server (with graceful shutdown)"
	@echo "  start-redis  Start Redis server only"
	@echo "  redis-status Check Redis server status"
	@echo "  run-prod     Build the project for production"
	@echo "  clean        Clean up generated artifacts"

setup:
	@echo "🔧 Running setup.sh…"
	@bash setup.sh

start-redis:
	@echo "📡 Starting Redis server..."
	@bash -c '\
		if ! pgrep -x redis-server > /dev/null; then \
			if command -v redis-server > /dev/null 2>&1; then \
				if [[ "$$OSTYPE" == "linux-gnu"* ]]; then \
					sudo systemctl start redis-server 2>/dev/null || sudo service redis-server start 2>/dev/null || redis-server --daemonize yes; \
				elif [[ "$$OSTYPE" == "darwin"* ]]; then \
					brew services start redis 2>/dev/null || redis-server --daemonize yes; \
				else \
					redis-server --daemonize yes; \
				fi; \
				echo "✅ Redis server started"; \
			else \
				echo "❌ Redis not found. Please install Redis or run: make setup"; \
				exit 1; \
			fi; \
		else \
			echo "✅ Redis server already running"; \
		fi'

redis-status:
	@echo "🔍 Checking Redis status..."
	@bash -c '\
		if pgrep -x redis-server > /dev/null; then \
			echo "✅ Redis server is running (PID: $$(pgrep -x redis-server))"; \
			if command -v redis-cli > /dev/null 2>&1; then \
				if redis-cli ping > /dev/null 2>&1; then \
					echo "✅ Redis is responding to ping"; \
				else \
					echo "⚠️  Redis process running but not responding"; \
				fi; \
			fi; \
		else \
			echo "❌ Redis server is not running"; \
			echo "💡 Run: make start-redis"; \
		fi'

run-dev:
	@echo "🚀 Starting Redis and development server…"
	@bash -c '\
		echo "📡 Starting Redis server..."; \
		if ! pgrep -x redis-server > /dev/null; then \
			if command -v redis-server > /dev/null 2>&1; then \
				if [[ "$$OSTYPE" == "linux-gnu"* ]]; then \
					sudo systemctl start redis-server 2>/dev/null || sudo service redis-server start 2>/dev/null || redis-server --daemonize yes; \
				elif [[ "$$OSTYPE" == "darwin"* ]]; then \
					brew services start redis 2>/dev/null || redis-server --daemonize yes; \
				else \
					redis-server --daemonize yes; \
				fi; \
				echo "✅ Redis server started"; \
			else \
				echo "⚠️  Redis not found. Please install Redis or run setup.sh"; \
			fi; \
		else \
			echo "✅ Redis server already running"; \
		fi; \
		echo "🚀 Starting development server..."; \
		trap "echo \"\n🛑 Development server stopped\"; exit 0" SIGINT; \
		npm run dev'

run-prod:
	@echo "📦 Building for production…"
	@npm run build

clean:
	@echo "🧹 Cleaning artifacts…"
	# Add commands to clean build and temp files, e.g.:
	# rm -rf node_modules apps/backend/.venv apps/frontend/node_modules
