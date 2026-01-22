---
name: design-principles
description: Swiss International Style for Resume Matcher. Invoke ONLY when designing new UI components or modifying existing component styles.
user-invocable: true
---

# Swiss International Style Design

> **Invoke when:** Creating new components, modifying styles, or building new pages.
> **Skip when:** Backend work, API changes, logic-only changes.

## Before Designing:

Read the full design specs in `docs/agent/design/`:

1. **[style-guide.md](docs/agent/design/style-guide.md)** - Core rules, colors, typography, components
2. **[design-system.md](docs/agent/design/design-system.md)** - Extended tokens, spacing, shadows
3. **[swiss-design-system-prompt.md](docs/agent/design/swiss-design-system-prompt.md)** - AI prompt for Swiss UI

## Critical Rules (Always Apply)

### Colors
| Name | Hex | Usage |
|------|-----|-------|
| Canvas | `#F0F0E8` | Background |
| Ink | `#000000` | Text, borders |
| Hyper Blue | `#1D4ED8` | Primary actions |
| Signal Green | `#15803D` | Success |
| Alert Red | `#DC2626` | Danger |

### Typography
```
font-serif  → Headers
font-mono   → Labels, metadata (uppercase, tracking-wider)
font-sans   → Body text
```

### Component Patterns
```tsx
// Button: Square corners, hard shadow, press effect
<button className="rounded-none border-2 border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none">

// Card: Hard shadow, no rounded corners
<div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000]">

// Label: Mono, uppercase
<label className="font-mono text-sm uppercase tracking-wider">
```

### Status Indicators
```tsx
<div className="w-3 h-3 bg-green-700" />  // Ready
<div className="w-3 h-3 bg-amber-500" />  // Warning
<div className="w-3 h-3 bg-red-600" />    // Error
<div className="w-3 h-3 bg-blue-700" />   // Active
```

## Anti-Patterns (NEVER)

❌ `rounded-*` - Always use `rounded-none`
❌ Gradients or blur shadows
❌ Custom colors outside palette
❌ Pastel or soft colors
❌ Decorative icons without function

## Retro Terminal Elements

Use bracket syntax for UI chrome ONLY (dashboard, settings, empty states):

```tsx
<span className="font-mono text-xs uppercase">[ STATUS: READY ]</span>
<span className="font-mono text-xs uppercase">[ LOADING... ]</span>
```

**DO NOT use retro elements on resume components** - keep resume areas professional.

## Quick Checklist

- [ ] Using `rounded-none` on all components
- [ ] Hard shadows (`shadow-[Xpx_Xpx_0px_0px_#000000]`)
- [ ] Correct typography (serif headers, mono labels, sans body)
- [ ] Colors from palette only
- [ ] No gradients or blur effects
