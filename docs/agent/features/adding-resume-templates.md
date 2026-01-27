# Adding Resume Templates

> Guide for adding new resume template layouts.

## Quick Start

1. Create `components/resume/resume-{name}.tsx`
2. Export from `components/resume/index.ts`
3. Add to `FormattingControls` template selector
4. Create thumbnail image

## Template Component

```tsx
interface TemplateProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
}

export function ResumeNewTemplate({ resumeData, settings }: TemplateProps) {
  return (
    <div className="resume-print">
      {/* Header */}
      <header className="resume-section">
        <h1>{resumeData.personalInfo?.name}</h1>
      </header>
      
      {/* Sections */}
      {getSortedSections(resumeData).map(section => (
        <section key={section.id} className="resume-section">
          <h3 className="resume-section-title">{section.displayName}</h3>
          <div className="resume-items">
            {/* Items */}
          </div>
        </section>
      ))}
    </div>
  );
}
```

## CSS Classes Required

```css
.resume-print          /* Root container (Playwright waits for this) */
.resume-section        /* Section wrapper */
.resume-section-title  /* Section heading */
.resume-items          /* Items container */
.resume-item           /* Individual entry (won't page-break) */
```

## Export Template

```typescript
// components/resume/index.ts
export { ResumeNewTemplate } from './resume-new-template';
```

## Add to Selector

```typescript
// components/builder/formatting-controls.tsx
const TEMPLATES = [
  { id: 'swiss-single', name: 'Single Column' },
  { id: 'swiss-two-column', name: 'Two Column' },
  { id: 'new-template', name: 'New Template' }, // Add here
];
```

## Testing

1. Load builder with new template
2. Check all sections render
3. Verify PDF generation works
4. Test with 2+ page content
