# Print PDF Design Spec

> Specifications for PDF rendering in Resume Matcher.

## Page Sizes

| Size | Dimensions |
|------|------------|
| A4 | 210 × 297 mm |
| US Letter | 215.9 × 279.4 mm |

## Print Route

```
/print/resumes/[id]?template=swiss-single&pageSize=A4&marginTop=10...
```

## CSS Requirements

```css
@media print {
  body * { visibility: hidden !important; }
  
  .resume-print,
  .resume-print * { visibility: visible !important; }
}
```

## Playwright Settings

```python
await page.pdf(
    format="A4",          # or "Letter"
    print_background=True,
    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"}
)
```

Margins are applied via HTML padding, not PDF margins (WYSIWYG accuracy).

## Section Break Rules

- Individual `.resume-item` elements stay together
- Section titles never orphaned at page bottom
- Pages must be ≥50% full before breaking to next

## File Locations

| File | Purpose |
|------|---------|
| `app/print/resumes/[id]/page.tsx` | Print route |
| `components/preview/use-pagination.ts` | Page break logic |
| `lib/constants/page-dimensions.ts` | Size constants |
| `apps/backend/app/pdf.py` | Playwright renderer |
