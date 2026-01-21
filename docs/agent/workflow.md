# Workflow: Commits, PRs, and Testing

> **Git workflow, testing guidelines, and PR conventions.**

## Commit Guidelines

- Use concise, sentence-style subjects (e.g., `Add custom funding link to FUNDING.yml`)
- Keep messages short
- If using prefixes, stick to `type: summary` in the imperative
- Reference issues with `Fixes #123`

### Examples

```
Add resume enrichment wizard component
Fix PDF generation timeout on large resumes
Refactor LLM provider configuration
```

## Pull Request Guidelines

1. **Reference issues**: `Fixes #123` in the description
2. **Call out schema or prompt changes** so reviewers can smoke-test downstream agents
3. **List local verification commands** you ran
4. **Attach screenshots** for UI or API changes

## Testing Guidelines

### Frontend Testing

- All contributions must pass `npm run lint`
- Add Jest or Playwright suites beneath `apps/frontend/__tests__/`
- Name test files `*.test.tsx`

```bash
# Run linter
npm run lint

# Format code
npm run format
```

### Backend Testing

- Tests belong in `apps/backend/tests/`
- Use `test_*.py` naming convention
- Seed anonymized resume/job fixtures

```bash
# Run tests
cd apps/backend
uv run pytest
```

## Definition of Done

Before marking a PR as ready:

- [ ] Code compiles without errors
- [ ] `npm run lint` passes
- [ ] New features have tests (or documented reason why not)
- [ ] UI changes follow [Swiss International Style](design/style-guide.md)
- [ ] Schema/prompt changes are called out in PR description
- [ ] Screenshots attached for UI changes
- [ ] Verified locally with commands listed in PR

## Code Review Checklist

- [ ] Type hints on all Python functions
- [ ] Proper error handling (generic to clients, detailed in logs)
- [ ] No exposed secrets or API keys
- [ ] Follows existing patterns in the codebase
- [ ] Documentation updated if needed
