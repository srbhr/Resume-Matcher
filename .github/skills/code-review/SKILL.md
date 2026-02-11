---
name: code-review
description: |
  Review code for correctness, security, performance, and Resume Matcher conventions. Use when receiving code review feedback or before submitting PRs. Requires technical rigor, not performative agreement.
---

# Code Review

Code review requires technical evaluation, not emotional performance.

**Core principle:** Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## Review Checklist

### Backend (Python/FastAPI)

- [ ] All functions have type hints
- [ ] `copy.deepcopy()` for mutable defaults
- [ ] Error handling: detailed logs server-side, generic messages to clients
- [ ] API keys via `api_key=` parameter, not `os.environ`
- [ ] Async functions for I/O operations
- [ ] Pydantic schemas for request/response bodies
- [ ] No blocking calls in async routes
- [ ] `asyncio.Lock()` for shared resource initialization

### Frontend (Next.js/React)

- [ ] Swiss International Style compliance
- [ ] `rounded-none` everywhere
- [ ] Textareas have Enter key handler
- [ ] Direct icon imports (not barrel)
- [ ] `next/dynamic` for heavy components
- [ ] `Promise.all()` for independent fetches
- [ ] Server Actions check auth inside

### Security

- [ ] No secrets in code
- [ ] Input validation on user data
- [ ] CORS configured properly
- [ ] Auth checks on protected endpoints

## Response Pattern

```
WHEN receiving feedback:
1. READ: Complete feedback without reacting
2. UNDERSTAND: Restate requirement in own words
3. VERIFY: Check against codebase reality
4. EVALUATE: Technically sound for THIS codebase?
5. RESPOND: Technical acknowledgment or reasoned pushback
6. IMPLEMENT: One item at a time, test each
```

## Forbidden Responses

- "You're absolutely right!" (performative)
- "Great point!" (performative)
- "Let me implement that now" (before verification)

## When to Push Back

- Suggestion breaks existing functionality
- Reviewer lacks full context
- Violates YAGNI (unused feature)
- Technically incorrect for this stack
- Conflicts with architectural decisions

## Severity Format

```
[CRITICAL] file:line - Security, data loss, crash
[ERROR]    file:line - Bug, missing validation
[WARNING]  file:line - Style, convention
[INFO]     file:line - Suggestion, not required
```

## References

- Backend guide: `docs/agent/architecture/backend-guide.md`
- Coding standards: `docs/agent/coding-standards.md`
- Style guide: `docs/agent/design/style-guide.md`
