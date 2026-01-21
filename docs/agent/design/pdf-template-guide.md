# PDF Template Guide

> PDF rendering and template editing for resumes and cover letters.

## Rendering Flow

```
Backend: GET /resumes/{id}/pdf
├── Build URL: {frontend}/print/resumes/{id}?params
├── Playwright opens headless Chrome
├── Waits for .resume-print selector
├── Waits for document.fonts.ready
├── Generates PDF (zero margins, print_background=true)
└── Returns PDF bytes
```

## Print Routes

| Route | Selector | Output |
|-------|----------|--------|
| `/print/resumes/[id]` | `.resume-print` | Resume PDF |
| `/print/cover-letter/[id]` | `.cover-letter-print` | Cover letter PDF |

## Query Parameters

| Param | Default | Range |
|-------|---------|-------|
| template | swiss-single | swiss-single, swiss-two-column |
| pageSize | A4 | A4, LETTER |
| marginTop/Bottom/Left/Right | 10 | 5-25mm |
| sectionSpacing | 3 | 1-5 |
| itemSpacing | 2 | 1-5 |
| lineHeight | 3 | 1-5 |
| fontSize | 3 | 1-5 |
| headerScale | 3 | 1-5 |

## Critical CSS Rule

In `globals.css`, whitelist print classes or PDFs will be blank:

```css
@media print {
  body * { visibility: hidden !important; }
  
  .resume-print,
  .resume-print * { visibility: visible !important; }
  
  .cover-letter-print,
  .cover-letter-print * { visibility: visible !important; }
}
```

## Template Structure

```
components/resume/
├── index.ts                    # Template exports
├── resume-single-column.tsx    # Full-width vertical
└── resume-two-column.tsx       # 65% main + 35% sidebar
```

## Adding New Templates

1. Create `components/resume/resume-{name}.tsx`
2. Export from `components/resume/index.ts`
3. Add to template selector in `formatting-controls.tsx`
4. Add thumbnail preview

## Template Props

```typescript
interface TemplateProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
}
```

## CSS Classes

```css
.resume-section        /* Section container */
.resume-section-title  /* Section heading */
.resume-items          /* Items container */
.resume-item           /* Individual entry (won't split across pages) */
```

## Error Handling

If Playwright can't connect to frontend, returns HTTP 503 with:
```
Cannot connect to frontend for PDF generation.
Please ensure: 1) Frontend is running
              2) FRONTEND_BASE_URL matches your frontend URL
```
