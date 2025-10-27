# Repository Guidelines

## Project Structure & Module Organization
- `apps/backend/app` contains the FastAPI stack: `agent/` for wrappers, `services/` for orchestration (see `score_improvement_service.py`), `prompt/` for LLM prompts, and `schemas/` for JSON/Pydantic contracts.
- `apps/frontend` hosts the Next.js dashboard (`app/` routes, shared `components/`, utility `lib/`); keep reusable UI logic in `lib/` and scope feature code to the route directory.
- Root tooling sits beside this file: `Makefile`, `setup.sh`, and `package.json` coordinate workflows; `docs/CONFIGURING.md` and `assets/` hold configuration notes.

## Build, Test, and Development Commands
- `npm run install` provisions the frontend and, via `uv`, the backend virtual environment.
- `make run-dev` (or `npm run dev`) launches FastAPI on `:8000` and the UI on `:3000`; use `npm run dev:backend` or `npm run dev:frontend` to focus on a single tier.
- Production builds: `npm run build` for both stacks, `npm run build:frontend` for UI-only, and `make build-prod` for a Makefile-driven bundle.
- Quality checks: `npm run lint` for the UI, `npm run format` to apply Prettier, and `uv run python apps/backend/test_docx_dependencies.py` when validating DOCX support.

## Coding Style & Naming Conventions
- Python uses 4-space indents, type hints, and descriptive async names; mirror the patterns in `apps/backend/app/services/score_improvement_service.py` and document side effects in docstrings.
- Frontend code is TypeScript-first. Use PascalCase for components, camelCase for helpers, Tailwind utility classes for styling, and run Prettier before committing.
- Environment files should match the samples (`apps/backend/.env`, `apps/frontend/.env.local`); only the templates belong in Git.

## Testing Guidelines
- UI contributions must pass `npm run lint`; add Jest or Playwright suites beneath `apps/frontend/__tests__/` named `*.test.tsx` as functionality expands.
- Backend tests belong in `apps/backend/tests/` using `test_*.py` naming. Execute them with `uv run python -m pytest` once `pytest` is added, and seed anonymised resume/job fixtures.

## Commit & Pull Request Guidelines
- History shows concise, sentence-style subjects (e.g., `Add custom funding link to FUNDING.yml`) and GitHub merge commits; keep messages short and, if using prefixes, stick to `type: summary` in the imperative.
- Reference issues (`Fixes #123`) and call out schema or prompt changes in the PR description so reviewers can smoke-test downstream agents.
- List local verification commands and attach screenshots for UI or API changes.

## Agent Workflow Notes
- Register new agents in `apps/backend/app/agent/manager.py`, pair prompts under `apps/backend/app/prompt/`, and update both JSON and Pydantic schemas in `apps/backend/app/schemas/`.
- After prompt or embedding tweaks, rerun `ScoreImprovementService.run` locally to confirm score deltas and preview rendering remain stable.
