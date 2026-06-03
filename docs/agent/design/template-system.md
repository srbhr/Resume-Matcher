# Template System

> Resume template architecture and customization.

## Templates

| Template          | Layout                              | Best For                                 |
| ----------------- | ----------------------------------- | ---------------------------------------- |
| swiss-single      | Full-width vertical                 | 1-2 page resumes                         |
| swiss-two-column  | 65% main + 35% sidebar              | Dense content                            |
| modern            | Single column, accent headers       | Colorful single-column                   |
| modern-two-column | 65% main + 35% sidebar, accent      | Colorful dense content                   |
| latex             | Single column, serif, ruled headers | Classic/academic résumés                 |
| clean             | Single column, minimal sans         | Understated modern résumés               |
| vivid             | 63% main + 37% sidebar, accent      | Colorful Awesome-CV style (accent color) |

## File Structure

```
components/resume/
├── index.ts                      # Re-exports all templates
├── resume-single-column.tsx      # swiss-single
├── resume-two-column.tsx         # swiss-two-column
├── resume-modern.tsx             # modern
├── resume-modern-two-column.tsx  # modern-two-column
├── resume-latex.tsx              # latex
├── resume-clean.tsx              # clean
├── resume-vivid.tsx              # vivid
├── dynamic-resume-section.tsx    # shared custom-section renderer
├── safe-html.tsx                 # sanitized rich-text renderer
└── styles/                       # *.module.css per template + _base/_tokens
```

## Template Settings

Authoritative definition: `apps/frontend/lib/types/template-settings.ts` (`TemplateSettings`,
`DEFAULT_TEMPLATE_SETTINGS`, and the CSS-variable maps). Current shape:

```typescript
interface TemplateSettings {
  template:
    | "swiss-single"
    | "swiss-two-column"
    | "modern"
    | "modern-two-column"
    | "latex"
    | "clean"
    | "vivid";
  pageSize: "A4" | "LETTER";
  margins: { top: number; bottom: number; left: number; right: number }; // 5-25mm each
  spacing: {
    section: 1 | 2 | 3 | 4 | 5;
    item: 1 | 2 | 3 | 4 | 5;
    lineHeight: 1 | 2 | 3 | 4 | 5;
  };
  fontSize: {
    base: 1 | 2 | 3 | 4 | 5;
    headerScale: 1 | 2 | 3 | 4 | 5;
    headerFont: "serif" | "sans-serif" | "mono";
    bodyFont: "serif" | "sans-serif" | "mono";
  };
  compactMode: boolean;
  showContactIcons: boolean;
  accentColor: "blue" | "green" | "orange" | "red"; // modern, modern-two-column, vivid
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
  sectionMeta: SectionMeta[]; // Order, visibility
  customSections: CustomSection[]; // User-added sections
}
```

## Custom Sections

Users can add custom sections via `AddSectionDialog`:

| Type       | Component         | Use Case               |
| ---------- | ----------------- | ---------------------- |
| text       | `GenericTextForm` | Objective, statement   |
| itemList   | `GenericItemForm` | Publications, research |
| stringList | `GenericListForm` | Hobbies, interests     |

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
