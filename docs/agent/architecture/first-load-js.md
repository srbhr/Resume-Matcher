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

Measured 2026-10-10 with `rm -rf .next && npm run build && npm run report:first-load` on the Task 18
commit (`motion@13.4.4`, which resolves `framer-motion@13.5.1`).

| Route | First-load JS (gzip KB) | Raw KB | Δ gzip vs baseline |
|---|---|---|---|
| `/builder` | 363.5 | 1251.9 | +42.8 |
| `/resumes/[id]` | 319.8 | 1069.3 | +43.1 |
| `/tracker` | 315.7 | 1016.2 | +44.0 |
| `/dashboard` | 308.6 | 996.7 | +43.1 |
| `/settings` | 304.5 | 985.0 | +43.8 |
| `/tailor` | 301.8 | 973.7 | +43.8 |
| `/resume-wizard` | 292.3 | 944.0 | +43.2 |
| `/` | 256.5 | 837.2 | +11.7 |
| `/_not-found` | 131.9 | 445.3 | 0.0 |
| `/print/cover-letter/[id]` | 131.9 | 445.3 | 0.0 |
| `/print/resumes/[id]` | 131.9 | 445.3 | 0.0 |

**This is Motion, not drift.** A control build of the commit just before Motion (d6c857f, same
machine) matches the baseline to within 1.3 KB on every route (the Control column below). The 43-44 KB
on the product routes is Motion.

**The budget.** Every route except `/_not-found` and the print routes is now over 250 KB. `/`
(was 5.2 KB under) is 6.5 KB over and `/resume-wizard` (was 0.9 KB under) is 42.3 KB over.

### Why it is not the +5 KB the plan expected

The Task 18 checks found nothing wrong in our code: every import is `m`, never `motion`, and
`domAnimation` is imported only from `components/common/motion-features.ts`. The cost comes from
how Turbopack bundles the `motion/react` entry. That file does
`import * as fm from 'framer-motion'; const m = fm.m;`, and a route that imports `m` through it
ships about 19 KB more than one that imports `m` straight from `framer-motion`. The likely
mechanism is that the namespace import keeps most of framer-motion (projection, drag, layout and
the feature modules); that was inferred from the chunks, not proven. Throwaway routes on the
pre-Motion tree, each importing one thing, give the numbers (gzip KB; a route that imports
nothing from Motion is 241.4):

| Import | First-load JS | Δ |
|---|---|---|
| `{ m } from 'motion/react'` | 275.0 | +33.6 |
| `{ m } from 'framer-motion'` | 256.4 | +15.0 |
| `* as m from 'motion/react-m'` | 256.2 | +14.8 |

With ideal tree-shaking (rolldown, minified, gzip) the five Motion imports we use come to 7.3 KB
and `m` alone to 5.2 KB, which is where the plan's +5 KB comes from. Under Turbopack the
measured floor for `m` is about 15 KB. `/` pays +11.7 KB although the hero is pure CSS, because
`MotionProvider` sits in the shared `(default)` layout and its Motion imports land on every
route in the group.

The lazy split is defeated as built. `LazyMotion` is meant to fetch the animation features
(`domAnimation`: about 45 KB raw, 17 KB gzip) after hydration, but on every product route that
chunk is a `<script src>` in the initial HTML and loads at navigation start (checked in the
browser on `/dashboard` against `next build` output: both Motion chunks sit in the first
waterfall, so the stats script is not over-counting). `/` does not have it. The pure
wrapper overhead (the 19 KB above) and this 17 KB account for most of the 43 KB.

### Option measured, not applied

Resolving the `motion/react` specifier to `framer-motion` for Turbopack needs no source or test
change (Vitest mocks the `motion/react` specifier on its own):

```ts
// next.config.ts, inside nextConfig
turbopack: { resolveAlias: { 'motion/react': 'framer-motion' } },
```

| Route | Baseline | Control (d6c857f, pre-Motion) | As built | With Turbopack alias (not applied) |
|---|---|---|---|---|
| `/builder` | 320.7 | 321.4 | 363.5 (+42.8) | 339.0 (+18.3) |
| `/resumes/[id]` | 276.7 | 277.3 | 319.8 (+43.1) | 295.3 (+18.6) |
| `/tracker` | 271.7 | 272.8 | 315.7 (+44.0) | 291.1 (+19.4) |
| `/dashboard` | 265.5 | 266.8 | 308.6 (+43.1) | 284.1 (+18.6) |
| `/settings` | 260.7 | 261.7 | 304.5 (+43.8) | 279.9 (+19.2) |
| `/tailor` | 258.0 | 259.1 | 301.8 (+43.8) | 277.3 (+19.3) |
| `/resume-wizard` | 249.1 | 249.7 | 292.3 (+43.2) | 267.7 (+18.6) |
| `/` | 244.8 | 245.1 | 256.5 (+11.7) | 256.4 (+11.6) |

It saves about 25 KB on every product route and leaves `/` unchanged. With the alias the
features chunk is a separate async chunk and no route lists it in first-load, so the lazy split
works as designed (checked in the build's chunk graph, not in a browser). It is not applied because
`next.config.ts` is outside Task 18's file list and it changes which package's entry ships; it
needs the owner's sign-off. Adding `'motion/react'` to `experimental.optimizePackageImports` was
tried and changes nothing (the entry declares `m` as a local binding, so the barrel optimizer
cannot map it).
