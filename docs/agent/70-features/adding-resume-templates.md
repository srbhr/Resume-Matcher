# Adding New Resume Templates

This guide explains how to add a new resume template to the Resume Matcher application.

---

## Quick Reference

| Step | File(s) | Purpose |
|------|---------|---------|
| 1 | `lib/types/template-settings.ts` | Add type definition and metadata |
| 2 | `components/resume/styles/_tokens.css` | Add CSS variable defaults (if needed) |
| 3 | `components/resume/styles/{template}.module.css` | Create template-specific styles |
| 4 | `components/resume/{template}.tsx` | Create template component |
| 5 | `components/resume/index.ts` | Export the component |
| 6 | `components/dashboard/resume-component.tsx` | Add conditional rendering |
| 7 | `components/builder/template-selector.tsx` | Add thumbnail |
| 8 | `components/builder/formatting-controls.tsx` | Add template-specific controls (optional) |
| 9 | `app/print/resumes/[id]/page.tsx` | Ensure print compatibility |

---

## Step 1: Type Definitions

**File:** `apps/frontend/lib/types/template-settings.ts`

### 1.1 Add to TemplateType union

```typescript
export type TemplateType = 'swiss-single' | 'swiss-two-column' | 'modern' | 'modern-two-column' | 'your-template';
```

### 1.2 Add to TEMPLATE_OPTIONS array

```typescript
export const TEMPLATE_OPTIONS: TemplateInfo[] = [
  // ... existing templates
  {
    id: 'your-template',
    name: 'Your Template',
    description: 'Brief description of the template layout',
  },
];
```

### 1.3 Add new settings (if needed)

If your template requires new settings (like accent colors), add:

1. New type definition:

```typescript
export type YourSetting = 'option1' | 'option2' | 'option3';
```

1. Add to `TemplateSettings` interface:

```typescript
export interface TemplateSettings {
  // ... existing fields
  yourSetting: YourSetting;
}
```

1. Add to `DEFAULT_TEMPLATE_SETTINGS`:

```typescript
export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  // ... existing defaults
  yourSetting: 'option1',
};
```

1. Add mapping constant (if converting to CSS):

```typescript
export const YOUR_SETTING_MAP: Record<YourSetting, string> = {
  option1: '#value1',
  option2: '#value2',
  option3: '#value3',
};
```

1. Update `settingsToCssVars()` function:

```typescript
export function settingsToCssVars(settings?: TemplateSettings): React.CSSProperties {
  // ... existing code
  return {
    // ... existing vars
    '--your-css-var': YOUR_SETTING_MAP[s.yourSetting],
  } as React.CSSProperties;
}
```

---

## Step 2: CSS Token Defaults (Optional)

**File:** `apps/frontend/components/resume/styles/_tokens.css`

Add default CSS variable values if your template uses custom variables:

```css
.resume-body {
  /* ... existing tokens */

  /* Your template tokens */
  --your-css-var: #defaultValue;
}
```

---

## Step 3: Template-Specific CSS

**File:** `apps/frontend/components/resume/styles/{your-template}.module.css`

Create a new CSS module file:

```css
@import './_tokens.css';

/*
  Your Template Name
  ID: your-template

  Description of the template layout and features.
*/

.container {
  width: 100%;
}

/* Template-specific styles */
.your-custom-class {
  /* Use CSS variables for dynamic values */
  color: var(--your-css-var);
}

/* Print media query for PDF rendering */
@media print {
  .your-custom-class {
    /* Ensure colors render in PDF */
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
```

---

## Step 4: Template Component

**File:** `apps/frontend/components/resume/{your-template}.tsx`

### 4.1 Basic structure

```tsx
import React from 'react';
import { Mail, Phone, MapPin, Globe, Linkedin, Github, ExternalLink } from 'lucide-react';
import type { ResumeData, SectionMeta } from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/your-template.module.css';

interface YourTemplateProps {
  data: ResumeData;
  showContactIcons?: boolean;
}

export const YourTemplate: React.FC<YourTemplateProps> = ({
  data,
  showContactIcons = false,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;
  const sortedSections = getSortedSections(data);

  // Render sections based on sectionMeta ordering
  const renderSection = (section: SectionMeta) => {
    switch (section.key) {
      case 'personalInfo':
        return null; // Handled in header
      case 'summary':
        // ... render summary
      case 'workExperience':
        // ... render experience
      // ... other cases
      default:
        // Handle custom sections
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      {personalInfo && (
        <header>
          {/* Name, title, contact info */}
        </header>
      )}

      {/* Sections */}
      {sortedSections
        .filter((section) => section.key !== 'personalInfo')
        .map((section) => renderSection(section))}
    </div>
  );
};

export default YourTemplate;
```

### 4.2 ATS Compatibility Requirements

**CRITICAL:** All resume templates must be ATS (Applicant Tracking System) parsable:

| Element | DO | DON'T |
|---------|-----|-------|
| Bullets | `<span>•&nbsp;</span>` in DOM | CSS `::before` or `list-style` |
| Date separators | ASCII hyphen `-` as text | En-dash `–` or CSS spacing |
| Links | Display actual URL as anchor text | Generic labels like "GitHub" |
| Contact separators | Comma `,` or pipe `|` as text | CSS-only spacing |
| Section headers | `<h3>` with text content | CSS-generated content |

### 4.3 Use base styles

Import and use shared styles from `_base.module.css`:

```tsx
// Common classes available:
baseStyles['resume-body']          // Root container
baseStyles['resume-header']        // Header section
baseStyles['resume-name']          // Name heading
baseStyles['resume-title']         // Job title
baseStyles['resume-section']       // Section container
baseStyles['resume-section-title'] // Section heading (h3)
baseStyles['resume-item']          // Individual item
baseStyles['resume-item-title']    // Item title (h4)
baseStyles['resume-item-subtitle'] // Subtitle (0.95× base, weight 600) - for company, degree, role
baseStyles['resume-item-subtitle-sm'] // Small subtitle (0.88× base) - for compact layouts
baseStyles['resume-text']          // Body text
baseStyles['resume-text-sm']       // Smaller body text
baseStyles['resume-meta']          // Metadata (mono font, 0.82× base)
baseStyles['resume-date']          // Date formatting
baseStyles['resume-list']          // Bullet list container
baseStyles['resume-link']          // Hyperlinks
```

**Best Practice:** Use `resume-item-subtitle` for company names, education degrees, and project roles instead of `resume-meta`. The subtitle classes provide better visibility with larger font size (0.95× vs 0.82×) and semi-bold weight (600 vs 400).

---

## Step 5: Export Component

**File:** `apps/frontend/components/resume/index.ts`

```typescript
export { ResumeSingleColumn } from './resume-single-column';
export { ResumeTwoColumn } from './resume-two-column';
export { ResumeModern } from './resume-modern';
export { YourTemplate } from './your-template'; // Add this
```

---

## Step 6: Resume Component Integration

**File:** `apps/frontend/components/dashboard/resume-component.tsx`

### 6.1 Import the component

```typescript
import { ResumeSingleColumn, ResumeTwoColumn, ResumeModern, YourTemplate } from '@/components/resume';
```

### 6.2 Add conditional rendering

```tsx
const Resume: React.FC<ResumeProps> = ({ resumeData, template, settings }) => {
  // ... existing code

  return (
    <div className={...} style={cssVars}>
      {mergedSettings.template === 'swiss-single' && (
        <ResumeSingleColumn data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
      {mergedSettings.template === 'swiss-two-column' && (
        <ResumeTwoColumn data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
      {mergedSettings.template === 'modern' && (
        <ResumeModern data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
      {/* Add your template */}
      {mergedSettings.template === 'your-template' && (
        <YourTemplate data={resumeData} showContactIcons={mergedSettings.showContactIcons} />
      )}
    </div>
  );
};
```

### 6.3 Update JSDoc comment

```typescript
/**
 * Resume Component
 *
 * Templates:
 * - swiss-single: Traditional single-column layout
 * - swiss-two-column: Two-column layout with sidebar
 * - modern: Single-column with accent colors
 * - your-template: Your template description  // Add this
 */
```

---

## Step 7: Template Selector Thumbnail

**File:** `apps/frontend/components/builder/template-selector.tsx`

Add a visual thumbnail in the `TemplateThumbnail` component:

```tsx
export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ type, isActive }) => {
  const lineColor = isActive ? 'bg-blue-700' : 'bg-gray-400';
  const borderColor = isActive ? 'border-blue-700' : 'border-gray-400';

  if (type === 'swiss-single') { /* ... */ }
  if (type === 'swiss-two-column') { /* ... */ }
  if (type === 'modern') { /* ... */ }

  // Add your template thumbnail
  if (type === 'your-template') {
    return (
      <div className={`w-14 h-18 border ${borderColor} bg-white p-1.5 flex flex-col gap-1`}>
        {/* Visual representation of your layout */}
        <div className={`h-2 ${lineColor} w-full`}></div>
        {/* ... more layout elements */}
      </div>
    );
  }

  // Fallback
  return <div>...</div>;
};
```

---

## Step 8: Formatting Controls (Optional)

**File:** `apps/frontend/components/builder/formatting-controls.tsx`

If your template has template-specific settings (like accent colors):

### 8.1 Import new types

```typescript
import {
  // ... existing imports
  type YourSetting,
  YOUR_SETTING_MAP,
} from '@/lib/types/template-settings';
```

### 8.2 Add handler function

```typescript
const handleYourSettingChange = (yourSetting: YourSetting) => {
  onChange({ ...settings, yourSetting });
};
```

### 8.3 Add conditional UI section

```tsx
{/* Your Setting - Only visible for your template */}
{settings.template === 'your-template' && (
  <div>
    <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
      Your Setting
    </h4>
    <div className="flex gap-2">
      {(Object.keys(YOUR_SETTING_MAP) as YourSetting[]).map((option) => (
        <button
          key={option}
          onClick={() => handleYourSettingChange(option)}
          className={`... ${settings.yourSetting === option ? 'selected' : ''}`}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
)}
```

---

## Step 9: Backend & Print Page Compatibility

### 9.1 Frontend Print Page

**File:** `apps/frontend/app/print/resumes/[id]/page.tsx`

Update the template parser to accept your new template:

```typescript
function parseTemplate(value: string | undefined): TemplateType {
  if (
    value === 'swiss-single' ||
    value === 'swiss-two-column' ||
    value === 'modern' ||
    value === 'modern-two-column' ||
    value === 'your-template'  // Add this
  ) {
    return value;
  }
  return 'swiss-single';
}
```

If your template uses custom settings (like accent colors), add parser functions:

```typescript
function parseYourSetting(value: string | undefined): YourSetting {
  if (value === 'option1' || value === 'option2' || value === 'option3') {
    return value;
  }
  return DEFAULT_TEMPLATE_SETTINGS.yourSetting;
}
```

And include it in the settings object:

```typescript
const settings: TemplateSettings = {
  template: parseTemplate(resolvedSearchParams?.template),
  pageSize: parsePageSize(resolvedSearchParams?.pageSize),
  // ... all other settings
  yourSetting: parseYourSetting(resolvedSearchParams?.yourSetting), // Add this
};
```

### 9.2 Backend PDF Endpoint

**File:** `apps/backend/app/routers/resumes.py`

If your template requires custom parameters (like `accentColor` for Modern templates):

**1. Add parameter to endpoint:**

```python
@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    # ... existing parameters
    yourSetting: str = Query("default", pattern="^(option1|option2|option3)$"),  # Add this
) -> Response:
```

**2. Add to URL parameters:**

```python
    params = (
        f"template={template}"
        # ... existing params
        f"&yourSetting={yourSetting}"  # Add this
    )
```

**3. Update docstring:**

```python
    """Generate a PDF for a resume using headless Chromium.

    Accepts template settings for customization:
    - template: swiss-single, swiss-two-column, modern, modern-two-column, or your-template
    # ... existing params
    - yourSetting: option1, option2, or option3  # Add this
    """
```

### 9.3 Frontend API Client

**File:** `apps/frontend/lib/api/resume.ts`

If your template has custom settings, add them to the PDF download function:

```typescript
export async function downloadResumePdf(
  resumeId: string,
  settings?: TemplateSettings
): Promise<Blob> {
  const params = new URLSearchParams();

  if (settings) {
    params.set('template', settings.template);
    // ... existing params
    params.set('yourSetting', settings.yourSetting);  // Add this
  }
  // ...
}
```

---

## Testing Checklist

After implementation, verify:

- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Template appears in template selector
- [ ] Template renders correctly in preview
- [ ] PDF export works (`/print/resumes/[id]`)
- [ ] All text is selectable in generated PDF (ATS check)
- [ ] Template-specific controls appear/hide correctly
- [ ] Settings persist when switching templates

---

## File Tree Reference

```
apps/frontend/
├── lib/types/
│   └── template-settings.ts    # Types, constants, settingsToCssVars()
├── components/
│   ├── resume/
│   │   ├── index.ts            # Exports
│   │   ├── your-template.tsx   # Template component
│   │   └── styles/
│   │       ├── _tokens.css     # CSS variable defaults
│   │       ├── _base.module.css # Shared styles
│   │       └── your-template.module.css # Template styles
│   ├── dashboard/
│   │   └── resume-component.tsx # Conditional rendering
│   └── builder/
│       ├── template-selector.tsx # Thumbnails
│       └── formatting-controls.tsx # Settings UI
└── app/print/resumes/[id]/
    └── page.tsx                # PDF generation settings
```

---

## Real-World Example: Modern Two-Column Template

The `modern-two-column` template demonstrates how to combine features from multiple templates:

### Type Definitions

```typescript
// apps/frontend/lib/types/template-settings.ts
export type TemplateType = 'swiss-single' | 'swiss-two-column' | 'modern' | 'modern-two-column';

export const TEMPLATE_OPTIONS: TemplateInfo[] = [
  // ...
  {
    id: 'modern-two-column',
    name: 'Modern Two Column',
    description: 'Two-column layout with modern colorful accents and themes',
  },
];
```

### CSS Styles

```css
/* apps/frontend/components/resume/styles/modern-two-column.module.css */

.grid {
  display: grid;
  grid-template-columns: 65% 35%;
  gap: var(--section-gap);
}

.mainColumn {
  border-right: 2px solid var(--accent-primary);  /* Uses accent color */
}

.sectionTitleAccent {
  color: var(--accent-primary);
  border-bottom: 2px solid var(--accent-primary);
}
```

### Component Structure

```tsx
// apps/frontend/components/resume/resume-modern-two-column.tsx

export const ResumeModernTwoColumn: React.FC<Props> = ({ data, showContactIcons }) => {
  return (
    <>
      {/* Header with accent underline */}
      <div className={baseStyles['resume-header']}>
        <h1 className={`${baseStyles['resume-name']} ${styles.nameAccent}`}>
          {personalInfo?.name}
        </h1>
      </div>

      {/* Two-column grid */}
      <div className={styles.grid}>
        {/* Main column - accent section headers */}
        <div className={styles.mainColumn}>
          <h3 className={styles.sectionTitleAccent}>Experience</h3>
          {/* Content uses baseStyles['resume-item-subtitle'] */}
        </div>

        {/* Sidebar - accent headers */}
        <div className={styles.sidebarColumn}>
          <h3 className={`${baseStyles['resume-section-title-sm']} text-[var(--accent-primary)]`}>
            Education
          </h3>
        </div>
      </div>
    </>
  );
};
```

### Backend Integration

```python
# apps/backend/app/routers/resumes.py

@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),  # For Modern templates
    # ...
) -> Response:
    """Generate a PDF for a resume using headless Chromium.
    
    - template: swiss-single, swiss-two-column, modern, or modern-two-column
    - accentColor: blue, green, orange, or red (for modern templates)
    """
    params = f"template={template}&accentColor={accentColor}"  # Passed to print page
```

### Key Features

- **Layout**: Combines two-column efficiency with modern aesthetics
- **Accent Colors**: Inherits `accentColor` setting from Modern template
- **Typography**: Uses `resume-item-subtitle-sm` for better visibility
- **ATS Compatible**: All visual elements are real DOM text
- **Responsive**: Uses CSS Grid with percentage-based columns

---

## Simpler Example: Adding a "Minimal" Template

For a basic template without custom settings:

1. Add `'minimal'` to `TemplateType`
2. Add to `TEMPLATE_OPTIONS` with name "Minimal" and description
3. Create `minimal.module.css` with clean, whitespace-focused styles
4. Create `resume-minimal.tsx` with simplified layout
5. Export from `index.ts`
6. Add conditional render in `resume-component.tsx`
7. Add `'minimal'` to `parseTemplate()` in `app/print/resumes/[id]/page.tsx`
8. Add thumbnail showing minimal layout
9. Test lint, build, preview, and PDF export

**No backend changes needed** since `template` parameter accepts any string.
