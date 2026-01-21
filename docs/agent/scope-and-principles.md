# Scope and Principles

> **Canonical source for agent behavior rules in Resume Matcher.**

## What This Repo Is

Resume Matcher is an AI-powered application that helps users tailor resumes to job descriptions. It consists of:

- **Backend**: FastAPI + Python 3.11+ with multi-provider LLM support via LiteLLM
- **Frontend**: Next.js 15 + React 19 with Swiss International Style design
- **Database**: TinyDB (JSON file storage)
- **PDF Generation**: Headless Chromium via Playwright

## Non-Negotiable Rules

### Code Quality

1. **All frontend changes** MUST follow the Swiss International Style in [style-guide.md](design/style-guide.md)
2. **All backend functions** MUST have type hints
3. **Run `npm run lint`** before committing frontend changes
4. **Run Prettier** (`npm run format`) before committing

### Error Handling

- **Backend**: Log detailed errors server-side, return generic messages to clients
- **Frontend**: Use proper error boundaries and user-friendly error states

### Security

- Never expose API keys or sensitive data in client responses
- Use `asyncio.Lock()` for shared resource initialization
- Always use `copy.deepcopy()` for mutable default values

## Out of Scope

The agent should NOT:

- Modify GitHub workflow files (`.github/workflows/`)
- Change CI/CD configuration without explicit request
- Alter Docker build behavior without explicit request
- Remove or disable tests

## Related Docs

- [quickstart.md](quickstart.md) - Build, run, test commands
- [workflow.md](workflow.md) - Git workflow, PRs, commits
