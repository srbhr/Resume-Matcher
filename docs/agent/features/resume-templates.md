# Resume Template Settings

> **Template types and extensive formatting controls.**

## Template Types

| Template | Description |
|----------|-------------|
| `swiss-single` | Traditional single-column layout with maximum content density |
| `swiss-two-column` | 65%/35% split with experience in main column, skills in sidebar |
| `modern` | Single-column with colorful accent headers and customizable theme colors |
| `modern-two-column` | Two-column layout combining modern accents with space-efficient design |
| `latex` | Classic serif single-column with Title-Case ruled headers and company-first entries (LaTeX-style). Single-typeface — driven by the Header Font control |
| `clean` | Minimal sans single-column with large understated gray UPPERCASE headers and single-line entries. Single-typeface — driven by the Body Font control |
| `vivid` | Colorful two-column (Awesome-CV lineage): two-tone accent name, monospace contact with circular icons, accent small-caps headers, accent arrow bullets. Supports the Accent Color control |

## Formatting Controls

| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Margins | 5-25mm | 8mm | Page margins |
| Section Spacing | 1-5 | 3 | Gap between major sections |
| Item Spacing | 1-5 | 2 | Gap between items within sections |
| Line Height | 1-5 | 3 | Text line height |
| Base Font Size | 1-5 | 3 | Overall text scale (11-16px) |
| Header Scale | 1-5 | 3 | Name/section header size multiplier |
| Header Font | serif/sans-serif/mono | serif | Font family for headers |
| Body Font | serif/sans-serif/mono | sans-serif | Font family for body text |
| Compact Mode | boolean | false | Apply 0.6x spacing multiplier (spacing only; margins unchanged) |
| Contact Icons | boolean | false | Show icons next to contact info |
| Accent Color | blue/green/orange/red | blue | Accent color for color templates (modern, modern-two-column, vivid) |

## Key Files

| File | Purpose |
|------|---------|
| `apps/frontend/lib/types/template-settings.ts` | Type definitions, defaults, CSS variable mapping |
| `apps/frontend/components/resume/styles/_tokens.css` | Global design tokens (colors) |
| `apps/frontend/components/resume/styles/_base.module.css` | Shared typography and layout styles |
| `apps/frontend/components/builder/formatting-controls.tsx` | UI controls for template settings |
| `apps/frontend/components/resume/resume-single-column.tsx` | Single column template |
| `apps/frontend/components/resume/resume-two-column.tsx` | Two column template |
| `apps/frontend/components/resume/resume-modern.tsx` | Modern single column template |
| `apps/frontend/components/resume/resume-modern-two-column.tsx` | Modern two column template |
| `apps/backend/app/routers/resumes.py` | PDF generation endpoint with accentColor support |

## CSS Variables

Templates use CSS custom properties for styling:

- `--section-gap`, `--item-gap`, `--line-height` - Spacing
- `--font-size-base`, `--header-scale`, `--section-header-scale` - Typography
- `--header-font` - Header font family
- `--body-font` - Body text font family
- `--margin-top/bottom/left/right` - Page margins
- `--accent-primary`, `--accent-light` - Accent colors for Modern templates

> **Note**: Templates should use the styles exported from `apps/frontend/components/resume/styles/_base.module.css` (e.g., `baseStyles['resume-section']`, `baseStyles['resume-item-subtitle']`) to ensure all spacing and typography respond to template settings.

### Typography Classes

The base stylesheet includes specialized classes for improved subtitle visibility:

| Class | Font Size | Weight | Usage |
|-------|-----------|--------|-------|
| `resume-item-subtitle` | 0.95× base | 600 | Company names, education degrees, project roles |
| `resume-item-subtitle-sm` | 0.88× base | 600 | Same fields in compact two-column layouts |

These classes provide **better visibility** than the generic `resume-meta` class (0.82× base, weight 400), making subtitles 13-16% larger and semi-bold.

Formatting controls include an "Effective Output" summary that reflects compact-mode adjustments for spacing/line-height.

---

## Description Styles (`descriptionStyles`)

Each description row can render **with** a bullet marker or as a **plain**
paragraph — used for sub-headings or continuation lines inside an entry.

### Shape

`descriptionStyles` is a positional array parallel to `description`:

```jsonc
{
  "description":       ["Led the platform migration", "Rebuilt the ingest tier"],
  "descriptionStyles": ["plain",                      "bullet"]
}
```

`descriptionStyles[i]` describes `description[i]`. Values: `"bullet"` | `"plain"`.

### The alignment invariant

**The two arrays must stay index-aligned.** Anything that adds, removes, filters
or reorders `description` rows must apply the identical operation to
`descriptionStyles`. A desync is silent — it does not error, it just moves every
later row's marker onto its neighbour.

Enforced in three places:

| Layer | File | Behaviour |
|---|---|---|
| Editor | `apps/frontend/components/builder/forms/{experience,projects,generic-item}-form.tsx` | `alignDescriptionStyles()` before every splice |
| Client normalize | `apps/frontend/lib/utils/resume-normalization.ts` | filters both arrays in lockstep |
| Server | `apps/backend/app/schemas/models.py` `_align_description_styles` | truncates/pads by index, defaults to `"bullet"` |

The server aligns **by index**, so it cannot detect a desync — it can only
guarantee length. Correctness has to be preserved upstream.

### Models that carry it

`Experience`, `Project`, `CustomSectionItem` (`apps/backend/app/schemas/models.py`). Rides
inside the existing `processed_data` JSON column — **no migration needed**.

`Education.description` is a scalar `str | None`, so it has no styles array.

### Prompts that must preserve it

Four prompts instruct the model to keep the arrays aligned:

- `apps/backend/app/prompts/templates.py` — the three improve variants
- `apps/backend/app/prompts/refinement.py` — `KEYWORD_INJECTION_PROMPT`

A prompt is **not** a guarantee for positional metadata. `inject_keywords` is
the last writer on the improve path, so `apps/backend/app/services/refiner.py::_preserve_description_styles()`
restores the field locally after it — matching the defence-in-depth pattern
already used for dates, skills, `personalInfo` and custom sections.

### Rendering

All seven templates render rows through
`apps/frontend/components/resume/description-list.tsx`, which omits the marker span when the
style is `"plain"`. The marker is `aria-hidden="true"`. The JD-match preview
(`apps/frontend/components/builder/highlighted-resume-view.tsx`) applies the same rule so the
builder does not contradict the PDF.

Coverage: `apps/frontend/tests/template-description-styles.test.tsx` asserts marker presence
per template; `apps/frontend/tests/resume-normalization.test.ts` pins the lockstep filter.
