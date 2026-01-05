# Template System Documentation

This document provides comprehensive guidance for understanding, extending, and creating new resume templates in the Resume Matcher application.

---

## Table of Contents

1. [Current Template Architecture](#1-current-template-architecture)
2. [Template File Structure](#2-template-file-structure)
3. [CSS Custom Properties System](#3-css-custom-properties-system)
4. [Creating a New Template](#4-creating-a-new-template)
5. [Template Settings Integration](#5-template-settings-integration)
6. [Print & PDF Considerations](#6-print--pdf-considerations)
7. [Template Examples](#7-template-examples)

---

## 1. Current Template Architecture

### Available Templates

| Template ID | Name | Layout | Status |
|-------------|------|--------|--------|
| `swiss-single` | Swiss Single Column | Traditional single-column | Production |
| `swiss-two-column` | Swiss Two Column | 65%/35% split layout | Production |

### Template Selection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEMPLATE SELECTION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

User selects template in Builder
         │
         ▼
┌─────────────────┐
│ FormattingCtrls │
│ updates         │
│ templateSettings│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ ResumeBuilder   │────>│ Resume          │
│ passes settings │     │ component       │
└─────────────────┘     └────────┬────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │                           │
                   ▼                           ▼
          ┌─────────────────┐        ┌─────────────────┐
          │ swiss-single    │        │ swiss-two-column│
          │ ResumeSingle    │        │ ResumeTwoColumn │
          │ Column.tsx      │        │ .tsx            │
          └─────────────────┘        └─────────────────┘
```

### Component Hierarchy

```
Resume (components/dashboard/resume-component.tsx)
├── Delegates to template based on settings.template
│
├── ResumeSingleColumn (components/resume/resume-single-column.tsx)
│   ├── Header (personalInfo - always first)
│   ├── Dynamic sections via getSortedSections()
│   │   ├── Default sections (summary, workExperience, education, etc.)
│   │   └── Custom sections via DynamicResumeSection
│   └── Respects sectionMeta order and visibility
│
└── ResumeTwoColumn (components/resume/resume-two-column.tsx)
    ├── Header (personalInfo - centered)
    ├── LeftColumn (65%)
    │   ├── Experience, Projects, Certifications
    │   └── Custom sections via DynamicResumeSection
    │
    └── RightColumn (35%)
        ├── Summary, Education, Skills, Languages, Awards
        └── Links section
```

### Dynamic Section Rendering

Templates use `getSortedSections()` from `lib/utils/section-helpers.ts` to:
- Get sections in user-defined order
- Filter out hidden sections (`isVisible: false`)
- Use custom display names instead of hardcoded titles
- Render custom sections via `DynamicResumeSection` component

```typescript
// Template pattern for dynamic sections
const sortedSections = getSortedSections(data);

{sortedSections.map((section) => (
  section.isDefault
    ? <DefaultSection key={section.id} displayName={section.displayName} />
    : <DynamicResumeSection key={section.id} sectionMeta={section} resumeData={data} />
))}
```

---

## 2. Template File Structure

### Directory Layout

```
apps/frontend/
├── components/
│   ├── dashboard/
│   │   └── resume-component.tsx      # Main router component + types
│   │
│   └── resume/
│       ├── index.ts                  # Barrel export
│       ├── resume-single-column.tsx  # Swiss single column
│       ├── resume-two-column.tsx     # Swiss two column
│       ├── dynamic-resume-section.tsx # Renders custom sections
│       ├── styles/                   # CSS Modules & Tokens
│       │   ├── _tokens.css           # Design tokens (Colors)
│       │   ├── _base.module.css      # Base typography & utilities
│       │   ├── swiss-single.module.css
│       │   └── swiss-two-column.module.css
│       └── sections/                 # Shared section components
│           ├── personal-info.tsx
│           ├── experience.tsx
│           ├── education.tsx
│           ├── projects.tsx
│           └── skills.tsx
│
├── lib/
│   ├── types/
│   │   └── template-settings.ts      # Settings types & defaults
│   │
│   └── constants/
│       └── page-dimensions.ts        # A4/Letter dimensions
│
└── app/
    └── (default)/
        └── css/
            └── globals.css           # Print styles & resets
```

### Key Files

#### Resume Router (`components/dashboard/resume-component.tsx`)

```typescript
// Lines 1-50 - Main resume component that routes to templates
interface ResumeProps {
  data: ResumeData;
  settings?: TemplateSettings;
  className?: string;
}

export function Resume({ data, settings, className }: ResumeProps) {
  const templateSettings = settings ?? DEFAULT_TEMPLATE_SETTINGS;

  // Apply CSS custom properties
  const style = getTemplateStyles(templateSettings);

  switch (templateSettings.template) {
    case "swiss-single":
      return <ResumeSingleColumn data={data} style={style} className={className} />;
    case "swiss-two-column":
      return <ResumeTwoColumn data={data} style={style} className={className} />;
    default:
      return <ResumeSingleColumn data={data} style={style} className={className} />;
  }
}
```

#### Template Settings Types (`lib/types/template-settings.ts`)

```typescript
// Complete type definitions

export type TemplateType = 'swiss-single' | 'swiss-two-column';
export type PageSize = 'A4' | 'LETTER';
export type SpacingLevel = 1 | 2 | 3 | 4 | 5;
export type HeaderFontFamily = 'serif' | 'sans-serif' | 'mono';
export type BodyFontFamily = 'serif' | 'sans-serif' | 'mono';

export interface MarginSettings {
  top: number;    // 5-25mm
  bottom: number;
  left: number;
  right: number;
}

export interface SpacingSettings {
  section: SpacingLevel;    // Gap between major sections
  item: SpacingLevel;       // Gap between items within sections
  lineHeight: SpacingLevel; // Text line height
}

export interface FontSizeSettings {
  base: SpacingLevel;           // Overall text scale
  headerScale: SpacingLevel;    // Header size multiplier
  headerFont: HeaderFontFamily; // Header font family
  bodyFont: BodyFontFamily;     // Body text font family
}

export interface TemplateSettings {
  template: TemplateType;
  pageSize: PageSize;
  margins: MarginSettings;
  spacing: SpacingSettings;
  fontSize: FontSizeSettings;
  compactMode: boolean;      // Apply tighter spacing (0.6x multiplier, margins unchanged)
  showContactIcons: boolean; // Show icons next to contact info
}

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  template: 'swiss-single',
  pageSize: 'A4',
  margins: { top: 8, bottom: 8, left: 8, right: 8 },
  spacing: { section: 3, item: 2, lineHeight: 3 },
  fontSize: { base: 3, headerScale: 3, headerFont: 'serif', bodyFont: 'sans-serif' },
  compactMode: false,
  showContactIcons: false,
};

// CSS custom property value mappings
export const SECTION_SPACING_MAP: Record<SpacingLevel, string> = {
  1: '0.5rem', 2: '1rem', 3: '1.5rem', 4: '2rem', 5: '2.5rem',
};

export const ITEM_SPACING_MAP: Record<SpacingLevel, string> = {
  1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.25rem',
};

export const LINE_HEIGHT_MAP: Record<SpacingLevel, number> = {
  1: 1.2, 2: 1.35, 3: 1.5, 4: 1.65, 5: 1.8,
};

export const FONT_SIZE_MAP: Record<SpacingLevel, string> = {
  1: '11px', 2: '12px', 3: '14px', 4: '15px', 5: '16px',
};

export const HEADER_SCALE_MAP: Record<SpacingLevel, number> = {
  1: 1.5, 2: 1.75, 3: 2, 4: 2.25, 5: 2.5,
};

export const SECTION_HEADER_SCALE_MAP: Record<SpacingLevel, number> = {
  1: 1.0, 2: 1.1, 3: 1.2, 4: 1.3, 5: 1.4,
};

export const HEADER_FONT_MAP: Record<HeaderFontFamily, string> = {
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  'sans-serif': 'ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

export const BODY_FONT_MAP: Record<BodyFontFamily, string> = {
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  'sans-serif': 'ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
};

export const COMPACT_MULTIPLIER = 0.6;
export const COMPACT_LINE_HEIGHT_MULTIPLIER = 0.92;

export function settingsToCssVars(settings?: TemplateSettings): React.CSSProperties {
  const s = settings || DEFAULT_TEMPLATE_SETTINGS;
  const compact = s.compactMode ? COMPACT_MULTIPLIER : 1;

  return {
    '--section-gap': s.compactMode
      ? `calc(${SECTION_SPACING_MAP[s.spacing.section]} * ${compact})`
      : SECTION_SPACING_MAP[s.spacing.section],
    '--item-gap': s.compactMode
      ? `calc(${ITEM_SPACING_MAP[s.spacing.item]} * ${compact})`
      : ITEM_SPACING_MAP[s.spacing.item],
    '--line-height': s.compactMode
      ? LINE_HEIGHT_MAP[s.spacing.lineHeight] * COMPACT_LINE_HEIGHT_MULTIPLIER
      : LINE_HEIGHT_MAP[s.spacing.lineHeight],
    '--font-size-base': FONT_SIZE_MAP[s.fontSize.base],
    '--header-scale': HEADER_SCALE_MAP[s.fontSize.headerScale],
    '--section-header-scale': SECTION_HEADER_SCALE_MAP[s.fontSize.headerScale],
    '--header-font': HEADER_FONT_MAP[s.fontSize.headerFont],
    '--body-font': BODY_FONT_MAP[s.fontSize.bodyFont],
    '--margin-top': `${s.margins.top}mm`,
    '--margin-bottom': `${s.margins.bottom}mm`,
    '--margin-left': `${s.margins.left}mm`,
    '--margin-right': `${s.margins.right}mm`,
  } as React.CSSProperties;
}
```

---

## 3. CSS Modules & Token System

The template system uses **CSS Modules** for scoping and **CSS Variables** for design tokens.

### Token System (`styles/_tokens.css`)

Defines the semantic color palette and global theme variables.

```css
.resume-body {
  /* Text colors */
  --resume-text-primary: #000000;
  --resume-text-secondary: #374151;
  
  /* Border colors */
  --resume-border-primary: #9CA3AF;
  
  /* Accent */
  --resume-accent-bg: #F3F4F6;
}
```

### Base Styles (`styles/_base.module.css`)

Defines shared typography, spacing utilities, and layout primitives. Imports tokens.

```css
@import './_tokens.css';

.resume-body {
  /* Spacing defaults */
  --section-gap: 1rem;
  /* ... */
}

.resume-section-title {
  /* Shared title styling */
}
```

### Template-Specific Styles

Each template has its own module (e.g., `swiss-single.module.css`) for specific layout requirements.

### Helper Classes (Base Module)

Use the exports from `_base.module.css` instead of hardcoded Tailwind classes:

- Typography: `resume-name`, `resume-title`, `resume-text`, `resume-meta`
- Layout: `resume-stack`, `resume-row`, `resume-two-column-grid` (in base or specific)
- Elements: `resume-section`, `resume-item`, `resume-skill-pill`

### Usage in Components

```tsx
import baseStyles from './styles/_base.module.css';
import styles from './styles/my-template.module.css';

return (
  <div className={styles.container}>
    <h1 className={baseStyles['resume-name']}>{name}</h1>
    {/* ... */}
  </div>
);
```

### How Settings Map to CSS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SETTINGS → CSS MAPPING                                   │
└─────────────────────────────────────────────────────────────────────────────┘

 TemplateSettings                         CSS Custom Properties
─────────────────────────────────────────────────────────────────────────────

spacing.section: 3      ──────────────>  --section-gap: 1.5rem

spacing.item: 2         ──────────────>  --item-gap: 0.5rem

spacing.lineHeight: 3   ──────────────>  --line-height: 1.5

fontSize.base: 3        ──────────────>  --font-size-base: 14px

fontSize.headerScale: 3 ──────────────>  --header-scale: 2
                                         --section-header-scale: 1.2

fontSize.headerFont     ──────────────>  --header-font: ui-serif, Georgia...

fontSize.bodyFont       ──────────────>  --body-font: ui-sans-serif, system-ui...

compactMode: true       ──────────────>  section/item spacing * 0.6, line-height * 0.92

margins.top/bottom/     ──────────────>  --margin-top/bottom/left/right: Nmm
left/right
```

### Value Scales

| Setting | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|---------|---------|---------|---------|---------|---------|
| Section Spacing | 0.5rem | 1rem | **1.5rem** | 2rem | 2.5rem |
| Item Spacing | 0.25rem | **0.5rem** | 0.75rem | 1rem | 1.25rem |
| Line Height | 1.2 | 1.35 | **1.5** | 1.65 | 1.8 |
| Font Size | 11px | 12px | **14px** | 15px | 16px |
| Header Scale | 1.5x | 1.75x | **2x** | 2.25x | 2.5x |
| Section Header Scale | 1.0x | 1.1x | **1.2x** | 1.3x | 1.4x |

**Bold** = Default

### Header & Body Font Families

| Option | Font Stack |
|--------|------------|
| `serif` | ui-serif, Georgia, Cambria, "Times New Roman", Times, serif |
| `sans-serif` | ui-sans-serif, system-ui, sans-serif |
| `mono` | ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace |

---

## 4. Creating a New Template

### Step 1: Define Template ID

Add the new template type to `lib/types/template-settings.ts`:

```typescript
// Before
export type TemplateType = "swiss-single" | "swiss-two-column";

// After
export type TemplateType = "swiss-single" | "swiss-two-column" | "modern-minimal";
```

### Step 2: Create Template Component

Create a new style module `components/resume/styles/modern-minimal.module.css` and component `components/resume/resume-modern-minimal.tsx`:

```tsx
import { CSSProperties } from "react";
import { ResumeData } from "@/lib/types/resume";
import baseStyles from "./styles/_base.module.css";
import styles from "./styles/modern-minimal.module.css";

interface Props {
  data: ResumeData;
  style?: CSSProperties; // Contains spacing variables from settings
  className?: string;    // Contains baseStyles['resume-body'] from parent
}

export function ResumeModernMinimal({ data, style, className }: Props) {
  // Combine parent classes with local specific classes if needed
  return (
    <div className={className} style={style}>
      {/* Header Section */}
      <header className={`${baseStyles['resume-section']} ${baseStyles['resume-header']}`}
              style={{ borderBottom: '2px solid var(--resume-text-primary)' }}>
        <h1 className={`${baseStyles['resume-name']} tracking-tight uppercase`}>
          {data.personal_info.name}
        </h1>
        {/* ... */}
      </header>
    </div>
  );
}
```

### Step 3: Register in Router

Update `components/dashboard/resume-component.tsx`:

```typescript
import { ResumeModernMinimal } from "@/components/resume/resume-modern-minimal";

// In the switch statement:
switch (templateSettings.template) {
  case "swiss-single":
    return <ResumeSingleColumn data={data} style={style} className={className} />;
  case "swiss-two-column":
    return <ResumeTwoColumn data={data} style={style} className={className} />;
  case "modern-minimal":
    return <ResumeModernMinimal data={data} style={style} className={className} />;
  default:
    return <ResumeSingleColumn data={data} style={style} className={className} />;
}
```

### Step 4: Add to Template Selector UI

Update `components/builder/formatting-controls.tsx`:

```typescript
const TEMPLATES = [
  {
    id: "swiss-single",
    name: "Single Column",
    preview: "/templates/swiss-single.png",
  },
  {
    id: "swiss-two-column",
    name: "Two Column",
    preview: "/templates/swiss-two-column.png",
  },
  {
    id: "modern-minimal",
    name: "Modern Minimal",
    preview: "/templates/modern-minimal.png",
  },
];
```

### Step 5: Export from Index

Update `components/resume/index.ts`:

```typescript
export { ResumeSingleColumn } from "./resume-single-column";
export { ResumeTwoColumn } from "./resume-two-column";
export { ResumeModernMinimal } from "./resume-modern-minimal";
```

---

## 5. Template Settings Integration

### Builder Integration

The `ResumeBuilder` component manages template settings through state:

```typescript
// components/builder/resume-builder.tsx

const [templateSettings, setTemplateSettings] = useState<TemplateSettings>(
  DEFAULT_TEMPLATE_SETTINGS
);

// Load from localStorage on mount
useEffect(() => {
  const saved = localStorage.getItem("resume_builder_settings");
  if (saved) {
    setTemplateSettings(JSON.parse(saved));
  }
}, []);

// Save to localStorage on change
useEffect(() => {
  localStorage.setItem(
    "resume_builder_settings",
    JSON.stringify(templateSettings)
  );
}, [templateSettings]);
```

### FormattingControls Component

```typescript
// components/builder/formatting-controls.tsx

interface FormattingControlsProps {
  settings: TemplateSettings;
  onChange: (settings: TemplateSettings) => void;
}

export function FormattingControls({ settings, onChange }: FormattingControlsProps) {
  return (
    <div className="space-y-4 p-4 border rounded-lg">
      {/* Template Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Template</label>
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => onChange({ ...settings, template: template.id })}
              className={`p-2 border rounded ${
                settings.template === template.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200"
              }`}
            >
              <img src={template.preview} alt={template.name} />
              <span className="text-xs">{template.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Page Size */}
      <div>
        <label className="block text-sm font-medium mb-2">Page Size</label>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ ...settings, pageSize: "A4" })}
            className={`px-3 py-1 rounded ${
              settings.pageSize === "A4" ? "bg-black text-white" : "bg-gray-100"
            }`}
          >
            A4
          </button>
          <button
            onClick={() => onChange({ ...settings, pageSize: "LETTER" })}
            className={`px-3 py-1 rounded ${
              settings.pageSize === "LETTER" ? "bg-black text-white" : "bg-gray-100"
            }`}
          >
            US Letter
          </button>
        </div>
      </div>

      {/* Spacing Sliders */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Section Spacing: {settings.sectionSpacing}
        </label>
        <input
          type="range"
          min="1"
          max="5"
          value={settings.sectionSpacing}
          onChange={(e) =>
            onChange({ ...settings, sectionSpacing: parseInt(e.target.value) })
          }
          className="w-full"
        />
      </div>

      {/* ... More controls */}
    </div>
  );
}
```

Formatting controls should surface an "Effective Output" summary (margins, section/item gaps,
line height, base font size, header scale) so compact-mode adjustments are visible without
inspecting the preview.

### PDF Download with Settings

Settings are passed to the PDF endpoint:

```typescript
// lib/api/resume.ts

export async function downloadResumePdf(
  resumeId: string,
  settings: TemplateSettings
): Promise<Blob> {
  const params = new URLSearchParams({
    template: settings.template,
    pageSize: settings.pageSize,
    marginTop: settings.margins.top.toString(),
    marginBottom: settings.margins.bottom.toString(),
    marginLeft: settings.margins.left.toString(),
    marginRight: settings.margins.right.toString(),
    sectionSpacing: settings.spacing.section.toString(),
    itemSpacing: settings.spacing.item.toString(),
    lineHeight: settings.spacing.lineHeight.toString(),
    fontSize: settings.fontSize.base.toString(),
    headerScale: settings.fontSize.headerScale.toString(),
    headerFont: settings.fontSize.headerFont,
    bodyFont: settings.fontSize.bodyFont,
  });

  const response = await fetch(
    `${API_BASE}/resumes/${resumeId}/pdf?${params}`
  );

  if (!response.ok) {
    throw new Error("Failed to download PDF");
  }

  return response.blob();
}
```

---

## 6. Print & PDF Considerations

### Print Route

The frontend has a dedicated print route for PDF rendering:

```
apps/frontend/app/print/resumes/[id]/page.tsx
```

This page:
1. Receives resume ID and settings via URL params
2. Fetches resume data from backend
3. Renders the Resume component with settings
4. Playwright visits this page and generates PDF

### Print Styles

```css
/* globals.css - Print-specific styles */

@media print {
  .resume-print,
  .resume-print * {
    visibility: visible !important;
  }

  .resume-print {
    width: 100% !important;
    max-width: 210mm !important;
    margin: 0 auto !important;
    border: none !important;
    box-shadow: none !important;
    background: #ffffff !important;
  }

  .no-print {
    display: none !important;
  }
}
```

### Playwright PDF Configuration

```python
# apps/backend/app/pdf.py

async def render_resume_pdf(
    resume_id: str,
    template: str,
    page_size: str,
    margins: dict,
    **kwargs
) -> bytes:
    # Build URL with all settings
    params = urlencode({
        "template": template,
        "pageSize": page_size,
        **{f"margin{k.title()}": v for k, v in margins.items()},
        **kwargs,
    })

    url = f"{FRONTEND_URL}/print/resumes/{resume_id}?{params}"

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        await page.goto(url, wait_until="networkidle")

        # Wait for fonts to load
        await page.wait_for_function("document.fonts.ready")

        pdf_bytes = await page.pdf(
            format=page_size,
            margin={
                "top": f"{margins['top']}mm",
                "right": f"{margins['right']}mm",
                "bottom": f"{margins['bottom']}mm",
                "left": f"{margins['left']}mm",
            },
            print_background=True,
            prefer_css_page_size=False,
        )

        await browser.close()

    return pdf_bytes
```

### Margin Application

Margins are applied in Playwright so they repeat on every page. The print route passes
`TemplateSettings` with margins zeroed so CSS padding does not double-apply margins.

---

## 7. Template Examples

### Swiss Single Column

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  JOHN DOE                                                       │
│  john@email.com | (555) 123-4567 | New York, NY                │
│  linkedin.com/in/johndoe | github.com/johndoe                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  PROFESSIONAL SUMMARY                                           │
│  Experienced software engineer with 8+ years building          │
│  scalable web applications...                                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  EXPERIENCE                                                     │
│                                                                 │
│  Senior Software Engineer                                       │
│  Tech Company Inc. | Jan 2020 - Present                        │
│  • Led team of 5 engineers...                                  │
│  • Improved performance by 40%...                              │
│                                                                 │
│  Software Engineer                                              │
│  Startup Co. | Jun 2016 - Dec 2019                             │
│  • Built microservices architecture...                         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  EDUCATION                                                      │
│                                                                 │
│  B.S. Computer Science                                          │
│  University of Technology | 2016                                │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  SKILLS                                                         │
│  Python, JavaScript, React, Node.js, PostgreSQL, AWS           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Swiss Two Column

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  JOHN DOE                                                       │
│  john@email.com | (555) 123-4567 | New York, NY                │
│                                                                 │
├─────────────────────────────────────────┬───────────────────────┤
│                                         │                       │
│  EXPERIENCE                             │  EDUCATION            │
│                                         │                       │
│  Senior Software Engineer               │  B.S. Computer Sci.   │
│  Tech Company Inc.                      │  Univ. of Technology  │
│  Jan 2020 - Present                     │  2016                 │
│  • Led team of 5 engineers...           │                       │
│  • Improved performance by 40%...       │  ─────────────────────│
│                                         │                       │
│  Software Engineer                      │  SKILLS               │
│  Startup Co.                            │                       │
│  Jun 2016 - Dec 2019                    │  Languages:           │
│  • Built microservices...               │  Python, JavaScript   │
│                                         │                       │
│  ─────────────────────────────────────  │  Frameworks:          │
│                                         │  React, Node.js       │
│  PROJECTS                               │                       │
│                                         │  Databases:           │
│  Open Source CLI Tool                   │  PostgreSQL, MongoDB  │
│  github.com/johndoe/cli-tool            │                       │
│  • Built popular CLI with 1k+ stars     │  Cloud:               │
│                                         │  AWS, GCP             │
│                                         │                       │
└─────────────────────────────────────────┴───────────────────────┘
```

### Modern Minimal (Example New Template)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  john doe                                                       │
│  ═══════════════════════════════════════════════════════════   │
│  john@email.com  •  (555) 123-4567  •  New York, NY            │
│                                                                 │
│                                                                 │
│  Experienced software engineer with 8+ years building          │
│  scalable web applications using modern technologies.          │
│                                                                 │
│                                                                 │
│  E X P E R I E N C E                                           │
│                                                                 │
│  Senior Software Engineer                       2020 – Present  │
│  Tech Company Inc.                                              │
│  – Led team of 5 engineers on customer platform                │
│  – Improved API response time by 40%                           │
│                                                                 │
│  Software Engineer                              2016 – 2019     │
│  Startup Co.                                                    │
│  – Built microservices architecture from scratch               │
│                                                                 │
│                                                                 │
│  E D U C A T I O N                                             │
│                                                                 │
│  B.S. Computer Science                                    2016  │
│  University of Technology                                       │
│                                                                 │
│                                                                 │
│  S K I L L S                                                   │
│                                                                 │
│  Python • JavaScript • React • Node.js • PostgreSQL • AWS      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Template Checklist

When creating a new template, ensure:

- [ ] Template ID added to `TemplateType` union
- [ ] Component file created in `components/resume/`
- [ ] Component exported from `components/resume/index.ts`
- [ ] Switch case added in `resume-component.tsx`
- [ ] Preview thumbnail created (300x400px recommended)
- [ ] Template added to `TEMPLATES` array in formatting controls
- [ ] CSS custom properties used for spacing/typography
- [ ] `.resume-section` and `.resume-item` classes applied
- [ ] Page break rules respected
- [ ] Print styles tested
- [ ] PDF generation tested with all page sizes
- [ ] All ResumeData fields handled (including optional ones)

---

## Files Changed Summary

### For Adding a New Template

| File | Change |
|------|--------|
| `lib/types/template-settings.ts` | Add to `TemplateType` union |
| `components/resume/[new-template].tsx` | Create new component |
| `components/resume/styles/[new-template].module.css` | Create new style module |
| `components/resume/index.ts` | Export new component |
| `components/dashboard/resume-component.tsx` | Add switch case |
| `components/builder/formatting-controls.tsx` | Add to TEMPLATES array |
| `public/templates/[new-template].png` | Add preview thumbnail |

### For Modifying Template System

| File | Purpose |
|------|---------|
| `lib/types/template-settings.ts` | Settings types, defaults, CSS mapping |
| `app/(default)/css/globals.css` | Print styles & resets |
| `components/builder/resume-builder.tsx` | Settings state management |
| `components/builder/formatting-controls.tsx` | Settings UI |
| `app/print/resumes/[id]/page.tsx` | Print route with margins |
| `apps/backend/app/pdf.py` | Playwright PDF generation |
