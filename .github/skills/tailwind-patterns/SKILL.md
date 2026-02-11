---
name: tailwind-patterns
description: |
  Production-ready Tailwind CSS patterns for responsive layouts, cards, navigation, forms, buttons, and typography. Includes spacing scale, breakpoints, mobile-first patterns, dark mode, and Swiss International Style overrides for Resume Matcher.
---

# Tailwind CSS Component Patterns

## Spacing Scale

Use increments of 4: `gap-4`, `p-6`, `py-8`, `space-y-12`, `py-16`, `py-24`

## Responsive Breakpoints (Mobile-First)

| Breakpoint | Min Width | Example |
|------------|-----------|---------|
| Base | 0px | `text-base` |
| sm | 640px | `sm:text-lg` |
| md | 768px | `md:grid-cols-2` |
| lg | 1024px | `lg:px-8` |
| xl | 1280px | `xl:max-w-7xl` |

## Essential Patterns

```tsx
// Page Container
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Responsive Grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Section
<section className="py-16 sm:py-24">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
```

## Swiss International Style Overrides

**Resume Matcher uses Swiss Brutalist design:**

```tsx
// Card (Swiss)
<div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-6">

// Button (Swiss)
<button className="rounded-none border-2 border-black px-4 py-2 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">

// Input (Swiss)
<input className="rounded-none border-2 border-black p-3 font-sans w-full">

// Label (Swiss)
<label className="font-mono text-sm uppercase tracking-wider">
```

### Swiss Colors

| Color | Hex | Tailwind |
|-------|-----|----------|
| Canvas | `#F0F0E8` | `bg-[#F0F0E8]` |
| Ink | `#000000` | `text-black` |
| Hyper Blue | `#1D4ED8` | `bg-blue-700` |
| Signal Green | `#15803D` | `text-green-700` |
| Alert Red | `#DC2626` | `text-red-600` |

### NEVER in Resume Matcher

- `rounded-sm/md/lg/xl/full` (always `rounded-none`)
- `shadow-sm/md/lg/xl` (always hard `shadow-[...]`)
- `bg-gradient-*`, `blur-*`, `backdrop-blur`
- Pastel or off-palette colors

## Button Sizes

- Small: `px-3 py-1.5 text-sm`
- Default: `px-4 py-2`
- Large: `px-6 py-3 text-lg`

## Full Reference

Complete patterns: `.claude/skills/tailwind-pattern/SKILL.md`
Swiss design: `docs/agent/design/style-guide.md`
