# First-load JS

Budget (`.impeccable.md`): 250 KB per route. Measured with `npm run report:first-load`
(gzip level 9 over the route's first-load chunks from `.next/diagnostics/route-bundle-stats.json`).

## Baseline — 2026-10-10, before the Swiss realignment (commit ab68967)

| Route | First-load JS (gzip KB) | Raw KB |
|---|---|---|
| `/builder` | 320.7 | 1132.2 |
| `/resumes/[id]` | 276.7 | 949.4 |
| `/tracker` | 271.7 | 894.4 |
| `/dashboard` | 265.5 | 877.1 |
| `/settings` | 260.7 | 863.7 |
| `/tailor` | 258.0 | 853.1 |
| `/resume-wizard` | 249.1 | 824.1 |
| `/` | 244.8 | 804.7 |
| `/_not-found` | 131.9 | 445.3 |
| `/print/cover-letter/[id]` | 131.9 | 445.3 |
| `/print/resumes/[id]` | 131.9 | 445.3 |

The budget is already exceeded on six of the seven product routes; `/resume-wizard` sits
0.9 KB under it and the landing page 5.2 KB under. This is recorded rather than fixed:
the bundle pass belongs to sub-project 2 (Next.js performance).

## After Motion (phase 4)

Measured 2026-10-10 with `rm -rf .next && npm run build && npm run report:first-load`, with the
`motion/react` alias in `next.config.ts` (below) and the Motion internals pinned to
`motion@13.4.4`, `framer-motion@13.4.4`, `motion-dom@13.4.4`, `motion-utils@13.3.0`.

| Route | First-load JS (gzip KB) | Raw KB | Δ gzip vs baseline |
|---|---|---|---|
| `/builder` | 339.5 | 1182.1 | +18.8 |
| `/resumes/[id]` | 295.9 | 999.6 | +19.2 |
| `/tracker` | 291.8 | 946.5 | +20.1 |
| `/dashboard` | 284.7 | 926.9 | +19.2 |
| `/settings` | 280.6 | 915.4 | +19.9 |
| `/tailor` | 278.0 | 904.2 | +20.0 |
| `/resume-wizard` | 268.4 | 874.3 | +19.3 |
| `/` | 256.6 | 837.8 | +11.8 |
| `/_not-found` | 131.9 | 445.3 | 0.0 |
| `/print/cover-letter/[id]` | 131.9 | 445.3 | 0.0 |
| `/print/resumes/[id]` | 131.9 | 445.3 | 0.0 |

**This is Motion, not drift.** A control build of the commit just before Motion (d6c857f) matches
the baseline to within 1.3 KB on every route. Motion adds about 19 to 20 KB on the product routes
and 11.8 KB on `/`, still over the 5 KB the plan expected (see below).

**The budget.** Every route except `/_not-found` and the print routes is over 250 KB: `/` by 6.6 KB
(it was 5.2 KB under) and `/resume-wizard` by 18.4 KB (it was 0.9 KB under).

### Why the alias

Without it the same build was +42.8 KB on `/builder` and +43 to +44 KB on every product route
(`/dashboard` 308.6, `/builder` 363.5), because the `motion/react` entry does
`import * as fm from 'framer-motion'; const m = fm.m;` and Turbopack then keeps most of
framer-motion whenever `m` is imported. It also defeated `LazyMotion`: the animation features
chunk (about 17 KB gzip) was a static `<script>` on every product route. `next.config.ts` now
resolves the `motion/react` specifier to `framer-motion` for Turbopack; no source or test changes
(Vitest mocks the `motion/react` specifier on its own). `framer-motion` is a direct, exact
dependency so the alias does not rely on a transitive hoist.

With the alias no route lists the features chunk (37.6 KB raw) in first-load, the server HTML does
not reference it, and in a browser against `next start` it is fetched after the load event, so the
lazy split works as designed.

Throwaway routes on the pre-Motion tree, one import each (gzip KB over a route that imports
nothing from Motion, 241.4):

| Import | Δ |
|---|---|
| `{ m } from 'motion/react'` | +33.6 |
| `{ m } from 'framer-motion'` | +15.0 |
| `* as m from 'motion/react-m'` | +14.8 |

With ideal tree-shaking (rolldown, minified, gzip) `m` alone is 5.2 KB, which is where the plan's
5 KB comes from; Turbopack's measured floor for `m` is about 15 KB. `/` pays +11.8 KB although the
hero is pure CSS, because `MotionProvider` sits in the shared `(default)` layout and its Motion
imports land on every route in the group. Adding `'motion/react'` to
`experimental.optimizePackageImports` was tried and changes nothing (the entry declares `m` as a
local binding, so the barrel optimizer cannot map it).
