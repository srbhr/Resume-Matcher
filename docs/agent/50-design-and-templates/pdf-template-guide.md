# PDF Rendering & Resume Template Guide

This guide documents how PDF generation and resume templates work, making it easier to modify styling, spacing, and layout.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Files](#key-files)
- [How PDF Generation Works](#how-pdf-generation-works)
- [Template Settings System](#template-settings-system)
- [CSS Variables Reference](#css-variables-reference)
- [Modifying Spacing & Layout](#modifying-spacing--layout)
- [Adding New Template Settings](#adding-new-template-settings)
- [Resume Template Components](#resume-template-components)
- [Compact Mode](#compact-mode)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
├─────────────────────────────────────────────────────────────────┤
│  User adjusts settings in FormattingControls                    │
│              ↓                                                  │
│  TemplateSettings object created                                │
│              ↓                                                  │
│  settingsToCssVars() converts to CSS custom properties          │
│              ↓                                                  │
│  Resume component renders with CSS variables                    │
│              ↓                                                  │
│  downloadResumePdf() sends settings as URL query params         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                 │
├─────────────────────────────────────────────────────────────────┤
│  GET /api/v1/resumes/{id}/pdf?template=...&margins=...          │
│              ↓                                                  │
│  Build print URL with all query params                          │
│              ↓                                                  │
│  Playwright renders /print/resumes/{id}?params...               │
│              ↓                                                  │
│  PDF bytes returned to client                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Files

### Frontend

| File | Purpose |
|------|---------|
| `lib/types/template-settings.ts` | Type definitions, defaults, CSS variable mappings, `settingsToCssVars()` |
| `app/(default)/css/globals.css` | CSS custom properties, `.resume-body` styles, print media rules |
| `components/builder/formatting-controls.tsx` | UI controls for adjusting template settings |
| `components/dashboard/resume-component.tsx` | Main Resume wrapper, applies CSS variables |
| `components/resume/resume-single-column.tsx` | Single-column template layout |
| `components/resume/resume-two-column.tsx` | Two-column template layout |
| `app/print/resumes/[id]/page.tsx` | Server-rendered print route for PDF |
| `lib/api/resume.ts` | `downloadResumePdf()` - sends settings to backend |

### Backend

| File | Purpose |
|------|---------|
| `app/routers/resumes.py` | PDF endpoint, builds print URL with params |
| `app/pdf.py` | Playwright PDF renderer |

---

## How PDF Generation Works

### 1. Frontend Initiates Download

```typescript
// lib/api/resume.ts
export async function downloadResumePdf(resumeId: string, settings?: TemplateSettings) {
  const params = new URLSearchParams();
  params.set('template', settings.template);
  params.set('marginTop', String(settings.margins.top));
  params.set('compactMode', String(settings.compactMode));
  // ... all other settings

  const res = await apiFetch(`/resumes/${resumeId}/pdf?${params.toString()}`);
  return await res.blob();
}
```

### 2. Backend Receives Request

```python
# app/routers/resumes.py
@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    pageSize: str = Query("A4"),
    marginTop: int = Query(10, ge=5, le=25),
    marginBottom: int = Query(10, ge=5, le=25),
    marginLeft: int = Query(10, ge=5, le=25),
    marginRight: int = Query(10, ge=5, le=25),
    headerFont: str = Query("serif"),
    bodyFont: str = Query("sans-serif"),
    compactMode: bool = Query(False),
    # ... all other params
):
    # Build URL for print route
    params = (
        f"template={template}"
        f"&pageSize={pageSize}"
        f"&marginTop={marginTop}"
        f"&marginBottom={marginBottom}"
        f"&marginLeft={marginLeft}"
        f"&marginRight={marginRight}"
        f"&headerFont={headerFont}"
        f"&bodyFont={bodyFont}"
        f"&compactMode={str(compactMode).lower()}"
    )
    url = f"{settings.frontend_base_url}/print/resumes/{resume_id}?{params}"

    # Render with Playwright (margins applied at PDF layer)
    pdf_margins = {
        "top": marginTop,
        "right": marginRight,
        "bottom": marginBottom,
        "left": marginLeft,
    }
    pdf_bytes = await render_resume_pdf(url, pageSize, margins=pdf_margins)
    return Response(content=pdf_bytes, media_type="application/pdf")
```

### 3. Print Route Renders HTML

```typescript
// app/print/resumes/[id]/page.tsx
export default async function PrintResumePage({ params, searchParams }) {
  // Parse settings from query params
  const settings: TemplateSettings = {
    template: parseTemplate(searchParams?.template),
    margins: {
      top: parseMargin(searchParams?.marginTop, 10),
      // ...
    },
    compactMode: parseBoolean(searchParams?.compactMode, false),
  };

  return (
    <div className="resume-print">
      <Resume resumeData={data} settings={printSettings} />
    </div>
  );
}
```

### 4. Playwright Generates PDF

```python
# app/pdf.py
async def render_resume_pdf(url: str, page_size: str = "A4"):
    page = await _browser.new_page()
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_selector(".resume-print")

    # Margins come from the backend (applied to every page)
    pdf_bytes = await page.pdf(
        format=page_size,
        print_background=True,
        margin=pdf_margins,
    )
    return pdf_bytes
```

---

## Template Settings System

### TemplateSettings Interface

```typescript
// lib/types/template-settings.ts
export interface TemplateSettings {
  template: 'swiss-single' | 'swiss-two-column';
  pageSize: 'A4' | 'LETTER';
  margins: {
    top: number;    // 5-25mm
    bottom: number;
    left: number;
    right: number;
  };
  spacing: {
    section: SpacingLevel;    // 1-5, gap between sections
    item: SpacingLevel;       // 1-5, gap between items
    lineHeight: SpacingLevel; // 1-5, text line height
  };
  fontSize: {
    base: SpacingLevel;           // 1-5, base font size
    headerScale: SpacingLevel;    // 1-5, header size multiplier
    headerFont: 'serif' | 'sans-serif' | 'mono';
    bodyFont: 'serif' | 'sans-serif' | 'mono';
  };
  compactMode: boolean;      // Reduce spacing by 40% (margins unchanged)
  showContactIcons: boolean; // Show icons next to contact info
}
```

### Default Settings

```typescript
export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: 'swiss-single',
  pageSize: 'A4',
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
  spacing: { section: 3, item: 2, lineHeight: 3 },
  fontSize: { base: 3, headerScale: 3, headerFont: 'serif', bodyFont: 'sans-serif' },
  compactMode: false,
  showContactIcons: false,
};
```

---

## CSS Variables Reference

CSS custom properties are set on `.resume-body` and can be overridden via inline styles.

### Spacing Variables

| Variable | Default | Maps From | Description |
|----------|---------|-----------|-------------|
| `--section-gap` | `1rem` | `spacing.section` | Gap between major sections |
| `--item-gap` | `0.25rem` | `spacing.item` | Gap between items in a section |
| `--line-height` | `1.35` | `spacing.lineHeight` | Text line height |

### Font Variables

| Variable | Default | Maps From | Description |
|----------|---------|-----------|-------------|
| `--font-size-base` | `14px` | `fontSize.base` | Base font size |
| `--header-scale` | `2` | `fontSize.headerScale` | Name header multiplier |
| `--section-header-scale` | `1.2` | `fontSize.headerScale` | Section title multiplier |
| `--header-font` | `serif` | `fontSize.headerFont` | Header font family |
| `--body-font` | `sans-serif` | `fontSize.bodyFont` | Body font family |

### Margin Variables

| Variable | Default | Maps From | Description |
|----------|---------|-----------|-------------|
| `--margin-top` | `10mm` | `margins.top` | Top padding |
| `--margin-bottom` | `10mm` | `margins.bottom` | Bottom padding |
| `--margin-left` | `10mm` | `margins.left` | Left padding |
| `--margin-right` | `10mm` | `margins.right` | Right padding |

### Value Mappings

```typescript
// Spacing levels 1-5 map to these values:

SECTION_SPACING_MAP = {
  1: '0.375rem',  // 6px - tightest
  2: '0.625rem',  // 10px
  3: '1rem',      // 16px - default
  4: '1.25rem',   // 20px
  5: '1.5rem',    // 24px - loosest
};

ITEM_SPACING_MAP = {
  1: '0.125rem',  // 2px
  2: '0.25rem',   // 4px - default
  3: '0.5rem',    // 8px
  4: '0.75rem',   // 12px
  5: '1rem',      // 16px
};

LINE_HEIGHT_MAP = {
  1: 1.15,  // tight
  2: 1.25,
  3: 1.35,  // default
  4: 1.45,
  5: 1.55,  // loose
};

FONT_SIZE_MAP = {
  1: '11px',
  2: '12px',
  3: '14px',  // default
  4: '15px',
  5: '16px',
};
```

---

## Modifying Spacing & Layout

### Change Default Spacing

Edit `lib/types/template-settings.ts`:

```typescript
// To make default spacing tighter:
export const SECTION_SPACING_MAP: Record<SpacingLevel, string> = {
  1: '0.25rem',   // was 0.375rem
  2: '0.5rem',    // was 0.625rem
  3: '0.75rem',   // was 1rem (default)
  4: '1rem',      // was 1.25rem
  5: '1.25rem',   // was 1.5rem
};
```

### Change CSS Defaults

Edit `app/(default)/css/globals.css`:

```css
.resume-body {
  --section-gap: 0.75rem;  /* was 1rem */
  --item-gap: 0.125rem;    /* was 0.25rem */
  --line-height: 1.25;     /* was 1.35 */
}
```

### Change Section Title Styling

```css
/* globals.css */
.resume-body .resume-section-title {
  font-size: calc(var(--font-size-base) * var(--section-header-scale));
  font-family: var(--header-font);
  font-weight: 700;
  text-transform: uppercase;
  border-bottom: 2px solid #000000;
  margin-bottom: var(--item-gap);
  padding-bottom: 0.125rem;
  letter-spacing: 0.05em;
}
```

---

## Adding New Template Settings

### Step 1: Add to TypeScript Interface

```typescript
// lib/types/template-settings.ts
export interface TemplateSettings {
  // ... existing
  newSetting: boolean;  // Add new setting
}

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  // ... existing
  newSetting: false,
};
```

### Step 2: Add CSS Variable (if needed)

```typescript
// In settingsToCssVars()
return {
  // ... existing
  '--new-setting': s.newSetting ? 'value-on' : 'value-off',
};
```

### Step 3: Update CSS

```css
/* globals.css */
.resume-body {
  --new-setting: value-off;
}

.resume-body .some-element {
  property: var(--new-setting);
}
```

### Step 4: Add UI Control

```typescript
// formatting-controls.tsx
const handleNewSettingToggle = () => {
  onChange({ ...settings, newSetting: !settings.newSetting });
};

// In JSX:
<label className="flex items-center gap-3 cursor-pointer">
  <button onClick={handleNewSettingToggle} className={...}>
    {/* Toggle button */}
  </button>
  <span>New Setting</span>
</label>
```

### Step 5: Update Frontend API

```typescript
// lib/api/resume.ts - downloadResumePdf()
params.set('newSetting', String(settings.newSetting));
```

### Step 6: Update Backend Endpoint

```python
# app/routers/resumes.py
async def download_resume_pdf(
    # ... existing
    newSetting: bool = Query(False),
):
    params = (
        # ... existing
        f"&newSetting={str(newSetting).lower()}"
    )
```

### Step 7: Update Print Route

```typescript
// app/print/resumes/[id]/page.tsx
type PageProps = {
  searchParams?: Promise<{
    // ... existing
    newSetting?: string;
  }>;
};

// In component:
const settings: TemplateSettings = {
  // ... existing
  newSetting: parseBoolean(searchParams?.newSetting, false),
};
```

---

## Resume Template Components

### Component Hierarchy

```
Resume (wrapper)
├── applies CSS variables via settingsToCssVars()
├── selects template based on settings.template
│
├── ResumeSingleColumn
│   ├── Header (name, title, contact)
│   ├── Summary section
│   ├── Experience section (resume-items)
│   ├── Projects section
│   ├── Education section
│   └── Additional section (skills, awards)
│
└── ResumeTwoColumn
    ├── Main column (65%)
    │   ├── Summary
    │   ├── Experience
    │   └── Projects
    └── Sidebar (35%)
        ├── Contact
        ├── Skills
        └── Education
```

### CSS Classes

| Class | Purpose |
|-------|---------|
| `.resume-body` | Main container, holds CSS variables |
| `.resume-section` | Section wrapper, applies `--section-gap` |
| `.resume-section-title` | Section headers (SUMMARY, EXPERIENCE) |
| `.resume-items` | Container for items within section |
| `.resume-item` | Individual item (job, project, education) |

### Adding a New Section

```typescript
// In resume-single-column.tsx
{newData && newData.length > 0 && (
  <div className="resume-section">
    <h3 className="resume-section-title">New Section</h3>
    <div className="resume-items">
      {newData.map((item) => (
        <div key={item.id} className="resume-item">
          {/* Item content */}
        </div>
      ))}
    </div>
  </div>
)}
```

---

## Compact Mode

Compact mode automatically reduces spacing to fit more content on one page.

### Multipliers

```typescript
// lib/types/template-settings.ts
export const COMPACT_MULTIPLIER = 0.6;           // 40% reduction for spacing
export const COMPACT_LINE_HEIGHT_MULTIPLIER = 0.92;  // 8% reduction for line-height
```

### What Gets Reduced

| Property | Normal | Compact | Reduction |
|----------|--------|---------|-----------|
| Section gap | 1rem | 0.6rem | 40% |
| Item gap | 0.25rem | 0.15rem | 40% |
| Line height | 1.35 | 1.24 | 8% |
| Margins | 10mm | 10mm | 0% |

### Modifying Compact Behavior

```typescript
// lib/types/template-settings.ts
export function settingsToCssVars(settings?: TemplateSettings) {
  const compact = s.compactMode ? COMPACT_MULTIPLIER : 1;

  // Line-height uses gentler multiplier to avoid text overlap
  '--line-height': s.compactMode
    ? LINE_HEIGHT_MAP[s.spacing.lineHeight] * COMPACT_LINE_HEIGHT_MULTIPLIER
    : LINE_HEIGHT_MAP[s.spacing.lineHeight],
}
```

---

## Troubleshooting

### PDF Doesn't Match Preview

**Cause**: Settings not being passed to backend.

**Fix**: Check `downloadResumePdf()` in `lib/api/resume.ts` includes all params:

```typescript
params.set('headerFont', settings.fontSize.headerFont);
params.set('bodyFont', settings.fontSize.bodyFont);
params.set('compactMode', String(settings.compactMode));
params.set('showContactIcons', String(settings.showContactIcons));
```

### Text Overlapping in PDF

**Cause**: Line-height too small (compact multiplier too aggressive).

**Fix**: Adjust `COMPACT_LINE_HEIGHT_MULTIPLIER`:

```typescript
export const COMPACT_LINE_HEIGHT_MULTIPLIER = 0.95;  // was 0.92
```

### PDF Has Extra Margins

**Cause**: `@page` CSS rules overriding Playwright margins.

**Fix**: Remove `@page` margin overrides in `apps/frontend/app/(default)/css/globals.css` and rely on Playwright's margins.

### Blank Page Appears in PDF

**Cause**: Print CSS forcing a full-page minimum height or content overflow near page boundaries.

**Fix**: Keep `.resume-print` and `.cover-letter-print` free of fixed `min-height` values and ensure pagination logic drops empty trailing pages.

### Resume Viewer Has No Padding

**Cause**: CSS variables not applied.

**Fix**: Ensure `.resume-body` uses CSS variables for padding:

```css
.resume-body {
  padding: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
}
```

### New Setting Not Appearing in PDF

**Checklist**:
1. Added to `TemplateSettings` interface
2. Added to `DEFAULT_TEMPLATE_SETTINGS`
3. Added to `settingsToCssVars()` (if CSS variable)
4. Added `params.set()` in `downloadResumePdf()`
5. Added query param in backend endpoint
6. Added to `searchParams` type in print route
7. Parsed in print route component

---

## Quick Reference: End-to-End Flow

```
User changes setting in UI
       ↓
FormattingControls.onChange(settings)
       ↓
Resume component re-renders with settingsToCssVars(settings)
       ↓
User clicks "Download PDF"
       ↓
downloadResumePdf(resumeId, settings) → query params
       ↓
Backend: GET /resumes/{id}/pdf?params...
       ↓
Backend builds: /print/resumes/{id}?params...
       ↓
Playwright renders print route HTML
       ↓
page.pdf() with settings margins
       ↓
PDF bytes returned → blob download
```
