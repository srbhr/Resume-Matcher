# Next.js 15 Performance Pack

A focused, opinionated guide to the highest-impact performance optimizations for Next.js 15 applications. Adapted from Vercel's react-best-practices, restructured for portability and self-contained reading.

This pack is **self-contained**: every file in this directory links only to siblings here. Drop the whole folder into any project and the cross-references keep working.

---

## What you get

| File | Severity | Topic |
|------|----------|-------|
| [01-waterfalls.md](01-waterfalls.md) | CRITICAL | Eliminating sequential awaits, parallel fetching, Suspense streaming |
| [02-bundle-size.md](02-bundle-size.md) | CRITICAL | Barrel imports, dynamic imports, third-party scripts |
| [03-server-actions-security.md](03-server-actions-security.md) | CRITICAL | Auth checks inside Server Actions |
| [04-server-side-perf.md](04-server-side-perf.md) | HIGH | `React.cache()`, minimizing client data, `after()` for non-blocking work |
| [checklist.md](checklist.md) | — | Pre-PR checklist + `next.config.js` template |

---

## Audience

You should read this if you're:

- Writing or reviewing Next.js 15+ code (App Router)
- Hitting unexplained slowness on data-heavy pages
- Looking at large client bundles and not sure what's bloating them
- Building Server Actions and unsure about auth boundaries

---

## Prerequisites

Comfort with:

- React 18+ Server Components and Client Components (`'use client'`)
- async/await
- Next.js App Router (not Pages Router — most patterns here don't apply)
- TypeScript syntax in examples (the patterns work in JS too)

---

## How to read

1. Start with [01-waterfalls.md](01-waterfalls.md) — sequential awaits are the single biggest cause of unexplained slowness, and the fixes are nearly free.
2. Then [02-bundle-size.md](02-bundle-size.md) — barrel imports are quietly murdering cold-start times in most projects.
3. [03-server-actions-security.md](03-server-actions-security.md) is short but non-negotiable.
4. [04-server-side-perf.md](04-server-side-perf.md) is for when you've handled the basics and want to squeeze more.
5. Use [checklist.md](checklist.md) before opening every PR.

---

## A note on severity

The four issues marked CRITICAL are the ones that, in production code reviews, cause the biggest measurable wins. If you have limited time, fix waterfalls and barrel imports first — those alone typically cut load times in half.

---

## References

- [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
- [Next.js 15 Documentation](https://nextjs.org/docs)
