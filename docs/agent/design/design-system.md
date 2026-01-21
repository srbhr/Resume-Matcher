# Design System

> Extended design system for Resume Matcher Swiss International Style.

## Spacing Scale

```
xs: 4px    (p-1)
sm: 8px    (p-2)
md: 16px   (p-4)
lg: 24px   (p-6)
xl: 32px   (p-8)
2xl: 48px  (p-12)
```

## Typography Scale

```
xs:   12px / 1.4
sm:   14px / 1.5
base: 16px / 1.6
lg:   18px / 1.55
xl:   20px / 1.5
2xl:  24px / 1.4
3xl:  30px / 1.3
4xl:  36px / 1.2
```

## Shadows

```css
/* Button */
shadow-[2px_2px_0px_0px_#000000]

/* Card */
shadow-[4px_4px_0px_0px_#000000]

/* Resume preview */
shadow-[8px_8px_0px_0px_#000000]

/* Hover effect */
hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none
```

## Component Tokens

### Button Variants
| Variant | BG | Text |
|---------|-----|------|
| default | `bg-blue-700` | white |
| success | `bg-green-700` | white |
| destructive | `bg-red-600` | white |
| warning | `bg-orange-500` | white |
| outline | transparent | black |

### Alert Styles
```jsx
danger:  "bg-red-100 border-2 border-red-600"
warning: "bg-orange-100 border-2 border-orange-600"
success: "bg-green-100 border-2 border-green-700"
info:    "bg-blue-100 border-2 border-blue-700"
```

## Layout Patterns

### Dashboard Grid
```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
```

### Two-Panel Editor
```jsx
<div className="flex h-full">
  <div className="w-1/2 border-r">Editor</div>
  <div className="w-1/2">Preview</div>
</div>
```

### Panel Headers
```jsx
// Editor panel
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-blue-700" />
  <span className="font-mono text-xs uppercase">Editor Panel</span>
</div>

// Preview panel
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-green-700" />
  <span className="font-mono text-xs uppercase">Live Preview</span>
</div>
```

## Page Dimensions

```typescript
const PAGE_SIZES = {
  A4: { width: 210, height: 297 },     // mm
  LETTER: { width: 215.9, height: 279.4 }
};

// Convert mm to px at 96 DPI
const mmToPx = (mm: number) => mm * 3.7795275591;
```
