# Resume Template Settings

> **Template types and extensive formatting controls.**

## Template Types

| Template | Description |
|----------|-------------|
| `swiss-single` | Traditional single-column layout with maximum content density |
| `swiss-two-column` | 65%/35% split with experience in main column, skills in sidebar |
| `modern` | Single-column with colorful accent headers and customizable theme colors |
| `modern-two-column` | Two-column layout combining modern accents with space-efficient design |

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
| Accent Color | blue/green/orange/red | blue | Accent color for Modern templates (modern, modern-two-column) |

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
