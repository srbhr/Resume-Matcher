# Swiss Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every frontend surface back to one Swiss International Style system, with the same look, AA contrast, consistent primitives and purposeful motion. Add a guard test so drift can't return.

**Architecture:** Foundation first, then the pages:
1. A failing **Swiss guard** with a two-way count ratchet locks in today's drift.
2. **Tokens** are rewritten in `globals.css`, including a temporary override that unifies Tailwind's palette onto the brand colours.
3. The existing **primitives** are fixed at the source.
4. The **missing primitives** and a shared page frame are added.
5. **Motion** is layered on through a lazy provider.
6. Each **page is swept** onto the tokens and primitives, and every sweep lowers the guard's allowlist.
7. **Docs** are reconciled last.

**Tech Stack:** Next.js 16.4 (App Router, Turbopack), React 19.3, Tailwind CSS v4, TypeScript 5, vitest 5 + Testing Library (jsdom), `motion` (motion.dev), Oxlint + Prettier.

**Spec:** [`docs/superpowers/specs/2026-10-10-swiss-realignment-design.md`](../specs/2026-10-10-swiss-realignment-design.md). Read it alongside this plan. Section numbers (§) below refer to the spec.

## Global Constraints

- All work happens in `apps/frontend/` unless a path says otherwise. Run every command from `apps/frontend`.
- **Out of bounds:** `components/resume/**`, `app/print/**`, the backend, `.github/workflows/`, Docker, and data-flow/API/business logic (spec D2).
- **Fonts as rendered (D3):**
  - `--font-sans: Helvetica, Arial, sans-serif`.
  - The `font-mono` role is Space Grotesk, loaded via next/font as `--font-space-grotesk`.
  - Serif is Tailwind's default stack.
  - Geist is removed.
- **Colour:** app code uses semantic tokens only (§4.1). Never use Tailwind palette shades, raw hex or `rgba()` in TSX; the guard enforces this.
- **Geometry:** `rounded-none` everywhere.
  - Borders: 1px ink on controls, inputs and dialogs; 2px on alerts and emphasised cards.
  - Shadow roles: `shadow-sw-sm` controls, `shadow-sw-default` cards and menus, `shadow-sw-lg` dialogs and the page frame, `shadow-sw-xl` the home hero, `shadow-sw-card` the resume sheet.
- **Spacing scale:** Tailwind units 1, 2, 3, 4, 6, 8, 12, 16. Never 5, 7, 9, 10, 11 or 14, and no half-steps outside `components/ui/**`.
- **Type:**
  - Minimum `text-xs`; `text-[Npx]` is banned.
  - Page H1 is `font-serif text-4xl md:text-5xl font-bold uppercase`.
  - Dialog titles are serif `text-2xl` bold uppercase.
  - Section headers are serif bold, sentence case.
  - Labels are `font-mono text-xs uppercase tracking-wider`.
- **One primary (blue) action per region.** Selected segments and toggles use an **ink fill** (D14). The orange warning fill always carries **ink** text.
- **Motion (§7):**
  - One curve, `cubic-bezier(0.16,1,0.3,1)`, and one spring, `{ type:'spring', visualDuration:0.2, bounce:0 }`.
  - Press tier 100ms; surface tier 200ms in and 120ms out.
  - Only transform and opacity animate.
  - Never `transition-all`, never bounce.
  - Always `import { m } from 'motion/react'`, never `motion` (LazyMotion strict).
- **Microcopy:**
  - Use `…`, not `...`; curly quotes; `Loading…` and `Saving…`.
  - Source strings are sentence case, with CSS `uppercase` doing the casing.
  - Every new or changed key goes into **all seven** locale files: `messages/{en,es,fr,ja,ko,pt-BR,zh}.json`.
- **Gate:** run this before every commit that touches code, and in full before every push:
  ```bash
  npm run lint && npm run typecheck && npm run test && npm run build
  ```
  Before each phase's push, also run `bash ../../.githooks/pre-push`. Then push straight to dev: `git push origin HEAD:dev` (no PR, no force).
- **Staging:** stage only the files the task names, never `git add -A`. The owner's uncommitted edits in `components/tracker/card-detail-modal.tsx` and `components/tracker/manual-add-application-dialog.tsx` are **only** touched with the owner's explicit go-ahead (Tasks 8 and 23).
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** each test must fail when its target breaks. Existing tests that assert old markup are updated, never deleted or skipped.

## Review Focus

1. **Keyboard users who close a dialog** expect focus to land back on the button that opened it, not on `<body>`. → Task 8, test `returns focus to the opener when closed with Escape`.
2. **A Dropdown whose value matches no option** (the tracker's bulk "Move to" uses `''`) must show the placeholder with nothing marked selected. → Task 9, test `shows the placeholder and selects nothing…`.
3. **Disabled buttons must not "press" on hover.** The house `disabled:pointer-events-none` stays, so hovering a disabled button never moves it. → Task 5, test `keeps disabled buttons inert`.
4. **Long localised titles** (es, fr and pt-BR uppercase run long) must not run under the dialog close button. → Task 8, test `keeps the title clear of the close button…`.
5. **Users with reduced motion** must still be able to open and close dialogs, with no transform animation. → Task 16 asserts `MotionProvider` passes `reducedMotion="user"`. The CSS reduced-motion block lands in Task 3.

---

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `scripts/swiss-guard.mjs` | Banned-pattern scanner, ratchet comparison, CLI (`--update`, path filters) |
| `scripts/first-load-report.mjs` | First-load JS per route (gzip) from `.next/diagnostics/route-bundle-stats.json` |
| `tests/swiss-guard.allowlist.json` | Frozen `{ file: { rule: count } }` baseline. It may only shrink. |
| `tests/swiss-guard.test.ts` | Ratchet: the current counts must equal the allowlist |
| `tests/swiss-guard-rules.test.ts` | Each rule flags what it should and spares what it shouldn't |
| `tests/swiss-contrast.test.ts` | WCAG AA for every token pairing (§9.2) |
| `lib/theme-color.ts` | `THEME_COLOR` for `<meta name="theme-color">`, kept in sync with canvas by test |
| `lib/format-date.ts` | `formatDate(value, locale, options?)` |
| `lib/motion.ts` | `EASE_OUT_EXPO`, `DURATION`, `SPRING` |
| `components/ui/alert.tsx` | `Alert` (server-safe) |
| `components/ui/status-indicator.tsx` | `StatusIndicator` (server-safe) |
| `components/ui/panel-header.tsx` | `PanelHeader` (server-safe) |
| `components/ui/empty-state.tsx` | `EmptyState` (server-safe) |
| `components/ui/segmented-control.tsx` | `SegmentedControl` (client) |
| `components/ui/page-frame.tsx` | `PageFrame` (server-safe) |
| `components/ui/page-header.tsx` | `PageHeader` with `.Back`, `.Title`, `.Subtitle`, `.Actions` (server-safe) |
| `components/common/motion-provider.tsx`, `components/common/motion-features.ts` | `LazyMotion` + `MotionConfig` |
| `components/common/presence.tsx` | `FadePresence`, `FadeItem`, re-exported `AnimatePresence` |
| `components/common/llm-setup-alert.tsx` | One "LLM not configured" alert (Task 19) |
| `components/common/default-badge.tsx` | One "DEFAULT" badge (Task 19) |
| `docs/agent/architecture/first-load-js.md` | Bundle baseline and Motion delta |
| `tests/{button,card,form-primitives,dialog,dropdown,toggle-tabs,alert-status,confirm-dialog-variants,panel-empty,segmented-control,page-frame,format-date,motion-provider}.test.tsx` | Primitive behaviour tests |

**Modified (foundation):**
- `app/(default)/css/globals.css`
- `app/layout.tsx`
- `app/(default)/layout.tsx`
- `vitest.setup.ts`
- `package.json`
- `components/ui/{button,card,input,textarea,label,dialog,confirm-dialog,dropdown,toggle-switch,retro-tabs,rich-text-toolbar,link-dialog}.tsx`

**Modified (sweeps):** every file listed in Tasks 19–24.

---

## Phase 0: Guard first

### Task 1: Swiss guard scanner, rule tests, ratchet, and allowlist

**Files:**
- Create: `scripts/swiss-guard.mjs`, `tests/swiss-guard-rules.test.ts`, `tests/swiss-guard.test.ts`, `tests/swiss-guard.allowlist.json`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `scanSource(relPath: string, src: string): Hit[]`, where `Hit = { rule: string; line: number; match: string; text: string }`
  - `scanTree(root: string): Record<string, Hit[]>`
  - `countHits(byFile): Record<string, Record<string, number>>`
  - `loadAllowlist(root)`
  - `compareCounts(counts, allow): { increased: Delta[]; decreased: Delta[] }`, where `Delta = { file; rule; allowed; actual }`
  - `formatRatchetReport(result, byFile): string` (empty string when the counts match)
  - npm scripts `guard` and `guard:update`

- [ ] **Step 1: Write the failing rule tests.** Create `tests/swiss-guard-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanSource } from '../scripts/swiss-guard.mjs';

const rulesIn = (src: string, file = 'components/demo/demo.tsx'): string[] =>
  scanSource(file, src).map((hit: { rule: string }) => hit.rule);

describe('Swiss guard rules', () => {
  it.each([
    ['radius', '<div className="rounded-lg" />'],
    ['radius', '<div className="p-2 rounded" />'],
    ['soft-shadow', '<div className="shadow-md" />'],
    ['soft-shadow', '<div className="shadow-[0_1px_2px_black]" />'],
    ['gradient', '<div className="bg-gradient-to-r" />'],
    ['palette', '<p className="text-amber-700" />'],
    ['palette', '<p className="hover:bg-blue-800" />'],
    ['raw-colour', '<div className="bg-[#F5F5F0]" />'],
    ['raw-colour', "const s = { color: '#1D4ED8' };"],
    ['raw-colour', "const s = { boxShadow: '0 0 1px rgba(0,0,0,0.1)' };"],
    ['ink-tint', '<p className="text-black/60" />'],
    ['dark', '<p className="dark:bg-ink" />'],
    ['type-size', '<p className="text-[10px]" />'],
    ['spacing', '<div className="gap-5" />'],
    ['spacing', '<div className="py-0.5" />'],
    ['spacing', '<div className="-mt-10" />'],
    ['transition', '<div className="transition-all" />'],
    ['keyframes', '<div className="animate-pulse" />'],
    ['legacy-token', '<p className="text-steel-grey" />'],
    ['legacy-token', '<p className="bg-secondary" />'],
    ['decorative-icon', "import { X, Sparkles } from 'lucide-react';"],
    ['decorative-icon', "import {\n  X,\n  Zap,\n} from 'lucide-react';"],
    ['motion-import', "import { motion } from 'motion/react';"],
    ['motion-import', "import { motion } from 'framer-motion';"],
    ['glyph', '<span>✓</span>'],
    ['glyph', '<li><span>•</span> tip</li>'],
  ])('flags %s in %s', (rule, src) => {
    expect(rulesIn(src)).toContain(rule);
  });

  it.each([
    '<div className="rounded-none shadow-sw-sm hover:shadow-none" />',
    '<div className="bg-primary text-white border-ink p-3 gap-4 px-6 mt-12" />',
    '/* bg-[#1D4ED8] rounded-lg */ <div />',
    '// shadow-md and #ffffff in a comment\n<div />',
    '<a href="https://github.com/srbhr/Resume-Matcher">x</a>',
    "import { m, AnimatePresence } from 'motion/react';",
    "<p>{'// '}subtitle</p>",
    '<div className="transition-colors animate-spin top-5 w-2.5" />',
    "import { Check, Plus } from 'lucide-react';",
  ])('allows %s', (src) => {
    expect(rulesIn(src)).toEqual([]);
  });

  it('lets primitives use half-step spacing for optical padding', () => {
    expect(rulesIn('<b className="ps-4 pe-3.5" />', 'components/ui/button.tsx')).toEqual([]);
    expect(rulesIn('<b className="ps-4 pe-3.5" />', 'components/builder/x.tsx')).toContain('spacing');
  });

  it('reports 1-based line numbers', () => {
    const [hit] = scanSource('components/x.tsx', 'a\nb\n<div className="rounded-lg" />');
    expect(hit.line).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**
  Run `npx vitest run tests/swiss-guard-rules.test.ts`. Expected: FAIL, `Failed to resolve import "../scripts/swiss-guard.mjs"`.

- [ ] **Step 3: Implement the scanner.** Create `scripts/swiss-guard.mjs`:

```js
/**
 * Swiss guard — flags patterns the Swiss design system bans
 * (docs/portable/swiss-design-system/anti-patterns.md, spec §9.1) in app/
 * and components/, and ratchets the counts against
 * tests/swiss-guard.allowlist.json. The allowlist may only shrink.
 *
 *   node scripts/swiss-guard.mjs [path-prefix…]        report violations
 *   node scripts/swiss-guard.mjs --update              lower the allowlist to today's counts
 *   node scripts/swiss-guard.mjs --update --allow-increase   (phase 0 only) write any counts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SCAN_DIRS = ['app', 'components'];
export const EXCLUDED_PREFIXES = ['components/resume/', 'app/print/'];
export const ALLOWLIST_PATH = 'tests/swiss-guard.allowlist.json';

const PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const COLOR_PREFIX =
  '(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|outline|divide|placeholder|from|to|via|accent|caret|decoration|shadow)';
const DECORATIVE_ICONS = /\b(?:Sparkles?|WandSparkles|Wand2?|Stars?|Heart|Zap|Rocket|PartyPopper)\b/g;

export const LINE_RULES = [
  {
    id: 'radius',
    re: /(?<![\w-])rounded(?:-(?!none\b)[\w[\]./-]+)?(?![\w-])/g,
    hint: 'Use rounded-none — Swiss corners are square.',
  },
  {
    id: 'soft-shadow',
    re: /(?<![\w-])shadow(?:-(?:sm|md|lg|xl|2xl|inner))?(?![\w-])|(?<![\w-])shadow-\[/g,
    hint: 'Use a hard shadow token: shadow-sw-sm (controls), shadow-sw-default (cards), shadow-sw-lg (dialogs).',
  },
  {
    id: 'gradient',
    re: /\bbg-(?:gradient|linear|radial|conic)-|(?:linear|radial|conic)-gradient\(/g,
    hint: 'No gradients. The blueprint grid is the bg-blueprint utility.',
  },
  {
    id: 'palette',
    re: new RegExp(`(?<![\\w-])${COLOR_PREFIX}-${PALETTE}-\\d{2,3}\\b`, 'g'),
    hint: 'Use a semantic token: primary, success, destructive, warning, warning-text, *-tint, steel, ink-soft, panel, paper, highlight.',
  },
  {
    id: 'raw-colour',
    re: /\[#[0-9a-fA-F]{3,8}\]|(['"`])#[0-9a-fA-F]{3,4}\1|#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|rgba?\(/g,
    hint: 'No raw colours in TSX — use a token class, or var(--sw-*) inside a style object.',
  },
  {
    id: 'ink-tint',
    re: /(?<![\w-])(?:text|border|bg)-black\/\d+/g,
    hint: 'text-black/NN → text-steel; border-black/10 → border-panel-hover; bg-black/NN → bg-overlay.',
  },
  { id: 'dark', re: /(?<![\w-])dark:/g, hint: 'Light theme only — no dark: variants.' },
  {
    id: 'type-size',
    re: /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g,
    hint: 'Minimum text-xs; use the type scale.',
  },
  {
    id: 'spacing',
    re: /(?<![\w-])-?(?:p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(?:5|7|9|10|11|14|\d\.5)(?![\w.])/g,
    skip: (file) => file.startsWith('components/ui/'),
    hint: 'Use the spacing scale: 1, 2, 3, 4, 6, 8, 12, 16.',
  },
  {
    id: 'transition',
    re: /(?<![\w-])transition-all(?![\w-])/g,
    hint: 'Name the properties: transition-[transform,box-shadow,background-color] or transition-colors.',
  },
  {
    id: 'keyframes',
    re: /(?<![\w-])animate-(?:bounce|pulse|ping)(?![\w-])/g,
    hint: 'No decorative loops — use StatusIndicator, or Loader2 for in-flight work.',
  },
  {
    id: 'legacy-token',
    re: /(?<![\w-])(?:[a-z]+:)*(?:[a-z]+-)?(?:steel-grey|paper-tint|muted-foreground)(?![\w-])|(?<![\w-])(?:bg|text|border)-(?:secondary|background|foreground|muted)(?![\w-])/g,
    hint: 'steel-grey→steel, paper-tint→paper, muted-foreground→steel, secondary→panel, background→canvas, foreground→ink.',
  },
  {
    id: 'glyph',
    re: /[✨✓✔⭐🚀]|>[^<{}\n]*•[^<{}\n]*</g,
    hint: 'No text glyphs as icons — use a lucide icon with aria-hidden, or nothing.',
  },
];

export const FILE_RULES = [
  {
    id: 'decorative-icon',
    hint: 'Functional icons only — drop Sparkles/Wand/Star/Heart/Zap/Rocket.',
    find(text) {
      const found = [];
      for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
        const start = imp.index + imp[0].indexOf(imp[1]);
        for (const name of imp[1].matchAll(DECORATIVE_ICONS)) {
          found.push({ index: start + name.index, match: name[0] });
        }
      }
      for (const deep of text.matchAll(
        /from\s*['"]lucide-react\/dist\/esm\/icons\/(sparkles?|wand(?:-sparkles)?|stars?|heart|zap|rocket|party-popper)['"]/g
      )) {
        found.push({ index: deep.index, match: deep[1] });
      }
      return found;
    },
  },
  {
    id: 'motion-import',
    hint: "Import { m } from 'motion/react' — LazyMotion runs in strict mode.",
    find(text) {
      const found = [];
      for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]motion\/react['"]/g)) {
        if (/\bmotion\b/.test(imp[1])) found.push({ index: imp.index, match: 'motion' });
      }
      for (const imp of text.matchAll(/from\s*['"]framer-motion['"]/g)) {
        found.push({ index: imp.index, match: 'framer-motion' });
      }
      return found;
    },
  },
];

/** Blank out comments (keeping newlines and lengths) so hex values in doc comments don't count. */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, (whole, pre) => pre + ' '.repeat(whole.length - pre.length));
}

export function scanSource(relPath, src) {
  const text = stripComments(src);
  const lines = text.split('\n');
  const raw = src.split('\n');
  const hits = [];
  for (const rule of LINE_RULES) {
    if (rule.skip?.(relPath)) continue;
    lines.forEach((line, i) => {
      for (const match of line.matchAll(rule.re)) {
        hits.push({ rule: rule.id, line: i + 1, match: match[0], text: raw[i].trim() });
      }
    });
  }
  for (const rule of FILE_RULES) {
    for (const { index, match } of rule.find(text)) {
      const line = text.slice(0, index).split('\n').length;
      hits.push({ rule: rule.id, line, match, text: raw[line - 1].trim() });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (entry.isDirectory()) walk(abs);
      else if (rel.endsWith('.tsx') && !EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) out.push(rel);
    }
  };
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (fs.existsSync(abs)) walk(abs);
  }
  return out.sort();
}

export function scanTree(root) {
  const byFile = {};
  for (const rel of listFiles(root)) {
    const hits = scanSource(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    if (hits.length) byFile[rel] = hits;
  }
  return byFile;
}

export function countHits(byFile) {
  const counts = {};
  for (const [file, hits] of Object.entries(byFile)) {
    counts[file] = {};
    for (const { rule } of hits) counts[file][rule] = (counts[file][rule] ?? 0) + 1;
  }
  return counts;
}

export function loadAllowlist(root) {
  const file = path.join(root, ALLOWLIST_PATH);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

export function writeAllowlist(root, counts) {
  const sorted = {};
  for (const file of Object.keys(counts).sort()) {
    sorted[file] = {};
    for (const rule of Object.keys(counts[file]).sort()) sorted[file][rule] = counts[file][rule];
  }
  fs.writeFileSync(path.join(root, ALLOWLIST_PATH), `${JSON.stringify(sorted, null, 2)}\n`);
}

export function compareCounts(counts, allow) {
  const increased = [];
  const decreased = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(allow)]);
  for (const file of files) {
    const rules = new Set([...Object.keys(counts[file] ?? {}), ...Object.keys(allow[file] ?? {})]);
    for (const rule of rules) {
      const actual = counts[file]?.[rule] ?? 0;
      const allowed = allow[file]?.[rule] ?? 0;
      if (actual > allowed) increased.push({ file, rule, allowed, actual });
      if (actual < allowed) decreased.push({ file, rule, allowed, actual });
    }
  }
  return { increased, decreased };
}

const HINTS = Object.fromEntries([...LINE_RULES, ...FILE_RULES].map((r) => [r.id, r.hint]));

export function formatRatchetReport({ increased, decreased }, byFile) {
  const out = [];
  if (increased.length) {
    out.push('New Swiss-style drift (fix it — do not raise the allowlist):');
    for (const { file, rule, allowed, actual } of increased) {
      out.push(`  ${file} [${rule}] ${allowed} → ${actual}. ${HINTS[rule]}`);
      for (const hit of (byFile[file] ?? []).filter((h) => h.rule === rule)) {
        out.push(`    ${file}:${hit.line}  ${hit.text}`);
      }
    }
  }
  if (decreased.length) {
    out.push('Drift was fixed — lower the allowlist with `npm run guard:update`:');
    for (const { file, rule, allowed, actual } of decreased) {
      out.push(`  ${file} [${rule}] ${allowed} → ${actual}`);
    }
  }
  return out.join('\n');
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const byFile = scanTree(root);
  if (argv.includes('--update')) {
    const counts = countHits(byFile);
    const { increased } = compareCounts(counts, loadAllowlist(root));
    if (increased.length && !argv.includes('--allow-increase')) {
      console.error(formatRatchetReport({ increased, decreased: [] }, byFile));
      console.error('\nRefusing to raise the allowlist. Fix the drift instead.');
      return 1;
    }
    writeAllowlist(root, counts);
    console.log(`Allowlist written: ${Object.keys(counts).length} files.`);
    return 0;
  }
  const filters = argv.filter((a) => !a.startsWith('--'));
  let total = 0;
  for (const [file, hits] of Object.entries(byFile)) {
    if (filters.length && !filters.some((f) => file.startsWith(f))) continue;
    for (const hit of hits) {
      total += 1;
      console.log(`${file}:${hit.line} [${hit.rule}] ${hit.text}\n    → ${HINTS[hit.rule]}`);
    }
  }
  console.log(`\n${total} Swiss-guard hit(s).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
```

- [ ] **Step 4: Run the rule tests to confirm they pass.**
  Run `npx vitest run tests/swiss-guard-rules.test.ts`. Expected: PASS (all cases). If a case fails, fix the regex in `LINE_RULES` or `FILE_RULES`, never the test.

- [ ] **Step 5: Write the ratchet test.** Create `tests/swiss-guard.test.ts`:

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareCounts,
  countHits,
  formatRatchetReport,
  loadAllowlist,
  scanTree,
} from '../scripts/swiss-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('Swiss guard ratchet', () => {
  it('matches tests/swiss-guard.allowlist.json exactly (no new drift, no stale entries)', () => {
    const byFile = scanTree(ROOT);
    const report = formatRatchetReport(compareCounts(countHits(byFile), loadAllowlist(ROOT)), byFile);
    expect(report).toBe('');
  });
});
```

- [ ] **Step 6: Add the npm scripts.** In `package.json` `scripts`, add after `"test"`:

```json
"guard": "node scripts/swiss-guard.mjs",
"guard:update": "node scripts/swiss-guard.mjs --update"
```

- [ ] **Step 7: Generate the frozen baseline.**
  Run `node scripts/swiss-guard.mjs --update --allow-increase`. Expected: `Allowlist written: N files.` and a new `tests/swiss-guard.allowlist.json`. Then run `npm run guard | tail -1` and note the total hit count for the commit message.

- [ ] **Step 8: Prove the ratchet is not theater.** Run all three checks and paste their output into the commit body:
  1. Append `<div className="rounded-lg" />` as a JSX expression to `components/home/hero.tsx`. Run `npx vitest run tests/swiss-guard.test.ts`. Expected: FAIL, naming `components/home/hero.tsx [radius]` and the line. Revert with `git checkout components/home/hero.tsx`.
  2. Lower any one count in the allowlist by 1. Run the test. Expected: FAIL, the "New Swiss-style drift" section. Revert.
  3. Raise any one count by 1. Run the test. Expected: FAIL, the "Drift was fixed — lower the allowlist" section. Revert.

- [ ] **Step 9: Run the full gate and commit.**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
git add scripts/swiss-guard.mjs tests/swiss-guard-rules.test.ts tests/swiss-guard.test.ts tests/swiss-guard.allowlist.json package.json
git commit -m "test(frontend): add the Swiss guard with a two-way ratchet allowlist" -m "<baseline hit count + the three anti-theater outputs>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: First-load JS baseline

**Files:**
- Create: `scripts/first-load-report.mjs`, `docs/agent/architecture/first-load-js.md` (at the repo root, `../../docs/...`)

**Interfaces:** Produces `npm run report:first-load`, which prints a markdown table.

- [ ] **Step 1: Create `scripts/first-load-report.mjs`.**

```js
/** Prints first-load JS per route (gzip, level 9) from the last `next build`. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statsFile = path.join(root, '.next/diagnostics/route-bundle-stats.json');
if (!fs.existsSync(statsFile)) {
  console.error('Run `npm run build` first — .next/diagnostics/route-bundle-stats.json is missing.');
  process.exit(1);
}
const kb = (n) => (n / 1024).toFixed(1);
const rows = JSON.parse(fs.readFileSync(statsFile, 'utf8'))
  .map(({ route, firstLoadChunkPaths }) => {
    let raw = 0;
    let gz = 0;
    for (const chunk of firstLoadChunkPaths) {
      const buf = fs.readFileSync(path.join(root, chunk));
      raw += buf.length;
      gz += zlib.gzipSync(buf, { level: 9 }).length;
    }
    return { route, raw, gz };
  })
  .sort((a, b) => b.gz - a.gz);
console.log('| Route | First-load JS (gzip KB) | Raw KB |\n|---|---|---|');
for (const { route, raw, gz } of rows) console.log(`| \`${route}\` | ${kb(gz)} | ${kb(raw)} |`);
```

  Add `"report:first-load": "node scripts/first-load-report.mjs"` to `package.json` scripts.

- [ ] **Step 2: Build and capture the numbers.**
  Run `npm run build && npm run report:first-load`. Expected: a table where every product route is above 245 KB gzip.

- [ ] **Step 3: Write `../../docs/agent/architecture/first-load-js.md`.**

```markdown
# First-load JS

Budget (`.impeccable.md`): 250 KB per route. Measured with `npm run report:first-load`
(gzip level 9 over the route's first-load chunks from `.next/diagnostics/route-bundle-stats.json`).

## Baseline — 2026-10-10, before the Swiss realignment (commit <sha>)

<paste the table>

The budget is already exceeded on every product route. This is recorded rather than fixed:
the bundle pass belongs to sub-project 2 (Next.js performance).

## After Motion (phase 4)

_Filled in by Task 18._
```

- [ ] **Step 4: Commit, run the phase gate, and push.**

```bash
git add scripts/first-load-report.mjs package.json ../../docs/agent/architecture/first-load-js.md
git commit -m "docs(perf): record the first-load JS baseline before the Swiss realignment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

---

## Phase 1: Tokens

### Task 3: Contrast test, then the Swiss token set

**Files:**
- Create: `tests/swiss-contrast.test.ts`, `lib/theme-color.ts`
- Modify: `app/(default)/css/globals.css` (lines 1–138: `@import` through the end of `@layer base`; everything from the first `@media print {` onward stays unchanged)

**Interfaces:**
- Produces:
  - CSS custom properties `--sw-*`.
  - Tailwind colour utilities: `canvas`, `ink`, `ink-soft`, `steel`, `paper`, `panel`, `panel-hover`, `primary`/`-hover`, `success`/`-hover`, `destructive`/`-hover`, `warning`/`-hover`, `warning-text`, `info-tint`, `success-tint`, `warning-tint`, `destructive-tint`, `highlight`, `overlay`.
  - The easing utility `ease-out-expo`.
  - `THEME_COLOR: string`.
- Legacy aliases kept until Task 25: `background`, `foreground`, `card`, `secondary`, `muted`, `muted-foreground`, `accent`, `border`, `ring`, `steel-grey`, `paper-tint`.

- [ ] **Step 1: Write the failing contrast test.** Create `tests/swiss-contrast.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_COLOR } from '@/lib/theme-color';

const CSS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/(default)/css/globals.css'),
  'utf8'
);

function token(name: string): string {
  const match = CSS.match(new RegExp(`--sw-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`--sw-${name} must be defined as a 6-digit hex in globals.css`);
  return match[1].toLowerCase();
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text and text-on-fill pairs the UI actually uses (spec §4.1). 4.5:1 each.
const TEXT_PAIRS: Array<[string, string]> = [
  ['ink-soft', 'canvas'], ['ink-soft', 'white'], ['ink-soft', 'panel'], ['ink-soft', 'paper'],
  ['steel', 'canvas'], ['steel', 'white'], ['steel', 'paper'],
  ['primary', 'canvas'], ['primary', 'white'],
  ['success', 'canvas'], ['success', 'white'],
  ['destructive', 'canvas'], ['destructive', 'white'],
  ['warning-text', 'canvas'], ['warning-text', 'white'],
  ['white', 'primary'], ['white', 'primary-hover'], ['white', 'success'], ['white', 'success-hover'],
  ['white', 'destructive'], ['white', 'destructive-hover'], ['white', 'ink'],
  ['ink', 'warning'], ['ink', 'warning-hover'], ['ink', 'panel'], ['ink', 'panel-hover'],
  ['ink', 'highlight'], ['ink', 'canvas'],
  ['primary', 'info-tint'], ['success', 'success-tint'], ['warning-text', 'warning-tint'],
  ['destructive', 'destructive-tint'],
  ['ink-soft', 'info-tint'], ['ink-soft', 'success-tint'], ['ink-soft', 'warning-tint'],
  ['ink-soft', 'destructive-tint'],
];

// Non-text graphics that carry meaning on their own (SC 1.4.11). 3:1 each.
const GRAPHIC_PAIRS: Array<[string, string]> = [
  ['primary', 'canvas'], ['primary', 'white'], ['success', 'canvas'], ['success', 'white'],
  ['destructive', 'canvas'], ['destructive', 'white'], ['ink', 'canvas'], ['ink', 'white'],
];

describe('Swiss palette contrast (WCAG 2.2 AA)', () => {
  it.each(TEXT_PAIRS)('%s text on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHIC_PAIRS)('%s graphic on %s is at least 3:1', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });

  it('pins the warning fill, which is exempt from 1.4.11 because it never carries meaning alone', () => {
    // Spec §9.2: every warning square has a label, every warning alert has a
    // warning-text label on a tint, and warning buttons have an ink border and
    // ink text. Changing this value is a design decision — update the spec too.
    expect(token('warning')).toBe('#f97316');
    expect(contrast(token('ink'), token('warning'))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps steel off panel (4.11:1 fails)', () => {
    expect(contrast(token('steel'), token('panel'))).toBeLessThan(4.5);
  });

  it('keeps the browser theme colour in sync with canvas', () => {
    expect(THEME_COLOR.toLowerCase()).toBe(token('canvas'));
  });
});
```

  Create `lib/theme-color.ts`:

```ts
/** Browser UI colour (<meta name="theme-color">). Must equal --sw-canvas; tests/swiss-contrast.test.ts checks it. */
export const THEME_COLOR = '#f0f0e8';
```

- [ ] **Step 2: Run it to confirm it fails.**
  Run `npx vitest run tests/swiss-contrast.test.ts`. Expected: FAIL, `--sw-ink-soft must be defined as a 6-digit hex in globals.css`.

- [ ] **Step 3: Rewrite the top of `globals.css`.** Replace everything from line 1 down to the closing `}` of `@layer base { … }` with the block below. Leave all the print and page-break CSS that follows untouched.

```css
@import 'tailwindcss';
@import 'tw-animate-css'; /* removed in Task 18 once Dialog animates with Motion */

@source "../../../{app,components,hooks,lib,messages}/**/*.{js,ts,jsx,tsx,mdx}";

/* Swiss palette — the single source of colour (spec §4.1). Hex values (oklch in
   comments). tests/swiss-contrast.test.ts asserts WCAG 2.2 AA for every pairing
   the UI uses; run it after any change. */
:root {
  --sw-canvas: #f0f0e8;
  --sw-white: #ffffff;
  --sw-ink: #000000;
  --sw-ink-soft: #3d424c; /* oklch(37.8% 0.018 264) body text (house) */
  --sw-steel: #696d75; /* oklch(53.4% 0.013 264) secondary text, placeholders, hairlines. Never on panel. */
  --sw-paper: #f5f5f0; /* sub-panel and header tint */
  --sw-panel: #e5e5e0; /* secondary fills, dialog footer */
  --sw-panel-hover: #d8d8d2;
  --sw-primary: #1d4ed8; /* Hyper Blue */
  --sw-primary-hover: #193cb8;
  --sw-success: #127e3b;
  --sw-success-hover: #016630;
  --sw-destructive: #d61e21;
  --sw-destructive-hover: #be0010;
  --sw-warning: #f97316; /* fill, squares and borders only, always with ink text */
  --sw-warning-hover: #eb5601;
  --sw-warning-text: #b44f02;
  --sw-info-tint: #eff6ff;
  --sw-success-tint: #f0fdf4;
  --sw-warning-tint: #fff7ed;
  --sw-destructive-tint: #fef2f2;
  --sw-highlight: #fff085; /* keyword <mark> only */
  --sw-overlay: rgb(0 0 0 / 0.5); /* dialog backdrop */
}

@theme inline {
  --color-canvas: var(--sw-canvas);
  --color-ink: var(--sw-ink);
  --color-ink-soft: var(--sw-ink-soft);
  --color-steel: var(--sw-steel);
  --color-paper: var(--sw-paper);
  --color-panel: var(--sw-panel);
  --color-panel-hover: var(--sw-panel-hover);
  --color-primary: var(--sw-primary);
  --color-primary-hover: var(--sw-primary-hover);
  --color-success: var(--sw-success);
  --color-success-hover: var(--sw-success-hover);
  --color-destructive: var(--sw-destructive);
  --color-destructive-hover: var(--sw-destructive-hover);
  --color-warning: var(--sw-warning);
  --color-warning-hover: var(--sw-warning-hover);
  --color-warning-text: var(--sw-warning-text);
  --color-info-tint: var(--sw-info-tint);
  --color-success-tint: var(--sw-success-tint);
  --color-warning-tint: var(--sw-warning-tint);
  --color-destructive-tint: var(--sw-destructive-tint);
  --color-highlight: var(--sw-highlight);
  --color-overlay: var(--sw-overlay);

  /* Legacy names still used at call sites. The phase-5 sweeps rename them;
     Task 25 deletes these aliases (the guard's legacy-token rule tracks the rest). */
  --color-background: var(--sw-canvas);
  --color-foreground: var(--sw-ink);
  --color-card: var(--sw-canvas);
  --color-secondary: var(--sw-panel);
  --color-muted: var(--sw-panel);
  --color-muted-foreground: var(--sw-steel);
  --color-accent: var(--sw-panel);
  --color-border: var(--sw-ink);
  --color-ring: var(--sw-primary);
  --color-steel-grey: var(--sw-steel);
  --color-paper-tint: var(--sw-paper);

  /* Brand unification (spec §4.6). Tailwind v4 renders blue-700 as #1447e6,
     red-600 as #e30117 and so on, so the app shipped two of each brand colour.
     Point the shades in use at the brand values until the sweeps rename them;
     Task 25 deletes this block. */
  --color-blue-700: var(--sw-primary);
  --color-blue-800: var(--sw-primary-hover);
  --color-green-700: var(--sw-success);
  --color-green-800: var(--sw-success-hover);
  --color-red-600: var(--sw-destructive);
  --color-red-700: var(--sw-destructive-hover);
  --color-orange-500: var(--sw-warning);
  --color-orange-600: var(--sw-warning-hover);

  /* Hard offset shadows in solid ink — never blurred. Roles (spec §4.3):
     sm = controls, default = cards and menus, lg = dialogs and page frame,
     xl = home hero, card = resume sheet. xs is folded into sm by the sweeps. */
  --shadow-sw-xs: 1px 1px 0px 0px #000000;
  --shadow-sw-sm: 2px 2px 0px 0px #000000;
  --shadow-sw-default: 4px 4px 0px 0px #000000;
  --shadow-sw-card: 6px 6px 0px 0px #000000;
  --shadow-sw-lg: 8px 8px 0px 0px #000000;
  --shadow-sw-xl: 12px 12px 0px 0px #000000;

  /* Fonts: exactly what rendered before the realignment (spec D3). */
  --font-sans: Helvetica, Arial, sans-serif;
  --font-mono: var(--font-space-grotesk), 'Space Grotesk', sans-serif;

  /* Motion (spec §7): one curve; the 100ms press tier is the default transition. */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --default-transition-duration: 100ms;
  --default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Light theme only. */

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

  Deleted on purpose:
  - the old `:root` palette and the duplicate `--font-sans` / `--font-mono`;
  - the `chart-*`, `sidebar-*`, `popover*`, `input`, `*-foreground` theme entries (zero uses);
  - `--animate-gradient` and its keyframes (zero uses).

  Before deleting, verify those zero uses: `grep -rnE "(chart|sidebar|popover)-|animate-gradient|-input\b" app components lib hooks --include='*.tsx'` must return nothing that refers to these tokens.

- [ ] **Step 4: Run the contrast test.**
  Run `npx vitest run tests/swiss-contrast.test.ts`. Expected: PASS. If `success`, `destructive`, `warning-text` or `steel` misses 4.5 by less than 0.01, darken that one token by one hex step on its dominant channel and re-run. Spec §4.1 allows this without re-ratification.

- [ ] **Step 5: Run the full gate.**
  Run `npm run lint && npm run typecheck && npm run test && npm run build`. Expected: green, and the guard is unchanged because `globals.css` isn't scanned.

- [ ] **Step 6: Commit.**

```bash
git add app/\(default\)/css/globals.css tests/swiss-contrast.test.ts lib/theme-color.ts
git commit -m "feat(frontend): one AA-checked Swiss token set; unify the brand colours" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Fonts and theme colour in the root layout

**Files:** Modify `app/layout.tsx`.

- [ ] **Step 1: Edit `app/layout.tsx`.**
  - Change the next/font import to `import { Noto_Sans_JP, Noto_Sans_KR, Noto_Sans_SC, Space_Grotesk } from 'next/font/google';`.
  - Delete the `const geist = Geist({…})` block.
  - Import `Viewport` and the theme colour, and add the viewport export:

```tsx
import type { Metadata, Viewport } from 'next';
import { THEME_COLOR } from '@/lib/theme-color';

export const viewport: Viewport = { themeColor: THEME_COLOR };
```

  - Change the body className to:

```tsx
className={`${spaceGrotesk.variable} ${notoSansSC.variable} ${notoSansKR.variable} ${notoSansJP.variable} antialiased bg-background text-ink-soft min-h-full`}
```

- [ ] **Step 2: Gate.**
  Run the full gate. Then run `grep -c "Geist" .next/static/chunks/*.css` and expect `0` in every file.

- [ ] **Step 3: Commit, run the phase gate, and push.**

```bash
git add app/layout.tsx
git commit -m "fix(frontend): render fonts exactly as before and stop downloading Geist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

  **Owner review, phase 1:** all pages. Secondary text is darker, and blues, reds and greens are unified onto the brand values. Nothing else should look different.

---

## Phase 2: Fix the existing primitives

### Task 5: Button, `buttonClass`, and the new sizes and variant

**Files:**
- Modify: `components/ui/button.tsx` (full rewrite)
- Test: `tests/button.test.tsx`

**Interfaces:**
- Produces:
  - `type ButtonVariant = 'default' | 'destructive' | 'outline-destructive' | 'success' | 'warning' | 'outline' | 'secondary' | 'ghost' | 'link'`
  - `type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs'`
  - `buttonClass(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string`
  - `Button` (same props plus the new values)

- [ ] **Step 1: Write the failing test.** Create `tests/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonClass, type ButtonSize, type ButtonVariant } from '@/components/ui/button';

const VARIANTS: ButtonVariant[] = ['default', 'destructive', 'outline-destructive', 'success', 'warning', 'outline', 'secondary', 'ghost', 'link'];
const SIZES: ButtonSize[] = ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-xs'];

describe('Button', () => {
  it('gives warning buttons ink text (white on orange is 2.8:1)', () => {
    expect(buttonClass({ variant: 'warning' })).toContain('text-ink');
    expect(buttonClass({ variant: 'warning' })).not.toContain('text-white');
  });

  it('styles a link exactly like a button', () => {
    render(<a href="/dashboard" className={buttonClass({ variant: 'outline', size: 'sm' })}>Back</a>);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveClass('border-ink', 'h-8', 'shadow-sw-sm', 'rounded-none');
  });

  it('has compact icon sizes with an expanded hit area', () => {
    render(<Button size="icon-sm" aria-label="Edit" />);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveClass('h-8', 'w-8', 'before:-inset-1.5');
  });

  it('offers an outline-destructive variant', () => {
    expect(buttonClass({ variant: 'outline-destructive' })).toContain('text-destructive');
    expect(buttonClass({ variant: 'outline-destructive' })).toContain('border-destructive');
  });

  it('keeps disabled buttons inert', () => {
    expect(buttonClass()).toContain('disabled:pointer-events-none');
  });

  it('uses one focus ring with a canvas offset', () => {
    expect(buttonClass()).toContain('focus-visible:ring-offset-canvas');
  });

  it('never uses raw palette shades, hex, or eased durations', () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        expect(buttonClass({ variant, size })).not.toMatch(/-(?:blue|red|green|orange|gray)-\d|\[#|duration-|ease-out\b/);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**
  Run `npx vitest run tests/button.test.tsx`. Expected: FAIL, `buttonClass is not a function` or a missing export.

- [ ] **Step 3: Rewrite `components/ui/button.tsx`.**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss button. 1px ink border, 2px hard shadow, press-in on hover
 * (translate 1px into the shadow). Transition timing comes from the theme
 * default (100ms ease-out-expo), see globals.css.
 *
 * - default: Hyper Blue, the one primary action per region
 * - destructive / outline-destructive: delete, remove
 * - success: confirm, complete
 * - warning: risky but reversible, orange fill with ink text
 * - outline / secondary / ghost / link: everything else
 */
export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline-destructive'
  | 'success'
  | 'warning'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-xs';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE = cn(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none',
  'font-mono text-sm font-medium uppercase tracking-wide',
  'transition-[transform,box-shadow,background-color,color]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  'disabled:pointer-events-none disabled:opacity-50',
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
);

const PRESS =
  'shadow-sw-sm hover:translate-x-px hover:translate-y-px hover:shadow-none active:translate-x-[2px] active:translate-y-[2px]';

const VARIANTS: Record<ButtonVariant, string> = {
  default: cn('border border-ink bg-primary text-white hover:bg-primary-hover', PRESS),
  destructive: cn('border border-ink bg-destructive text-white hover:bg-destructive-hover', PRESS),
  'outline-destructive': cn('border border-destructive bg-canvas text-destructive hover:bg-destructive-tint', PRESS),
  success: cn('border border-ink bg-success text-white hover:bg-success-hover', PRESS),
  warning: cn('border border-ink bg-warning text-ink hover:bg-warning-hover', PRESS),
  outline: cn('border border-ink bg-canvas text-ink hover:bg-panel', PRESS),
  secondary: cn('border border-ink bg-panel text-ink hover:bg-panel-hover', PRESS),
  ghost: 'border-none bg-transparent text-ink shadow-none hover:bg-panel active:bg-panel-hover',
  link: 'h-auto border-none bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline',
};

// WCAG 2.2 AA target size (2.5.8) is 24×24; 44×44 is the house target (2.5.5 AAA).
// The ::before overlay grows compact icon buttons to ~44px of hit area without
// changing layout. Keep a gap-3 or larger between them so hit areas don't overlap.
const HIT = "before:absolute before:-inset-1.5 before:content-['']";
const HIT_XS = "before:absolute before:-inset-1 before:content-['']";

const SIZES: Record<ButtonSize, string> = {
  default: 'h-10 px-6 py-2',
  sm: 'h-8 px-4 py-1 text-xs',
  lg: 'h-12 px-8 py-3 text-base',
  icon: cn('h-11 w-11 p-0', HIT),
  'icon-sm': cn('h-8 w-8 p-0', HIT),
  'icon-xs': cn('h-6 w-6 p-0', HIT_XS),
};

export function buttonClass({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button ref={ref} className={buttonClass({ variant, size, className })} {...props} />
  )
);
Button.displayName = 'Button';

export { Button };
```

- [ ] **Step 4: Run the test and the full suite.**
  Run `npx vitest run tests/button.test.tsx`. Expected: PASS. Then run `npm run test`. If an existing test asserted the old `bg-blue-700` and similar, update it to the token class (`bg-primary`) and note it in the commit body.

- [ ] **Step 5: Lower the guard and commit.**
  Run `npm run guard:update`. This lowers the counts only: `button.tsx` loses `[#D8D8D2]` and its `blue`/`red`/`green`/`orange` shades. Then run the full gate.

```bash
git add components/ui/button.tsx tests/button.test.tsx tests/swiss-guard.allowlist.json
git commit -m "feat(ui): token-based Button with buttonClass, compact icon sizes and outline-destructive" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Card, with press-in instead of lift and a `raised` variant

**Files:**
- Modify: `components/ui/card.tsx:6,13-28,52`
- Test: `tests/card.test.tsx`

**Interfaces:** `Card` `variant` becomes `'default' | 'interactive' | 'raised' | 'outline' | 'ghost'`. `raised` is the tracker card: white, 1px ink, `sw-sm`, press-in.

- [ ] **Step 1: Write the failing test.** Create `tests/card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardTitle } from '@/components/ui/card';

describe('Card', () => {
  it('presses in on hover instead of lifting', () => {
    render(<Card variant="interactive" data-testid="c" />);
    const card = screen.getByTestId('c');
    expect(card).toHaveClass('hover:translate-x-px', 'hover:translate-y-px', 'hover:border-ink');
    expect(card.className).not.toMatch(/-translate-|transition-all|hover:shadow-sw/);
  });

  it('gives interactive cards a visible focus ring', () => {
    render(<Card variant="interactive" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-primary');
  });

  it('offers a raised resting frame for cards on bare canvas', () => {
    render(<Card variant="raised" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass('bg-white', 'border', 'border-ink', 'shadow-sw-sm');
  });

  it('sets card titles in bold serif', () => {
    render(<CardTitle>Title</CardTitle>);
    expect(screen.getByText('Title')).toHaveClass('font-serif', 'font-bold');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.** Run `npx vitest run tests/card.test.tsx`. Expected: FAIL (lift classes present, no `raised`).

- [ ] **Step 3: Edit `components/ui/card.tsx`.**
  - Line 6 becomes `variant?: 'default' | 'interactive' | 'raised' | 'outline' | 'ghost';`.
  - Replace the `variants` object and the stale comment block (lines 13–28) with:

```tsx
    const variants = {
      default: 'bg-canvas',
      interactive: cn(
        'bg-canvas border-2 border-transparent cursor-pointer group',
        'transition-[transform,box-shadow,border-color]',
        'hover:z-20 hover:border-ink hover:translate-x-px hover:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'
      ),
      raised: cn(
        'bg-white border border-ink shadow-sw-sm transition-[transform,box-shadow]',
        'hover:translate-x-px hover:translate-y-px hover:shadow-none'
      ),
      outline: 'bg-canvas border-2 border-ink',
      ghost: 'bg-transparent border-none shadow-none',
    };
```

  - In `CardTitle`, replace `font-semibold` with `font-bold`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/card.test.tsx && npm run test`. Expected: PASS.

- [ ] **Step 5: Commit.**
  Run `npm run guard:update` (lower only), then the full gate.

```bash
git add components/ui/card.tsx tests/card.test.tsx tests/swiss-guard.allowlist.json
git commit -m "fix(ui): cards press in instead of lifting; add the raised variant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Input, Textarea, Label

**Files:**
- Modify: `components/ui/input.tsx:20-23`, `components/ui/textarea.tsx:11`, `components/ui/label.tsx:9`
- Test: `tests/form-primitives.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `tests/form-primitives.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

describe('form primitives', () => {
  it.each([
    ['Input', <Input key="i" aria-label="field" />],
    ['Textarea', <Textarea key="t" aria-label="field" />],
  ])('%s is a white elevated field that flags invalid input', (_name, el) => {
    render(el);
    const field = screen.getByLabelText('field');
    expect(field).toHaveClass('bg-white', 'border-ink', 'aria-invalid:border-destructive', 'focus-visible:border-primary');
    expect(field.className).not.toContain('bg-transparent');
  });

  it('defaults labels to the mono caption every call site already used', () => {
    render(<Label>Email</Label>);
    expect(screen.getByText('Email')).toHaveClass('font-mono', 'text-xs', 'uppercase', 'tracking-wider', 'text-steel');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/form-primitives.test.tsx`. Expected: FAIL (`bg-transparent`, `text-sm`).

- [ ] **Step 3: Edit the three files.**
  - `input.tsx`: replace the first two className strings with

```tsx
          'flex h-10 w-full border border-ink bg-white px-3 py-2 text-sm',
          'placeholder:text-steel aria-invalid:border-destructive',
          'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary',
```

    and delete the old `'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-700',` line.
  - `textarea.tsx`: the className becomes

```tsx
          'flex min-h-16 w-full border border-ink bg-white px-3 py-2 text-sm placeholder:text-steel aria-invalid:border-destructive focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 rounded-none',
```

  - `label.tsx`: the className becomes

```tsx
        'font-mono text-xs font-medium uppercase leading-none tracking-wider text-steel peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/form-primitives.test.tsx && npm run test`. Expected: PASS.

- [ ] **Step 5: Commit.**
  Run `npm run guard:update`, then the full gate.

```bash
git add components/ui/input.tsx components/ui/textarea.tsx components/ui/label.tsx tests/form-primitives.test.tsx tests/swiss-guard.allowlist.json
git commit -m "fix(ui): white elevated fields with an invalid state; labels default to the mono caption" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Dialog chrome, sizes, `DialogBody`, focus contract, and its call sites

The padding lives in the parts, not in `DialogContent`. 7 of the 11 dialogs already use a banded header (`p-6 pb-4 border-b`) and footer (`p-4 bg-secondary border-t`), so the header, a new `DialogBody` and the footer each carry their own padding. No call site needs negative margins. This is a refinement of spec §5's "built-in p-6" and achieves the same goal.

**Owner go-ahead required.** Steps 6.2 and 6.5 edit `components/tracker/card-detail-modal.tsx` and `components/tracker/manual-add-application-dialog.tsx`, which contain the owner's uncommitted edits. Stage the whole file, including their edit.

**Files:**
- Modify: `components/ui/dialog.tsx` (full rewrite)
- Modify the 10 call sites in Step 6, and `components/ui/link-dialog.tsx`
- Test: `tests/dialog.test.tsx`

**Interfaces:**
- Produces:
  - `type DialogSize = 'sm' | 'md' | 'lg' | 'xl'`
  - `DialogContent` props `{ children; className?; size?: DialogSize; initialFocusRef?: React.RefObject<HTMLElement | null> }`
  - new `DialogBody` `{ children; className? }`
- Unchanged: `Dialog`, `DialogTrigger`, `DialogClose`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

- [ ] **Step 1: Write the failing test.** Create `tests/dialog.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Una solicitud con un título bastante largo</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <input aria-label="first" />
          </DialogBody>
          <DialogFooter>
            <button>save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function openDialog() {
  render(<Harness />);
  const opener = screen.getByText('open');
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('Dialog', () => {
  it('moves focus into the dialog on open', () => {
    openDialog();
    expect(screen.getByLabelText('first')).toHaveFocus();
  });

  it('returns focus to the opener when closed with Escape', () => {
    const opener = openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('traps Tab inside the dialog', () => {
    openDialog();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'common.close' });
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByLabelText('first')).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
  });

  it('applies the size and the Swiss chrome', () => {
    openDialog();
    expect(screen.getByRole('dialog')).toHaveClass('max-w-md', 'bg-white', 'border', 'border-ink', 'shadow-sw-lg', 'rounded-none');
  });

  it('keeps the title clear of the close button and left-aligned', () => {
    openDialog();
    const title = screen.getByRole('heading', { name: /título/ });
    expect(title).toHaveClass('uppercase', 'text-balance', 'font-serif', 'text-2xl', 'font-bold');
    expect(title.parentElement).toHaveClass('pr-14', 'text-left');
    expect(title.parentElement?.className).not.toContain('text-center');
  });

  it('bands the footer on panel with an ink rule', () => {
    openDialog();
    expect(screen.getByText('save').parentElement).toHaveClass('bg-panel', 'border-t', 'border-ink');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/dialog.test.tsx`. Expected: FAIL, `DialogBody` is not exported.

- [ ] **Step 3: Rewrite `components/ui/dialog.tsx`.** Keep `Dialog`, `DialogTrigger` and `DialogClose` exactly as they are today (lines 1–95 minus the doc comment), then replace from `interface DialogContentProps` to the end with:

```tsx
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
  size?: DialogSize;
  /** Element to focus on open. Defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className,
  size = 'md',
  initialFocusRef,
}) => {
  const { open, onOpenChange, titleId } = useDialogContext();
  const { t } = useTranslations();
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onOpenChange(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Focus contract: move focus in on open, give it back to the opener on close.
  React.useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (initialFocusRef?.current ?? focusableIn(panel)[0] ?? panel).focus();
    }
    return () => opener?.focus();
  }, [open, initialFocusRef]);

  const trapTab = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      e.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-overlay" aria-hidden="true" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={trapTab}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'relative flex max-h-[90vh] w-full flex-col overflow-hidden overscroll-contain',
            'rounded-none border border-ink bg-white shadow-sw-lg outline-none',
            SIZE_CLASS[size],
            className
          )}
        >
          {children}
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-4 top-5"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

interface DialogPartProps {
  children: React.ReactNode;
  className?: string;
}

const DialogHeader: React.FC<DialogPartProps> = ({ className, children }) => (
  <div className={cn('flex shrink-0 flex-col gap-2 border-b border-ink px-6 pt-6 pb-4 pr-14 text-left', className)}>
    {children}
  </div>
);

const DialogBody: React.FC<DialogPartProps> = ({ className, children }) => (
  <div className={cn('min-h-0 flex-1 overflow-y-auto p-6', className)}>{children}</div>
);

const DialogFooter: React.FC<DialogPartProps> = ({ className, children }) => (
  <div className={cn('flex shrink-0 flex-row items-center justify-end gap-3 border-t border-ink bg-panel px-6 py-4', className)}>
    {children}
  </div>
);

const DialogTitle: React.FC<DialogPartProps> = ({ className, children }) => {
  const { titleId } = useDialogContext();
  return (
    <h2
      id={titleId}
      className={cn('font-serif text-2xl font-bold uppercase leading-none tracking-tight text-balance text-ink', className)}
    >
      {children}
    </h2>
  );
};

const DialogDescription: React.FC<DialogPartProps> = ({ className, children }) => (
  <p className={cn('text-sm text-ink-soft text-pretty', className)}>{children}</p>
);

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

  Add `import { Button } from './button';` to the imports and update the top doc comment to: "Swiss dialog: white panel, 1px ink border, 8px hard shadow, banded header and footer, focus moved in, trapped, and returned on close."

- [ ] **Step 4: Run the Dialog tests.** Run `npx vitest run tests/dialog.test.tsx`. Expected: PASS.

- [ ] **Step 5: Move LinkDialog onto Dialog.** In `components/ui/link-dialog.tsx`, replace the hand-rolled portal (the `return (` block) with:

```tsx
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{hasExistingLink ? 'Edit link' : 'Add link'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-text">Display text</Label>
              <Input id="link-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Link text" autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
            </div>
          </DialogBody>
          <DialogFooter>
            {hasExistingLink && (
              <Button type="button" variant="outline-destructive" size="sm" onClick={handleRemoveLink}>
                Remove link
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {hasExistingLink ? 'Update link' : 'Add link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
```

  Then:
  - Delete the component's own Escape `useEffect`, since Dialog handles Escape.
  - Delete the `X` import.
  - Add `import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';`.

  These strings were already hardcoded English, so the i18n status is unchanged; they're just sentence-cased.

- [ ] **Step 6: Migrate the remaining 10 call sites.** In each file:
  - Replace the `DialogContent` className with the `size` given.
  - Strip header and footer overrides that the defaults now provide (`p-6`, `pb-4`, `p-4`, `border-b border-black`, `border-t border-black`, `bg-white`, `bg-secondary`, `bg-background`, `rounded-none`, `gap-0`, `flex-row`, `gap-3`).
  - Keep any `justify-between`.
  - Wrap the content between `</DialogHeader>` and `<DialogFooter>` (or the end of `DialogContent`) in `<DialogBody>`. If that content already sits in a padded wrapper div (`p-6`, `px-6`, `space-y-4 p-6`), replace the wrapper with `<DialogBody className="<its non-padding classes>">`.

  | # | File:line | `DialogContent` becomes | Header / footer edits |
  |---|---|---|---|
  | 6.1 | `components/tracker/manage-columns-dialog.tsx:35` | `<DialogContent size="sm">` | none |
  | 6.2 | `components/tracker/card-detail-modal.tsx:92` (owner WIP) | `<DialogContent size="lg">`; body → `<DialogBody className="space-y-4">` | none |
  | 6.3 | `components/dashboard/resume-upload-dialog.tsx:304` | `<DialogContent size="sm">` | `:305` header → `<DialogHeader>` |
  | 6.4 | `components/tailor/diff-preview-modal.tsx:69` and `:136` | `<DialogContent size="xl">` | `:70`, `:137` header → `<DialogHeader>`. The footers at `:84` and `:343` (`bg-white` divs) → `<DialogFooter>`; keep their buttons. |
  | 6.5 | `components/tracker/manual-add-application-dialog.tsx:96` (owner WIP) | `<DialogContent size="lg">`; body → `<DialogBody className="space-y-4">` | none |
  | 6.6 | `components/dashboard/master-resume-choice-dialog.tsx:32` | `<DialogContent size="lg">` | `:33` header → `<DialogHeader>` |
  | 6.7 | `components/builder/regenerate-diff-preview.tsx:123` | `<DialogContent size="xl">` | `:124` → `<DialogHeader>`; `:269` → `<DialogFooter className="justify-between">` |
  | 6.8 | `components/builder/add-section-dialog.tsx:86` | `<DialogContent size="md">` | `:87` → `<DialogHeader>`; `:155` → `<DialogFooter>` |
  | 6.9 | `components/builder/regenerate-dialog.tsx:77` | `<DialogContent size="lg">` | `:78` → `<DialogHeader>`; `:204` → `<DialogFooter>` |
  | 6.10 | `components/builder/regenerate-instruction-dialog.tsx:84` | `<DialogContent size="lg">` | `:85` → `<DialogHeader>`; `:139` → `<DialogFooter className="justify-between">` |

  Also remove the per-site `DialogTitle` size and casing overrides (`text-2xl`, `text-3xl`, `uppercase`, `tracking-normal`). The title now comes from the primitive.

- [ ] **Step 7: Run the suite and fix markup assertions.**
  Run `npm run test`. Existing tests that query old wrapper classes (`diff-preview-modal*.test.tsx`, `manage-columns-dialog.test.tsx`, `dashboard-*`) must be updated to the new structure. Query by role or text, never weaken a behavioural assertion.

- [ ] **Step 8: Commit.**
  Run `npm run guard:update` (lower only), then the full gate.

```bash
git add components/ui/dialog.tsx components/ui/link-dialog.tsx tests/dialog.test.tsx tests/swiss-guard.allowlist.json \
  components/tracker/manage-columns-dialog.tsx components/tracker/card-detail-modal.tsx components/tracker/manual-add-application-dialog.tsx \
  components/dashboard/resume-upload-dialog.tsx components/dashboard/master-resume-choice-dialog.tsx components/tailor/diff-preview-modal.tsx \
  components/builder/regenerate-diff-preview.tsx components/builder/add-section-dialog.tsx components/builder/regenerate-dialog.tsx \
  components/builder/regenerate-instruction-dialog.tsx <any updated tests>
git commit -m "feat(ui): one Swiss dialog with sizes, banded parts and a focus trap; migrate every dialog" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Dropdown becomes a proper select

**Files:**
- Modify: `components/ui/dropdown.tsx` (full rewrite)
- Modify: `tests/tailor-master-picker.test.tsx:119,178` (`menuitemradio` → `option`)
- Test: `tests/dropdown.test.tsx`

**Interfaces:** `Dropdown` props gain `placeholder?: string`. The trigger is `role=button` with `aria-haspopup="listbox"`; the popup is `role="listbox"`; options are `role="option"` with `aria-selected`.

- [ ] **Step 1: Write the failing test.** Create `tests/dropdown.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/components/ui/dropdown';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const OPTIONS = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
];

function Harness({ initial = 'a', placeholder }: { initial?: string; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return <Dropdown label="Stage" options={OPTIONS} value={value} onChange={setValue} placeholder={placeholder} />;
}

describe('Dropdown', () => {
  it('announces the label and the current value on the trigger', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Stage Alpha' })).toHaveAttribute('aria-haspopup', 'listbox');
  });

  it('shows the placeholder and selects nothing when the value matches no option', () => {
    render(<Harness initial="" placeholder="Move to…" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage Move to…' }));
    const selected = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(0);
  });

  it('opens with ArrowDown, moves with arrows, and returns focus after a choice', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveFocus();
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveFocus();
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stage Beta' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Stage Alpha' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marks the selected option without the success colour or a glyph', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Stage Alpha' }));
    const alpha = screen.getByRole('option', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveClass('bg-panel');
    expect(alpha.textContent).not.toContain('✓');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/dropdown.test.tsx`. Expected: FAIL (no listbox, name mismatch).

- [ ] **Step 3: Rewrite `components/ui/dropdown.tsx`.**

```tsx
'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface DropdownOption {
  id: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  /** Shown, and nothing is marked selected, when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Swiss select: a field-style trigger and a listbox with full keyboard support. */
export function Dropdown({
  options,
  value,
  onChange,
  label,
  description,
  placeholder,
  disabled = false,
  className,
}: DropdownProps) {
  const { t } = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const listId = `${baseId}-list`;

  const selectedIndex = options.findIndex((option) => option.id === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) optionRefs.current[activeIndex]?.focus();
  }, [isOpen, activeIndex]);

  const openAt = (index: number) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(index);
    setIsOpen(true);
  };
  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  };
  const choose = (id: string) => {
    onChange(id);
    close(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : options.length - 1);
    }
  };

  const onOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActiveIndex(moves[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('space-y-1', className)}>
      {label && (
        <span id={labelId} className="block font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
          {label}
        </span>
      )}
      {description && <p className="text-sm text-ink-soft">{description}</p>}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-labelledby={label ? `${labelId} ${valueId}` : valueId}
          onClick={() => (isOpen ? close(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
          onKeyDown={onTriggerKeyDown}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-none border border-ink bg-white px-3 text-left font-mono text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span id={valueId} className={cn('min-w-0 flex-1 truncate', selected ? 'font-bold text-ink' : 'text-steel')}>
            {selected ? selected.label : (placeholder ?? t('common.selectOption'))}
          </span>
          <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
        </button>

        {isOpen && (
          <div
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 divide-y divide-ink overflow-y-auto rounded-none border border-ink bg-white shadow-sw-default"
          >
            {options.map((option, index) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => choose(option.id)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 px-3 py-2 text-left font-mono text-sm transition-colors focus-visible:bg-panel focus-visible:outline-none',
                    isSelected ? 'bg-panel font-bold text-ink' : 'bg-white text-ink hover:bg-panel'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{option.label}</span>
                    {option.description && (
                      <span className="mt-1 block text-xs font-normal text-steel">{option.description}</span>
                    )}
                  </span>
                  {isSelected && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the old role queries.**
  In `tests/tailor-master-picker.test.tsx`, replace `'menuitemradio'` with `'option'` at `:119` and `:178`. Then run `npx vitest run tests/dropdown.test.tsx tests/tailor-master-picker.test.tsx && npm run test`. Expected: PASS.

- [ ] **Step 5: Commit.**
  Run `npm run guard:update`, then the full gate.

```bash
git add components/ui/dropdown.tsx tests/dropdown.test.tsx tests/tailor-master-picker.test.tsx tests/swiss-guard.allowlist.json
git commit -m "feat(ui): Dropdown becomes an accessible select with a placeholder and a field-style trigger" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: ToggleSwitch, RetroTabs, RichTextToolbar

**Files:**
- Modify: `components/ui/toggle-switch.tsx`, `components/ui/retro-tabs.tsx`, `components/ui/rich-text-toolbar.tsx:52-74`
- Test: `tests/toggle-tabs.test.tsx`

**Interfaces:**
- `ToggleSwitch` adds `variant?: 'card' | 'inline'` (default `'card'`).
- `RetroTabs` adds `idPrefix?: string`. When it's set, each tab gets the id `${idPrefix}-tab-${id}` and `aria-controls="${idPrefix}-panel-${id}"`.

- [ ] **Step 1: Write the failing test.** Create `tests/toggle-tabs.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { RetroTabs } from '@/components/ui/retro-tabs';

describe('ToggleSwitch', () => {
  it('toggles when the row label is clicked', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onCheckedChange={onChange} label="Show photo" />);
    fireEvent.click(screen.getByText('Show photo'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('has an inline variant without the card frame', () => {
    const { container } = render(<ToggleSwitch variant="inline" checked onCheckedChange={vi.fn()} label="Inline" />);
    expect(container.firstChild).not.toHaveClass('shadow-sw-sm');
    expect(screen.getByRole('switch', { name: 'Inline' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('RetroTabs', () => {
  const tabs = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];

  it('exposes tab semantics with roving tabindex', () => {
    render(<RetroTabs tabs={tabs} activeTab="a" onTabChange={vi.fn()} idPrefix="t" />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    expect(alpha).toHaveAttribute('aria-selected', 'true');
    expect(alpha).toHaveAttribute('tabindex', '0');
    expect(alpha).toHaveAttribute('aria-controls', 't-panel-a');
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '-1');
  });

  it('activates the next tab with ArrowRight', () => {
    const onChange = vi.fn();
    render(<RetroTabs tabs={tabs} activeTab="a" onTabChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/toggle-tabs.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Rewrite `components/ui/toggle-switch.tsx` (body only; props interface plus `variant`).**

```tsx
export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: 'card' | 'inline';
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  variant = 'card',
  className,
}) => {
  const switchId = React.useId();
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        variant === 'card' && 'border border-ink bg-white p-4 shadow-sw-sm',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <label htmlFor={switchId} className={cn('min-w-0 flex-1', !disabled && 'cursor-pointer')}>
        <span className="block font-mono text-sm font-bold uppercase tracking-wider text-ink">{label}</span>
        {description && <span className="mt-1 block font-sans text-xs text-steel">{description}</span>}
      </label>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-12 shrink-0 items-center border-2 border-ink transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-panel'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none block h-4 w-4 border border-ink bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
};
```

  Update the doc comment to say "square thumb and track; the row label toggles the switch".

- [ ] **Step 4: Rewrite the `RetroTabs` component body.**

```tsx
export interface RetroTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /** When set, tabs get ids `${idPrefix}-tab-${id}` and aria-controls `${idPrefix}-panel-${id}`. */
  idPrefix?: string;
  className?: string;
}

export const RetroTabs: React.FC<RetroTabsProps> = ({ tabs, activeTab, onTabChange, idPrefix, className }) => {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.map((tab, i) => ({ tab, i })).filter(({ tab }) => !tab.disabled);

  const focusTab = (from: number, delta: number) => {
    const pos = enabled.findIndex(({ i }) => i === from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (!next) return;
    onTabChange(next.tab.id);
    refs.current[next.i]?.focus();
  };

  return (
    <div role="tablist" className={cn('flex gap-0 border-b border-ink', className)}>
      {tabs.map((tab, i) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(i, 1); }
              if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(i, -1); }
            }}
            className={cn(
              '-mb-px border border-b-0 border-ink px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              isActive && 'border-b-white bg-white font-bold text-ink',
              !isActive && !tab.disabled && 'bg-panel text-ink-soft hover:bg-panel-hover hover:text-ink',
              tab.disabled && 'cursor-not-allowed bg-paper text-steel opacity-50'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 5: Restyle the toolbar.** In `components/ui/rich-text-toolbar.tsx`:
  - The wrapper div becomes `className="flex items-center gap-3 p-1 border border-ink bg-panel"`.
  - On each Button, set `size="icon-sm"`.
  - The className becomes `cn(tool.isActive && 'bg-ink text-white hover:bg-ink hover:text-white')`.
  - Update the doc comment: "Active states shown with an ink fill (selection = ink; blue is for actions)".

- [ ] **Step 6: Run the tests.** Run `npx vitest run tests/toggle-tabs.test.tsx && npm run test`. Expected: PASS.

- [ ] **Step 7: Commit, run the phase gate, and push.**
  Run `npm run guard:update`, then the full gate.

```bash
git add components/ui/toggle-switch.tsx components/ui/retro-tabs.tsx components/ui/rich-text-toolbar.tsx tests/toggle-tabs.test.tsx tests/swiss-guard.allowlist.json
git commit -m "fix(ui): accessible switch and tabs; ink selection in the rich-text toolbar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

  **Owner review, phase 2:** every dialog (dashboard upload and master choice; builder add-section and regenerate ×3; tailor diff; tracker ×3), every form field and dropdown (settings, tailor, tracker), tabs in the builder, and the rich-text toolbar.

---

## Phase 3: New primitives

### Task 11: Alert and StatusIndicator

**Files:**
- Create: `components/ui/alert.tsx`, `components/ui/status-indicator.tsx`
- Test: `tests/alert-status.test.tsx`

**Interfaces:**
- `Alert({ tone?: 'info'|'success'|'warning'|'error'; title?: ReactNode; children?: ReactNode; className?; ref?; ...div props })`, exported with `type AlertTone`. Server-safe.
- `StatusIndicator({ tone: 'ready'|'warning'|'error'|'active'|'neutral'; children: ReactNode; className? })`, exported with `type StatusTone`. Server-safe.

- [ ] **Step 1: Write the failing test.** Create `tests/alert-status.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from '@/components/ui/alert';
import { StatusIndicator } from '@/components/ui/status-indicator';

describe('Alert', () => {
  it.each([
    ['error', 'alert', 'border-destructive', 'bg-destructive-tint'],
    ['warning', 'alert', 'border-warning', 'bg-warning-tint'],
    ['success', 'status', 'border-success', 'bg-success-tint'],
    ['info', 'status', 'border-primary', 'bg-info-tint'],
  ] as const)('%s uses role=%s and its tone colours', (tone, role, border, bg) => {
    render(<Alert tone={tone} title="Heads up">Body</Alert>);
    const alert = screen.getByRole(role);
    expect(alert).toHaveClass('border-2', border, bg, 'rounded-none');
    expect(alert.className).not.toMatch(/shadow/);
  });

  it('labels warnings in the AA warning-text colour, not the fill', () => {
    render(<Alert tone="warning" title="Setup required" />);
    expect(screen.getByText('Setup required')).toHaveClass('text-warning-text', 'font-mono', 'uppercase');
  });
});

describe('StatusIndicator', () => {
  it('always renders the text label next to a 12px square', () => {
    render(<StatusIndicator tone="ready">Ready</StatusIndicator>);
    const label = screen.getByText('Ready');
    expect(label).toHaveClass('font-mono', 'uppercase', 'text-success');
    expect(label.previousElementSibling).toHaveClass('size-3', 'bg-success');
    expect(label.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/alert-status.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `components/ui/alert.tsx`.**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONE: Record<AlertTone, { box: string; label: string }> = {
  info: { box: 'border-primary bg-info-tint', label: 'text-primary' },
  success: { box: 'border-success bg-success-tint', label: 'text-success' },
  warning: { box: 'border-warning bg-warning-tint', label: 'text-warning-text' },
  error: { box: 'border-destructive bg-destructive-tint', label: 'text-destructive' },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

/** Swiss alert: 2px tone border on a tint, mono label, ink-soft body, no shadow. Server-safe. */
export function Alert({ tone = 'info', title, children, className, ref, ...props }: AlertProps) {
  return (
    <div
      ref={ref}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('rounded-none border-2 p-4', TONE[tone].box, className)}
      {...props}
    >
      {title && (
        <p className={cn('mb-1 font-mono text-sm font-bold uppercase tracking-wider', TONE[tone].label)}>{title}</p>
      )}
      {children && <div className="font-sans text-sm text-ink-soft text-pretty">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/ui/status-indicator.tsx`.**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'ready' | 'warning' | 'error' | 'active' | 'neutral';

const SQUARE: Record<StatusTone, string> = {
  ready: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  active: 'bg-primary',
  neutral: 'bg-steel',
};

const TEXT: Record<StatusTone, string> = {
  ready: 'text-success',
  warning: 'text-warning-text',
  error: 'text-destructive',
  active: 'text-primary',
  neutral: 'text-steel',
};

/** 12px square + mono label. The label is mandatory, so status never relies on colour alone. Server-safe. */
export function StatusIndicator({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className={cn('size-3 shrink-0', SQUARE[tone])} />
      <span className={cn('font-mono text-xs font-bold uppercase tracking-wider', TEXT[tone])}>{children}</span>
    </span>
  );
}
```

- [ ] **Step 5: Run the tests.** Run `npx vitest run tests/alert-status.test.tsx`. Expected: PASS.

- [ ] **Step 6: Commit.** Run the full gate.

```bash
git add components/ui/alert.tsx components/ui/status-indicator.tsx tests/alert-status.test.tsx
git commit -m "feat(ui): add Alert and StatusIndicator primitives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: ConfirmDialog on Dialog and Alert, with deletes confirmed as danger

**Files:**
- Modify: `components/ui/confirm-dialog.tsx:72-162`, `components/tracker/bulk-action-bar.tsx:63`, `app/(default)/settings/page.tsx:1491,1503`
- Test: `tests/confirm-dialog-variants.test.tsx`. Keep `tests/confirm-dialog.test.tsx` passing unchanged.

- [ ] **Step 1: Write the failing test.** Create `tests/confirm-dialog-variants.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

describe('ConfirmDialog', () => {
  it('drops the glyph tiles and uses the danger button for destructive confirms', () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Delete" description="Gone for good." variant="danger" confirmLabel="Delete" onConfirm={vi.fn()} />
    );
    expect(screen.queryByText('!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-destructive');
  });

  it('shows errors as an error Alert', () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="Retry" description="d" errorMessage="Network failed" onConfirm={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
  });

  it('sets the description in sans, not mono', () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="t" description="Plain words" onConfirm={vi.fn()} />);
    expect(screen.getByText('Plain words').className).not.toContain('font-mono');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/confirm-dialog-variants.test.tsx`. Expected: FAIL (the `!` tile exists, there's no `role=alert`, the description is mono).

- [ ] **Step 3: Replace the `variantStyles` block and the JSX in `confirm-dialog.tsx`.**

```tsx
  const buttonVariant = (
    { danger: 'destructive', warning: 'warning', success: 'success', default: 'default' } as const
  )[variant];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && cancelDisabled) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="min-w-0 flex-1">
            <DialogDescription className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
              {description}
            </DialogDescription>
          </div>
          {errorMessage && (
            <Alert tone="error" className="max-h-60 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
              {errorMessage}
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          {showCancelButton && (
            <Button variant="outline" onClick={handleCancel} disabled={cancelDisabled}>
              {finalCancelLabel}
            </Button>
          )}
          <Button variant={buttonVariant} onClick={handleConfirm} disabled={confirmDisabled}>
            {finalConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
```

  Add `DialogBody` to the dialog import and `import { Alert } from './alert';`.

- [ ] **Step 4: Switch the irreversible deletes to danger.** Change `variant="warning"` to `variant="danger"` on the ConfirmDialogs at `components/tracker/bulk-action-bar.tsx:63`, `app/(default)/settings/page.tsx:1491` and `:1503`.

- [ ] **Step 5: Run the tests.** Run `npx vitest run tests/confirm-dialog.test.tsx tests/confirm-dialog-variants.test.tsx && npm run test`. Expected: PASS. The existing class test still finds `max-h-60 …` on the description and `min-w-0 flex-1` on its parent.

- [ ] **Step 6: Commit.** Run `npm run guard:update`, then the full gate.

```bash
git add components/ui/confirm-dialog.tsx components/tracker/bulk-action-bar.tsx app/\(default\)/settings/page.tsx tests/confirm-dialog-variants.test.tsx tests/swiss-guard.allowlist.json
git commit -m "fix(ui): ConfirmDialog on the Swiss dialog; confirm irreversible deletes as danger" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: PanelHeader and EmptyState

**Files:**
- Create: `components/ui/panel-header.tsx`, `components/ui/empty-state.tsx`
- Test: `tests/panel-empty.test.tsx`

**Interfaces:**
- `PanelHeader({ tone?: 'input'|'output'|'neutral'; title: ReactNode; level?: 'h2'|'h3'; children?: ReactNode; className? })`, exported with `type PanelTone`
- `EmptyState({ title: ReactNode; description?: ReactNode; action?: ReactNode; variant?: 'plain'|'framed'; className? })`
- Both server-safe.

- [ ] **Step 1: Write the failing test.** Create `tests/panel-empty.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelHeader } from '@/components/ui/panel-header';
import { EmptyState } from '@/components/ui/empty-state';

describe('PanelHeader', () => {
  it('encodes the panel role in the square colour', () => {
    render(<PanelHeader tone="output" title="Preview" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Preview' });
    expect(heading).toHaveClass('font-mono', 'text-xs', 'uppercase');
    expect(heading.previousElementSibling).toHaveClass('size-3', 'bg-success');
  });

  it('renders actions in the right-hand slot', () => {
    render(<PanelHeader title="Editor"><button>Save</button></PanelHeader>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('is left-aligned with no icon tile and at most one action', () => {
    const { container } = render(
      <EmptyState title="No entries" description="Add your first role." action={<button>Add</button>} />
    );
    expect(container.firstChild).toHaveClass('items-start', 'text-left');
    expect(container.firstChild?.className).not.toMatch(/text-center|justify-center/);
    expect(screen.getByText('No entries')).toHaveClass('font-mono', 'uppercase');
    expect(screen.getByText('Add your first role.')).toHaveClass('max-w-[60ch]');
  });

  it('has a framed variant for empty list slots', () => {
    const { container } = render(<EmptyState variant="framed" title="Empty" />);
    expect(container.firstChild).toHaveClass('border', 'border-dashed', 'border-steel', 'bg-paper');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/panel-empty.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Create both files.** `components/ui/panel-header.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type PanelTone = 'input' | 'output' | 'neutral';

const SQUARE: Record<PanelTone, string> = { input: 'bg-primary', output: 'bg-success', neutral: 'bg-ink' };

/** Swiss panel header: role square + mono caption, optional right-hand actions. Server-safe. */
export function PanelHeader({
  tone = 'neutral',
  title,
  level: Heading = 'h2',
  children,
  className,
}: {
  tone?: PanelTone;
  title: React.ReactNode;
  level?: 'h2' | 'h3';
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-4 border-b-2 border-ink pb-2', className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={cn('size-3 shrink-0', SQUARE[tone])} />
        <Heading className="truncate font-mono text-xs font-bold uppercase tracking-wider text-ink">{title}</Heading>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
```

  `components/ui/empty-state.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss empty state: left-aligned mono label, one line of copy, at most one action.
 * `framed` marks an empty list slot, a draft-like state where the pack allows dashed borders. Server-safe.
 */
export function EmptyState({
  title,
  description,
  action,
  variant = 'plain',
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: 'plain' | 'framed';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 text-left',
        variant === 'framed' ? 'border border-dashed border-steel bg-paper p-6' : 'py-6',
        className
      )}
    >
      <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">{title}</p>
      {description && <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/panel-empty.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit.** Run the full gate.

```bash
git add components/ui/panel-header.tsx components/ui/empty-state.tsx tests/panel-empty.test.tsx
git commit -m "feat(ui): add PanelHeader and EmptyState primitives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: SegmentedControl

**Files:**
- Create: `components/ui/segmented-control.tsx` (client)
- Test: `tests/segmented-control.test.tsx`

**Interfaces:**
- `SegmentedItem<T extends string> = { value: T; label: ReactNode; disabled?: boolean; title?: string }`
- `SegmentedControl<T extends string>({ items, value, onChange, variant?: 'fill'|'outline', size?: 'sm'|'default', className?, 'aria-label'?, 'aria-labelledby'? })`
- `fill` gives selected segments an ink fill with white text. `outline` adds a 2px ink outline to the selected item and is meant for thumbnails.

- [ ] **Step 1: Write the failing test.** Create `tests/segmented-control.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from '@/components/ui/segmented-control';

function Harness() {
  const [value, setValue] = useState<'a4' | 'letter' | 'legal'>('a4');
  return (
    <SegmentedControl
      aria-label="Page size"
      value={value}
      onChange={setValue}
      items={[
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'Letter' },
        { value: 'legal', label: 'Legal', disabled: true },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('is a radio group with the selected option in ink', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Page size' })).toBeInTheDocument();
    const a4 = screen.getByRole('radio', { name: 'A4' });
    expect(a4).toHaveAttribute('aria-checked', 'true');
    expect(a4).toHaveClass('bg-ink', 'text-white');
    expect(screen.getByRole('radio', { name: 'Letter' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves with arrow keys, skipping disabled options and wrapping', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A4' }), { key: 'ArrowRight' });
    const letter = screen.getByRole('radio', { name: 'Letter' });
    expect(letter).toHaveAttribute('aria-checked', 'true');
    expect(letter).toHaveFocus();
    fireEvent.keyDown(letter, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'A4' })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run tests/segmented-control.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Create `components/ui/segmented-control.tsx`.**

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedItem<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** fill: selected = ink fill (text options). outline: selected = 2px ink outline (thumbnails). */
  variant?: 'fill' | 'outline';
  size?: 'sm' | 'default';
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Single-select segmented control with radiogroup semantics and arrow-key navigation. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  variant = 'fill',
  size = 'default',
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.disabled);
  const selectedIndex = items.findIndex((item) => item.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : (enabled[0]?.index ?? -1);

  const move = (from: number, delta: number) => {
    const pos = enabled.findIndex(({ index }) => index === from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.item.value);
    refs.current[next.index]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(index, 1); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(index, -1); }
    if (event.key === 'Home' && enabled[0]) { event.preventDefault(); move(enabled[0].index, 0); }
    if (event.key === 'End' && enabled.length) { event.preventDefault(); move(enabled[enabled.length - 1].index, 0); }
  };

  return (
    <div role="radiogroup" {...aria} className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'rounded-none border border-ink font-mono uppercase tracking-wider transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              'disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm',
              variant === 'fill' && (selected ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-panel'),
              variant === 'outline' && cn('bg-white p-2 text-ink', selected ? 'outline-2 outline-offset-2 outline-ink' : 'hover:bg-panel')
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/segmented-control.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit.** Run the full gate.

```bash
git add components/ui/segmented-control.tsx tests/segmented-control.test.tsx
git commit -m "feat(ui): add an accessible SegmentedControl with ink selection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: PageFrame, PageHeader, blueprint utility, and formatDate

**Files:**
- Create: `components/ui/page-frame.tsx`, `components/ui/page-header.tsx`, `lib/format-date.ts`
- Modify: `app/(default)/css/globals.css` (append the utility)
- Test: `tests/page-frame.test.tsx`, `tests/format-date.test.ts`

**Interfaces:**
- `PageFrame({ width?: 'default'|'wide'; height?: 'auto'|'screen'; className?; children })`
- `PageHeader({ className?; children })`, with `PageHeader.Back({ href; children })`, `PageHeader.Title({ children; className? })`, `PageHeader.Subtitle({ children })` and `PageHeader.Actions({ children })`
- The CSS utility `bg-blueprint`
- `formatDate(value: string | number | Date | null | undefined, locale: string, options?: Intl.DateTimeFormatOptions): string`

- [ ] **Step 1: Write the failing tests.** Create `tests/page-frame.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';

describe('PageFrame + PageHeader', () => {
  it('frames the page on the blueprint grid', () => {
    const { container } = render(<PageFrame width="wide"><p>content</p></PageFrame>);
    expect(container.firstChild).toHaveClass('bg-blueprint', 'bg-canvas');
    expect(screen.getByText('content').parentElement).toHaveClass('border', 'border-ink', 'shadow-sw-lg', 'max-w-[104rem]');
  });

  it('renders one header recipe: back link, bold serif H1, steel subtitle', () => {
    render(
      <PageHeader>
        <PageHeader.Back href="/dashboard">Dashboard</PageHeader.Back>
        <PageHeader.Title>Settings</PageHeader.Title>
        <PageHeader.Subtitle>Configure your providers</PageHeader.Subtitle>
      </PageHeader>
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('border-ink', 'h-8');
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toHaveClass('font-serif', 'font-bold', 'uppercase', 'text-4xl', 'md:text-5xl');
    expect(screen.getByText(/Configure your providers/)).toHaveClass('text-steel');
    expect(screen.getByText(/Configure your providers/).textContent?.startsWith('// ')).toBe(true);
  });
});
```

  Create `tests/format-date.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format-date';

describe('formatDate', () => {
  it('formats in the UI locale', () => {
    expect(formatDate('2026-03-05T12:00:00Z', 'en')).toBe('Mar 5, 2026');
    expect(formatDate('2026-03-05T12:00:00Z', 'de')).toBe('5. März 2026');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatDate(null, 'en')).toBe('');
    expect(formatDate('not a date', 'en')).toBe('');
  });

  it('falls back to English for an unusable locale tag', () => {
    expect(formatDate('2026-03-05T12:00:00Z', 'xx-INVALID-TAG-123')).toBe('Mar 5, 2026');
  });
});
```

- [ ] **Step 2: Confirm they fail.** Run `npx vitest run tests/page-frame.test.tsx tests/format-date.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement.** `components/ui/page-frame.tsx`:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type PageFrameWidth = 'default' | 'wide';
export type PageFrameHeight = 'auto' | 'screen';

const WIDTH: Record<PageFrameWidth, string> = { default: 'max-w-[86rem]', wide: 'max-w-[104rem]' };

/** The house page frame: blueprint grid on canvas, 1px ink frame, 8px hard shadow. Server-safe. */
export function PageFrame({
  width = 'default',
  height = 'auto',
  className,
  children,
}: {
  width?: PageFrameWidth;
  height?: PageFrameHeight;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-blueprint flex w-full items-start justify-center bg-canvas px-4 py-12 md:px-8',
        height === 'screen' ? 'h-screen overflow-hidden' : 'min-h-screen'
      )}
    >
      <div
        className={cn(
          'flex w-full flex-col border border-ink bg-canvas shadow-sw-lg',
          WIDTH[width],
          height === 'screen' && 'max-h-full overflow-hidden',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
```

  `components/ui/page-header.tsx`:

```tsx
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonClass } from '@/components/ui/button';

type Children = { children: React.ReactNode };

function PageHeaderRoot({ className, children }: Children & { className?: string }) {
  return (
    <header className={cn('relative z-30 shrink-0 border-b border-ink bg-canvas p-8 md:p-12', className)}>
      {children}
    </header>
  );
}

function Back({ href, children }: Children & { href: string }) {
  return (
    <Link href={href} className={buttonClass({ variant: 'outline', size: 'sm', className: 'mb-8' })}>
      <ArrowLeft aria-hidden="true" />
      {children}
    </Link>
  );
}

function Title({ children, className }: Children & { className?: string }) {
  return (
    <h1 className={cn('font-serif text-4xl font-bold uppercase leading-none tracking-tight text-balance text-ink md:text-5xl', className)}>
      {children}
    </h1>
  );
}

function Subtitle({ children }: Children) {
  return (
    <p className="mt-4 max-w-[60ch] font-mono text-sm font-bold uppercase tracking-wide text-steel">
      {'// '}
      {children}
    </p>
  );
}

function Actions({ children }: Children) {
  return <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>;
}

/** One page-header recipe. Actions hold at most one primary Button. Server-safe. */
export const PageHeader = Object.assign(PageHeaderRoot, { Back, Title, Subtitle, Actions });
```

  `lib/format-date.ts`:

```ts
const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

/** Formats a date in the UI locale. Returns '' for missing or invalid input. */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_OPTIONS
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date);
  }
}
```

  Append to `globals.css`, after the reduced-motion block:

```css
/* House signature: the blueprint grid behind framed pages (one definition). */
@utility bg-blueprint {
  background-image:
    linear-gradient(rgb(29 78 216 / 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgb(29 78 216 / 0.1) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/page-frame.test.tsx tests/format-date.test.ts && npm run test`. Expected: PASS.

- [ ] **Step 5: Commit, run the phase gate, and push.**

```bash
git add components/ui/page-frame.tsx components/ui/page-header.tsx lib/format-date.ts app/\(default\)/css/globals.css tests/page-frame.test.tsx tests/format-date.test.ts
git commit -m "feat(ui): add PageFrame, PageHeader, the blueprint utility and formatDate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

---

## Phase 4: Motion

### Task 16: Install Motion, add the provider and constants, mock it in tests

**Files:**
- Create: `lib/motion.ts`, `components/common/motion-provider.tsx`, `components/common/motion-features.ts`, `tests/motion-provider.test.tsx`
- Modify: `package.json`, `package-lock.json`, `vitest.setup.ts`, `app/(default)/layout.tsx`

**Interfaces:**
- Produces:
  - `EASE_OUT_EXPO: readonly [0.16, 1, 0.3, 1]`
  - `DURATION: { press: 0.1; surface: 0.2; exit: 0.12; menuIn: 0.12; menuOut: 0.08; list: 0.15; swap: 0.1 }`
  - `SPRING: { type: 'spring'; visualDuration: 0.2; bounce: 0 }`
  - `MotionProvider({ children })`

- [ ] **Step 1: Pick the version and install it.**
  Run `npm view motion time --json | node -e "const t=JSON.parse(require('fs').readFileSync(0));const cut=Date.now()-14*864e5;console.log(Object.entries(t).filter(([v,d])=>/^\d+\.\d+\.\d+$/.test(v)&&Date.parse(d)<cut).sort((a,b)=>Date.parse(b[1])-Date.parse(a[1]))[0][0])"`. This prints the newest release that is at least 14 days old. Then run `npm install motion@<that version> --save-exact`.

- [ ] **Step 2: Mock Motion for jsdom.** Append to `vitest.setup.ts`:

```ts
import { vi } from 'vitest';

// Motion can't run in jsdom, and `m` without LazyMotion features would leave
// `initial` styles (opacity 0) applied. Render motion elements as plain DOM
// and presence as a passthrough, so tests see the final state immediately.
vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap',
    'whileFocus', 'whileInView', 'layout', 'layoutId', 'onAnimationStart', 'onAnimationComplete',
  ]);
  const cache = new Map<string, React.ElementType>();
  const m = new Proxy({} as Record<string, React.ElementType>, {
    get: (_target, tag: string | symbol) => {
      // Only element names are components; never answer `then` (thenable checks) or symbols.
      if (typeof tag !== 'string' || tag === 'then') return undefined;
      if (!cache.has(tag)) {
        const Component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
          const domProps: Record<string, unknown> = { ref };
          for (const [key, val] of Object.entries(props)) if (!MOTION_PROPS.has(key)) domProps[key] = val;
          return React.createElement(tag, domProps);
        });
        cache.set(tag, Component);
      }
      return cache.get(tag);
    },
  });
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    m,
    AnimatePresence: Passthrough,
    LazyMotion: Passthrough,
    MotionConfig: ({ children, reducedMotion }: { children?: React.ReactNode; reducedMotion?: string }) =>
      React.createElement('div', { 'data-reduced-motion': reducedMotion, style: { display: 'contents' } }, children),
    useReducedMotion: () => false,
    domAnimation: {},
  };
});
```

  The `import { vi }` line goes with the other imports at the top of the file.

- [ ] **Step 3: Write the failing provider test.** Create `tests/motion-provider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MotionProvider } from '@/components/common/motion-provider';
import { DURATION, EASE_OUT_EXPO, SPRING } from '@/lib/motion';

describe('MotionProvider', () => {
  it('respects the OS reduced-motion setting', () => {
    render(<MotionProvider><p>child</p></MotionProvider>);
    expect(screen.getByText('child').parentElement).toHaveAttribute('data-reduced-motion', 'user');
  });

  it('uses the one curve, one spring and the duration tiers from the spec', () => {
    expect(EASE_OUT_EXPO).toEqual([0.16, 1, 0.3, 1]);
    expect(SPRING).toEqual({ type: 'spring', visualDuration: 0.2, bounce: 0 });
    expect(DURATION.surface).toBe(0.2);
    expect(DURATION.exit).toBeLessThan(DURATION.surface);
  });
});
```

  Run `npx vitest run tests/motion-provider.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement.** `lib/motion.ts`:

```ts
/** The motion vocabulary (spec §7). CSS uses the same values via globals.css. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  press: 0.1,
  surface: 0.2,
  exit: 0.12,
  menuIn: 0.12,
  menuOut: 0.08,
  list: 0.15,
  swap: 0.1,
} as const;

/** Critically damped: velocity carries through interruptions, never bounces. */
export const SPRING = { type: 'spring', visualDuration: 0.2, bounce: 0 } as const;
```

  `components/common/motion-features.ts`:

```ts
// Separate module so the animation features load as their own lazy chunk.
import { domAnimation } from 'motion/react';

export default domAnimation;
```

  `components/common/motion-provider.tsx`:

```tsx
'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

const loadFeatures = () => import('./motion-features').then((mod) => mod.default);

/**
 * Lazy Motion for the app. `strict` throws if anyone renders `motion.*` instead
 * of `m.*`; nothing visible at first paint may depend on Motion.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DURATION.surface, ease: EASE_OUT_EXPO }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
```

  In `app/(default)/layout.tsx`:
  - Add `import { MotionProvider } from '@/components/common/motion-provider';`.
  - Wrap the `<main>`: `<LocalizedErrorBoundary><MotionProvider><main className="min-h-screen flex flex-col">{children}</main></MotionProvider></LocalizedErrorBoundary>`.

- [ ] **Step 5: Run the tests.** Run `npx vitest run tests/motion-provider.test.tsx && npm run test`. Expected: PASS.

- [ ] **Step 6: Commit.** Run the full gate.

```bash
git add package.json package-lock.json vitest.setup.ts lib/motion.ts components/common/motion-provider.tsx components/common/motion-features.ts app/\(default\)/layout.tsx tests/motion-provider.test.tsx
git commit -m "feat(frontend): add Motion with a lazy, reduced-motion-aware provider" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: Presence for Dialog, Dropdown, alerts and lists

**Files:**
- Create: `components/common/presence.tsx`
- Modify: `components/ui/dialog.tsx` (the `DialogContent` return), `components/ui/dropdown.tsx` (the listbox)
- Test: covered by `tests/dialog.test.tsx` and `tests/dropdown.test.tsx`, which must stay green.

**Interfaces:**
- `FadePresence({ show: boolean; className?; children })`
- `FadeItem({ className?; children })`
- `AnimatePresence`, re-exported from `motion/react`

- [ ] **Step 1: Create `components/common/presence.tsx`.**

```tsx
'use client';

import { AnimatePresence, m } from 'motion/react';
import { DURATION, EASE_OUT_EXPO } from '@/lib/motion';

const fadeIn = (duration: number) => ({ opacity: 1, transition: { duration, ease: EASE_OUT_EXPO } });
const fadeOut = { opacity: 0, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } };

/** Fades a single element in and out (alerts, banners). No animation on first render. */
export function FadePresence({ show, className, children }: { show: boolean; className?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div key="fade" className={className} initial={{ opacity: 0 }} animate={fadeIn(DURATION.surface)} exit={fadeOut}>
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A list item that fades in and out. Wrap the list in <AnimatePresence initial={false}>
 * and key each FadeItem. Neighbours snap; never add `layout`. A dnd-kit node goes *inside*
 * FadeItem, because dnd-kit owns `transform` on its own element.
 */
export function FadeItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <m.div className={className} initial={{ opacity: 0 }} animate={fadeIn(DURATION.list)} exit={fadeOut}>
      {children}
    </m.div>
  );
}

export { AnimatePresence };
```

- [ ] **Step 2: Animate the Dialog.** In `components/ui/dialog.tsx`:
  - Add `import { AnimatePresence, m } from 'motion/react';` and `import { DURATION, EASE_OUT_EXPO, SPRING } from '@/lib/motion';`.
  - Replace `if (!open || typeof document === 'undefined') return null;` with `if (typeof document === 'undefined') return null;`.
  - Replace the portal body with:

```tsx
  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="dialog" className="fixed inset-0 z-50">
          <m.div
            className="fixed inset-0 bg-overlay"
            aria-hidden="true"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.surface, ease: EASE_OUT_EXPO } }}
            exit={{ opacity: 0, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } }}
          />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onKeyDown={trapTab}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { opacity: { duration: DURATION.surface, ease: EASE_OUT_EXPO }, scale: SPRING },
              }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: DURATION.exit, ease: EASE_OUT_EXPO } }}
              className={cn(
                'relative flex max-h-[90vh] w-full flex-col overflow-hidden overscroll-contain',
                'rounded-none border border-ink bg-white shadow-sw-lg outline-none',
                SIZE_CLASS[size],
                className
              )}
            >
              {children}
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-4 top-5"
                onClick={() => onOpenChange(false)}
                aria-label={t('common.close')}
                title={t('common.close')}
              >
                <X aria-hidden="true" />
              </Button>
            </m.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
```

- [ ] **Step 3: Animate the Dropdown menu.** In `components/ui/dropdown.tsx`:
  - Import `AnimatePresence`, `m` and the motion constants.
  - Wrap `{isOpen && ( … )}` in `<AnimatePresence>`.
  - Make the listbox `<div>` an `<m.div>` with the props below.

```tsx
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1, transition: { opacity: { duration: DURATION.menuIn, ease: EASE_OUT_EXPO }, scale: SPRING } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: DURATION.menuOut, ease: EASE_OUT_EXPO } }}
            style={{ transformOrigin: 'top' }}
```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/dialog.test.tsx tests/dropdown.test.tsx && npm run test`. Expected: PASS (the jsdom mock renders the final state).

- [ ] **Step 5: Check it by hand in a real browser.**
  Run `npm run dev` with the backend up. Open the dashboard upload dialog: it fades and scales in, fades out on Esc, and focus returns to the trigger. Open a Settings dropdown: it opens from the top edge. With macOS "Reduce motion" on, the dialog only fades, with no scale.

- [ ] **Step 6: Commit.** Run `npm run guard:update`, then the full gate.

```bash
git add components/common/presence.tsx components/ui/dialog.tsx components/ui/dropdown.tsx tests/swiss-guard.allowlist.json
git commit -m "feat(ui): animate dialog and menu presence with Motion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: CSS motion cleanup, hero entrance, dnd-kit timing, and the bundle check

**Files:**
- Modify: `app/(default)/css/globals.css`, `components/home/hero.tsx:26-31`, `components/tracker/application-card.tsx`, `components/tracker/kanban-board.tsx:145,151`
- Modify: every other `useSortable(` call site; find them with `grep -rln "useSortable(" components`
- Modify: `components/builder/regenerate-instruction-dialog.tsx:152`, `components/builder/regenerate-diff-preview.tsx:287`, `components/tailor/ats-score-card.tsx:42,70`, `../../docs/agent/architecture/first-load-js.md`

- [ ] **Step 1: Remove `tw-animate-css`.**
  - Delete `@import 'tw-animate-css';` from `globals.css`.
  - Run `grep -rnE "animate-in|fade-in-|zoom-in-|slide-in-" app components` and expect no output (Dialog no longer uses them).
  - Run `npm uninstall tw-animate-css`.

- [ ] **Step 2: Add the hero entrance CSS** at the end of `globals.css`:

```css
/* Home hero entrance (spec D10): one-shot, 300ms expo, staggered. CSS, not
   Motion, so first paint never waits for the lazy Motion chunk. */
@keyframes hero-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.hero-enter { animation: hero-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.hero-enter-delay-1 { animation-delay: 60ms; }
.hero-enter-delay-2 { animation-delay: 120ms; }

@media (prefers-reduced-motion: reduce) {
  .hero-enter { animation: none; opacity: 1; transform: none; }
}
```

  In `components/home/hero.tsx`:
  - Add `hero-enter` to the `<h1>` className.
  - Wrap the button row's className with `hero-enter hero-enter-delay-1`.
  - The brand lines are a single h1, so the third stagger (`hero-enter-delay-2`) goes on the Launch App link.

- [ ] **Step 3: Set dnd-kit timing and respect reduced motion.** In every `useSortable(` call site:
  - Add `const reducedMotion = useReducedMotion();`, importing it from `motion/react`.
  - Pass `transition: reducedMotion ? null : { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }` into the `useSortable({ … })` options.

  In `components/tracker/kanban-board.tsx:145,151`, change `behavior: 'smooth'` to `behavior: reducedMotion ? 'auto' : 'smooth'`, with `reducedMotion` from `useReducedMotion()`.

- [ ] **Step 4: Remove the decorative motion.**
  - Replace the spinning `Sparkles` at `regenerate-instruction-dialog.tsx:152` and the spinning `Check` at `regenerate-diff-preview.tsx:287` with `<Loader2 className="size-4 animate-spin" aria-hidden="true" />`. Fix the imports.
  - In `ats-score-card.tsx:42,70`, delete `transition-all duration-500`. The card itself is re-skinned in Task 21.

- [ ] **Step 5: Re-measure the bundle.**
  Run `npm run build && npm run report:first-load`. Under "After Motion (phase 4)" in `first-load-js.md`, paste the table and the per-route delta against the baseline. Expect about +5 KB gzip on routes that render Dialog. If any route grows more than 10 KB, check for an import of `motion` instead of `m`, or of `domAnimation` outside `motion-features.ts`.

- [ ] **Step 6: Commit, run the phase gate, and push.** Run `npm run guard:update`, then the full gate.

```bash
git add app/\(default\)/css/globals.css package.json package-lock.json components/home/hero.tsx components/tracker/application-card.tsx components/tracker/kanban-board.tsx \
  components/builder/regenerate-instruction-dialog.tsx components/builder/regenerate-diff-preview.tsx components/tailor/ats-score-card.tsx \
  <the other useSortable files> tests/swiss-guard.allowlist.json ../../docs/agent/architecture/first-load-js.md
git commit -m "feat(frontend): hero entrance, dnd-kit timing and reduced-motion support; drop tw-animate-css" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

  **Owner review, phase 4:** dialogs, menus, the home hero, kanban drag, and builder reordering.

---

## Phase 5: Page sweeps

### Sweep Procedure (applies to every task in this phase)

1. **List the work.** Run `npm run guard -- <the task's paths>` and keep the output open as the checklist.
2. **Do the mechanical renames** in the task's files only, using the table below. Then re-run the guard.
3. **Apply the task's surface checklist.** Every item lists the line from the audit, so re-locate it after earlier edits shift lines.
4. **Adopt the primitives:**
   - Delete overrides that repeat a primitive's defaults: `rounded-none`, `border-black`, `bg-white` on Input, the `focus-visible:ring-0 …` overrides, and `text-xs text-steel-grey` on Label.
   - Swap hand-rolled markup for `Button`/`buttonClass`, `Input`, `Textarea`, `Label`, `Alert`, `StatusIndicator`, `PanelHeader`, `SegmentedControl`, `EmptyState`, `PageFrame` and `PageHeader`.
5. **Apply the craft rules** (spec §8) to every touched component:
   - focus rings;
   - `aria-label` on icon-only buttons;
   - `type="button"`;
   - `Label htmlFor`;
   - `tabular-nums` on counts and dates;
   - `formatDate(value, locale)` for dates, using `locale` from `useTranslations()`;
   - one primary per region;
   - no glyphs as icons;
   - no `mr-2` inside a `gap-2` button.
6. **i18n.** Any new key goes into all seven `messages/*.json` files with real translations. `scripts/check_locale_parity.py` must pass.
7. **Lower the guard.** Run `npm run guard:update`. It refuses if anything went up. Then run `npm run guard -- <paths>`: what remains must be only the items this plan defers.
8. **Gate, commit, push.** Run the full gate, then `bash ../../.githooks/pre-push`. Commit with the task's message and `git push origin HEAD:dev`.
9. **Owner review.** List in the commit body the pages to check and any flagged visual changes.

**Mechanical rename table** (word-boundary matches only; check each replacement in context):

| From | To |
|---|---|
| `text-steel-grey`, `text-muted-foreground`, `text-black/NN` | `text-steel` |
| `border-steel-grey` / `bg-steel-grey` | `border-steel` / `bg-steel` |
| `bg-paper-tint`, `border-paper-tint` | `bg-paper`, `border-paper` |
| `hover:bg-paper-tint`, `active:bg-paper-tint` | `hover:bg-panel`, `active:bg-panel` |
| `bg-secondary`, `hover:bg-secondary` | `bg-panel`, `hover:bg-panel` |
| `bg-background`, `text-foreground`, `text-background` | `bg-canvas`, `text-ink`, `text-canvas` |
| `*-blue-700`, `*-blue-600`, `*-blue-500` | `*-primary` |
| `*-blue-800` | `*-primary-hover` |
| `bg-blue-50`, `bg-blue-100`, `hover:bg-blue-50` | `bg-info-tint`, `hover:bg-info-tint` |
| `*-green-700`, `*-green-600`, `*-green-500`, `border-green-200`/`300` | `*-success` |
| `*-green-800` | `*-success-hover` |
| `bg-green-50`, `bg-green-100` | `bg-success-tint` |
| `*-red-600`, `*-red-700`, `*-red-500`, `border-red-200`/`300` | `*-destructive` |
| `hover:bg-red-700`, `*-red-800` | `*-destructive-hover` |
| `bg-red-50`, `bg-red-100`, `bg-red-50/50`, `hover:bg-red-50`, `hover:bg-destructive/10` | `bg-destructive-tint` / `hover:bg-destructive-tint` |
| `text-red-900` (body copy) | `text-ink-soft` |
| `bg-orange-500`, `bg-amber-500`, `border-orange-500/600`, `border-amber-500/700` | `bg-warning`, `border-warning` |
| `hover:bg-orange-600` | `hover:bg-warning-hover` |
| `text-orange-*`, `text-amber-*`, `text-yellow-600`, icon `text-warning` | `text-warning-text` |
| `bg-amber-50`, `bg-orange-50`, `bg-orange-100` | `bg-warning-tint` |
| `bg-yellow-200` (keyword marks) | `bg-highlight` |
| `bg-[#F5F5F0]`, `bg-[#F6F5EE]` | `bg-paper`, `bg-canvas` |
| `bg-[#D8D8D2]`, `bg-[#CFCFC7]`, `bg-[#D5D5D0]` | `bg-panel-hover` |
| `bg-[#E0E0D8]` | `bg-panel` |
| `bg-[#FEF2F2]`, `bg-[#F0FDF4]`, `bg-[#FFF7ED]`, `bg-[#EFF6FF]`, `bg-[#FFF9DB]` | `bg-destructive-tint`, `bg-success-tint`, `bg-warning-tint`, `bg-info-tint`, `bg-warning-tint` |
| `text-[#0077B5]` | `text-ink` |
| `shadow-[4px_4px_0px_0px_#000000]` | `shadow-sw-default` |
| `shadow-sw-xs` | `shadow-sw-sm` |
| `border-black/10` | `border-panel-hover` (same rendered colour on canvas) |
| `border-black/20` and above | `border-steel` |
| `bg-black/20`, `bg-black/40`, `bg-black/50` | `bg-overlay` |
| `text-[9px]`, `text-[10px]`, `text-[11px]` | `text-xs` |
| `transition-all` on press-in elements | `transition-[transform,box-shadow,background-color]` |
| `transition-all` elsewhere | `transition-colors` |
| `duration-NNN`, `ease-out`, `ease-in-out` on CSS transitions | delete (theme default: 100ms expo) |
| spacing `*-5` / `*-7` / `*-9` / `*-10` / `*-11` / `*-14` | `*-4` / `*-6` / `*-8` / `*-8` / `*-12` / `*-12` (use `*-6` for section padding where `*-4` is cramped) |
| spacing half-steps `*-0.5` / `*-1.5` / `*-2.5` | `*-1` / `*-2` / `*-3` |
| `Sparkles`, `Lightbulb` and other decorative icons | delete the icon (keep the label) |
| `✓` | `<Check aria-hidden="true" className="size-4" />` |
| `•` | a real `<ul className="list-disc pl-4 marker:text-primary">` |

### Task 19: Sweep 5a, dashboard and home

**Files:**
- `app/(default)/page.tsx`, `components/home/hero.tsx`, `components/home/swiss-grid.tsx`, `app/(default)/dashboard/page.tsx`
- `components/dashboard/resume-upload-dialog.tsx`, `components/dashboard/master-resume-choice-dialog.tsx`
- Create `components/common/llm-setup-alert.tsx` and `components/common/default-badge.tsx`
- Tests: `tests/dashboard-*.test.tsx`; add `tests/dashboard-tiles-keyboard.test.tsx`

- [ ] **Step 1: Create the shared pieces.**

```tsx
// components/common/llm-setup-alert.tsx
'use client';

import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { buttonClass } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

/** The one "LLM not configured" banner (dashboard + tailor). */
export function LlmSetupAlert({ titleKey, messageKey, actionKey }: { titleKey: string; messageKey: string; actionKey: string }) {
  const { t } = useTranslations();
  return (
    <Alert tone="warning" title={t(titleKey)}>
      <p>{t(messageKey)}</p>
      <Link href="/settings" className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-3' })}>
        {t(actionKey)}
      </Link>
    </Alert>
  );
}
```

```tsx
// components/common/default-badge.tsx
/** The "DEFAULT" marker for the default master resume (dashboard + viewer). */
export function DefaultBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center border border-ink bg-ink px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">
      {children}
    </span>
  );
}
```

  Before writing `DefaultBadge`, read the current badge at `dashboard/page.tsx:694`. If its look differs, copy that exact look with tokens instead of this recipe; the goal is the same look.

- [ ] **Step 2: Write the failing keyboard test.** Create `tests/dashboard-tiles-keyboard.test.tsx`, reusing the render harness and mocks from `tests/dashboard-multi-master.test.tsx`; copy its `beforeEach` and mocks verbatim. It asserts:
  1. every master-resume tile is reachable as a `link` whose `href` is `/resumes/<id>`;
  2. the tile's own action buttons are siblings of the link, not inside it: `expect(link.contains(actionButton)).toBe(false)`.

  Run it and expect FAIL: the tiles are `<Card onClick>` today.

- [ ] **Step 3: Work through the surface checklist.**
  - **`hero.tsx`:**
    - Delete the local `buttonClass` string.
    - Launch App becomes `<Link href="/dashboard" className={buttonClass({ size: 'lg', className: 'hero-enter hero-enter-delay-2' })}>`, the one primary.
    - GitHub and Docs become `<a … className={buttonClass({ variant: 'outline', size: 'lg' })}>`.
    - The inline `style` with the `linear-gradient` grid becomes `className="… bg-blueprint"`.
    - `text-blue-700` → `text-primary`; `selection:bg-blue-700` → `selection:bg-primary`.
    - The oversized mono poster headline stays (D15).
  - **`swiss-grid.tsx`:** rebuild it on `<PageFrame height="screen">` + `<PageHeader><PageHeader.Title>{t('nav.dashboard')}</PageHeader.Title><PageHeader.Subtitle>{t('dashboard.selectModule')}</PageHeader.Subtitle></PageHeader>`. Keep the scrollable `@container` grid region and footer exactly as they are, except:
    - the tracker link becomes `buttonClass({ variant: 'outline', className: 'min-w-36' })`;
    - the settings link becomes `buttonClass({ variant: 'warning', className: 'min-w-36' })`;
    - the footer's `text-blue-700` becomes `text-primary`.
  - **`dashboard/page.tsx`:**
    - `:550-570`: move the list-error alert inside the frame (render it in the grid region above the tiles) as `<Alert tone="error">`.
    - `:576-596`: the banner becomes `<LlmSetupAlert titleKey="dashboard.llmNotConfiguredTitle" messageKey="dashboard.llmNotConfiguredMessage" actionKey="nav.settings" />`, inside the frame.
    - `:603-628` (setup tile): keep the Link tile.
      - `border-dashed border-warning bg-amber-50` → `border-dashed border-warning bg-warning-tint`.
      - The 14×14 icon box becomes a bare `<AlertTriangle aria-hidden="true" className="size-6 text-warning-text" />`.
      - `text-amber-*` → `text-warning-text`.
      - CardTitle `text-lg uppercase` stays.
    - **Tiles** `:630-637`, `:657-661`, `:738-743`, `:788-796`, `:812-817`: use the stretched-link pattern so every tile is keyboard-reachable and the action buttons stay outside the link.

      ```tsx
      <Card variant="interactive" className="relative …">
        <Link href={`/resumes/${resume.resume_id}`} className="after:absolute after:inset-0 focus-visible:outline-none" aria-label={…}>
          …title…
        </Link>
        <div className="relative z-10 …">…tile action buttons…</div>
      </Card>
      ```

      Upload and create tiles, which are actions rather than navigation, become `<button type="button" className="… w-full text-left">` wrapping the Card content.
    - `:520-529` `cardPalette`: replace the hex monogram colours with tokens. **The owner chooses the mapping in the plan handoff**; the default is `['bg-primary', 'bg-ink', 'bg-success', 'bg-steel', 'bg-destructive']`. Flag this in the commit body as a visible change.
    - `:548` fillers → `bg-panel-hover`, `bg-panel-hover`, `bg-panel`.
    - `:664` monogram `w-16 h-16` → `size-12`, matching `:746` and `:821`.
    - `:694` badge → `<DefaultBadge>{t(…same key…)}</DefaultBadge>`.
    - `:711`, `:722`, `:762`, `:772`: Buttons `size="sm"` with no `h-7 text-xs rounded-none border-black` overrides. `:722` becomes `variant="outline-destructive"`.
    - `:641`: the `+` glyph with `top-[-2px]` becomes `<Plus aria-hidden="true" className="size-6" />`.
    - `:848-851`: the create Button becomes `<Button variant="outline" className="size-20">` with no other overrides.
    - `:855`: the green label under the blue CTA → `text-steel`.
    - `:647`, `:799`, `:867`, `:876`: opacity text → `text-steel`.
    - `:489`, `:495`: processing spinners stay as `Loader2`, beside `<StatusIndicator tone="active">`.
    - `:503`: the status icon → `<StatusIndicator tone="…">`, with the same label text.
    - `:591`: delete `mr-2`.
  - **`resume-upload-dialog.tsx`:**
    - `:298`: drop the trigger's `shadow-sw-default transition-all` and `mr-2` (`:299`).
    - `:314-315`: the dropzone keeps `border-dashed` (a drop zone) with `border-steel`; `transition-all duration-200` → `transition-colors`.
    - `:382` → `<Alert tone="error">`; `:399` → `<Alert tone="success">`; `:400` icon → `StatusIndicator`.
    - `:410`, `:431`, `:443`: delete the redundant `rounded-none border-black hover:bg-paper-tint`.
  - **`master-resume-choice-dialog.tsx`:**
    - `:34`, `:68`: blue kickers → `text-steel`.
    - `:53`, `:71`: option headings → `font-serif text-xl font-bold` (sentence case).
    - `:64`: arbitrary shadow → `shadow-sw-default`.

- [ ] **Step 4: Finish the sweep.** Follow Sweep Procedure steps 4–9. Run `npx vitest run tests/dashboard-tiles-keyboard.test.tsx` and expect PASS. Commit with `fix(dashboard): Swiss sweep of home and dashboard; keyboard-reachable tiles`.

  **Owner review:** home and dashboard, including the monogram colours, the setup tile and the LLM banner inside the frame.

### Task 20: Sweep 5b, builder, enrichment and preview

**Files:**
- `components/builder/**` (31 files), `components/enrichment/**`, `components/preview/**`, `app/(default)/builder/page.tsx`
- Tests: `tests/resume-builder-*.test.tsx`, `tests/builder-*.test.tsx`, `tests/interview-prep-view.test.tsx`, `tests/enrichment-preview-errors.test.tsx`

- [ ] **Step 1: Write the failing one-panel test.**
  In `tests/resume-builder-attachments.test.tsx`, add a case using the file's existing `Builder` harness and mocks. Render the interview-prep tab with no prep generated, then:

```tsx
expect(screen.getAllByRole('button', { name: 'generate-interview-prep' })).toHaveLength(1);
```

  Write the same assertion for `cover-letter` and `outreach` with the `?tab=` param the harness supports. Run it and expect FAIL: there are 2 today, one per panel.

- [ ] **Step 2: Fix the panels in `resume-builder.tsx`** (`:1572/1717`, `:1590/1732`, `:1599/1742`).
  - The **left** panel renders the editor and the generate controls (`GeneratePrompt`) for cover letter, outreach and interview prep.
  - The **right** panel renders only the output: the preview, or `InterviewPrepView`.
  - When there's nothing to show yet, the right panel shows `<EmptyState title={t('builder.panels.nothingYet')} />`. Add `builder.panels.nothingYet` to all seven locales:

    | Locale | String |
    |---|---|
    | en | Nothing generated yet |
    | es | Aún no se ha generado nada |
    | fr | Rien n'a encore été généré |
    | ja | まだ何も生成されていません |
    | ko | 아직 생성된 항목이 없습니다 |
    | pt-BR | Nada foi gerado ainda |
    | zh | 尚未生成任何内容 |

  Re-run the test and expect PASS.

- [ ] **Step 3: Work through the surface checklist.**
  - **`resume-builder.tsx`:**
    - `:1376-1384`: the header becomes `<PageHeader className="p-6 md:p-8">` with `.Back` (replacing the `variant="link"` back button) and `.Title`, replacing the not-bold serif `leading-[0.95]` h1. The blue subtitle becomes `.Subtitle`.
    - `:1389-1394`: the save-state pill becomes `<StatusIndicator>`. Map the existing states: saved → `ready`, saving → `active` ("Saving…"), unsaved → `warning`, failed → `error`. Use the same i18n keys.
    - `:1403-1443`: Save stays `default`; Download `success` → `outline`; Reset `warning` → `outline`.
    - `:1409`, `:1459`, `:1487`, `:1518`: delete the `Sparkles` icons.
    - `:1491`: delete the header Copy button on the outreach tab (the editor's Copy remains).
    - `:1531`: drop `mx-auto` from `max-w-3xl mx-auto`.
    - `:1532-1534`: the editor panel header becomes `<PanelHeader tone="input" title={…same text…} />`.
    - The right panel gains `<PanelHeader tone="output" title={t('builder.panels.preview')} />`. Add `builder.panels.preview` to all seven locales: en "Preview", es "Vista previa", fr "Aperçu", ja "プレビュー", ko "미리보기", pt-BR "Pré-visualização", zh "预览".
    - `:1548` → `<Alert tone="error">`; `:1360-1363` hex tints → tokens.
    - `:1638` → `bg-highlight`.
    - `:1664` → `bg-panel`.
    - `:1667` RetroTabs gains `idPrefix="builder"`, and each tab panel gets `id="builder-panel-<id>" role="tabpanel" aria-labelledby="builder-tab-<id>"`.
    - `:1762`: the blue footer text → `text-steel`.
    - `:1775`: the 8px square → `size-3`.
  - **`formatting-controls.tsx`:**
    - These five groups become `<SegmentedControl>` (variant `fill`): accent `:231`, page size `:259`, fonts `:355`, spacing `:384`, and `:579`. Keep the same values and handlers. Grid layouts go in `className="grid grid-cols-N"`.
    - The template picker `:192-217` becomes `<SegmentedControl variant="outline">`, with each item `label` set to `<TemplateThumbnail …/>` plus its name.
    - `:415-456` → `<ToggleSwitch variant="inline">`.
    - `:533-551`: the range input becomes `className="w-full accent-ink"`.
    - `:166`: the accordion button gains `aria-expanded`.
    - `:171`: the square → `size-3`.
    - `text-[9px]`/`[10px]` → `text-xs`.
  - **`template-selector.tsx`:**
    - `:57`, `:59-60`, `:71`, `:96-97`, `:210` → tokens.
    - The `shadow-[3px…]` and hover-shadow lift go; selection is shown by the outline only.
    - The half-step thumbnail art (`:22` hits) uses `size-*` and `gap-*` from the scale, where 0.5 → 1 and 1.5 → 2. If a thumbnail visibly degrades, keep that file's spacing hits allowlisted and say so in the commit body.
  - **`cover-letter-editor.tsx:59-72`, `outreach-editor.tsx:84-97`:**
    - Raw textarea → `<Textarea>`; the font becomes sans (**flagged visible change**).
    - `:39`, `:51`, `:76`, `:101` → `bg-paper`; the panel headers → `PanelHeader`.
    - In both editors, Save is primary and Copy is outline.
  - **`outreach-preview.tsx`:** `:30` → `text-ink`; `:49` remove the nested shadow.
  - **`interview-prep-view.tsx`:**
    - amber → warning tokens; `:132`, `:164` → `text-ink-soft`; `:36` → `border-panel-hover`.
    - `:37`, `:69`, `:178-194`: delete the decorative icons.
    - `:67`, `:134`: mono body → sans.
    - `:138-139`: the icon tile → `EmptyState`.
  - **`highlighted-resume-view.tsx`:** the rename table; `:41-167` delete the decorative icons; `:248`, `:268` → `bg-highlight`.
  - **`jd-comparison-view.tsx`, `jd-display.tsx`:** the rename table (`:68`, `:74`, `:87`, `:89`).
  - **`regenerate-dialog.tsx`:**
    - `:243-274`: selected cards `bg-blue-50` → `bg-info-tint`; the inline check svg → `<Check aria-hidden="true">`.
    - `:97`, `:136`, `:173`: the accordion buttons gain `aria-expanded`.
    - `:180`: delete `Lightbulb`.
  - **`add-section-dialog.tsx`:**
    - `:119-149` → `<SegmentedControl variant="outline" className="grid grid-cols-1 gap-2">`, with item labels holding the existing title and description.
    - `:189`: `border-dashed … hover:border-solid transition-all` → solid `border-ink`, `transition-colors`.
  - **`regenerate-instruction-dialog.tsx`:** `:102`, `:120` raw labels → `<Label htmlFor>`; `:96` → `<Alert tone="error">`; `:76` delete `Lightbulb`.
  - **`regenerate-diff-preview.tsx`:**
    - `:135` → `border-success`; `:150` keeps its Alert recipe → `<Alert>`; `:164` → `bg-warning-tint`.
    - `:173`: the `•` → a list.
    - `:186`: the accordion gains `aria-expanded`.
    - `:99`: delete `Lightbulb`.
  - **`generate-prompt.tsx`:** `:44-93` → `<EmptyState title=… description=… action={<Button>…</Button>} />`, with no icon tiles, a sans body and no `Sparkles`.
  - **`section-header.tsx`:**
    - `:114-243`: icon buttons → `size="icon-xs"` (the h-6 ones) or `"icon-sm"` (the h-7/8 ones), with the `h-* w-*` overrides removed.
    - `:79-87`: the hide-default-section action uses `EyeOff`, not `Trash2`.
    - `:178-183`: keep a static `aria-label` with `aria-pressed`.
    - `:149`: the pencil → `size={16}`.
    - `:153`, `:158` → `text-xs`.
    - `:243` → `hover:bg-destructive-tint`.
    - `:199-203`: wrap the disabled button in `<span title=…>` so the tooltip still works.
  - **Item forms** (`forms/experience-form.tsx`, `projects-form.tsx`, `education-form.tsx`, `generic-item-form.tsx`):
    - Add buttons (`:146`, `:146`, `:58`, `:190`) lose their `hover:bg-black hover:text-white transition-colors` overrides.
    - The empty states (`:153`, `:153`, `:65`, `:197`) → `<EmptyState variant="framed" …>`.
    - `text-muted-foreground` → `text-steel`.
    - Trash `hover:bg-destructive/10` → `hover:bg-destructive-tint`.
    - `generic-item-form.tsx:184` `space-y-4` → `space-y-6`.
    - Delete Input/Label overrides that repeat the new defaults.
    - Item add/remove: wrap each list in `<AnimatePresence initial={false}>` and each item in `<FadeItem key=…>`, with the dnd-kit node inside FadeItem.
  - **Other forms** (`personal-info-form.tsx`, `summary-form.tsx`, `additional-form.tsx`, `generic-list-form.tsx`, `generic-text-form.tsx`):
    - Delete the 15 `focus-visible:ring-0 … border-blue-700` overrides.
    - `personal-info-form.tsx:25-28`: the card gains `ml-4` so it lines up with the draggable siblings.
    - `additional-form.tsx:43`, `generic-list-form.tsx:53`: the blue non-interactive text → `text-ink`.
  - **`components/enrichment/enrichment-modal.tsx:138-175`:**
    - Native `<dialog>` → `<Dialog open onOpenChange><DialogContent size="xl" className="h-[90vh]">…`.
    - The header becomes `DialogHeader`/`DialogTitle`, with no `Sparkles`.
    - The custom close button is deleted (the built-in X replaces it).
  - **`loading-steps.tsx`:**
    - `:14-150`: the big circle icons and centred layout become a left-aligned `<StatusIndicator>` with the existing text.
    - Spinners `:16`, `:96` stay `Loader2`.
    - `:98`, `:129`: delete `Sparkles`.
    - `:151` → `<Alert tone="error">`.
  - **`question-step.tsx`, `preview-step.tsx`:**
    - The headings (`:126`, `:21`) → `font-serif text-xl font-bold`.
    - `:134` → `border-success`.
    - `:133`: the textarea → `<Textarea>` (sans).
    - `:26` → `<Alert>`.
  - **`components/preview/paginated-preview.tsx`, `page-container.tsx`:**
    - `:171` → `bg-panel-hover`; `:201` → `text-ink-soft` (steel never sits on panel); `:114` → `border-steel`.
    - `page-container.tsx:75` inline `rgba(29,78,216,0.5)` → `'color-mix(in srgb, var(--sw-primary) 50%, transparent)'`.
    - `:79-82` `border-blue-500` → `border-primary`.

- [ ] **Step 4: Finish the sweep.** Follow Sweep Procedure steps 4–9. Commit with `fix(builder): Swiss sweep of the builder, enrichment and preview; one output panel`.

  **Owner review:**
  - The builder on every tab (resume, cover letter, outreach, interview prep).
  - Formatting controls and the template picker.
  - The enrichment modal.
  - Visible change to check: editor textareas now use the body sans font.

### Task 21: Sweep 5c, tailor, the ATS card and the diff modal

**Files:**
- `app/(default)/tailor/page.tsx`, `components/tailor/ats-score-card.tsx`, `components/tailor/diff-preview-modal.tsx`
- Tests: `tests/tailor-page-lifecycle.test.tsx`, `tests/tailor-master-picker.test.tsx`, `tests/diff-preview-modal*.test.tsx`

- [ ] **Step 1: Write the failing ATS visibility test.**
  In `tests/tailor-page-lifecycle.test.tsx`, using its existing harness, drive a preview that returns an `atsScore`. Close or reject the diff modal, then assert `screen.getByRole('heading', { name: 'ATS Score Breakdown' })` is still in the document. Run it and expect FAIL: the card depends on `pendingResult`, which is cleared at `:339`/`:350`.

- [ ] **Step 2: Keep the last ATS result in its own state.**
  In `tailor/page.tsx`:
  - Add `const [atsResult, setAtsResult] = useState<ATSScore | null>(null);`.
  - Set it wherever `pendingResult` gets a result carrying `ats_score`.
  - Render `<ATSScoreCard atsScore={atsResult} />` from `atsResult` at `:566`, independent of the modal.
  - Clear it only when a new tailoring run starts.

  This is UI state only; no API changes. Re-run the test and expect PASS.

- [ ] **Step 3: Re-skin `components/tailor/ats-score-card.tsx`** onto the Swiss system. Keep the hardcoded English, which is out of scope (D2).

```tsx
'use client';

import type { ATSScore } from '@/components/common/resume_previewer_context';
import { cn } from '@/lib/utils';

interface ATSScoreCardProps {
  atsScore: ATSScore;
}

const SUB_SCORE_LABELS: Record<string, string> = {
  keyword_match: 'Keyword Match',
  skills_coverage: 'Skills Coverage',
  section_completeness: 'Section Completeness',
};

type Band = 'high' | 'mid' | 'low';
const band = (value: number): Band => (value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low');
const BAND_TEXT: Record<Band, string> = { high: 'text-success', mid: 'text-warning-text', low: 'text-destructive' };
const BAND_FILL: Record<Band, string> = { high: 'bg-success', mid: 'bg-warning', low: 'bg-destructive' };
const clampWidth = (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0);

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full border border-ink bg-white">
      <div className={cn('h-full', BAND_FILL[band(value)])} style={{ width: `${clampWidth(value)}%` }} />
    </div>
  );
}

function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-soft">{label}</span>
        <span className={cn('font-mono text-sm font-bold tabular-nums', BAND_TEXT[band(value)])}>
          {Number.isFinite(value) ? value.toFixed(1) : '—'}%
        </span>
      </div>
      <ScoreBar value={value} />
    </div>
  );
}

function KeywordList({ title, keywords, tone }: { title: string; keywords: string[]; tone: 'missing' | 'injectable' }) {
  return (
    <div>
      <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-steel">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {keywords.map((keyword, i) => (
          <li
            key={`${tone}-${i}-${keyword}`}
            className={cn(
              'border px-2 py-1 font-mono text-xs',
              tone === 'missing' ? 'border-destructive bg-destructive-tint text-destructive' : 'border-primary bg-info-tint text-primary'
            )}
          >
            {keyword}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ATSScoreCard({ atsScore }: ATSScoreCardProps) {
  const { overall_score, sub_scores, missing_keywords, injectable_keywords, recommendations } = atsScore;
  return (
    <section className="space-y-6 border border-ink bg-white p-6 shadow-sw-default">
      <div className="flex items-end justify-between gap-4">
        <h3 className="font-serif text-xl font-bold text-ink">ATS Score Breakdown</h3>
        <p className="flex items-end gap-1">
          <span className={cn('font-mono text-3xl font-bold tabular-nums', BAND_TEXT[band(overall_score)])}>
            {overall_score.toFixed(1)}
          </span>
          <span className="mb-1 font-mono text-sm text-steel">/100</span>
        </p>
      </div>
      <ScoreBar value={overall_score} />
      <div className="space-y-3">
        {Object.entries(sub_scores).map(([key, value]) => (
          <SubScoreRow key={key} label={SUB_SCORE_LABELS[key] ?? key} value={value} />
        ))}
      </div>
      {missing_keywords.length > 0 && <KeywordList title="Missing Keywords" keywords={missing_keywords} tone="missing" />}
      {injectable_keywords.length > 0 && (
        <KeywordList title="Safe to Add (in your master resume)" keywords={injectable_keywords} tone="injectable" />
      )}
      {recommendations.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-steel">Recommendations</p>
          <ul className="list-disc space-y-2 pl-4 text-sm text-ink-soft marker:text-primary">
            {recommendations.map((tip, i) => (
              <li key={`rec-${i}-${tip.slice(0, 30)}`}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Work through the surface checklist.**
  - **`tailor/page.tsx`:**
    - `:416-432`: the `bg-[#F6F5EE]` page and white card become `<PageFrame>` + `<PageHeader>` with `.Back` (replacing the absolute `variant="link"` button at `:418`), `.Title`, and `.Subtitle` (the blue `//` line).
    - Content sits left-aligned in a `p-8 md:p-12` region. Remove `items-center`, `justify-center` and `text-center`.
    - `:435-457` → `<LlmSetupAlert titleKey="tailor.setupRequiredTitle" messageKey="tailor.noApiKeyMessage" actionKey="tailor.configureApiKey" />`.
    - `:512-514`: Textarea keeps only its sizing classes; it renders in sans (**flagged visible change**).
    - `:526` → `<Alert tone="error">`; `:527`: delete the `!` glyph.
    - `:548` → `text-steel`.
  - **`diff-preview-modal.tsx`:**
    - `:79` amber → warning tokens.
    - `:191-199`, `:411-414`, `:465-467` hex → the tint tokens.
    - `:208` → `<Alert tone="error">`.
    - `:355` → `<Button variant="success">`.
    - `:437`: the accordion `<button>` gains `type="button"`, `aria-expanded` and the control focus ring.
    - `:149-151` → `<PanelHeader>`.
    - `:76`, `:493`, `:498`: mono prose → sans.
    - `:364`: the status icon → `StatusIndicator`.
    - Spacing per the table: `p-3` stays, the half-steps go.

- [ ] **Step 5: Finish the sweep.** Follow Sweep Procedure steps 4–9. Commit with `fix(tailor): Swiss sweep of tailor; re-skin the ATS card and keep it visible`.

  **Owner review:** the tailor flow end to end, including the ATS card after closing the diff modal. Visible change to check: the JD textarea now uses sans.

### Task 22: Sweep 5d, resume wizard, viewer and error boundary

**Files:**
- `components/resume-wizard/**`, `app/(default)/resume-wizard/page.tsx`, `app/(default)/resumes/[id]/page.tsx`, `components/common/error-boundary.tsx`
- Tests: `tests/resume-wizard-*.test.tsx`, `tests/viewer-*.test.tsx`; find them with `ls tests | grep -iE "wizard|viewer|resume-page"`

- [ ] **Step 1: Work through the surface checklist.**
  - **`resume-wizard-page.tsx:190-200`:**
    - The nested `<main>` → `<div>`, wrapped in `<PageFrame>`.
    - The h1, currently a mono xs label, becomes `<PageHeader><PageHeader.Back href="/dashboard">…</PageHeader.Back><PageHeader.Title>{same key}</PageHeader.Title></PageHeader>`. QuestionCard keeps its own h2.
    - The ghost back button at the top right is replaced by `.Back`.
    - `:190`: drop the `text-black` workaround.
    - `:203` → `<Alert tone="warning">`; `:222` → `<Alert tone="error">`.
  - **`question-card.tsx`:** `:109-111` raw label → `<Label htmlFor>`; `:89` blue kicker → `text-steel`; `:100` → `border-steel`.
  - **`live-preview.tsx`:** `:46` → `shadow-sw-default`; `:53` loading text → `<StatusIndicator tone="active">`; `:134` `✓` → `<Check aria-hidden="true" className="size-4" />`.
  - **`resumes/[id]/page.tsx`:**
    - `:514-598` → `<PageFrame>` + `<PageHeader>` with `.Back` (replacing the outline button at `:518`) and `.Title` (an h1 replacing the `:573` serif 2xl h2, same text).
    - `:554-563`: the raw rename `<input>` → `<Input>`; `:566`: the raw button → `<Button size="icon-sm" aria-label=…>`.
    - `:525-547`: Enhance stays primary with **no** `Sparkles`; Download `success` → `outline`.
    - `:487`, `:497`: the failed state shows primary Retry and `outline-destructive` Delete.
    - `:443`: the full-screen spinner → a left-aligned `Loader2` + `StatusIndicator` inside the frame.
    - `:458` → `<Alert tone="error">`; `:460-465` → `<Alert>` with the matching tones.
    - `:584` → `<DefaultBadge>`.
    - `:574`, `:579`: delete `transition-*`; opacity text → `text-steel`.
  - **`components/common/error-boundary.tsx`:**
    - `:90`, `:96`: the re-declared button styles → `<Button variant="outline">` and `<Button>`.
    - `:79` → `<Alert tone="error">`.
    - `:69`: the centred card → left-aligned.
    - `:76`: mono body → sans.
    - `:98`: delete `mr-2`.

- [ ] **Step 2: Finish the sweep.** Follow Sweep Procedure steps 4–9. Commit with `fix(wizard,viewer): Swiss sweep of the resume wizard, viewer and error boundary`.

  **Owner review:** the wizard (every step), the resume viewer (loaded, failed, renaming), and an error state.

### Task 23: Sweep 5e, tracker

**Owner go-ahead required** for `card-detail-modal.tsx` and `manual-add-application-dialog.tsx`, which hold uncommitted owner edits that Task 8 may already have folded in.

**Files:**
- `app/(default)/tracker/page.tsx`, `components/tracker/{kanban-board,kanban-column,application-card,bulk-action-bar,card-detail-modal,manual-add-application-dialog,manage-columns-dialog}.tsx`
- Tests: `tests/manage-columns-dialog.test.tsx`, `tests/tracker-*.test.ts`, `tests/api-tracker.test.ts`; add `tests/bulk-action-bar.test.tsx`

- [ ] **Step 1: Write the failing placeholder test.** Create `tests/bulk-action-bar.test.tsx`:
  - Render `BulkActionBar` with two selected cards. Use its real props; read the component first, and mock `@/lib/i18n` as in `tests/dropdown.test.tsx`.
  - Open the "Move to" select and assert `screen.getAllByRole('option').filter(o => o.getAttribute('aria-selected') === 'true')` has length 0.
  - Assert the delete confirmation's confirm button has class `bg-destructive`.

  Run it and expect FAIL on the first assertion: there's a `''` option today.

- [ ] **Step 2: Work through the surface checklist.**
  - **`tracker/page.tsx:14-30`:**
    - The inline frame copy becomes `<PageFrame width="wide" height="screen">`.
    - The raw back `Link` (`:23-29`) → `<PageHeader.Back href="/dashboard">`.
    - The nested `<main>` → `<div>`.
  - **`kanban-board.tsx`:**
    - `:217`: the header h1 → `<PageHeader.Title>`; the ink-soft subtitle → `.Subtitle`.
    - `:231-248`: prev/next → `<Button variant="outline" size="icon" aria-label=…>`.
    - `:329-337`: the stage-rail chips → `<button className={buttonClass({ variant: 'outline', size: 'sm' })}>`; `text-[11px]` → `text-xs`.
    - `:258-262` → `<Alert tone="error">`.
    - `:283`: the centred empty state → `<EmptyState>`.
  - **`kanban-column.tsx`:**
    - `:34-38`: the column header → `<PanelHeader tone="neutral" level="h2" title=…>`.
    - `:50` → `<EmptyState>`.
    - `:47`: the cards list → `<AnimatePresence initial={false}>`, with each `ApplicationCard` inside a keyed `<FadeItem>`.
    - The `isOver` highlight → `transition-colors`.
  - **`application-card.tsx`:**
    - `:43-46` → `<Card variant="raised">`.
    - `:49-56`: the checkbox → `className="size-4 accent-ink"` (drop `rounded-none`).
    - `:70`, `:75` → `text-xs`.
    - `:71` → `formatDate(card.applied_at ?? …, locale)`, with the same field as today.
    - `:58`: the control focus ring.
    - Drag opacity → `transition-opacity`.
  - **`bulk-action-bar.tsx`:**
    - `:32`: delete the inner frame (`border shadow-sw-sm`).
    - `:23-44`: remove the `''` placeholder option and pass `placeholder={t('…same key…')}`.
    - The danger variant was done in Task 12.
  - **`card-detail-modal.tsx`:**
    - `:105-107`: the status chip → `<StatusIndicator>`.
    - `:137`, `:155` → `<Alert tone="warning|error">`.
    - `:110` `'en-US'` → `formatDate(…, locale)`.
    - `:99`, `:161`: centred states → left-aligned.
  - **`manual-add-application-dialog.tsx`:** `:157` → `<Alert tone="error">`; `:104`, `:146`: drop the separate `<Label>` and pass `label=` to `Dropdown`.
  - **`manage-columns-dialog.tsx`:** `:71` Close → `variant="outline"`; `:61` → `text-xs`.

- [ ] **Step 3: Finish the sweep.** Follow Sweep Procedure steps 4–9. Commit with `fix(tracker): Swiss sweep of the tracker`.

  **Owner review:** the tracker board, drag and drop, bulk actions, and all three tracker dialogs.

### Task 24: Sweep 5f, settings

**Files:**
- `app/(default)/settings/page.tsx`. Leave `components/settings/api-key-menu.tsx` untouched: it's dead code, and its guard entries stay (D19).
- Tests: `tests/settings-*.test.tsx`; find them with `ls tests | grep -i settings`

- [ ] **Step 1: Work through the surface checklist.**
  - `:689-707`: the centred `max-w-4xl` frame and `bg-white` header become `<PageFrame>` + `<PageHeader>`, with `.Back` replacing the `<Link><Button>` nesting, `.Title` replacing the 3xl h1, and `.Subtitle`.
  - `:713-720`: the amber shadowed alert → `<Alert tone="warning">`.
  - `:715`, `:1462`: amber squares → `<StatusIndicator tone="warning">`.
  - **Section headings** `:734`, `:899`, `:1174`, `:1328`, `:1390`: mono `text-sm` h2 → `font-serif text-xl font-bold text-ink` (sentence-case source strings).
  - **Dividers:** `:730`, `:897`, `:1172`, `:1326` `border-black/10` → `border-panel-hover`; `:1311`, `:1359` → `border-paper`; `:1388` → `border-destructive`.
  - **Danger cards** `:1397`, `:1416`:
    - `bg-red-50/50` → `bg-destructive-tint`.
    - The `:1399`, `:1418` h3 → `font-serif text-lg font-bold text-ink`.
    - `:1402`, `:1421` body → `text-ink-soft`.
    - `:1404-1407` → `<Button variant="outline-destructive">`.
    - `:1410`, `:1429`: delete `mr-2`.
  - **Status icons** `:795`, `:797`, `:816`, `:876`, `:883`, `:995`, `:1114`, `:1116` (`CheckCircle2`/`XCircle`) → `<StatusIndicator tone="ready|error">` with the same text.
  - `:56`, `:857`: delete `Sparkles`.
  - `:84-87` `SEGMENTED_BUTTON_*` and the groups at `:910-919`, `:1345-1353`, `:1372-1380` → `<SegmentedControl>`. Delete the constants.
  - `:1200-1207`, `:1257-1264`: raw textareas → `<Textarea>`.
  - `:1003-1012`: the raw red delete → `<Button variant="outline-destructive" size="sm">`.
  - Labels: every raw label style → `<Label htmlFor>`. `:1145`, `:1154` `text-[10px]` → `text-xs`; `:983` `tracking-wide` → `tracking-wider`.
  - `:1438-1478` footer: `bg-secondary` → `bg-canvas` (steel and green text now sit on canvas, which passes AA).
  - `:1066`: the Save → "Saved" swap becomes

    ```tsx
    <AnimatePresence mode="wait" initial={false}>
      <m.span key={status} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: DURATION.swap } }} exit={{ opacity: 0, transition: { duration: DURATION.swap } }}>
        {label}
      </m.span>
    </AnimatePresence>
    ```

    Import `AnimatePresence` and `m` from `motion/react`, and `DURATION` from `@/lib/motion`.

- [ ] **Step 2: Finish the sweep.** Follow Sweep Procedure steps 4–9. Commit with `fix(settings): Swiss sweep of settings`.

  **Owner review:** settings top to bottom: providers, keys, health check, danger zone, footer.

---

## Phase 6: Docs and final audit

### Task 25: Delete aliases and overrides, reconcile docs

**Files:**
- Modify: `app/(default)/css/globals.css`, `../../docs/portable/swiss-design-system/{README,tokens,components,layouts,anti-patterns,ai-prompt}.md`, `CLAUDE.md` (apps/frontend), `../../.claude/CLAUDE.md`, `../../.impeccable.md`, `../../docs/agent/testing-strategy.md`

- [ ] **Step 1: Confirm nothing still uses the legacy names.**
  Run `npm run guard | grep -E "legacy-token|palette"`. Expected: only `components/settings/api-key-menu.tsx` (D19). If any other file appears, sweep it with the rename table first.

- [ ] **Step 2: Delete the temporary theme blocks.** In `globals.css`:
  - Delete the "Legacy names" and "Brand unification" blocks.
  - Change `@apply bg-background text-foreground;` to `@apply bg-canvas text-ink;` and `@apply border-border outline-ring/50;` to `@apply border-ink outline-primary/50;`.
  - In `app/layout.tsx`, change the body's `bg-background` to `bg-canvas`.
  - Delete `--shadow-sw-xs` once `grep -rn "shadow-sw-xs" app components` is empty.

  Then run the full gate. Expected: green.
  - **If** `api-key-menu.tsx` loses styling because it used a deleted alias, that's acceptable: it's dead code (D19) that nothing imports. Note it in the commit body.

- [ ] **Step 3: Update the Swiss pack** with the ratified house conventions.
  - `tokens.md`:
    - The palette table becomes the §4.1 table (names and hex, plus a "never on panel" note for steel).
    - Add `paper`, `panel` and `panel-hover`.
    - Steel becomes `#696D75`.
    - Warning fill is ink-text only, with `warning-text` for labels.
    - Add 12px (`p-3`) to the spacing scale.
    - The shadow-role table from §4.3.
    - The fonts as rendered (D3).
    - A Motion section with the 8 rules from §7, replacing "no transitions", and the press-in hover kept.
  - `components.md`:
    - Buttons are 1px ink with `outline-destructive`; `buttonClass` for links.
    - Inputs are white.
    - Dialog chrome per D12, with banded parts and the size table.
    - Alert, StatusIndicator, PanelHeader, SegmentedControl (ink selection) and EmptyState recipes.
    - `Loader2` is only for in-progress work.
  - `layouts.md`:
    - PageFrame/PageHeader replaces the "sidebar + content" example as the house shell; the blueprint grid; the H1 scale.
  - `anti-patterns.md`:
    - The checklist adds "run `npm run guard`".
    - Update the "Animated transitions" row to point at the motion rules.
    - Add the legacy-token renames.
  - `ai-prompt.md`: update the prompt to match the above.

- [ ] **Step 4: Update the agent docs.**
  - **`apps/frontend/CLAUDE.md`** (Styling section):
    - 1px ink borders; shadow roles; the tokens.
    - "Run `npm run guard -- <path>`; lower the allowlist with `npm run guard:update`, which refuses increases."
    - "Motion: `import { m } from 'motion/react'` only; `MotionProvider` lives in `app/(default)/layout.tsx`."
  - **`.claude/CLAUDE.md`** (Design System Quick Reference): Steel `#696D75`, plus rows for `paper`, `panel`, `warning-text` and the tints; "Borders: 1px ink controls, 2px alerts".
  - **`.impeccable.md`:**
    - Remove "Pull toward brutalist/raw", the Space Grotesk "flagged for replacement" and "Forbidden: Space Grotesk" entries, and the dark-mode removal note (done).
    - Add a "Decisions (2026-10-10)" section recording D1, D3, D4 and D6, with a link to the spec.
  - **`docs/agent/testing-strategy.md`:** add the Swiss guard (ratchet semantics, npm scripts) and the contrast test under the frontend suite.

- [ ] **Step 5: Gate, commit, push.**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
git add app/\(default\)/css/globals.css app/layout.tsx tests/swiss-guard.allowlist.json CLAUDE.md ../../docs/portable/swiss-design-system ../../.claude/CLAUDE.md ../../.impeccable.md ../../docs/agent/testing-strategy.md
git commit -m "docs(design): reconcile the Swiss pack and agent docs with the realigned house style" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

### Task 26: Final audit pass

**Files:** whatever the audits flag, limited to the Swiss scope.

- [ ] **Step 1: Run the mechanical detector once over the changed surfaces.**
  Run `"/Users/saurabh/.claude/plugins/cache/impeccable/impeccable/4.3.1/skills/impeccable/scripts/impeccable" detect --json app components/ui components/builder components/dashboard components/tailor components/tracker components/resume-wizard components/home components/common components/enrichment components/preview`. Triage each finding:
  - fix it (it's in scope and contradicts the spec);
  - accept it (it's a house convention the spec ratified, so record why);
  - or defer it (out of scope, with a follow-up note).

- [ ] **Step 2: Run the improve-ui pass.**
  Load the `ui-skills-root` → `improve-ui` guidance, explicitly asking for accessibility findings. Run it once per surface: home+dashboard, builder, tailor, wizard+viewer, tracker, settings. Keep at most 3 findings per surface, each with a reason, written to `.claude/plans/2026-10-10-swiss-final-audit.md`, which is local and gitignored.

- [ ] **Step 3: Fix the confirmed findings, then gate, commit, push.**
  Fix the findings from steps 1–2, then run the full gate and the guard. The allowlist must contain only the D19 dead-code files.

```bash
git commit -m "fix(frontend): address the final Swiss audit findings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bash ../../.githooks/pre-push && git push origin HEAD:dev
```

- [ ] **Step 4: Hand off to the owner.**
  Report:
  - the guard totals, from the phase-0 baseline to now;
  - the bundle delta;
  - the flagged visible changes (mono → sans in editor textareas, monogram colours);
  - that the icon family (phase 7) and sub-project 2 (Next.js performance) are next.
