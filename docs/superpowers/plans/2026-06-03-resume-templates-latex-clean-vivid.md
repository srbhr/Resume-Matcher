# LaTeX, Clean, Vivid Resume Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new resume templates — `latex` (single-column serif), `clean` (single-column minimal sans), `vivid` (two-column colorful Awesome-CV style) — each faithful to a maintainer-provided reference image, wired through the existing template selection / preview / PDF pipeline.

**Architecture:** Each template is a React component reading `ResumeData` via `getSortedSections`, styled by a co-located CSS module using shared `_base.module.css` classes plus template-specific overrides. Registration mirrors how `modern` was added: extend `TemplateType` + `TEMPLATE_OPTIONS`, add a dispatcher branch in `resume-component.tsx`, a `TemplateThumbnail` case, label maps, the print-route allow-list, and i18n in 5 locales. `vivid` reuses the existing accent-color control + two-column grid; `latex`/`clean` are monochrome single-column.

**Tech Stack:** Next.js 16 / React 19, CSS modules, TypeScript, vitest + @testing-library/react (jsdom), i18n JSON (en/es/zh/ja/pt).

**Spec:** `docs/superpowers/specs/2026-06-03-resume-templates-latex-clean-vivid-design.md`

**Environment note:** Do NOT run `npm`/`npx` in this shell (nvm issues). After implementation, hand the maintainer: `cd apps/frontend && npm run test && npm run lint && npm run build`.

**Always-compiling rule:** Each task leaves the codebase type-valid. Task 1 registers all three IDs *and* their label/thumbnail/footer/accent wiring with placeholder behavior (default thumbnail, blank dispatcher body) so nothing breaks; Tasks 2–4 fill in each real component + thumbnail + dispatcher branch.

---

## Task 1: Register the three templates (types, options, allow-lists, i18n, controls)

**Files:**
- Modify: `apps/frontend/lib/types/template-settings.ts`
- Modify: `apps/frontend/components/builder/template-selector.tsx`
- Modify: `apps/frontend/components/builder/formatting-controls.tsx`
- Modify: `apps/frontend/components/builder/resume-builder.tsx`
- Modify: `apps/frontend/app/print/resumes/[id]/page.tsx`
- Modify: `apps/backend/app/routers/resumes.py`
- Modify: `apps/frontend/messages/{en,es,zh,ja,pt}.json`
- Test: `apps/frontend/tests/template-registration.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/frontend/tests/template-registration.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { TEMPLATE_OPTIONS, type TemplateType } from '@/lib/types/template-settings';

describe('template registration', () => {
  it('includes all seven templates with non-empty metadata', () => {
    const ids = TEMPLATE_OPTIONS.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining<TemplateType>([
        'swiss-single',
        'swiss-two-column',
        'modern',
        'modern-two-column',
        'latex',
        'clean',
        'vivid',
      ])
    );
    for (const opt of TEMPLATE_OPTIONS) {
      expect(opt.name.length).toBeGreaterThan(0);
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** — `npm run test -- template-registration` → FAIL (ids missing).

- [ ] **Step 3: Extend the type + options** in `template-settings.ts`:

```ts
export type TemplateType =
  | 'swiss-single'
  | 'swiss-two-column'
  | 'modern'
  | 'modern-two-column'
  | 'latex'
  | 'clean'
  | 'vivid';
```

Append to `TEMPLATE_OPTIONS`:

```ts
  {
    id: 'latex',
    name: 'LaTeX',
    description: 'Classic serif academic layout with ruled section headers',
  },
  {
    id: 'clean',
    name: 'Clean',
    description: 'Minimal sans layout with large understated section headers',
  },
  {
    id: 'vivid',
    name: 'Vivid',
    description: 'Colorful two-column layout with accent headers and arrow bullets',
  },
```

- [ ] **Step 4: Add label entries** to the `templateLabels` object in BOTH `template-selector.tsx` and `formatting-controls.tsx` (append inside the object literal):

```ts
    latex: {
      name: t('builder.formatting.templates.latex.name'),
      description: t('builder.formatting.templates.latex.description'),
    },
    clean: {
      name: t('builder.formatting.templates.clean.name'),
      description: t('builder.formatting.templates.clean.description'),
    },
    vivid: {
      name: t('builder.formatting.templates.vivid.name'),
      description: t('builder.formatting.templates.vivid.description'),
    },
```

- [ ] **Step 5: Footer single/two-column logic** — `resume-builder.tsx` (~line 946). Change the single-column condition to include the new single-column IDs:

```tsx
                {templateSettings.template === 'swiss-single' ||
                templateSettings.template === 'modern' ||
                templateSettings.template === 'latex' ||
                templateSettings.template === 'clean'
                  ? t('builder.footer.singleColumn')
                  : t('builder.footer.twoColumn')}
```

- [ ] **Step 6: Accent-color visibility** — `formatting-controls.tsx` (~line 207). Add `vivid` so the accent control shows for it:

```tsx
          {(settings.template === 'modern' ||
            settings.template === 'modern-two-column' ||
            settings.template === 'vivid') && (
```

- [ ] **Step 7: Print-route allow-list** — `app/print/resumes/[id]/page.tsx` `parseTemplate`:

```ts
  if (
    value === 'swiss-single' ||
    value === 'swiss-two-column' ||
    value === 'modern' ||
    value === 'modern-two-column' ||
    value === 'latex' ||
    value === 'clean' ||
    value === 'vivid'
  ) {
    return value;
  }
  return 'swiss-single';
```

- [ ] **Step 8: Backend docstring** — `apps/backend/app/routers/resumes.py` line ~1433 comment, update to:

```python
    - template: swiss-single, swiss-two-column, modern, modern-two-column, latex, clean, or vivid
```

- [ ] **Step 9: i18n** — in each of `messages/{en,es,zh,ja,pt}.json`, add under `builder.formatting.templates` three keys `latex`, `clean`, `vivid`, each `{ "name", "description" }`. English values match Step 3; other locales use a translated name + description (keep `LaTeX` as a proper noun untranslated; translate `Clean`/`Vivid` descriptively where natural, else transliterate). Preserve existing key ordering and JSON validity.

- [ ] **Step 10: Run the registration test, expect PASS** — `npm run test -- template-registration` (maintainer runs). Code still compiles; selecting a new template currently shows the default thumbnail + blank preview body (filled in Tasks 2–4).

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/lib/types/template-settings.ts apps/frontend/components/builder/template-selector.tsx apps/frontend/components/builder/formatting-controls.tsx apps/frontend/components/builder/resume-builder.tsx "apps/frontend/app/print/resumes/[id]/page.tsx" apps/backend/app/routers/resumes.py apps/frontend/messages/en.json apps/frontend/messages/es.json apps/frontend/messages/zh.json apps/frontend/messages/ja.json apps/frontend/messages/pt.json apps/frontend/tests/template-registration.test.ts
git commit -m "feat(templates): register latex, clean, vivid template IDs + controls/i18n"
```

---

## Task 2: LaTeX template (single-column serif)

**Files:**
- Create: `apps/frontend/components/resume/resume-latex.tsx`
- Create: `apps/frontend/components/resume/styles/latex.module.css`
- Modify: `apps/frontend/components/resume/index.ts`
- Modify: `apps/frontend/components/dashboard/resume-component.tsx`
- Modify: `apps/frontend/components/builder/template-selector.tsx` (thumbnail case)
- Test: `apps/frontend/tests/resume-latex.test.tsx`

**Component spec (adapt from `resume-modern.tsx`, single-column flow):**
- Reads `getSortedSections`, renders `personalInfo` header + sections in order; uses `SafeHtml` for bullet HTML; `formatDateRange` for dates; honors `showContactIcons`.
- Header centered: `<h1>` name with class `styles.name` (serif, `font-variant: small-caps`, size `calc(var(--font-size-base) * var(--header-scale))`). Optional `personalInfo.title` → centered italic `styles.tagline`. `personalInfo.location` → centered `styles.locationLine`. Contact row centered using the same `renderContactDetail` helper as `resume-modern.tsx` but separated by a middle dot, icons gated on `showContactIcons`.
- Section header: `<h3 className={styles.sectionTitle}>` (Title-Case, serif, bold, full-width 1px rule).
- Experience/itemList entries (company-first):
  - Row 1: `flex justify-between` → `<span styles.entryPrimary>{company}</span>` (bold) · `<span styles.entryDates>{formatDateRange(years)}</span>` (bold).
  - Row 2: `flex justify-between` → `<span styles.entrySecondary>{title}</span>` (italic) · `<span styles.entrySecondary>{location}</span>` (italic).
  - Bullets: `<ul className={baseStyles['resume-list']}>` with `•&nbsp;` markers (reuse modern's list markup).
- Projects: name (bold) + tech/links; dates right; bullets. Education: institution (bold) · dates right; degree italic. Additional: bold `Category:` labels + comma-joined items (reuse modern's `AdditionalSection`, swapping the title class for `styles.sectionTitle`). Custom sections via a `DynamicResumeSectionLatex` wrapper (copy modern's pattern, use `styles.sectionTitle`).

**CSS spec (`latex.module.css`):**

```css
@import './_tokens.css';

/* LaTeX template — single-typeface serif, driven by --header-font */
.container { width: 100%; }

.container,
.container :global(p),
.container :global(li),
.container :global(span) {
  font-family: var(--header-font);
}

.name {
  font-family: var(--header-font);
  font-size: calc(var(--font-size-base) * var(--header-scale));
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  color: var(--resume-text-primary);
}

.tagline {
  font-family: var(--header-font);
  font-style: italic;
  font-size: calc(var(--font-size-base) * 1.05);
  color: var(--resume-text-body);
}

.locationLine {
  font-family: var(--header-font);
  font-size: var(--font-size-base);
  color: var(--resume-text-body);
}

.sectionTitle {
  font-family: var(--header-font);
  font-size: calc(var(--font-size-base) * var(--section-header-scale));
  font-weight: 700;
  text-transform: none;            /* Title-Case, override base uppercase */
  letter-spacing: 0;
  color: var(--resume-text-primary);
  border-bottom: 1px solid var(--resume-text-primary);
  padding-bottom: 0.1rem;
  margin-bottom: var(--item-gap);
  break-after: avoid;
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
}

.entryPrimary { font-weight: 700; color: var(--resume-text-primary); }
.entryDates { font-weight: 700; color: var(--resume-text-primary); white-space: nowrap; }
.entrySecondary { font-style: italic; color: var(--resume-text-body); }

@media print {
  .sectionTitle { break-after: avoid !important; page-break-after: avoid !important; }
}
```

- [ ] **Step 1: Write the failing test** — `apps/frontend/tests/resume-latex.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeLatex } from '@/components/resume/resume-latex';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const data: ResumeData = {
  personalInfo: { name: 'Saurabh Rai', location: 'Delhi, India', email: 'a@b.com' },
  workExperience: [
    { id: 1, title: 'DevRel Engineer', company: 'Apideck', location: 'Remote', years: '2025-Present', description: ['Lead client demos.'] },
  ],
  additional: { technicalSkills: ['Python', 'TypeScript'] },
} as ResumeData;

describe('ResumeLatex', () => {
  it('renders name, company, title and a bullet', () => {
    render(<ResumeLatex data={data} />);
    expect(screen.getByText('Saurabh Rai')).toBeInTheDocument();
    expect(screen.getByText('Apideck')).toBeInTheDocument();
    expect(screen.getByText('DevRel Engineer')).toBeInTheDocument();
    expect(screen.getByText('Lead client demos.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** — `npm run test -- resume-latex` → FAIL (module not found).
- [ ] **Step 3: Create `resume-latex.tsx` + `latex.module.css`** per the specs above.
- [ ] **Step 4: Export** — add to `components/resume/index.ts`: `export { ResumeLatex } from './resume-latex';`
- [ ] **Step 5: Dispatcher branch** — in `resume-component.tsx` import `ResumeLatex` and add:

```tsx
      {mergedSettings.template === 'latex' && (
        <ResumeLatex
          data={resumeData}
          showContactIcons={mergedSettings.showContactIcons}
          additionalSectionLabels={additionalSectionLabels}
        />
      )}
```

- [ ] **Step 6: Thumbnail** — in `template-selector.tsx` add a `if (type === 'latex')` branch returning a single-column thumbnail with a centered name bar, a serif-feel ruled header line, and stacked content lines (reuse swiss-single thumbnail markup; add a centered top bar + an underline rule under each section line via `border-b`).
- [ ] **Step 7: Run test, expect PASS** — `npm run test -- resume-latex`.
- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/resume/resume-latex.tsx apps/frontend/components/resume/styles/latex.module.css apps/frontend/components/resume/index.ts apps/frontend/components/dashboard/resume-component.tsx apps/frontend/components/builder/template-selector.tsx apps/frontend/tests/resume-latex.test.tsx
git commit -m "feat(templates): add LaTeX single-column serif template"
```

---

## Task 3: Clean template (single-column minimal sans)

**Files:**
- Create: `apps/frontend/components/resume/resume-clean.tsx`
- Create: `apps/frontend/components/resume/styles/clean.module.css`
- Modify: `apps/frontend/components/resume/index.ts`
- Modify: `apps/frontend/components/dashboard/resume-component.tsx`
- Modify: `apps/frontend/components/builder/template-selector.tsx`
- Test: `apps/frontend/tests/resume-clean.test.tsx`

**Component spec (adapt from `resume-latex.tsx`, single-typeface sans):**
- Header centered: `<h1 className={styles.name}>` (light weight, sans). Contact rendered as one `|`-separated line via a helper that joins the present `renderContactDetail` spans with `<span className={styles.sep}> | </span>`; icons gated on `showContactIcons`.
- Section header `styles.sectionTitle` (large, UPPERCASE, gray, letter-spaced, thin rule).
- Entries single-line: `<div className="flex justify-between">` → left: `<span styles.entryCompany>{company}</span>` (bold) + `<span styles.sep> | </span>` + `<span styles.entryRole>{title}</span>` (small-caps gray); right: `<span styles.entryMeta>{location} | {formatDateRange(years)}</span>`. Bullets below.
- Education/Projects analogous. Additional: `**Label:** items`.

**CSS spec (`clean.module.css`):**

```css
@import './_tokens.css';

/* Clean template — single-typeface sans, driven by --body-font */
.container { width: 100%; }
.container,
.container :global(p),
.container :global(li),
.container :global(span),
.container :global(h1),
.container :global(h3) {
  font-family: var(--body-font);
}

.name {
  font-size: calc(var(--font-size-base) * var(--header-scale));
  font-weight: 400;
  letter-spacing: 0.01em;
  color: var(--resume-text-primary);
}

.sep { color: var(--resume-text-tertiary); padding: 0 0.4em; }

.sectionTitle {
  font-size: calc(var(--font-size-base) * var(--section-header-scale) * 1.15);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--resume-text-tertiary);
  border-bottom: 1px solid var(--resume-border-secondary);
  padding-bottom: 0.15rem;
  margin-bottom: var(--item-gap);
  break-after: avoid;
  page-break-after: avoid;
  orphans: 3;
  widows: 3;
}

.entryCompany { font-weight: 700; color: var(--resume-text-primary); }
.entryRole { font-variant: small-caps; color: var(--resume-text-tertiary); }
.entryMeta { color: var(--resume-text-tertiary); white-space: nowrap; }

@media print {
  .sectionTitle { break-after: avoid !important; page-break-after: avoid !important; }
}
```

- [ ] **Step 1: Write the failing test** — `apps/frontend/tests/resume-clean.test.tsx` (same shape as Task 2 test, importing `ResumeClean`, asserting name/company/title/bullet render).
- [ ] **Step 2: Run test, expect FAIL.**
- [ ] **Step 3: Create `resume-clean.tsx` + `clean.module.css`.**
- [ ] **Step 4: Export** from `index.ts`: `export { ResumeClean } from './resume-clean';`
- [ ] **Step 5: Dispatcher branch** for `'clean'` in `resume-component.tsx` (same shape as Task 2 Step 5).
- [ ] **Step 6: Thumbnail** — `if (type === 'clean')` branch: centered light name bar + large gray uppercase header lines (use `opacity-60` gray bars + thin rule).
- [ ] **Step 7: Run test, expect PASS.**
- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/resume/resume-clean.tsx apps/frontend/components/resume/styles/clean.module.css apps/frontend/components/resume/index.ts apps/frontend/components/dashboard/resume-component.tsx apps/frontend/components/builder/template-selector.tsx apps/frontend/tests/resume-clean.test.tsx
git commit -m "feat(templates): add Clean single-column minimal template"
```

---

## Task 4: Vivid template (two-column colorful)

**Files:**
- Create: `apps/frontend/components/resume/resume-vivid.tsx`
- Create: `apps/frontend/components/resume/styles/vivid.module.css`
- Modify: `apps/frontend/components/resume/index.ts`
- Modify: `apps/frontend/components/dashboard/resume-component.tsx`
- Modify: `apps/frontend/components/builder/template-selector.tsx`
- Test: `apps/frontend/tests/resume-vivid.test.tsx`

**Component spec (adapt from `resume-modern-two-column.tsx`):**
- Reuse the column-split logic, `getSortedSections`/`getSectionMeta`, `sectionHeadings`, `fallbackLabels`, and grid (`styles.grid` / `styles.mainColumn` / `styles.sidebarColumn`).
- Header (full width, left-aligned, above grid): two-tone name — split `personalInfo.name` on first space: `<span className={styles.nameFirst}>{first}</span>` + `<span className={styles.nameRest}>{rest}</span>`. `personalInfo.title` → `<div className={styles.titleLine}>` (monospace). Contact row: monospace, each item wrapped `<span className={styles.contactChip}>` with a circular-icon wrapper `<span className={styles.iconCircle}>{icon}</span>` shown when `showContactIcons`, else text only.
- Section titles use `styles.sectionTitle` (main) and `styles.sectionTitleSm` (sidebar): accent color, `font-variant: small-caps`, bold.
- Bullets: replace `•&nbsp;` markers with `<span className={styles.arrow}>➜&nbsp;</span>` (accent color). Apply in main-column experience/projects and any bulleted lists.
- Sidebar skills: render each group as bold label + `•`-joined wrapping list (reuse modern-two-column sidebar markup; recolor label via default text).

**CSS spec (`vivid.module.css`):** copy the grid + responsive widths from `modern-two-column.module.css`, then:

```css
@import './_tokens.css';

.container { width: 100%; }
.grid { display: grid; grid-template-columns: 63% 37%; gap: calc(var(--section-gap) * 1.25); }
.mainColumn { min-width: 0; }
.sidebarColumn { min-width: 0; }

.nameFirst {
  font-size: calc(var(--font-size-base) * var(--header-scale) * 1.2);
  font-weight: 800;
  color: var(--resume-accent-primary);
  font-family: var(--body-font);
}
.nameRest {
  font-size: calc(var(--font-size-base) * var(--header-scale) * 1.2);
  font-weight: 400;
  color: var(--resume-accent-primary);
  opacity: 0.6;
  font-family: var(--body-font);
}

.titleLine {
  font-family: var(--resume-font-mono);
  font-size: calc(var(--font-size-base) * 1.05);
  color: var(--resume-text-tertiary);
  margin-top: 0.1rem;
}

.contactChip {
  font-family: var(--resume-font-mono);
  font-size: calc(var(--font-size-base) * 0.8);
  color: var(--resume-text-body);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.iconCircle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 1px solid var(--resume-border-primary);
  border-radius: 9999px;
  color: var(--resume-text-tertiary);
}

.sectionTitle {
  font-family: var(--header-font);
  font-size: calc(var(--font-size-base) * var(--section-header-scale) * 1.1);
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  color: var(--resume-accent-primary);
  margin-bottom: var(--item-gap);
  break-after: avoid;
  page-break-after: avoid;
}
.sectionTitleSm { font-family: var(--header-font); font-size: calc(var(--font-size-base) * var(--section-header-scale) * 0.95); font-weight: 700; font-variant: small-caps; color: var(--resume-accent-primary); margin-bottom: var(--item-gap); break-after: avoid; page-break-after: avoid; }

.arrow { color: var(--resume-accent-primary); font-weight: 700; flex-shrink: 0; }

@media print {
  .nameFirst, .nameRest, .sectionTitle, .sectionTitleSm, .arrow {
    color: var(--resume-accent-primary) !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .sectionTitle, .sectionTitleSm { break-after: avoid !important; page-break-after: avoid !important; }
}
```

- [ ] **Step 1: Write the failing test** — `apps/frontend/tests/resume-vivid.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeVivid } from '@/components/resume/resume-vivid';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

const data: ResumeData = {
  personalInfo: { name: 'Saurabh Rai', title: 'Solutions Architect', email: 'a@b.com' },
  workExperience: [
    { id: 1, title: 'DevRel Engineer', company: 'Apideck', years: '2025-Present', description: ['Lead client demos.'] },
  ],
  additional: { technicalSkills: ['Python'] },
} as ResumeData;

describe('ResumeVivid', () => {
  it('renders a two-tone name, company and bullet', () => {
    render(<ResumeVivid data={data} />);
    expect(screen.getByText('Saurabh')).toBeInTheDocument(); // first token only
    expect(screen.getByText('Rai')).toBeInTheDocument();     // remaining tokens
    expect(screen.getByText('Apideck')).toBeInTheDocument();
    expect(screen.getByText('Lead client demos.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL.**
- [ ] **Step 3: Create `resume-vivid.tsx` + `vivid.module.css`.**
- [ ] **Step 4: Export** from `index.ts`: `export { ResumeVivid } from './resume-vivid';`
- [ ] **Step 5: Dispatcher branch** for `'vivid'` in `resume-component.tsx`, passing `sectionHeadings` and `fallbackLabels` like `modern-two-column`.
- [ ] **Step 6: Thumbnail** — `if (type === 'vivid')` branch: two-column thumbnail with an accent top bar (two-tone), accent section header bars, and accent arrow-tick marks on left column lines (reuse `modern-two-column` thumbnail markup, recolor to accent).
- [ ] **Step 7: Run test, expect PASS.**
- [ ] **Step 8: Commit**

```bash
git add apps/frontend/components/resume/resume-vivid.tsx apps/frontend/components/resume/styles/vivid.module.css apps/frontend/components/resume/index.ts apps/frontend/components/dashboard/resume-component.tsx apps/frontend/components/builder/template-selector.tsx apps/frontend/tests/resume-vivid.test.tsx
git commit -m "feat(templates): add Vivid two-column colorful template"
```

---

## Task 5: parseTemplate test + docs

**Files:**
- Test: `apps/frontend/tests/print-route-parse.test.ts` (only if `parseTemplate` is exported; otherwise fold the allow-list assertion into `template-registration.test.ts` by re-testing `TEMPLATE_OPTIONS` ids — see Step 1)
- Modify: `docs/agent/design/template-system.md`
- Modify: `docs/agent/features/resume-templates.md`

- [ ] **Step 1: parseTemplate coverage.** `parseTemplate` is a module-local function in `page.tsx` (not exported). Do NOT export server-route internals just for a test. Instead assert the allow-list intent at the type/options layer: confirm `template-registration.test.ts` (Task 1) already pins the seven IDs, which is the source of truth `parseTemplate` mirrors. Add a comment in `parseTemplate` referencing `TEMPLATE_OPTIONS` so the two stay in sync. No new test file.
- [ ] **Step 2: Update docs tables.** In `docs/agent/design/template-system.md` and `docs/agent/features/resume-templates.md`, add `latex`, `clean`, `vivid` rows to the template tables with one-line descriptions matching `TEMPLATE_OPTIONS`. Note `vivid` supports the accent-color control.
- [ ] **Step 3: Commit**

```bash
git add "apps/frontend/app/print/resumes/[id]/page.tsx" docs/agent/design/template-system.md docs/agent/features/resume-templates.md
git commit -m "docs(templates): document latex, clean, vivid templates"
```

---

## Final Verification (maintainer runs — npm avoided in agent shell)

```bash
cd apps/frontend
npm run test     # all suites incl. template-registration + 3 component smoke tests
npm run lint
npm run build
```

Then visually confirm in the builder: select LaTeX / Clean / Vivid, verify live preview matches the reference images, toggle Contact Icons, change accent color (Vivid), and export a PDF via the print route for each.

## Self-Review

- **Spec coverage:** types/options (T1), 3 components+CSS (T2–T4), dispatcher/thumbnail/labels/footer/accent/print-allow-list (T1+T2–T4), i18n×5 (T1), backend docstring (T1), tests (T1–T4), docs (T5). All spec sections mapped. ✓
- **Placeholders:** wiring/test/CSS code is inline and complete; component bodies are specified as precise deltas from named existing files (`resume-modern.tsx`, `resume-modern-two-column.tsx`) — acceptable given they are direct structural analogues. ✓
- **Type consistency:** IDs `latex`/`clean`/`vivid`, components `ResumeLatex`/`ResumeClean`/`ResumeVivid`, classes `styles.sectionTitle`/`styles.name`/`styles.arrow`/`styles.nameFirst`/`styles.nameRest` referenced consistently across tasks. ✓
