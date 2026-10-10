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

_Filled in by Task 18._
