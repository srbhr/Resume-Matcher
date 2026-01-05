---
name: design-principles
description: Swiss International Style design system for Resume Matcher. Use this skill when building UI components, modifying styles, or creating new pages. Every frontend change MUST follow these rules.
---

# Resume Matcher Design System: Swiss International Style

This project follows a strict **Swiss International Style** (International Typographic Style) aesthetic. It emphasizes cleanliness, readability, objectivity, and strong grid structures. The design is "Brutalist-Lite" — raw, functional, but polished.

---

## Core Philosophy

- **Form follows function**: content is primary
- **Grid Systems**: mathematically consistent layouts
- **High Contrast**: Sharp borders, distinct colors
- **Typography**: Hierarchy through size, weight, and font family mixing (Serif + Mono)

---

## Color Palette

The palette is minimal, relying on high contrast between ink and paper.

| Color Name | Hex / Tailwind | Usage |
|------------|----------------|-------|
| **Canvas Cream** | `#F0F0E8` | Main application background. Simulates paper. |
| **Panel Grey** | `#E5E5E0` | Secondary backgrounds, workspaces, unselected areas. |
| **Ink Black** | `#000000` | Borders, primary text, grid lines, hard shadows. |
| **Hyper Blue** | `#1D4ED8` (blue-700) | Primary actions, links, active states, accents. |
| **Paper White** | `#FFFFFF` | Input fields, active cards, resume pages. |
| **Signal Green** | `#15803D` (green-700) | Download actions, live status indicators. |
| **Alert Orange** | `#F97316` (orange-500) | Reset actions, highlights. |
| **Alert Red** | `#DC2626` (red-600) | Destructive actions, delete confirmations. |
| **Steel Grey** | `#4B5563` (gray-600) | Secondary labels like Live Preview text. |
| **Muted Text** | `text-gray-500` | Metadata, placeholders, descriptions. |

---

## Typography

We mix three typefaces to create a distinctive technical document feel.

### Headings: Serif
Used for major page titles and section headers. Represents authority and tradition.
- **Class**: `font-serif`
- **Style**: Bold, often Uppercase
- **Tracking**: Tight (`tracking-tight`) for large headers

### Body: Sans-Serif
Used for long-form text, descriptions, and general readability.
- **Class**: `font-sans`
- **Style**: Regular weight, clean

### Metadata / Technical: Monospace
Used for labels, dates, locations, small details, and "system" text.
- **Class**: `font-mono`
- **Style**: Uppercase, tracking wide (`tracking-wider`), small size (`text-xs` or `text-sm`)
- **Prefixes**: Often stylized with `//` (e.g., `// SELECT MODULE`)

---

## Components & Shapes

### Borders & Radius
- **Borders**: Always solid, 1px Black (`border border-black`)
- **Radius**: **Zero**. `rounded-none`. No soft curves.

### Shadows (Hard Drops)
Shadows are solid blocks of color/alpha, not diffuse blurs. They mimic paper cutout layers.

**Primary Swiss-Style Shadows (solid black):**
- **Resume/Large Content**: `shadow-[8px_8px_0px_0px_#000000]`
- **Builder Preview**: `shadow-[6px_6px_0px_0px_#000000]`
- **Buttons (Hover)**: `shadow-[2px_2px_0px_0px_#000000]`

**Secondary Shadows (semi-transparent):**
- **Page Containers**: `shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]`
- **Cards / Forms**: `shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]`

**Important:** Resume components should NOT have internal shadows. The parent container provides the Swiss-style shadow.

---

## Buttons

Swiss-style buttons use hard shadows, square corners, and clear semantic colors.

### Base Styling (All Buttons)
```css
rounded-none                           /* Square corners - Brutalist */
border border-black                    /* High contrast border */
shadow-[2px_2px_0px_0px_#000000]       /* Hard shadow (no blur) */
font-mono uppercase tracking-wide      /* Technical typography */
transition-all duration-150 ease-out   /* Smooth interactions */
```

### Hover/Active Behavior
```css
hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none  /* Press effect */
active:translate-y-[2px] active:translate-x-[2px]                   /* Deep press */
```

### Button Variants

| Variant | Color | Hex | Use Case |
|---------|-------|-----|----------|
| **default** | Hyper Blue | `#1D4ED8` | Primary actions (Save, Submit) |
| **destructive** | Alert Red | `#DC2626` | Dangerous actions (Delete) |
| **success** | Signal Green | `#15803D` | Positive actions (Download) |
| **warning** | Alert Orange | `#F97316` | Caution actions (Reset, Undo) |
| **outline** | Transparent | Black border | Secondary actions (Cancel) |
| **secondary** | Panel Grey | `#E5E5E0` | Tertiary actions |
| **ghost** | Transparent | No border/shadow | Icon buttons |
| **link** | Hyper Blue text | `#1D4ED8` | Inline links |

### Button Sizes

| Size | Height | Padding | Use Case |
|------|--------|---------|----------|
| **sm** | `h-8` | `px-4 py-1` | Compact UI, toolbars |
| **default** | `h-10` | `px-6 py-2` | Standard buttons |
| **lg** | `h-12` | `px-8 py-3` | Hero CTAs |
| **icon** | `h-10 w-10` | `p-0` | Icon-only buttons |

### Usage Examples
```tsx
<Button variant="default">Save Changes</Button>
<Button variant="destructive">Delete Resume</Button>
<Button variant="success">Download PDF</Button>
<Button variant="warning">Reset Form</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost" size="icon"><Settings /></Button>
```

### DO's and DON'Ts

**DO:**
- Use semantic variants (destructive for delete, success for download)
- Use `outline` for cancel/back actions paired with primary buttons
- Use `ghost` for icon-only buttons in toolbars

**DON'T:**
- Add `rounded-*` classes (always square)
- Use custom colors inline (use variants)
- Use soft/blurred shadows

---

## Status Indicators

Small colored squares for at-a-glance system state information.

### Base Styling
```css
w-3 h-3                          /* 12x12px square */
/* No rounded corners - sharp edges */
```

### Indicator Variants

| Color | Tailwind Class | Use Case |
|-------|----------------|----------|
| **Hyper Blue** | `bg-blue-700` | Active sections, editor mode |
| **Signal Green** | `bg-green-700` | Ready state, success |
| **Alert Amber** | `bg-amber-500` | Warning, setup required |
| **Alert Red** | `bg-red-600` | Error, offline |
| **Steel Grey** | `bg-gray-500` | Inactive, disabled |

### Usage Pattern
```tsx
<div className="flex items-center gap-2 border-b-2 border-black pb-2">
  <div className="w-3 h-3 bg-blue-700"></div>
  <h2 className="font-mono text-lg font-bold uppercase tracking-wider">
    Editor Panel
  </h2>
</div>
```

---

## Inputs & Forms

- **Background**: White or Transparent
- **Borders**: Black, square (`rounded-none`)
- **Focus**: Sharp blue ring or border color change. No soft glow.
- **Labels**: Uppercase Monospace (`text-xs font-mono uppercase tracking-wider`)

---

## Collapsible Panels

```tsx
<div className="border border-black bg-white">
  {/* Header - Always Visible */}
  <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50">
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-blue-700"></div>
      <span className="font-mono text-xs font-bold uppercase tracking-wider">
        Panel Title
      </span>
    </div>
    <ChevronUp />
  </button>

  {/* Expandable Content */}
  <div className="border-t border-black p-4 space-y-6">
    {/* Controls */}
  </div>
</div>
```

---

## Template Thumbnails

```tsx
<button className={`flex flex-col items-center p-2 border-2 transition-all ${
  isActive
    ? 'border-blue-700 bg-blue-50 shadow-[2px_2px_0px_0px_#1D4ED8]'
    : 'border-black bg-white hover:bg-gray-50 hover:shadow-[1px_1px_0px_0px_#000]'
}`}>
  <div className="w-12 h-16 mb-1.5">{/* Thumbnail */}</div>
  <span className={`font-mono text-[9px] uppercase tracking-wider font-bold ${
    isActive ? 'text-blue-700' : 'text-gray-700'
  }`}>
    Template Name
  </span>
</button>
```

---

## Toggle Selectors

Binary choices (A4 / US Letter):
```tsx
<button className={`flex-1 px-3 py-2 border-2 font-mono text-xs transition-all ${
  isSelected
    ? 'border-blue-700 bg-blue-50 text-blue-700 shadow-[2px_2px_0px_0px_#1D4ED8]'
    : 'border-black bg-white text-gray-700 hover:bg-gray-50'
}`}>
  <div className="font-bold">A4</div>
  <div className="text-[9px] opacity-70">210 × 297 mm</div>
</button>
```

---

## Spacing Level Selectors

Button groups for levels 1-5:
```tsx
<div className="flex gap-1">
  {[1, 2, 3, 4, 5].map((level) => (
    <button className={`w-6 h-6 font-mono text-xs border transition-all ${
      isSelected
        ? 'bg-blue-700 text-white border-blue-700 shadow-[1px_1px_0px_0px_#000]'
        : 'bg-white text-gray-700 border-gray-300 hover:border-black'
    }`}>
      {level}
    </button>
  ))}
</div>
```

---

## Layout Patterns

### The "Canvas" Container
```tsx
<div className="w-full max-w-7xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
  {/* Content */}
</div>
```

### Full-Height Editor Layout
```tsx
<div className="h-screen w-full bg-[#F0F0E8] flex justify-center items-center p-4 md:p-8">
  <div className="w-full h-full max-w-[95%] xl:max-w-[1800px] border border-black flex flex-col">
    {/* Header */}
    <div className="border-b border-black p-6 md:p-8">...</div>

    {/* Content grid */}
    <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px] flex-1 min-h-0">
      <div className="bg-[#F0F0E8] p-6 md:p-8 overflow-y-auto">...</div>
      <div className="bg-[#E5E5E0] p-6 md:p-8 overflow-y-auto">...</div>
    </div>

    {/* Footer */}
    <div className="p-4 border-t border-black">...</div>
  </div>
</div>
```

### Grid Lines Background
```tsx
style={{
  backgroundImage: 'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
}}
```

---

## Paginated Preview System

### Page Dimensions

| Page Size | Width | Height |
|-----------|-------|--------|
| **A4** | 210mm | 297mm |
| **US Letter** | 215.9mm | 279.4mm |

### PageContainer Component
```tsx
<PageContainer
  pageSize="A4"
  margins={{ top: 10, bottom: 10, left: 10, right: 10 }}
  pageNumber={1}
  totalPages={2}
  scale={0.6}
  showMarginGuides={false}
>
  <Resume ... />
</PageContainer>
```

### Page Break Rules
1. **Sections CAN span pages** - Experience, Projects flow naturally
2. **Individual items stay together** - Job entries don't split
3. **50% minimum fill** - Pages at least half full before moving items
4. **Section titles protected** - No orphans at page bottom

### CSS for Page Breaks
```css
.resume-body .resume-item {
  break-inside: avoid;
  page-break-inside: avoid;
}

.resume-body .resume-section-title {
  break-after: avoid;
  page-break-after: avoid;
}
```

---

## Quick Reference

### Required Classes

| Element | Classes |
|---------|---------|
| Headers | `font-serif font-bold tracking-tight` |
| Body text | `font-sans` |
| Labels/Meta | `font-mono text-xs uppercase tracking-wider` |
| Borders | `border border-black rounded-none` |
| Primary BG | `bg-[#F0F0E8]` |
| Panel BG | `bg-[#E5E5E0]` |
| Hard shadow | `shadow-[Xpx_Xpx_0px_0px_#000000]` |

### Semantic Colors

| Purpose | Color | Class |
|---------|-------|-------|
| Primary action | Hyper Blue | `bg-blue-700 text-white` |
| Success | Signal Green | `bg-green-700 text-white` |
| Warning | Alert Orange | `bg-orange-500 text-white` |
| Destructive | Alert Red | `bg-red-600 text-white` |
| Secondary | Panel Grey | `bg-[#E5E5E0] text-black` |

---

## Retro Terminal Elements (UI Chrome Only)

These elements add personality to the app interface. **DO NOT use these on resume builder, resume viewer, or any resume-related components.**

### Where to Use
- Dashboard
- Settings page
- Navigation/sidebar
- Empty states
- Loading states
- Error pages
- Modals (non-resume)

### Where NOT to Use
- Resume Builder form
- Resume Preview/Viewer
- PDF output
- Print layouts
- Any component that displays resume content

---

### Bracket Syntax for Labels

Use brackets for status indicators and system labels in UI chrome:

```tsx
// Status indicators
<span className="font-mono text-xs uppercase tracking-wider">
  [ STATUS: READY ]
</span>

<span className="font-mono text-xs uppercase tracking-wider">
  [ LOADING... ]
</span>

// Section labels
<span className="font-mono text-xs uppercase tracking-wider text-gray-500">
  [ SETTINGS ]
</span>

// Navigation items (optional)
<span className="font-mono text-sm">
  [ 01. DASHBOARD ]
</span>
```

**Bracket Variants:**

| Context | Format | Example |
|---------|--------|---------|
| Status ready | `[ STATUS: X ]` | `[ STATUS: READY ]` |
| Status warning | `[ STATUS: X ]` | `[ STATUS: SETUP REQUIRED ]` |
| Section label | `[ LABEL ]` | `[ SETTINGS ]` |
| Action hint | `[ ACTION ]` | `[ DRAG TO REORDER ]` |
| System message | `> MESSAGE` | `> NO ITEMS FOUND` |

---

### ASCII Empty States

Use ASCII art for empty states to add character:

```tsx
// Empty resume list
<div className="text-center py-12 font-mono text-gray-500">
  <pre className="text-xs leading-relaxed">
{`    ┌─────────────────┐
    │                 │
    │   NO RESUMES    │
    │      YET        │
    │                 │
    └─────────────────┘`}
  </pre>
  <p className="mt-4 text-sm">[ CREATE YOUR FIRST RESUME ]</p>
</div>

// Empty job list
<div className="text-center py-12 font-mono text-gray-500">
  <pre className="text-xs leading-relaxed">
{`    ╔═══════════════════╗
    ║                   ║
    ║   NO JOBS SAVED   ║
    ║                   ║
    ╚═══════════════════╝`}
  </pre>
  <p className="mt-4 text-sm">[ ADD A JOB DESCRIPTION ]</p>
</div>

// Generic empty state
<div className="text-center py-8 font-mono text-gray-400">
  <span className="text-2xl">[ EMPTY ]</span>
  <p className="mt-2 text-xs">> NO DATA AVAILABLE</p>
</div>
```

**ASCII Box Characters:**
```
Single line: ┌ ┐ └ ┘ │ ─ ├ ┤ ┬ ┴ ┼
Double line: ╔ ╗ ╚ ╝ ║ ═ ╠ ╣ ╦ ╩ ╬
Mixed:       ╒ ╕ ╘ ╛ ╞ ╡ ╤ ╧ ╪
```

---

### Loading States

**Keep spinners for async operations** - users need visual feedback that something is happening. Combine spinners with bracket-style labels:

```tsx
// Standard loading - spinner + bracket label
<div className="flex items-center gap-2">
  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
  <span className="font-mono text-xs uppercase tracking-wider">
    [ PROCESSING ]
  </span>
</div>

// LLM/AI operations - spinner with context
<div className="flex items-center gap-2">
  <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
  <span className="font-mono text-xs uppercase tracking-wider">
    [ GENERATING CONTENT ]
  </span>
</div>

// Saving state
<div className="flex items-center gap-2">
  <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
  <span className="font-mono text-xs text-gray-500">
    [ SAVING... ]
  </span>
</div>
```

**Completion states** - clear transition from loading to done:

```tsx
// Success completion
<div className="flex items-center gap-2">
  <Check className="w-4 h-4 text-green-700" />
  <span className="font-mono text-xs uppercase tracking-wider text-green-700">
    [ COMPLETE ]
  </span>
</div>

// With detail
<div className="flex items-center gap-2">
  <Check className="w-4 h-4 text-green-700" />
  <span className="font-mono text-xs text-green-700">
    [ SAVED SUCCESSFULLY ]
  </span>
</div>
```

**Progress bars** - only use when you have REAL progress data:

```tsx
// Deterministic progress (file upload, multi-step process)
<div className="space-y-1">
  <div className="flex justify-between font-mono text-xs">
    <span>[ UPLOADING ]</span>
    <span>{progress}%</span>
  </div>
  <div className="h-2 bg-gray-200 border border-black">
    <div
      className="h-full bg-blue-700 transition-all"
      style={{ width: `${progress}%` }}
    />
  </div>
</div>
```

**DO NOT use ASCII progress bars** like `[████░░░░]` - they look cool but provide no real information for indeterminate operations.

---

### Error States

```tsx
// Error message with brackets
<div className="border border-red-600 bg-red-50 p-4">
  <p className="font-mono text-sm text-red-700">
    [ ERROR: CONNECTION FAILED ]
  </p>
  <p className="font-mono text-xs text-red-600 mt-1">
    > Unable to reach server. Check your connection.
  </p>
</div>

// 404 style
<div className="text-center py-12 font-mono">
  <pre className="text-6xl font-bold text-gray-300">404</pre>
  <p className="text-gray-500 mt-4">[ PAGE NOT FOUND ]</p>
  <p className="text-xs text-gray-400 mt-2">> The requested resource does not exist</p>
</div>
```

---

## Anti-Patterns (NEVER DO)

- **NO rounded corners** - always `rounded-none`
- **NO soft/blurred shadows** - always hard offset shadows
- **NO gradient backgrounds** - flat colors only
- **NO custom colors** - use the defined palette
- **NO spring/bouncy animations**
- **NO thick borders** (2px+) for decoration
- **NO retro elements on resume components** - keep resume areas clean

---

**Summary**: Make it look like a high-end architectural blueprint or a technical manual. Precise, bordered, and grid-aligned. Add retro terminal personality to UI chrome, but keep resume areas professional and clean.
