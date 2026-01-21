# Swiss International Style Guide

> **REQUIRED** for all frontend changes in Resume Matcher.

## Design Principles

1. **Grid-based layouts** - Mathematical precision
2. **Asymmetric balance** - Strategic spacing
3. **Objective typography** - Serif headers, mono metadata, sans body
4. **Minimal ornamentation** - Hard edges, no gradients, no rounded corners

## Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Canvas | `#F0F0E8` | Background |
| Ink | `#000000` | Text, borders |
| Hyper Blue | `#1D4ED8` | Links, primary actions |
| Signal Green | `#15803D` | Success, downloads |
| Alert Orange | `#F97316` | Warnings |
| Alert Red | `#DC2626` | Errors, delete |
| Steel Grey | `#4B5563` | Secondary text |

## Typography

```css
font-serif   /* Headers: Georgia, Times */
font-mono    /* Metadata, labels: SF Mono, Consolas */
font-sans    /* Body text: Inter, Helvetica */
```

| Use | Font | Size | Weight |
|-----|------|------|--------|
| Headers | serif | 3xl+ | bold |
| Body | sans | base | normal |
| Labels | mono | sm | medium, uppercase |
| Metadata | mono | xs | light |

## Components

### Buttons
- `rounded-none` (no rounded corners)
- Hard shadows: `shadow-[2px_2px_0px_0px_#000000]`
- Hover: `translate-y-[1px] translate-x-[1px] shadow-none`

### Inputs
- `border border-black rounded-none`
- Focus: `ring-1 ring-blue-700`

### Cards
- `border-2 border-black`
- Shadow: `shadow-[4px_4px_0px_0px_#000000]`

### Dialogs
- Centered, `max-w-md`
- Hard black border

## Status Indicators

```jsx
// Ready
<div className="w-3 h-3 bg-green-700" />
<span className="text-green-700 font-bold">STATUS: READY</span>

// Setup Required
<div className="w-3 h-3 bg-amber-500" />
<span className="text-amber-500 font-bold">STATUS: SETUP REQUIRED</span>
```

## Quick Reference

```jsx
// Swiss button
<button className="rounded-none border-2 border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none">

// Swiss card
<div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000]">

// Swiss label
<label className="font-mono text-sm uppercase tracking-wider">
```

## Anti-Patterns

❌ No rounded corners (`rounded-*`)
❌ No gradients
❌ No blur shadows
❌ No decorative icons
❌ No pastel colors
