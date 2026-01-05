# Swiss Brutalist Design System - Conversion Prompt

Use this prompt to convert an existing Astro website to match the Swiss International Style / Neo-Brutalist design system.

---

## PROMPT FOR AI ASSISTANT

You are converting an existing website to match a Swiss International Style / Neo-Brutalist design system. Follow these specifications EXACTLY to ensure visual consistency.

---

## 1. COLOR PALETTE

### Primary Colors
```css
/* Background Colors */
--bg-primary: #F0F0E8;      /* Warm off-white - main page background */
--bg-secondary: #E5E5E0;    /* Panel grey - cards, sections */
--bg-tertiary: #D8D8D2;     /* Darker panel - filler elements */
--bg-white: #FFFFFF;        /* Pure white - content areas */

/* Accent Colors */
--accent-blue: #1D4ED8;     /* Hyper Blue (blue-700) - primary actions, links */
--accent-blue-dark: #1E40AF; /* blue-800 - hover state */
--accent-green: #15803D;    /* Signal Green (green-700) - success, download */
--accent-red: #DC2626;      /* Alert Red (red-600) - destructive, delete */
--accent-orange: #F97316;   /* Alert Orange (orange-500) - warning, settings */

/* Text Colors */
--text-primary: #000000;    /* Black - headings, primary text */
--text-secondary: #4B5563;  /* gray-600 - body text */
--text-muted: #9CA3AF;      /* gray-400 - placeholders, hints */
--text-blue: #1D4ED8;       /* blue-700 - links, code comments */
```

### Background Pattern (Grid)
```css
background-image:
  linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px),
  linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px);
background-size: 40px 40px;
```

---

## 2. TYPOGRAPHY

### Font Stack
```css
/* Sans-serif (body text) */
font-family: "Geist Sans", ui-sans-serif, system-ui, sans-serif;

/* Monospace (labels, code, technical text) */
font-family: "Space Grotesk", "Geist Mono", ui-monospace, monospace;

/* Serif (large headings) */
font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
```

### Typography Patterns
```css
/* Page Titles - Large serif */
.page-title {
  font-family: ui-serif, Georgia, serif;
  font-size: 3rem; /* text-5xl to text-7xl */
  font-weight: 400;
  letter-spacing: -0.025em;
  line-height: 0.95;
  color: #000000;
}

/* Section Headers - Monospace uppercase */
.section-header {
  font-family: "Space Grotesk", monospace;
  font-size: 0.875rem; /* text-sm */
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Labels - Small monospace uppercase */
.label {
  font-family: "Space Grotesk", monospace;
  font-size: 0.75rem; /* text-xs */
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6B7280; /* gray-500 */
}

/* Code Comments Style */
.code-comment {
  font-family: "Space Grotesk", monospace;
  font-size: 0.875rem;
  color: #1D4ED8;
  text-transform: uppercase;
}
/* Usage: "// SELECT MODULE" */
```

---

## 3. SPACING & LAYOUT

### Container
```css
.main-container {
  max-width: 86rem; /* ~1376px */
  margin: 0 auto;
  padding: 3rem 1rem; /* py-12 px-4 */
}

@media (min-width: 768px) {
  .main-container {
    padding: 3rem 2rem; /* py-12 px-8 */
  }
}
```

### Grid System
```css
/* Dashboard Grid - 5 columns with gap created by black background */
.card-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  background-color: #000000;
  gap: 1px; /* Creates black lines between cells */
}

@media (min-width: 640px) { grid-template-columns: repeat(2, 1fr); }
@media (min-width: 768px) { grid-template-columns: repeat(3, 1fr); }
@media (min-width: 1024px) { grid-template-columns: repeat(5, 1fr); }

/* Card inside grid */
.grid-card {
  background: #F0F0E8;
  aspect-ratio: 1;
  padding: 1.5rem; /* p-6 */
}

@media (min-width: 768px) {
  .grid-card { padding: 2rem; } /* p-8 */
}
```

### Section Spacing
```css
/* Between major sections */
margin-bottom: 2.5rem; /* space-y-10 */

/* Between subsections */
margin-bottom: 1.5rem; /* space-y-6 */

/* Between form elements */
margin-bottom: 1rem; /* space-y-4 */
```

---

## 4. BORDERS & SHADOWS

### Border Rules
```css
/* CRITICAL: NO ROUNDED CORNERS */
border-radius: 0; /* rounded-none - ALWAYS */

/* Standard border */
border: 1px solid #000000;

/* Heavy border (containers) */
border: 2px solid #000000;
```

### Shadow System (Hard Shadows - NO BLUR)
```css
/* Small shadow (buttons, inputs) */
box-shadow: 2px 2px 0px 0px #000000;

/* Medium shadow (cards, panels) */
box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.1);

/* Large shadow (containers, modals) */
box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.1);

/* Extra large shadow (main container) */
box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.9);
```

---

## 5. INTERACTIVE ELEMENTS

### Buttons

```css
/* Base Button Styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  /* Typography */
  font-family: "Space Grotesk", monospace;
  font-size: 0.875rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;

  /* Sizing */
  height: 2.5rem; /* h-10 */
  padding: 0.5rem 1.5rem; /* py-2 px-6 */

  /* Shape */
  border-radius: 0;
  border: 1px solid #000000;

  /* Transitions */
  transition: all 150ms ease-out;
}

/* Primary Button (Blue) */
.btn-primary {
  background: #1D4ED8;
  color: #FFFFFF;
  box-shadow: 2px 2px 0px 0px #000000;
}
.btn-primary:hover {
  background: #1E40AF;
  transform: translate(1px, 1px);
  box-shadow: none;
}

/* Outline Button */
.btn-outline {
  background: transparent;
  color: #000000;
  box-shadow: 2px 2px 0px 0px #000000;
}
.btn-outline:hover {
  background: #F3F4F6;
  transform: translate(1px, 1px);
  box-shadow: none;
}

/* Destructive Button (Red) */
.btn-danger {
  background: #DC2626;
  color: #FFFFFF;
  box-shadow: 2px 2px 0px 0px #000000;
}

/* Success Button (Green) */
.btn-success {
  background: #15803D;
  color: #FFFFFF;
  box-shadow: 2px 2px 0px 0px #000000;
}

/* Ghost Button (No background) */
.btn-ghost {
  background: transparent;
  color: #000000;
  border: none;
  box-shadow: none;
}
.btn-ghost:hover {
  background: #F3F4F6;
}
```

### Button Sizes
```css
.btn-sm { height: 2rem; padding: 0.25rem 1rem; font-size: 0.75rem; }
.btn-md { height: 2.5rem; padding: 0.5rem 1.5rem; font-size: 0.875rem; }
.btn-lg { height: 3rem; padding: 0.75rem 2rem; font-size: 1rem; }
.btn-icon { height: 2.5rem; width: 2.5rem; padding: 0; }
```

### Form Inputs
```css
.input {
  width: 100%;
  height: 2.25rem; /* h-9 */
  padding: 0.25rem 0.75rem;

  font-family: "Space Grotesk", monospace;
  font-size: 0.875rem;

  background: transparent;
  border: 1px solid #000000;
  border-radius: 0;

  transition: box-shadow 150ms;
}

.input:focus {
  outline: none;
  box-shadow: 0 0 0 1px #1D4ED8;
}

.input::placeholder {
  color: #9CA3AF;
}
```

### Cards (Interactive)
```css
.card {
  background: #F0F0E8;
  padding: 1.5rem;
  aspect-ratio: 1;
  position: relative;
  display: flex;
  flex-direction: column;

  transition: all 200ms ease-in-out;
  cursor: pointer;
}

.card:hover {
  transform: translate(-4px, -4px);
  box-shadow: 6px 6px 0px 0px #000000;
}

/* Card with colored accent */
.card:hover {
  background: #1D4ED8;
  color: #F0F0E8;
}
```

### Status Cards (Non-interactive)
```css
.status-card {
  background: #FFFFFF;
  padding: 1rem;
  border: 1px solid #000000;
  box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.1);
}
```

---

## 6. COMPONENT PATTERNS

### Page Container Pattern
```html
<div class="page-wrapper" style="background: #F0F0E8; min-height: 100vh; padding: 3rem 2rem;">
  <!-- Blue grid pattern background -->

  <div class="main-container" style="max-width: 86rem; margin: 0 auto; border: 1px solid #000; background: #F0F0E8; box-shadow: 8px 8px 0 rgba(0,0,0,0.1);">

    <!-- Header -->
    <header style="border-bottom: 1px solid #000; padding: 2rem 3rem;">
      <h1 class="page-title">DASHBOARD</h1>
      <p class="code-comment">// SELECT MODULE</p>
    </header>

    <!-- Content -->
    <main>
      <!-- Grid or content here -->
    </main>

    <!-- Footer -->
    <footer style="padding: 1rem; background: #F0F0E8; border-top: 1px solid #000;">
      <span class="label">SYSTEM NAME</span>
    </footer>

  </div>
</div>
```

### Section Header Pattern
```html
<div style="display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
  <!-- Icon -->
  <svg class="icon" width="16" height="16">...</svg>
  <h2 class="section-header">Section Title</h2>
</div>
```

### Status Indicator Pattern
```html
<!-- Healthy/Success -->
<div style="display: flex; align-items: center; gap: 0.5rem;">
  <svg class="icon text-green-600"><!-- CheckCircle --></svg>
  <span class="label" style="color: #15803D;">HEALTHY</span>
</div>

<!-- Error/Offline -->
<div style="display: flex; align-items: center; gap: 0.5rem;">
  <svg class="icon text-red-500"><!-- XCircle --></svg>
  <span class="label" style="color: #DC2626;">OFFLINE</span>
</div>
```

### Icon Badge Pattern (Dashboard Cards)
```html
<div style="width: 4rem; height: 4rem; border: 2px solid #000; background: #1D4ED8; color: white; display: flex; align-items: center; justify-content: center;">
  <span style="font-family: monospace; font-weight: 700; font-size: 1.125rem;">M</span>
</div>
```

---

## 7. MODAL / DIALOG

```css
/* Backdrop */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
}

/* Modal Container */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem; /* 40px from edges */
}

/* Modal Content - 80% viewport */
.modal-content {
  width: 100%;
  height: 100%;
  max-width: 1200px;

  background: #FFFFFF;
  border: 2px solid #000000;
  box-shadow: 8px 8px 0px 0px rgba(0,0,0,0.9);

  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Modal Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 2px solid #000000;
  background: #F9FAFB;
}
```

---

## 8. TAILWIND UTILITIES REFERENCE

If using Tailwind CSS, here are the key classes:

```
/* Backgrounds */
bg-[#F0F0E8] bg-[#E5E5E0] bg-white bg-blue-700 bg-green-700 bg-red-600 bg-orange-500

/* Text */
text-black text-gray-500 text-gray-600 text-blue-700 text-green-700 text-red-600

/* Borders */
border border-2 border-black border-black/10

/* Shadows */
shadow-[2px_2px_0px_0px_#000000]
shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]
shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]

/* Typography */
font-mono font-serif font-sans
text-xs text-sm text-lg text-xl text-2xl text-5xl text-7xl
uppercase tracking-wide tracking-wider
font-bold font-medium

/* Spacing */
p-4 p-6 p-8 p-12
gap-2 gap-4 gap-6
space-y-4 space-y-6 space-y-10

/* Layout */
rounded-none (CRITICAL - use everywhere)
aspect-square

/* Hover Effects */
hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none
hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000]
hover:bg-blue-700 hover:text-white
```

---

## 9. DO's AND DON'Ts

### DO:
- Use `rounded-none` everywhere - NO rounded corners
- Use hard shadows (no blur): `box-shadow: Xpx Xpx 0px 0px`
- Use monospace font for labels, technical text, and buttons
- Use uppercase for labels and buttons
- Use 1px black borders consistently
- Keep high contrast (black on light backgrounds)
- Use the warm off-white (#F0F0E8) as primary background
- Use code-comment style (// COMMENT) for decorative text

### DON'T:
- Don't use `rounded-*` classes (except `rounded-none`)
- Don't use blurred shadows (`blur` in shadow)
- Don't use gradients (except for the subtle background grid)
- Don't use low-contrast color combinations
- Don't use cursive or decorative fonts
- Don't use soft, muted color palettes
- Don't use drop shadows with blur

---

## 10. CONVERSION CHECKLIST

When converting your Astro site:

1. [ ] Replace all `rounded-*` with `rounded-none`
2. [ ] Update shadows to hard shadows (0px blur)
3. [ ] Change background to #F0F0E8
4. [ ] Add background grid pattern to main wrapper
5. [ ] Update button styles (uppercase, monospace, hard shadow)
6. [ ] Add 1px or 2px black borders to containers
7. [ ] Update typography (serif for titles, monospace for labels)
8. [ ] Add hover effects (translate + shadow removal)
9. [ ] Update color palette to blue/green/red/orange accents
10. [ ] Add code-comment style decorative text
11. [ ] Update form inputs (no rounded, black border)
12. [ ] Update cards with aspect-ratio and hover effects

---

This design system creates a bold, functional, and memorable aesthetic inspired by Swiss International Style with Neo-Brutalist web design elements.
