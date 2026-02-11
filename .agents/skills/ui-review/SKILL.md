---
name: ui-review
description: |
  Review UI changes against Swiss International Style design system. Checks colors, typography, borders, shadows, spacing, and anti-patterns. Use before committing any frontend UI changes.
metadata:
  author: resume-matcher
  version: "1.0.0"
allowed-tools: Bash(rg:*) Bash(npm:*) Read
---

# UI Review Agent

> Use to verify frontend changes comply with Swiss International Style before committing.

## Review Process

### Step 1: Run automated checks

```bash
# Check for forbidden rounded corners
rg 'rounded-(sm|md|lg|xl|2xl|3xl|full)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Check for gradient usage (forbidden)
rg '(bg-gradient|from-|via-|to-)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Check for soft shadows (should be hard only)
rg 'shadow-(sm|md|lg|xl|2xl|inner)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Check for blur effects (forbidden)
rg '(blur-|backdrop-blur)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Check for off-palette colors
rg 'bg-(red|green|blue|yellow|purple|pink|indigo|teal|cyan|emerald|violet|fuchsia|rose|sky|lime|amber|stone|zinc|neutral|slate)-[0-9]' apps/frontend/ --glob '*.tsx' --no-heading -n

# Verify hard shadows are used
rg 'shadow-\[' apps/frontend/ --glob '*.tsx' --no-heading -n
```

### Step 2: Manual review checklist

For each changed file:

#### Colors
- [ ] Background uses Canvas `#F0F0E8` or white
- [ ] Text uses Ink `#000000` (no grey for main text)
- [ ] Links use Hyper Blue `#1D4ED8`
- [ ] Success states use Signal Green `#15803D`
- [ ] Error states use Alert Red `#DC2626`
- [ ] Warning states use Alert Orange `#F97316`
- [ ] No colors outside the Swiss palette

#### Typography
- [ ] Headers use `font-serif`
- [ ] Body text uses `font-sans`
- [ ] Labels/metadata use `font-mono text-sm uppercase tracking-wider`
- [ ] No decorative fonts

#### Borders & Shadows
- [ ] All elements use `rounded-none`
- [ ] Borders are `border-2 border-black` (or `border`)
- [ ] Shadows are hard: `shadow-[Xpx_Xpx_0px_0px_#000000]`
- [ ] Hover effects translate into shadow space

#### Components
- [ ] Buttons: square corners, hard shadow, press effect
- [ ] Cards: white bg, black border, hard shadow
- [ ] Inputs: `rounded-none`, black border
- [ ] Labels: mono, uppercase, tracking-wider
- [ ] Status dots: `w-3 h-3` with no border-radius

#### Layout
- [ ] Grid-based layouts
- [ ] Consistent spacing (multiples of 4)
- [ ] Mobile-first responsive breakpoints

## Swiss Design System

### Allowed Colors

| Name | Hex | Tailwind |
|------|-----|----------|
| Canvas | `#F0F0E8` | `bg-[#F0F0E8]` |
| Ink | `#000000` | `text-black` |
| White | `#FFFFFF` | `bg-white` |
| Hyper Blue | `#1D4ED8` | `text-blue-700` / `bg-blue-700` |
| Signal Green | `#15803D` | `text-green-700` |
| Alert Orange | `#F97316` | `text-orange-500` |
| Alert Red | `#DC2626` | `text-red-600` |
| Steel Grey | `#4B5563` | `text-gray-600` |

### Component Templates

```tsx
// Correct button
<button className="rounded-none border-2 border-black px-4 py-2 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">

// Correct card
<div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-6">

// Correct label
<label className="font-mono text-sm uppercase tracking-wider">

// Correct status indicator
<div className="w-3 h-3 bg-green-700" />
```

### Anti-Pattern Quick Scan

If ANY of these appear in changed files, flag immediately:

| Anti-Pattern | Why |
|-------------|-----|
| `rounded-sm/md/lg/xl/full` | Swiss style: sharp corners only |
| `bg-gradient-*` | No gradients allowed |
| `shadow-sm/md/lg/xl` | Must use hard `shadow-[...]` |
| `blur-*` / `backdrop-blur` | No blur effects |
| `opacity-*` (decorative) | Flat, opaque elements only |
| Pastel colors | Swiss palette is bold |
| `animate-pulse/bounce` | Minimal animation only |

## Retro Terminal Elements

For dashboard/settings/empty states ONLY (not resume content):

```tsx
<span className="font-mono text-xs uppercase">[ STATUS: READY ]</span>
```

**Never use retro elements** on resume editing or PDF preview areas.

## Reference

Full design system: `docs/agent/design/style-guide.md`
Extended tokens: `docs/agent/design/design-system.md`
