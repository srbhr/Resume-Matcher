# Anti-Patterns & Pre-Merge Checklist

What NOT to do, and how to catch it before code ships. Read this before opening a PR that touches UI.

> Sibling docs: [tokens](tokens.md) · [components](components.md) · [layouts](layouts.md) · [ai-prompt](ai-prompt.md)

---

## Forbidden things

| Anti-pattern | Why it breaks the style | Use instead |
|--------------|-------------------------|-------------|
| `rounded-*` (any value) | Rounds soften the binary geometry | `rounded-none` |
| Gradients (`bg-gradient-*`, `linear-gradient(`) | Decorative, not structural | Solid color from the palette. No exceptions |
| Blurred or soft shadows (`shadow`, `shadow-md`, `shadow-lg`, `shadow-[…]`, ad-hoc rgba shadows) | Implies depth illusion | The hard role tokens: `shadow-sw-sm` (controls), `shadow-sw-default` (menus, popovers), `shadow-sw-lg` (dialogs, page frame), `shadow-sw-nested` (cards and boxes inside a frame or dialog) |
| A solid shadow on a card, panel or box inside a page frame or dialog | The frame already carries the solid shadow; a second one inside competes with it | The nested shadow, `shadow-sw-nested` (translucent ink, hard 4px offset), on every sibling |
| Decorative icons (heart, star, sparkles, wand, zap, rocket) | Ornamental | Functional icons only, mono color |
| Glyphs as icons (`✓ ✨ ⭐ 🚀 •`) | Text characters pretending to be icons | A functional icon with `aria-hidden`, or nothing |
| Pastel colors | Off-palette | Hyper Blue, Signal Green, Alert Orange/Red. The `*-tint` tokens are for alert fills only |
| Raw hex, `rgba()`, or palette scales (`blue-700`, `gray-500`, `amber-100`) in app code | Two versions of every brand color; contrast drifts | Semantic tokens from [tokens.md](tokens.md) |
| Pure white (`#FFFFFF`) as page bg | Too clinical, fights the borders | Canvas `#F0F0E8` (white is for elevated surfaces) |
| `dark:` variants | One warm canvas is the brand | Light theme only |
| Decorative or layout-affecting motion (`transition-all`, bounce/pulse/ping loops, animating width/height/top/left, library `layout`) | Motion is feedback, not ornament | The rules in [Motion](tokens.md#motion): `transform` and `opacity`, the one curve, the one spring |
| Hover that lifts, grows or gains a shadow | The pack's hover is a press into the shadow | Press-in: `hover:translate-x-px hover:translate-y-px hover:shadow-none` |
| Centered layouts | Symmetric = generic | Left-aligned, asymmetric (the page frame is centred in the viewport; content inside it is left-aligned) |
| 2-column collections | Too symmetric | 3, 4, or 5 columns |
| Card carousels | Hides content | Show the grid |
| Soft grey dividers | Weakens structure | 1–2px solid ink |
| Circle status dots | Decorative | 12px squares, always with a label |
| Spinner as a persistent status | Motion that never resolves | A status square. A spinner is only for work in flight |
| Multiple primary buttons per region | No focal point | One primary, rest outline |
| Blue for "selected" | Blue means "press this" | Ink fill with white text |
| White text on an orange fill | 2.80:1, fails AA | Ink text on `warning` |
| `steel` text on a `panel` fill | 4.11:1, fails AA | `ink-soft` or `ink` |
| Decorative borders (dashed/dotted) | Ornamental | Solid only — exception: "empty slot / hidden / draft" state |
| New colors invented for new states | Palette explosion | Reuse existing colors with intent |
| Custom paddings off the 4px scale (`p-5`, `p-7`, `py-0.5`) | Breaks rhythm | `p-1`, `p-2`, `p-3`, `p-4`, `p-6`, `p-8`, `p-12`, `p-16` |
| Text below 12px (`text-[10px]`) | Unreadable, off the type scale | `text-xs` is the floor |
| Restyling a shared component at the call site | The style drifts one patch at a time | Fix the component, or add a variant |

---

## Common mistakes that look "almost right"

These are the ones that pass casual review but fail the style:

### Using `border-gray-300` instead of `border-ink`

Grey borders look "softer" and feel safer, which is exactly the wrong instinct. Swiss style commits to its borders. If a border looks too heavy, the answer is to **remove it**, not soften it.

### Adding `shadow-sm` "for a little depth"

A soft shadow is a depth illusion. The whole pack rejects depth illusions. If something needs to feel elevated, give it a hard offset shadow from the role table or a heavier border — never `shadow-sm`.

### Centering the page content with `mx-auto max-w-4xl`

Centering is the default reflex from generic web design. In Swiss style, content should sit asymmetrically — typically pulled to the left third or two-thirds, with whitespace on the right. The page frame is centred in the viewport, but everything inside it is left-aligned. Use a grid, not `mx-auto`.

### Using `text-gray-500` for everything secondary

There's exactly one secondary text color: Steel `#696D75`. Don't introduce tints or alternates. If you need more hierarchy, use weight or size, not color. And watch where it lands: steel passes on canvas, white and paper, but fails on a `panel` fill.

### Making a card lift on hover

`hover:-translate-y-1 hover:shadow-lg` is the SaaS reflex. Here a clickable card presses *into* its shadow like a button does. Nothing grows, lifts or glows.

### Importing decorative icon sets

`lucide-react`, `heroicons`, etc. ship with thousands of decorative glyphs. Use them only for functional icons (close, expand, navigate). Never for emotional decoration (sparkles, hearts, lightning bolts). Pick one icon family per project and enforce it with a guard rule.

### Hand-rolling a modal, alert or select

A one-off `<div className="fixed inset-0 …">` skips the focus trap, the Escape key, the focus return and the exit animation. A one-off alert box invents a fifth way to draw a warning. Use the shared dialog, alert and select.

---

## Legacy names and what replaces them

Older code carries shadcn-era token names and framework palette shades. They all have a direct replacement; rename rather than re-pick.

| Legacy | Use |
|--------|-----|
| `steel-grey`, `muted-foreground`, `#6b7280`, `text-black/NN` | `steel` |
| `paper-tint`, `#F5F5F0`, `#F6F5EE` | `paper` |
| `secondary`, `muted`, `accent`, `#E5E5E0`, `#E0E0D8` | `panel` |
| `#D8D8D2`, `#CFCFC7`, `border-black/10` | `panel-hover` |
| `background`, `card` | `canvas` |
| `foreground` | `ink` |
| `border-border`, `border-black` | `border-ink` |
| `ring-ring` | `ring-primary` |
| `bg-black/NN` (overlays) | `bg-overlay` |
| `blue-700` / `blue-800` | `primary` / `primary-hover` |
| `green-500/600/700` / `green-800` | `success` / `success-hover` |
| `red-500/600` / `red-700` | `destructive` / `destructive-hover` |
| `orange-500`, `amber-500` as a fill / `orange-600` | `warning` / `warning-hover` |
| `orange-*`, `amber-*`, `yellow-600` as text or icon | `warning-text` |
| `red-900`, `amber-900` body copy | `ink-soft` |
| `*-50`, `*-100` tints | `info-tint`, `success-tint`, `warning-tint`, `destructive-tint` |
| `bg-yellow-200` keyword marks | `highlight` |
| `shadow-sw-xs` | `shadow-sw-sm` |

---

## Pre-merge checklist

Before merging UI changes, walk through this list:

### Tokens
- [ ] All colors are semantic tokens from [tokens.md](tokens.md) — no raw hex, `rgba()` or palette-scale classes
- [ ] No `rounded-*` classes anywhere
- [ ] No `bg-gradient-*` or `linear-gradient(` anywhere
- [ ] No `shadow`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-[…]` (only the `shadow-sw-*` role tokens)
- [ ] All paddings are on the 4px scale (`p-1`, `p-2`, `p-3`, `p-4`, `p-6`, `p-8`, `p-12`, `p-16`)
- [ ] Orange fills carry ink text; `steel` never sits on `panel`; if you touched a token, the contrast check still passes

### Typography
- [ ] Headers use `font-serif` (page titles uppercase, section headers sentence case)
- [ ] Body uses `font-sans`
- [ ] Labels and metadata use `font-mono uppercase tracking-wider` (the label face)
- [ ] Nothing smaller than `text-xs`
- [ ] No more than three font families on the page

### Components
- [ ] Buttons have `border border-ink` (1px) and `shadow-sw-sm`, and use the shared button
- [ ] Inputs have `border border-ink` (1px), a white fill and `rounded-none`
- [ ] Cards and boxes inside a frame or dialog have `border border-ink` (or `border-2` when emphasized) and `shadow-sw-nested`; siblings match; solid shadows are only on controls, menus, dialogs and the frame
- [ ] A clickable tile highlights with the full `primary` fill and white text, no ink outline, and a 2px inset white focus ring
- [ ] Alerts are the shared alert: 2px status border on a tint
- [ ] Dialogs are the shared dialog: white, 1px ink border, banded header and footer, focus trapped and returned
- [ ] Status indicators are 12px squares with a label, not circles, dots or bare spinners
- [ ] Selected segments, tabs and switches are an ink fill; blue is for actions
- [ ] At most one primary button per logical region
- [ ] Every control has a visible `focus-visible` ring; icon-only buttons have an `aria-label`

### Layout
- [ ] Page background is Canvas, not white
- [ ] Pages use the shared page frame and header (full-height working views use the compact header)
- [ ] Content is left-aligned by default
- [ ] Padding is asymmetric (not equal on all sides for major blocks)
- [ ] Dividers between panels are 1–2px solid ink

### Motion
- [ ] Nothing animates except what the [Motion](tokens.md#motion) table lists
- [ ] No `transition-all`; properties are named, `transform` and `opacity` first
- [ ] Reduced motion is respected

### Final pass
- [ ] If your project ships a drift guard (a test that counts the banned patterns above), run it; it reports no new hits
- [ ] Squint at the design — does it look distinctly Swiss, or could it be any SaaS app?
- [ ] If you removed all colors except black and one accent, would the layout still read?

If you can answer **yes** to the squint test, you're done. If it looks like a generic dashboard, go back to [tokens.md](tokens.md) and start over.
