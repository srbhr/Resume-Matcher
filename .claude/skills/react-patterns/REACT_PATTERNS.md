# React and Next.js Top Patterns (Offline and Docker Focus)

Condensed patterns from `AGENT.md`, tuned for apps run locally after download or inside Docker. Emphasis is on startup time, main-thread responsiveness, and memory use rather than SEO or edge latency.

## Table of Contents

- [React and Next.js Top Patterns (Offline and Docker Focus)](#react-and-nextjs-top-patterns-offline-and-docker-focus)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Offline and Docker Priorities](#offline-and-docker-priorities)
  - [Critical Patterns: Eliminate Waterfalls](#critical-patterns-eliminate-waterfalls)
  - [Critical Patterns: Startup and Bundle Control](#critical-patterns-startup-and-bundle-control)
  - [High Impact: Server and RSC Boundaries](#high-impact-server-and-rsc-boundaries)
  - [Medium Impact: Client Data and Events](#medium-impact-client-data-and-events)
  - [Medium Impact: Re-render and Rendering](#medium-impact-re-render-and-rendering)
  - [Low-Medium: JavaScript Hot Paths](#low-medium-javascript-hot-paths)
  - [Checklist](#checklist)

## Overview

Use these patterns to avoid unnecessary waiting, reduce initial JS and memory cost, and keep the UI responsive under local loads.

## Offline and Docker Priorities

- Prefer responsiveness and low CPU over SEO or edge-optimized SSR behavior.
- Assume the server process is long-lived; in-process caches are effective.
- Local API or database calls still add latency; avoid sequential awaits.
- Defer non-critical work until after first render or after responses are sent.
- Keep serialized RSC payloads small to reduce hydration time and memory use.

## Critical Patterns: Eliminate Waterfalls

- `async-parallel` - Start independent work together with `Promise.all`.
- `async-dependencies` - Use `better-all` or chained promises for partial dependencies.
- `async-api-routes` - Kick off auth/config/data work early, await late.
- `async-defer-await` - Move awaits into the branches that use them.
- `async-suspense-boundaries` - Stream slow sections with Suspense instead of blocking the whole page.

## Critical Patterns: Startup and Bundle Control

- `bundle-barrel-imports` - Import directly to avoid loading unused modules.
- `bundle-dynamic-imports` - Use `next/dynamic` for heavy or optional components.
- `bundle-conditional` - Load modules only when a feature is activated.
- `bundle-preload` - Preload heavy bundles on user intent (hover or focus).
- `bundle-defer-third-party` - Defer analytics or logging until after hydration if used.

## High Impact: Server and RSC Boundaries

- `server-auth-actions` - Authenticate and authorize inside every Server Action.
- `server-serialization` - Pass only fields used by client components.
- `server-dedup-props` - Avoid duplicating serialized data at RSC boundaries.
- `server-cache-react` - Use `React.cache` to deduplicate work per request.
- `server-cache-lru` - Use an LRU cache for cross-request reuse in long-lived processes.
- `server-parallel-fetching` - Compose components to fetch in parallel.
- `server-after-nonblocking` - Use `after()` for logging and cleanup.

## Medium Impact: Client Data and Events

- `client-swr-dedup` - Use SWR to deduplicate fetches and revalidate on focus.
- `client-event-listeners` - Share global listeners to avoid N handlers.
- `client-passive-event-listeners` - Use passive listeners for scroll and touch.

## Medium Impact: Re-render and Rendering

- `rerender-memo` - Extract expensive subtrees into memoized components.
- `rerender-dependencies` - Narrow effect dependencies to primitives.
- `rerender-derived-state` - Subscribe to derived booleans instead of raw values.
- `rerender-functional-setstate` - Use functional updates for stable callbacks.
- `rerender-lazy-state-init` - Lazy init expensive state.
- `rerender-transitions` - Use `startTransition` for non-urgent updates.
- `rendering-content-visibility` - Use `content-visibility` for long lists.
- `rendering-hoist-jsx` - Hoist static JSX out of render.
- `rendering-hydration-no-flicker` - Avoid client-only mismatch without flicker.

## Low-Medium: JavaScript Hot Paths

- `js-index-maps` - Build Maps for repeated lookups.
- `js-combine-iterations` - Combine multiple passes into one loop.
- `js-cache-property-access` - Cache hot property reads inside loops.
- `js-hoist-regexp` - Hoist RegExp creation outside loops.
- `js-set-map-lookups` - Use Set/Map for O(1) membership checks.
- `js-early-exit` - Return early to skip unnecessary work.

## Checklist

- No sequential awaits for independent work (`Promise.all` or `better-all`).
- Heavy UI components load dynamically and only when needed.
- RSC props are minimal and not duplicated by derived arrays or objects.
- Server work is cached at the right level (per-request and cross-request).
- Global event listeners are shared and scroll handlers are passive.
- Expensive state or rendering work is memoized or deferred with transitions.
