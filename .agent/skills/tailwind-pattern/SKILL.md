---
name: tailwind-patterns
description: |
  Production-ready Tailwind CSS patterns for common website components: responsive layouts, cards, navigation, forms, buttons, and typography. Includes spacing scale, breakpoints, mobile-first patterns, and dark mode support.

  Use when building UI components, creating landing pages, styling forms, implementing navigation, or fixing responsive layouts.
---

# Tailwind CSS Component Patterns

**Status**: Production Ready ✅
**Last Updated**: 2026-01-14
**Tailwind Compatibility**: v3.x and v4.x
**Source**: Production projects, shadcn/ui patterns

---

## Quick Start

### Essential Patterns

```tsx
// Section Container
<section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
  {/* content */}
</section>

// Card Base
<div className="bg-card text-card-foreground rounded-lg border border-border p-6">
  {/* content */}
</div>

// Button Primary
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
  Click me
</button>

// Responsive Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* items */}
</div>
```

---

## Spacing Scale

Consistent spacing prevents design drift:

| Usage | Classes | Output |
|-------|---------|--------|
| **Tight spacing** | `gap-2 p-2 space-y-2` | 0.5rem (8px) |
| **Standard spacing** | `gap-4 p-4 space-y-4` | 1rem (16px) |
| **Comfortable** | `gap-6 p-6 space-y-6` | 1.5rem (24px) |
| **Loose** | `gap-8 p-8 space-y-8` | 2rem (32px) |
| **Section spacing** | `py-16 sm:py-24` | 4rem/6rem (64px/96px) |

**Standard Pattern**: Use increments of 4 (4, 6, 8, 12, 16, 24)

---

## Responsive Breakpoints

Mobile-first approach (base styles = mobile, add larger breakpoints):

| Breakpoint | Min Width | Pattern | Example |
|------------|-----------|---------|---------|
| **Base** | 0px | No prefix | `text-base` |
| **sm** | 640px | `sm:` | `sm:text-lg` |
| **md** | 768px | `md:` | `md:grid-cols-2` |
| **lg** | 1024px | `lg:` | `lg:px-8` |
| **xl** | 1280px | `xl:` | `xl:max-w-7xl` |
| **2xl** | 1536px | `2xl:` | `2xl:text-6xl` |

```tsx
// Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

---

## Container Patterns

### Standard Page Container

```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  {/* content */}
</div>
```

**Variations**:
- `max-w-4xl` - Narrow content (blog posts)
- `max-w-5xl` - Medium content
- `max-w-6xl` - Wide content
- `max-w-7xl` - Full width (default)

### Section Spacing

```tsx
<section className="py-16 sm:py-24">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    {/* content */}
  </div>
</section>
```

---

## Card Patterns

### Basic Card

```tsx
<div className="bg-card text-card-foreground rounded-lg border border-border p-6">
  <h3 className="text-lg font-semibold mb-2">Card Title</h3>
  <p className="text-muted-foreground">Card description goes here.</p>
</div>
```

### Feature Card with Icon

```tsx
<div className="bg-card text-card-foreground rounded-lg border border-border p-6 hover:shadow-lg transition-shadow">
  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
    {/* Icon */}
  </div>
  <h3 className="text-lg font-semibold mb-2">Feature Title</h3>
  <p className="text-muted-foreground">Feature description.</p>
</div>
```

### Pricing Card

```tsx
<div className="bg-card text-card-foreground rounded-lg border-2 border-border p-8 relative">
  <div className="text-sm font-semibold text-primary mb-2">Pro Plan</div>
  <div className="text-4xl font-bold mb-1">$29<span className="text-lg text-muted-foreground">/mo</span></div>
  <p className="text-muted-foreground mb-6">For growing teams</p>
  <button className="w-full bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90">
    Get Started
  </button>
</div>
```

See `references/card-patterns.md` for more variants.

---

## Grid Layouts

### Auto-Responsive Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### Auto-Fit Grid (Dynamic Columns)

```tsx
<div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
  {/* Automatically adjusts columns based on available space */}
</div>
```

### Masonry-Style Grid

```tsx
<div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
  {items.map(item => (
    <div key={item.id} className="break-inside-avoid">
      <Card {...item} />
    </div>
  ))}
</div>
```

---

## Button Patterns

```tsx
// Primary
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
  Primary
</button>

// Secondary
<button className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80">
  Secondary
</button>

// Outline
<button className="border border-border bg-transparent px-4 py-2 rounded-md hover:bg-accent">
  Outline
</button>

// Ghost
<button className="bg-transparent px-4 py-2 rounded-md hover:bg-accent hover:text-accent-foreground">
  Ghost
</button>

// Destructive
<button className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md hover:bg-destructive/90">
  Delete
</button>
```

**Size Variants**:
- Small: `px-3 py-1.5 text-sm`
- Default: `px-4 py-2`
- Large: `px-6 py-3 text-lg`

See `references/button-patterns.md` for full reference.

---

## Form Patterns

### Input Field

```tsx
<div className="space-y-2">
  <label htmlFor="email" className="text-sm font-medium">
    Email
  </label>
  <input
    id="email"
    type="email"
    className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
    placeholder="you@example.com"
  />
</div>
```

### Select Dropdown

```tsx
<select className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Checkbox

```tsx
<div className="flex items-center space-x-2">
  <input
    id="terms"
    type="checkbox"
    className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
  />
  <label htmlFor="terms" className="text-sm">
    I agree to the terms
  </label>
</div>
```

### Error State

```tsx
<div className="space-y-2">
  <label htmlFor="password" className="text-sm font-medium">
    Password
  </label>
  <input
    id="password"
    type="password"
    className="w-full px-3 py-2 bg-background border border-destructive rounded-md focus:outline-none focus:ring-2 focus:ring-destructive"
  />
  <p className="text-sm text-destructive">Password must be at least 8 characters</p>
</div>
```

See `references/form-patterns.md` for complete patterns.

---

## Typography Patterns

### Headings

```tsx
<h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
  Page Title
</h1>

<h2 className="text-3xl sm:text-4xl font-bold">
  Section Title
</h2>

<h3 className="text-2xl sm:text-3xl font-semibold">
  Subsection
</h3>

<h4 className="text-xl font-semibold">
  Card Title
</h4>
```

### Body Text

```tsx
<p className="text-base text-muted-foreground">
  Regular paragraph text.
</p>

<p className="text-lg text-muted-foreground leading-relaxed">
  Larger body text with comfortable line height.
</p>

<p className="text-sm text-muted-foreground">
  Small supporting text or captions.
</p>
```

### Lists

```tsx
<ul className="space-y-2 text-muted-foreground">
  <li className="flex items-start">
    <CheckIcon className="h-5 w-5 text-primary mr-2 mt-0.5" />
    <span>Feature one</span>
  </li>
  <li className="flex items-start">
    <CheckIcon className="h-5 w-5 text-primary mr-2 mt-0.5" />
    <span>Feature two</span>
  </li>
</ul>
```

See `references/typography-patterns.md` for complete guide.

---

## Navigation Patterns

### Header with Logo

```tsx
<header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex h-16 items-center justify-between">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <a href="/" className="font-bold text-xl">Brand</a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-6">
          <a href="#" className="text-sm hover:text-primary transition-colors">Features</a>
          <a href="#" className="text-sm hover:text-primary transition-colors">Pricing</a>
          <a href="#" className="text-sm hover:text-primary transition-colors">About</a>
        </nav>
      </div>

      {/* CTA */}
      <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm">
        Sign Up
      </button>
    </div>
  </div>
</header>
```

### Footer

```tsx
<footer className="border-t border-border bg-muted/50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
      <div>
        <h4 className="font-semibold mb-4">Product</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li><a href="#" className="hover:text-primary">Features</a></li>
          <li><a href="#" className="hover:text-primary">Pricing</a></li>
        </ul>
      </div>
      {/* More columns */}
    </div>
  </div>
</footer>
```

See `references/navigation-patterns.md` for mobile menus and dropdowns.

---

## Dark Mode Support

All patterns use semantic color tokens that automatically adapt:

| Token | Light Mode | Dark Mode |
|-------|------------|-----------|
| `bg-background` | White | Dark gray |
| `text-foreground` | Dark gray | White |
| `bg-card` | White | Slightly lighter gray |
| `text-muted-foreground` | Gray | Light gray |
| `border-border` | Light gray | Dark gray |
| `bg-primary` | Brand color | Lighter brand color |

**Never use raw colors** like `bg-blue-500` - always use semantic tokens.

See `references/dark-mode-patterns.md` for theme toggle implementation.

---

## Common Class Combinations

### Section with Heading

```tsx
<section className="py-16 sm:py-24">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
      Section Title
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* content */}
    </div>
  </div>
</section>
```

### Centered Content

```tsx
<div className="flex flex-col items-center justify-center text-center">
  <h1 className="text-4xl font-bold mb-4">Centered Title</h1>
  <p className="text-muted-foreground max-w-2xl">Centered description</p>
</div>
```

### Hover Effects

```tsx
// Lift on hover
<div className="transition-transform hover:scale-105">

// Shadow on hover
<div className="transition-shadow hover:shadow-lg">

// Color change on hover
<button className="transition-colors hover:bg-primary/90">
```

---

## Critical Rules

### ✅ Always Do

1. Use semantic color tokens (`bg-card`, `text-foreground`)
2. Apply mobile-first responsive design (`base → sm: → md:`)
3. Use consistent spacing scale (4, 6, 8, 12, 16, 24)
4. Add `transition-*` classes for smooth interactions
5. Test in both light and dark modes

### ❌ Never Do

1. Use raw Tailwind colors (`bg-blue-500` breaks themes)
2. Skip responsive prefixes (mobile users suffer)
3. Mix spacing scales randomly (creates visual chaos)
4. Forget hover states on interactive elements
5. Use fixed px values for text (`text-base` not `text-[16px]`)

---

## Template Components

Ready-to-use components in `templates/components/`:

- **hero-section.tsx** - Responsive hero with CTA
- **feature-grid.tsx** - 3-column feature grid with icons
- **contact-form.tsx** - Full form with validation styles
- **footer.tsx** - Multi-column footer with links

Copy and customize for your project.

---

## Reference Documentation

### Resume Matcher Design System (Swiss International Style)

This project uses **Swiss International Style (Brutalist)** design. For project-specific patterns:

- **[style-guide.md](docs/agent/design/style-guide.md)** - Core Swiss style rules, colors, typography
- **[design-system.md](docs/agent/design/design-system.md)** - Extended spacing, shadows, tokens
- **[swiss-design-system-prompt.md](docs/agent/design/swiss-design-system-prompt.md)** - AI prompt for generating Swiss-style UI

**Key Swiss Style Overrides:**
```tsx
// NO rounded corners - use rounded-none
<button className="rounded-none border-2 border-black">

// Hard shadows instead of soft
<div className="shadow-[4px_4px_0px_0px_#000000]">

// Hover: translate into shadow space
<button className="hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none">
```

**Swiss Color Palette:**
| Color | Hex | Usage |
|-------|-----|-------|
| Canvas | `#F0F0E8` | Background |
| Ink | `#000000` | Text, borders |
| Hyper Blue | `#1D4ED8` | Primary actions |
| Signal Green | `#15803D` | Success |
| Alert Orange | `#F97316` | Warning |
| Alert Red | `#DC2626` | Danger |

---

## Official Documentation

- **Tailwind CSS**: https://tailwindcss.com/docs

---

**Last Updated**: 2026-01-14
**Skill Version**: 1.0.0
**Production**: Tested across 10+ projects