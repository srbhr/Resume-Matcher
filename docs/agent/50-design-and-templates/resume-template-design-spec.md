# Resume Template System Design Specification

> **Status: IMPLEMENTED** - This specification has been fully implemented.

This document outlines the architecture for a multi-template resume system with user-customizable formatting controls. The system maintains Swiss International Style aesthetics while providing flexibility for different resume layouts and spacing preferences.

---

## 1. Overview

### Goals
1. **Multiple Templates**: Support 2+ resume layouts (single-column, two-column)
2. **User Controls**: Margins, section spacing, font sizes, line heights
3. **Live Preview**: Real-time template switching in the Resume Builder
4. **PDF Consistency**: Server-side rendering respects all template settings
5. **Persistence**: Template preferences saved per-resume

### Non-Goals
- Color customization (maintains Swiss black/white/blue palette)
- Custom fonts outside the serif/sans/mono presets (metadata remains mono)
- Drag-and-drop section reordering (future enhancement)

---

## 2. Template Definitions

### Template 1: Swiss Single-Column (`swiss-single`)

The existing default layout. Content flows vertically in a single column.

```
┌────────────────────────────────────────────────┐
│  NAME                                          │
│  Title            contact | email | links      │
├────────────────────────────────────────────────┤
│  SUMMARY                                       │
│  [paragraph text...]                           │
├────────────────────────────────────────────────┤
│  EXPERIENCE                                    │
│  [job entries with bullet points...]           │
├────────────────────────────────────────────────┤
│  PROJECTS                                      │
│  [project entries...]                          │
├────────────────────────────────────────────────┤
│  EDUCATION                                     │
│  [education entries...]                        │
├────────────────────────────────────────────────┤
│  SKILLS & AWARDS                               │
│  [key-value pairs...]                          │
└────────────────────────────────────────────────┘
```

**Characteristics:**
- Full-width sections
- Maximum content density
- Best for detailed experience descriptions
- Section order: Header → Summary → Experience → Projects → Education → Additional

---

### Template 2: Swiss Two-Column (`swiss-two-column`)

Two-column layout with experience-focused main column (left) and supporting info sidebar (right).

```
┌────────────────────────────────────────────────┐
│              NAME                              │
│       Title | email | phone | links            │
├────────────────────────────────────────────────┤
│                    │                           │
│  EXPERIENCE        │  SUMMARY                  │
│  [job entries...]  │  [brief text]             │
│                    │                           │
│  PROJECTS          │  EDUCATION                │
│  [project...]      │  [school entries...]      │
│                    │                           │
│  TRAINING          │  SKILLS                   │
│  [certifications]  │  [skill groups...]        │
│                    │                           │
│                    │  LANGUAGES                │
│                    │  [languages...]           │
│                    │                           │
│                    │  AWARDS                   │
│                    │  [awards...]              │
└────────────────────────────────────────────────┘
```

**Characteristics:**
- Main column (65%): Experience, Projects, Certifications
- Sidebar column (35%): Summary, Education, Skills, Languages, Awards
- Condensed format for one-page resumes
- Best for technical roles with many projects
- Section flow prioritizes work experience visibility

**Column Assignment:**
| Main Column (Left - 65%) | Sidebar Column (Right - 35%) |
|--------------------------|------------------------------|
| Experience               | Summary                      |
| Projects                 | Education                    |
| Certifications/Training  | Technical Skills             |
|                          | Languages                    |
|                          | Awards                       |

---

## 3. Formatting Controls

### 3.1 Margin Controls

Users can adjust page margins for one-page fitting.

| Control | Range | Default | Unit |
|---------|-------|---------|------|
| Top Margin | 5-25 | 10 | mm |
| Bottom Margin | 5-25 | 10 | mm |
| Left Margin | 5-25 | 10 | mm |
| Right Margin | 5-25 | 10 | mm |

**Implementation:**
- CSS custom properties on `.resume-body`
- Passed to backend PDF renderer via query params

### 3.2 Spacing Controls

| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Section Spacing | 1-5 | 3 | Gap between major sections (Summary, Experience, etc.) |
| Item Spacing | 1-5 | 2 | Gap between items within a section (jobs, schools) |
| Line Height | 1-5 | 3 | Text line height (1=tight, 5=loose) |

**CSS Mapping:**
```css
/* Section Spacing */
--section-spacing-1: 0.5rem;   /* 8px */
--section-spacing-2: 1rem;     /* 16px */
--section-spacing-3: 1.5rem;   /* 24px - default */
--section-spacing-4: 2rem;     /* 32px */
--section-spacing-5: 2.5rem;   /* 40px */

/* Item Spacing */
--item-spacing-1: 0.25rem;     /* 4px */
--item-spacing-2: 0.5rem;      /* 8px */
--item-spacing-3: 0.75rem;     /* 12px - default */
--item-spacing-4: 1rem;        /* 16px */
--item-spacing-5: 1.25rem;     /* 20px */

/* Line Height */
--line-height-1: 1.2;          /* tight */
--line-height-2: 1.35;
--line-height-3: 1.5;          /* default */
--line-height-4: 1.65;
--line-height-5: 1.8;          /* loose */
```

### 3.3 Font Size Controls

| Control | Range | Default | Effect |
|---------|-------|---------|--------|
| Base Font Size | 1-5 | 3 | Overall text scale |
| Header Scale | 1-5 | 3 | Name/section header size |

**CSS Mapping:**
```css
/* Base Font Size */
--font-size-1: 11px;
--font-size-2: 12px;
--font-size-3: 14px;   /* default */
--font-size-4: 15px;
--font-size-5: 16px;

/* Header Scale (relative to base) */
--header-scale-1: 1.5;
--header-scale-2: 1.75;
--header-scale-3: 2;    /* default */
--header-scale-4: 2.25;
--header-scale-5: 2.5;
```

---

## 4. Data Model

### 4.1 Template Settings Interface

```typescript
type TemplateType = 'swiss-single' | 'swiss-two-column';
type PageSize = 'A4' | 'LETTER';
type SpacingLevel = 1 | 2 | 3 | 4 | 5;
type HeaderFontFamily = 'serif' | 'sans-serif' | 'mono';

interface TemplateSettings {
  template: TemplateType;
  pageSize: PageSize;
  margins: {
    top: number;    // 5-25mm
    bottom: number;
    left: number;
    right: number;
  };
  spacing: {
    section: SpacingLevel;
    item: SpacingLevel;
    lineHeight: SpacingLevel;
  };
  fontSize: {
    base: SpacingLevel;
    headerScale: SpacingLevel;
    headerFont: HeaderFontFamily;  // NEW: Font family for headers
    bodyFont: HeaderFontFamily;    // NEW: Font family for body text
  };
  compactMode: boolean;       // NEW: Apply 0.6x spacing multiplier (spacing only; margins unchanged)
  showContactIcons: boolean;  // NEW: Show icons next to contact info
}

// Default settings
const DEFAULT_SETTINGS: TemplateSettings = {
  template: 'swiss-single',
  pageSize: 'A4',
  margins: { top: 8, bottom: 8, left: 8, right: 8 },  // Reduced from 10mm
  spacing: { section: 3, item: 2, lineHeight: 3 },
  fontSize: { base: 3, headerScale: 3, headerFont: 'serif', bodyFont: 'sans-serif' },
  compactMode: false,
  showContactIcons: false,
};
```

### 4.2 Storage Strategy

**Option A: Per-Resume Storage (Recommended)**
- Store `template_settings` JSON field alongside resume data
- Settings travel with the resume
- Different resumes can have different templates

**Backend Schema Addition:**
```python
# In resume model
template_settings: Optional[dict] = None  # JSON blob
```

**Option B: User Preferences + Per-Resume Override**
- Global defaults in user settings
- Per-resume overrides when explicitly changed
- More complex but more flexible

---

## 5. UI Components

### 5.1 Template Selector (Builder Header)

Location: Resume Builder header, between mode indicator and action buttons.

```
┌─────────────────────────────────────────────────────────────┐
│ ← Back to Dashboard                                         │
│                                                             │
│ RESUME BUILDER                                              │
│ // EDIT MODE                                                │
│                                                             │
│ ┌─────────────┐ ┌─────────────┐     [Reset] [Save] [Download]│
│ │ ▣ Single    │ │ ▣▣ Two-Col  │                             │
│ │   Column    │ │   Layout    │                             │
│ └─────────────┘ └─────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

**Component:** `TemplateSelector`
- Visual preview thumbnails for each template
- Active state with blue border
- Swiss-style square buttons

### 5.2 Formatting Controls Panel

Location: Collapsible panel below template selector OR in Editor Panel sidebar.

```
┌─────────────────────────────────────────┐
│ ▼ FORMATTING OPTIONS                    │
├─────────────────────────────────────────┤
│                                         │
│ MARGINS (mm)                            │
│ Top:    [-----|●----] 10                │
│ Bottom: [-----|●----] 10                │
│ Left:   [-----|●----] 10                │
│ Right:  [-----|●----] 10                │
│                                         │
│ SPACING                                 │
│ Section: [1] [2] [●3] [4] [5]           │
│ Items:   [1] [●2] [3] [4] [5]           │
│ Lines:   [1] [2] [●3] [4] [5]           │
│                                         │
│ FONT SIZE                               │
│ Base:    [1] [2] [●3] [4] [5]           │
│ Headers: [1] [2] [●3] [4] [5]           │
│                                         │
│ [Reset to Defaults]                     │
└─────────────────────────────────────────┘
```

**Components:**
- `MarginSlider`: Range input 5-25, displays value
- `SpacingSelector`: Button group with 5 options
- `FontSizeSelector`: Button group with 5 options
- `Effective Output`: Compact-aware summary of margins, spacing, line height, and typography

### 5.3 Live Preview Updates

The preview panel updates in real-time as users adjust settings:
1. Template changes → Re-render entire component
2. Margin changes → Update CSS custom properties
3. Spacing changes → Update CSS custom properties
4. Font changes → Update CSS custom properties

---

## 6. Component Architecture

### 6.1 New Components

```
components/
├── builder/
│   ├── resume-builder.tsx          # Existing - add settings state
│   ├── resume-form.tsx             # Existing - no changes
│   ├── template-selector.tsx       # NEW - template thumbnail buttons
│   └── formatting-controls.tsx     # NEW - margins/spacing/font controls
├── resume/
│   ├── resume-single-column.tsx    # NEW - single column template
│   ├── resume-two-column.tsx       # NEW - two column template
│   └── resume-wrapper.tsx          # NEW - applies CSS variables from settings
└── dashboard/
    └── resume-component.tsx        # UPDATE - delegate to template components
```

### 6.2 Resume Component Refactor

Current `resume-component.tsx` becomes a wrapper that delegates to template-specific components:

```tsx
// resume-component.tsx (updated)
interface ResumeProps {
  resumeData: ResumeData;
  template?: 'swiss-single' | 'swiss-two-column';
  settings?: TemplateSettings;
}

const Resume: React.FC<ResumeProps> = ({ resumeData, template = 'swiss-single', settings }) => {
  const cssVars = settingsToCssVars(settings);

  return (
    <div className="resume-body" style={cssVars}>
      {template === 'swiss-single' && <ResumeSingleColumn data={resumeData} />}
      {template === 'swiss-two-column' && <ResumeTwoColumn data={resumeData} />}
    </div>
  );
};
```

### 6.3 CSS Custom Properties

```css
/* Base resume styles with CSS variables */
.resume-body {
  --section-gap: 1rem;
  --item-gap: 0.25rem;
  --line-height: 1.35;
  --font-size-base: 14px;
  --header-scale: 2;
  --section-header-scale: 1.2;
  --header-font: ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif;
  --body-font: ui-sans-serif, system-ui, sans-serif;

  --margin-top: 10mm;
  --margin-bottom: 10mm;
  --margin-left: 10mm;
  --margin-right: 10mm;

  font-family: var(--body-font);
  font-size: var(--font-size-base);
  line-height: var(--line-height);
  padding: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
}

.resume-body .resume-section {
  margin-bottom: var(--section-gap);
}

.resume-body .resume-item {
  margin-bottom: var(--item-gap);
}
```

Template components should use the `resume-*` helper classes in `apps/frontend/app/(default)/css/globals.css`
to ensure font sizes and spacing respond to template settings.

---

## 7. Backend Changes

### 7.1 API Updates

**GET /api/v1/resumes/{id}/pdf**

Add query parameters for template settings:

```
GET /api/v1/resumes/{id}/pdf?template=swiss-two-column&marginTop=10&marginBottom=10&marginLeft=15&marginRight=15&sectionSpacing=3&itemSpacing=2&lineHeight=3&fontSize=3&headerScale=3&headerFont=serif&bodyFont=sans-serif
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| template | string | swiss-single | Template identifier |
| marginTop | int | 10 | Top margin in mm |
| marginBottom | int | 10 | Bottom margin in mm |
| marginLeft | int | 10 | Left margin in mm |
| marginRight | int | 10 | Right margin in mm |
| sectionSpacing | int | 3 | Section gap level (1-5) |
| itemSpacing | int | 2 | Item gap level (1-5) |
| lineHeight | int | 3 | Line height level (1-5) |
| fontSize | int | 3 | Base font size level (1-5) |
| headerScale | int | 3 | Header scale level (1-5) |
| headerFont | string | serif | serif, sans-serif, mono |
| bodyFont | string | sans-serif | serif, sans-serif, mono |

### 7.2 PDF Renderer Updates

```python
# pdf.py
async def render_resume_pdf(
    url: str,
    margins: dict = None,  # {"top": "10mm", "right": "10mm", ...}
) -> bytes:
    if margins is None:
        margins = {"top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm"}

    # ... existing code ...
    pdf_bytes = await page.pdf(
        format="A4",
        print_background=True,
        margin=margins,
    )
    return pdf_bytes
```

### 7.3 Resume API Update

**PATCH /api/v1/resumes/{id}**

Accept `template_settings` in request body:

```json
{
  "processed_resume": { ... },
  "template_settings": {
    "template": "swiss-two-column",
    "margins": { "top": 10, "bottom": 10, "left": 15, "right": 15 },
    "spacing": { "section": 3, "item": 2, "lineHeight": 3 },
    "fontSize": { "base": 3, "headerScale": 3, "headerFont": "serif", "bodyFont": "sans-serif" }
  }
}
```

---

## 8. Print Route Updates

### 8.1 URL Structure

```
/print/resumes/[id]?template=swiss-two-column&sectionSpacing=3&itemSpacing=2&lineHeight=3&fontSize=3&headerScale=3&headerFont=serif&bodyFont=sans-serif
```

### 8.2 Page Component Update

```tsx
// app/print/resumes/[id]/page.tsx
export default async function PrintResumePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resumeData = await fetchResumeData(resolvedParams.id);

  // Parse all settings from query params
  const settings: TemplateSettings = {
    template: (resolvedSearchParams?.template as TemplateSettings['template']) || 'swiss-single',
    margins: {
      top: parseInt(resolvedSearchParams?.marginTop || '10'),
      bottom: parseInt(resolvedSearchParams?.marginBottom || '10'),
      left: parseInt(resolvedSearchParams?.marginLeft || '10'),
      right: parseInt(resolvedSearchParams?.marginRight || '10'),
    },
    spacing: {
      section: parseInt(resolvedSearchParams?.sectionSpacing || '3') as 1|2|3|4|5,
      item: parseInt(resolvedSearchParams?.itemSpacing || '2') as 1|2|3|4|5,
      lineHeight: parseInt(resolvedSearchParams?.lineHeight || '3') as 1|2|3|4|5,
    },
    fontSize: {
      base: parseInt(resolvedSearchParams?.fontSize || '3') as 1|2|3|4|5,
      headerScale: parseInt(resolvedSearchParams?.headerScale || '3') as 1|2|3|4|5,
      headerFont: (resolvedSearchParams?.headerFont as HeaderFontFamily) || 'serif',
      bodyFont: (resolvedSearchParams?.bodyFont as HeaderFontFamily) || 'sans-serif',
    },
  };

  return (
    <div className="resume-print w-full max-w-[250mm] bg-white border-2 border-black">
      <Resume resumeData={resumeData} template={settings.template} settings={settings} />
    </div>
  );
}
```

---

## 9. Frontend API Updates

### 9.1 Download Function

```typescript
// lib/api/resume.ts
export async function downloadResumePdf(
  resumeId: string,
  settings?: TemplateSettings
): Promise<Blob> {
  const params = new URLSearchParams();

  if (settings) {
    params.set('template', settings.template);
    params.set('marginTop', String(settings.margins.top));
    params.set('marginBottom', String(settings.margins.bottom));
    params.set('marginLeft', String(settings.margins.left));
    params.set('marginRight', String(settings.margins.right));
    params.set('sectionSpacing', String(settings.spacing.section));
    params.set('itemSpacing', String(settings.spacing.item));
    params.set('lineHeight', String(settings.spacing.lineHeight));
    params.set('fontSize', String(settings.fontSize.base));
    params.set('headerScale', String(settings.fontSize.headerScale));
    params.set('headerFont', settings.fontSize.headerFont);
    params.set('bodyFont', settings.fontSize.bodyFont);
  }

  const url = `${API_URL}/api/v1/resumes/${encodeURIComponent(resumeId)}/pdf?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to download PDF (status ${res.status})`);
  }

  return res.blob();
}
```

---

## 10. Implementation Order

### Phase 1: Core Template Infrastructure
1. Create `TemplateSettings` type definition
2. Create `ResumeSingleColumn` component (extract from current)
3. Create `ResumeTwoColumn` component
4. Update `Resume` wrapper to delegate based on template
5. Add CSS custom properties system

### Phase 2: Formatting Controls
1. Create `MarginSlider` component
2. Create `SpacingSelector` component
3. Create `FontSizeSelector` component
4. Create `FormattingControls` panel component
5. Integrate into Resume Builder

### Phase 3: Template Selector UI
1. Create `TemplateSelector` component with thumbnails
2. Add to Resume Builder header
3. Wire up state management

### Phase 4: Backend Integration
1. Update PDF endpoint to accept settings params
2. Update print route to parse settings
3. Update `downloadResumePdf` function
4. Add `template_settings` to resume storage (optional)

### Phase 5: Polish
1. Add "Reset to Defaults" functionality
2. Add localStorage draft persistence for settings
3. Test PDF output with all combinations
4. Update documentation

---

## 11. Swiss Design Compliance

Both templates maintain Swiss International Style:

### Typography Hierarchy
- **Headers**: Serif, Bold, Uppercase, Tight tracking
- **Body**: Sans-serif, Regular weight
- **Metadata**: Monospace, Uppercase, Small size

### Visual Elements
- **Borders**: 1-2px solid black section dividers
- **Corners**: Square (no rounded corners)
- **Colors**: Black text, white background (no colors in PDF)
- **Shadows**: None in print (web preview only)

### Grid System
- Single column: Full-width content blocks
- Two column: 65/35 split with clear vertical separation
- Consistent gutters using spacing variables

---

## 12. Accessibility Considerations

- All controls have visible labels
- Slider values displayed numerically
- Keyboard navigation for selectors
- High contrast button states
- Screen reader announcements for live preview updates

---

## 13. File Structure Summary

```
apps/frontend/
├── components/
│   ├── builder/
│   │   ├── resume-builder.tsx        # UPDATE: Add settings state
│   │   ├── template-selector.tsx     # NEW
│   │   └── formatting-controls.tsx   # NEW
│   ├── resume/
│   │   ├── index.ts                  # NEW: Barrel export
│   │   ├── resume-wrapper.tsx        # NEW: CSS vars wrapper
│   │   ├── resume-single-column.tsx  # NEW: Template 1
│   │   └── resume-two-column.tsx     # NEW: Template 2
│   └── dashboard/
│       └── resume-component.tsx      # UPDATE: Delegate to templates
├── lib/
│   ├── api/
│   │   └── resume.ts                 # UPDATE: Add settings to download
│   └── types/
│       └── template-settings.ts      # NEW: Type definitions
├── app/
│   └── print/
│       └── resumes/
│           └── [id]/
│               └── page.tsx          # UPDATE: Parse settings
└── styles/
    └── resume-templates.css          # NEW: CSS custom properties

apps/backend/
├── app/
│   ├── pdf.py                        # UPDATE: Accept margin params
│   └── routers/
│       └── resumes.py                # UPDATE: Parse query params
```

---

## 14. Testing Checklist

- [ ] Single column template renders correctly
- [ ] Two column template renders correctly
- [ ] Template switching updates preview immediately
- [ ] Margin sliders update CSS variables
- [ ] Spacing selectors update CSS variables
- [ ] Font size selectors update CSS variables
- [ ] PDF download includes all settings
- [ ] PDF margins match selected values
- [ ] Settings persist across page refresh (localStorage)
- [ ] Settings save with resume (API)
- [ ] Print route respects all query params
- [ ] Mobile responsiveness maintained
- [ ] ATS-friendliness preserved (selectable text)
