# Resume Template Settings

> **Template types and extensive formatting controls.**

## Template Types

| Template | Description |
|----------|-------------|
| `swiss-single` | Traditional single-column layout with maximum content density |
| `swiss-two-column` | 65%/35% split with experience in main column, skills in sidebar |

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

## Key Files

| File | Purpose |
|------|---------|
| `apps/frontend/lib/types/template-settings.ts` | Type definitions, defaults, CSS variable mapping |
| `apps/frontend/app/(default)/css/globals.css` | CSS custom properties for resume styling |
| `apps/frontend/components/builder/formatting-controls.tsx` | UI controls for template settings |
| `apps/frontend/components/resume/resume-single-column.tsx` | Single column template |
| `apps/frontend/components/resume/resume-two-column.tsx` | Two column template |

## CSS Variables

Templates use CSS custom properties for styling:

- `--section-gap`, `--item-gap`, `--line-height` - Spacing
- `--font-size-base`, `--header-scale`, `--section-header-scale` - Typography
- `--header-font` - Header font family
- `--body-font` - Body text font family
- `--margin-top/bottom/left/right` - Page margins

> **Note**: Templates should use the `resume-*` helper classes in `apps/frontend/app/(default)/css/globals.css` to ensure all spacing and typography respond to template settings.

Formatting controls include an "Effective Output" summary that reflects compact-mode adjustments for spacing/line-height.
