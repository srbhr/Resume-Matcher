---
name: react-patterns
description: React and Next.js performance optimization guidelines from Vercel Engineering, tuned for local/offline or docker-deployed apps.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
  focus: local-offline-docker
---

# Vercel React Best Practices (Local/Docker)

Comprehensive performance optimization guide for React and Next.js applications, maintained by Vercel. This version highlights the most important patterns for local installs or dockerized deployments.

## Purpose

Provide a high-signal checklist to avoid async waterfalls, reduce client payloads, and keep UI responsive without relying on hosted or edge-specific optimizations.

## When to Apply

- Building or refactoring React components or Next.js pages
- Implementing Server Actions, Route Handlers, or data fetching
- Reducing startup time or memory footprint for local installs
- Debugging sluggish UI or long hydration times
- Reviewing code for performance regressions

## Offline and Docker Focus

- Optimize for cold-start and steady-state responsiveness over SEO.
- Use in-process caches because the server process persists.
- Avoid sequential awaits even for local APIs or databases.
- Defer non-critical work until after render or after responses are sent.
- Minimize RSC props to reduce hydration and memory overhead.

## Top Findings

- Eliminate async waterfalls by starting work early and awaiting late with `Promise.all` or `better-all`.
- Use Suspense boundaries to stream UI instead of blocking the whole page on data.
- Reduce initial load and memory via dynamic imports, conditional loading, and direct imports.
- Minimize RSC payloads; pass only fields used and avoid duplicating serialized data.
- Cache hot server work: `React.cache` per request and LRU for cross-request reuse.
- Reduce client work with memoized subtrees, lazy state init, transitions, and `content-visibility` for large lists.

## Core Patterns

- `async-parallel` and `async-api-routes` to eliminate waterfalls
- `async-suspense-boundaries` to stream slow sections
- `bundle-barrel-imports` and `bundle-dynamic-imports` to reduce startup cost
- `server-serialization` and `server-dedup-props` to shrink RSC payloads
- `server-cache-react` and `server-cache-lru` to reuse hot work
- `rerender-lazy-state-init` and `rerender-transitions` for responsive UI
- `rendering-content-visibility` for long lists
- `client-swr-dedup` for fetch deduplication

## Outputs

- `REACT_PATTERNS.md` for a condensed, offline-focused guide
- `AGENT.md` for the full compiled reference

## Rule Categories by Priority

| Priority | Category                  | Impact      | Prefix       |
| -------- | ------------------------- | ----------- | ------------ |
| 1        | Eliminating Waterfalls    | CRITICAL    | `async-`     |
| 2        | Bundle Size Optimization  | CRITICAL    | `bundle-`    |
| 3        | Server-Side Performance   | HIGH        | `server-`    |
| 4        | Client-Side Data Fetching | MEDIUM-HIGH | `client-`    |
| 5        | Re-render Optimization    | MEDIUM      | `rerender-`  |
| 6        | Rendering Performance     | MEDIUM      | `rendering-` |
| 7        | JavaScript Performance    | LOW-MEDIUM  | `js-`        |
| 8        | Advanced Patterns         | LOW         | `advanced-`  |

## How to Use

Start with `REACT_PATTERNS.md` for the condensed guidance.

## Full Compiled Document

For the complete guide with all rules expanded: `AGENT.md`
