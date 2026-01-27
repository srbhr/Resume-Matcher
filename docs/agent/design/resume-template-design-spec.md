# Resume Template Design Spec

> Swiss International Style specifications for resume templates.

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Name | serif | 2xl | bold |
| Title | serif | lg | normal |
| Section heading | serif | lg | semibold |
| Job title | sans | base | semibold |
| Company | sans | sm | medium |
| Body text | sans | sm | normal |
| Metadata | mono | xs | normal |

## Spacing

| Element | Spacing |
|---------|---------|
| Between sections | 16-24px |
| Between items | 8-12px |
| Line height | 1.4-1.6 |

## Colors

```
Text: #000000 (Ink)
Links: #1D4ED8 (Hyper Blue)
Dividers: #E5E5E0
Background: #FFFFFF
```

## Section Order

1. Header (name, title, contact)
2. Summary
3. Work Experience
4. Projects
5. Education
6. Additional (skills, languages, certs, awards)

## Two-Column Layout

```
┌────────────────────┬──────────┐
│     Main (65%)     │ Side 35% │
├────────────────────┼──────────┤
│   Experience       │ Summary  │
│   Projects         │ Education│
│   Certifications   │ Skills   │
│                    │ Languages│
│                    │ Awards   │
└────────────────────┴──────────┘
```

## CSS Classes

```css
.resume-section        /* Section wrapper */
.resume-section-title  /* Heading */
.resume-items          /* Item container */
.resume-item           /* Single entry */
```

## Print Considerations

- Never split `.resume-item` across pages
- Never orphan section headers
- Minimum 50% page fill before break
