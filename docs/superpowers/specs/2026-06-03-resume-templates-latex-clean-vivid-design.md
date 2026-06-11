# Design: Three New Resume Templates — LaTeX, Clean, Vivid

> **Status:** Approved (design). **Date:** 2026-06-03. **Branch:** `feat/resume-templates-latex-clean-vivid`

## Goal

Add three new resume templates to Resume Matcher, each a faithful reproduction of a
reference image the maintainer provided:

| ID | Display | Layout | Reference |
|----|---------|--------|-----------|
| `latex` | LaTeX | Single column | Classic serif/LaTeX resume (centered small-caps name, ruled Title-Case section headers, company-first two-line entries) |
| `clean` | Clean | Single column | Minimal modern sans (centered light name, `\|`-separated contact line, large gray UPPERCASE section headers, single-line entries) |
| `vivid` | Vivid | Two column | Colorful Awesome-CV lineage (two-tone colored name, monospace title + circular-icon contact row, accent small-caps headers, accent ➜ bullet markers) |

Guiding principle (maintainer steer): **match the reference images by default; expose the
existing universal controls so users can tweak the rest the way they like.** Do not
over-engineer beyond faithful reproduction.

## Non-Goals

- No new global controls in `TemplateSettings` (reuse existing margins / spacing / size /
  page-size / fonts / contact-icons / accent-color).
- No changes to the two-column column-assignment engine — `vivid` reuses the established
  split (main 65%: summary, experience, projects, certifications, custom; sidebar 35%:
  education, skills, languages, awards). Custom-section placement follows the existing
  convention; reordering remains a user action.
- No backend business-logic change. The PDF endpoint accepts `template` as a free string;
  only its docstring/allow-list comment and the frontend `parseTemplate` allow-list need the
  new IDs.
- No accent-color wiring for `latex`/`clean` (both are monochrome by design).

## Typography Approach (the one real wrinkle)

The maintainer chose "respect the font controls" over "enforce + hide the dropdowns," and
"the reference look is the default." Global font defaults are `headerFont: serif`,
`bodyFont: sans-serif`. To make each reference look the **default** while keeping the
dropdowns live and **without mutating settings on template switch**, each template binds to
existing font CSS variables per its design:

- **LaTeX** — single-typeface serif. Bind all text to `var(--header-font)` (default serif ✓).
  The **Header Font** dropdown drives the whole template; **Body Font** is inert for LaTeX.
- **Clean** — single-typeface sans. Bind all text to `var(--body-font)` (default sans ✓).
  The **Body Font** dropdown drives the whole template; **Header Font** is inert for Clean.
- **Vivid** — multi-font by design. Name + bullet body use `var(--body-font)` (sans default,
  Body Font drives body). Title line + contact row use a fixed **monospace** stack
  (`var(--resume-font-mono)`) to match the reference. Section headers + small-caps subtitles
  use `var(--header-font)` for the family with `font-variant: small-caps`.

Trade-off accepted: for the single-typeface templates one of the two font dropdowns is a
no-op. This is consistent with how accent-color is inert (and hidden) for non-color templates.

## Template Specifications

All three are pure DOM text (ATS-safe), follow the `resume-modern.tsx` /
`resume-modern-two-column.tsx` patterns, render sections in `sectionMeta` order via
`getSortedSections`, and reuse the shared `_base.module.css` spacing/typography classes so
margins/spacing/size controls apply.

### LaTeX (`latex`) — single column

- **Header (centered):** serif name with `font-variant: small-caps` at `--header-scale`;
  optional `personalInfo.title` as a centered italic tagline; `personalInfo.location` as a
  centered sub-name line; contact row centered, icons shown only when the global
  `showContactIcons` toggle is on, links underlined.
- **Section header:** serif, bold, **Title-Case** (override base `text-transform: uppercase`
  → `none`), full-width 1px bottom rule; `break-after: avoid`.
- **Experience / item entries (company-first):**
  - Line 1: **Company** bold (left) · **dates** bold (right).
  - Line 2: *Title* italic (left) · *Location* italic (right).
  - Bullets with `•` markers.
- **Projects:** name bold + tech/links; dates right; bullets.
- **Education:** institution bold (left) · dates right; degree italic line.
- **Skills/Additional:** `**Category**: comma-joined items` lines (bold category labels).

### Clean (`clean`) — single column

- **Header (centered):** light-weight sans name (font-weight ~400), larger; contact rendered
  as a single `\|`-separated line, small, links underlined; icons honor `showContactIcons`.
- **Section header:** large gray (`--resume-text-tertiary`) **UPPERCASE** sans, letter-spaced,
  thin bottom rule; `break-after: avoid`.
- **Entries (single line):** **COMPANY** bold ` \| ` Title (small-caps gray) on the left;
  `Location \| Dates` gray on the right; bullets below.
- **Education / Projects:** analogous single-line headers.
- **Skills/Additional:** `**Label:** items` lines.

### Vivid (`vivid`) — two column

- **Accent wired:** reads `--resume-accent-primary` (default blue); appears in the
  accent-color control alongside `modern`/`modern-two-column`.
- **Header (full width, left-aligned):** two-tone name — first token bold in accent-primary,
  remaining tokens in a lighter accent tone; `personalInfo.title` on a monospace line; contact
  row in monospace with **circular-outlined** icon chips (icons honor `showContactIcons`;
  when off, show monospace text only).
- **Section header:** accent-colored, `font-variant: small-caps`, bold (used in both columns;
  sidebar variant slightly smaller, matching the existing `-sm` convention).
- **Bullet markers:** accent ➜ arrow instead of `•`.
- **Columns:** reuse `modern-two-column` grid (main 65% / sidebar 35%) and section split.
  Sidebar skills render as `•`-separated wrapping lists (matching the reference).
- **Print:** accent colors forced with `-webkit-print-color-adjust: exact` (mirror
  `modern.module.css` / `modern-two-column.module.css`).

## Integration Points (mirrors how `modern` was added)

1. **`apps/frontend/lib/types/template-settings.ts`** — extend `TemplateType` union with
   `'latex' | 'clean' | 'vivid'`; append three `TEMPLATE_OPTIONS` entries.
2. **`apps/frontend/components/resume/`** — new `resume-latex.tsx`, `resume-clean.tsx`,
   `resume-vivid.tsx`; new `styles/latex.module.css`, `styles/clean.module.css`,
   `styles/vivid.module.css`; export all three from `index.ts`.
3. **`apps/frontend/components/dashboard/resume-component.tsx`** — import + three conditional
   render branches in the dispatcher.
4. **`apps/frontend/components/builder/template-selector.tsx`** — three new
   `TemplateThumbnail` variants + `templateLabels` entries.
5. **`apps/frontend/components/builder/formatting-controls.tsx`** — `templateLabels` entries;
   add `vivid` to the accent-color visibility condition.
6. **`apps/frontend/components/builder/resume-builder.tsx`** — footer single/two-column label
   logic: add `latex`, `clean` to the single-column condition (`vivid` falls through to
   two-column).
7. **`apps/frontend/app/print/resumes/[id]/page.tsx`** — add three IDs to `parseTemplate`.
8. **`apps/backend/app/routers/resumes.py`** — update the `/generate` docstring template
   allow-list comment (no logic change).
9. **i18n** — add `builder.formatting.templates.{latex,clean,vivid}` `{name, description}` to
   all five locales: `messages/{en,es,zh,ja,pt}.json`.
10. **Docs** — update `docs/agent/design/template-system.md` and
    `docs/agent/features/resume-templates.md` template tables.

## Testing

Currently there are **no** frontend template tests, so this establishes the pattern. Add
deterministic vitest + Testing Library tests (jsdom) that fail if the templates break:

- **Component render/smoke tests** (`components/resume/__tests__/` or co-located, following
  existing vitest conventions): render each of `ResumeLatex`, `ResumeClean`, `ResumeVivid`
  with a representative `ResumeData` fixture and assert key text appears (name, a section
  heading, a company, a bullet). For `vivid`, assert the two-tone name splits and an accent
  marker/element is present.
- **`parseTemplate` test**: the three new IDs round-trip; an unknown value still falls back to
  `swiss-single`.
- **`TEMPLATE_OPTIONS` test**: includes all seven IDs with non-empty name/description.

Verification commands are handed to the maintainer to run (shell `npm`/`npx` is avoided per
environment constraints): `cd apps/frontend && npm run test`, `npm run lint`, `npm run build`.
Locale parity is covered by the existing pre-push check.

## Definition of Done

- Three templates selectable in the builder, render in live preview and PDF print route.
- Each matches its reference image by default; universal controls (margins, spacing, size,
  page size, applicable font dropdown, contact-icon toggle, and accent color for `vivid`)
  function.
- Allow-lists (`parseTemplate`, backend docstring) and i18n (5 locales) updated.
- New deterministic tests pass; lint and build clean.
- Docs tables updated.
