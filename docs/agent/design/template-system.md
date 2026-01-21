# Template System

> Resume template architecture and customization.

## Templates

| Template | Layout | Best For |
|----------|--------|----------|
| swiss-single | Full-width vertical | 1-2 page resumes |
| swiss-two-column | 65% main + 35% sidebar | Dense content |

## File Structure

```
components/resume/
├── index.ts                    # Re-exports all templates
├── resume-single-column.tsx    # Single column template
└── resume-two-column.tsx       # Two column template
```

## Template Settings

```typescript
interface TemplateSettings {
  template: 'swiss-single' | 'swiss-two-column';
  pageSize: 'A4' | 'LETTER';
  marginTop: number;    // 5-25mm
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  sectionSpacing: 1-5;  // Inter-section gap
  itemSpacing: 1-5;     // Item gap
  lineHeight: 1-5;
  fontSize: 1-5;        // Base font scale
  headerScale: 1-5;     // Header size scale
}
```

## Section Order

1. Personal Info (header)
2. Summary
3. Work Experience
4. Projects
5. Education
6. Additional (skills, languages, certs, awards)

## ResumeData Schema

```typescript
interface ResumeData {
  personalInfo: PersonalInfo;
  summary: string;
  workExperience: Experience[];
  education: Education[];
  personalProjects: Project[];
  additional: AdditionalInfo;
  sectionMeta: SectionMeta[];      // Order, visibility
  customSections: CustomSection[]; // User-added sections
}
```

## Custom Sections

Users can add custom sections via `AddSectionDialog`:

| Type | Component | Use Case |
|------|-----------|----------|
| text | `GenericTextForm` | Objective, statement |
| itemList | `GenericItemForm` | Publications, research |
| stringList | `GenericListForm` | Hobbies, interests |

## CSS Classes

```css
.resume-section        /* Section wrapper */
.resume-section-title  /* Section heading (h3) */
.resume-items          /* Items container */
.resume-item           /* Single entry (won't page-break) */
```

## Spacing Variables

```css
--section-spacing: calc(4px * var(--spacing-level));
--item-spacing: calc(2px * var(--spacing-level));
--line-height: calc(1.4 + 0.1 * var(--line-height-level));
```

## Adding a Template

1. Create `components/resume/resume-{name}.tsx`
2. Implement `TemplateProps` interface
3. Export from `components/resume/index.ts`
4. Add to `FormattingControls` selector
5. Create thumbnail for preview
