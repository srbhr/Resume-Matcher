# Design Tokens

The atomic values every other file in this pack builds on. Memorize the colors and the three-font hierarchy — those two things define 80% of the visual identity.

> Sibling docs: [components](components.md) · [layouts](layouts.md) · [anti-patterns](anti-patterns.md)

---

## Color Palette

A small, intentional palette. Each color has one job. Don't introduce new colors casually — if a new state shows up, ask whether an existing color already covers it.

Every token below ships as a **hex** value. Contrast figures are WCAG relative-luminance ratios; every text and text-on-fill pairing in this table clears **WCAG 2.2 AA (4.5:1)**, and the status squares and borders that carry meaning on their own clear 3:1.

### Core

| Token | Hex | Role | vs Canvas | vs White |
|-------|-----|------|-----------|----------|
| `canvas` | `#F0F0E8` | Page background — warm off-white, never pure white | — | 1.15 |
| `white` | `#FFFFFF` | Elevated surfaces: cards, inputs, dialogs | 1.15 | — |
| `ink` | `#000000` | Headings, borders, strong text | 18.33 | 21.00 |
| `ink-soft` | `#3D424C` | Body text | 8.81 | 10.09 |
| `steel` | `#696D75` | Secondary text, labels, placeholders, hairlines | 4.53 | 5.19 |

### Neutral fills

| Token | Hex | Role | Text on fill |
|-------|-----|------|--------------|
| `paper` | `#F5F5F0` | Sub-panel and header tint | ink 19.20 · steel 4.75 |
| `panel` | `#E5E5E0` | Secondary fills, dialog footer, outline-button hover | ink 16.62 · ink-soft 7.98 |
| `panel-hover` | `#D8D8D2` | Hover on a `panel` fill | ink 14.67 |

**`steel` is never placed on `panel`** (4.11:1 fails). On a `panel` fill use `ink-soft` or `ink`.

### Action and status

| Name | Token | Hex | Role | vs Canvas | Text on fill |
|------|-------|-----|------|-----------|--------------|
| Hyper Blue | `primary` | `#1D4ED8` | Links, primary actions, focus rings | 5.85 | white 6.70 |
| | `primary-hover` | `#193CB8` | Primary hover fill | 7.70 | white 8.82 |
| Signal Green | `success` | `#127E3B` | Success text and fill (one value) | 4.50 | white 5.16 |
| | `success-hover` | `#016630` | Hover fill | 6.23 | white 7.13 |
| Alert Red | `destructive` | `#D61E21` | Error text and fill (one value) | 4.51 | white 5.16 |
| | `destructive-hover` | `#BE0010` | Hover fill | 5.74 | white 6.57 |
| Alert Orange | `warning` | `#F97316` | Warning fill, squares, alert border. **Ink text only.** | 2.45 | ink 7.49 |
| | `warning-hover` | `#EB5601` | Hover fill | — | ink 5.86 |
| | `warning-text` | `#B44F02` | Warning labels and icons | 4.52 | — |

`warning` (2.45:1 on Canvas) is the one fill below the 3:1 non-text threshold (WCAG 1.4.11). That is acceptable because the orange never carries meaning alone: a status square always has a label, a warning alert pairs its border with a `warning-text` label on a tint, and a warning button has an ink border and ink text.

### Tints and utility

| Token | Hex | Role |
|-------|-----|------|
| `info-tint` | `#EFF6FF` | Alert fill (label `primary` 6.16, body `ink-soft` 9.27) |
| `success-tint` | `#F0FDF4` | Alert fill (label `success` 4.93, body `ink-soft` 9.64) |
| `warning-tint` | `#FFF7ED` | Alert fill (label `warning-text` 4.87, body `ink-soft` 9.50) |
| `destructive-tint` | `#FEF2F2` | Alert fill (label `destructive` 4.72, body `ink-soft` 9.22) |
| `highlight` | `#FFF085` | Keyword `<mark>` only (ink 18.05) |
| `overlay` | `rgb(0 0 0 / 0.5)` | Dialog backdrop |

### Why no pure white as a page background?

Canvas (`#F0F0E8`) is the default surface. Pure white is jarring against the hard ink borders and feels clinical. White is reserved for **elevated** surfaces sitting on the canvas: cards, input fields, dialogs.

### Color rules

- One primary action per screen region (Hyper Blue)
- **Blue means action.** Links, primary buttons and focus rings are blue; a *selected* segment, tab or switch is an ink fill with white text, never blue
- Status colors are loud — they stop you, so use them sparingly
- **Orange fills take ink text, never white** (white on `warning` is 2.80:1). Orange used as text or an icon is `warning-text`
- The neutrals are `canvas`, `paper`, `panel`, `panel-hover`, `steel` and `ink-soft`. That is the whole grey scale; never invent additional greys
- Tints exist for alert fills only
- Use semantic tokens in app code. Raw hex values, `rgba()` and the framework's built-in palette scales (`blue-700`, `gray-500`, `amber-100`) are banned outside the file that defines the tokens
- If you change a token, re-run the contrast check. Four tokens sit within a hair of the threshold (`success` 4.50, `destructive` 4.51, `warning-text` 4.52, `steel` 4.53)

### Wiring the tokens (Tailwind v4)

The class names in this pack (`bg-canvas`, `text-ink-soft`, `border-ink`, `shadow-sw-sm`) come from a theme block like this:

```css
@theme inline {
  --color-canvas: #f0f0e8;
  --color-ink: #000000;
  --color-ink-soft: #3d424c;
  --color-steel: #696d75;
  --color-paper: #f5f5f0;
  --color-panel: #e5e5e0;
  --color-panel-hover: #d8d8d2;
  --color-primary: #1d4ed8;
  --color-primary-hover: #193cb8;
  --color-success: #127e3b;
  --color-success-hover: #016630;
  --color-destructive: #d61e21;
  --color-destructive-hover: #be0010;
  --color-warning: #f97316;
  --color-warning-hover: #eb5601;
  --color-warning-text: #b44f02;
  --color-info-tint: #eff6ff;
  --color-success-tint: #f0fdf4;
  --color-warning-tint: #fff7ed;
  --color-destructive-tint: #fef2f2;
  --color-highlight: #fff085;
  --color-overlay: rgb(0 0 0 / 0.5);

  --shadow-sw-sm: 2px 2px 0px 0px #000000;
  --shadow-sw-default: 4px 4px 0px 0px #000000;
  --shadow-sw-card: 6px 6px 0px 0px #000000;
  --shadow-sw-lg: 8px 8px 0px 0px #000000;
  --shadow-sw-xl: 12px 12px 0px 0px #000000;

  --font-sans: Helvetica, Arial, sans-serif;
  --font-mono: 'Space Grotesk', sans-serif; /* the label face, see Typography */

  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --default-transition-duration: 100ms;
  --default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
```

`white` is the framework's own. Keep hex as the source of truth rather than oklch: browser gamut-mapping of oklch drifts at 8 bits, which is enough to push a near-threshold pairing under 4.5:1.

---

## Typography

Three fonts. That's the whole hierarchy.

```css
font-serif   /* Headers — the framework's default serif stack (Georgia, Times) */
font-sans    /* Body text — Helvetica, Arial, sans-serif */
font-mono    /* Labels, metadata, buttons — the label face (Space Grotesk) */
```

**`font-mono` is a role, not a font technology.** In the house style the label face is Space Grotesk, a geometric sans, not a true monospace. The role is what matters: a distinct, uppercase, letter-spaced face that reads as "metadata, not content". A real monospace (SF Mono, Consolas) fills the role just as well in another project.

### Role mapping

| Use | Font | Size | Weight | Notes |
|-----|------|------|--------|-------|
| Page headers (H1) | serif | `text-4xl md:text-5xl` | bold | **Uppercase.** One size for every app page |
| Dialog titles | serif | 2xl | bold | **Uppercase** |
| Section headers | serif | xl–2xl | bold | **Sentence case** |
| Body | sans | sm–base | normal | `ink-soft` |
| Labels | label face | xs | medium, **uppercase**, tracked | Form labels, table headers; `steel` |
| Buttons | label face | sm (xs for `sm` buttons) | medium, **uppercase** | |
| Captions and status text | label face | xs | bold, **uppercase**, tracked | Panel headers, status indicators, empty-state labels |
| Metadata | label face | xs | normal | Timestamps, IDs, `// subtitles` in `steel` |

Marketing surfaces may set a poster-scale headline (a landing hero does); app pages do not.

### Type Scale

```
xs:   12px / 1.4    Captions, metadata — the floor, nothing smaller
sm:   14px / 1.5    Labels, secondary text
base: 16px / 1.6    Body
lg:   18px / 1.55   Lead paragraphs
xl:   20px / 1.5    Subsection headers
2xl:  24px / 1.4    Section headers, dialog titles
3xl:  30px / 1.3    Large section headers
4xl:  36px / 1.2    Page headers (H1, small screens)
5xl:  48px / 1.1    Page headers (H1, md and up)
```

**Type floor:** `text-xs` (12px). Pixel sizes such as `text-[10px]` are banned.

### Type details

- Headings get `text-balance`; descriptions get `text-pretty`
- `tabular-nums` on counts, scores and dates
- Source strings are sentence case; CSS `uppercase` does the visual casing, so a translation is never re-cased by hand
- `…` rather than `...`, curly quotes, a non-breaking space between a value and its unit

### Why a distinct label face?

A separate face + uppercase + tracking signals "this is metadata, not content". It creates instant visual hierarchy without relying on color or size. It's the cheapest way to organize a dense interface.

---

## Spacing Scale

A 4px-based scale. Stick to it. Custom paddings break the rhythm.

```
xs:  4px    (p-1)
sm:  8px    (p-2)
12px        (p-3)   ← dense controls and compact panels
md:  16px   (p-4)   ← default for most cases
lg:  24px   (p-6)
xl:  32px   (p-8)
2xl: 48px   (p-12)
3xl: 64px   (p-16)
```

**Default rule**: when in doubt, use `md` (16px). Tighten to `sm` or 12px for dense lists, expand to `lg` or `xl` for breathing room around major sections.

**Banned in app code:** units `5, 7, 9, 10, 11, 14` and every half-step (`py-0.5`, `gap-1.5`). The one exception is inside the shared UI primitives, where a half-step may nudge optical icon padding (for example `ps-4 pe-3.5` on an icon button). Never fix alignment at a call site with a negative margin or `top-[-2px]`; use gap, grid or divide.

---

## Shadows

Hard shadows only. Never blurred. Never soft. The shadow is a graphic element, not a depth illusion. Each token has one job:

| Token | Offset | Role |
|-------|--------|------|
| `shadow-sw-sm` | 2px | Buttons and controls |
| `shadow-sw-default` | 4px | Cards and menus |
| `shadow-sw-lg` | 8px | Dialogs and the page frame |
| `shadow-sw-xl` | 12px | A landing/hero frame only |
| `shadow-sw-card` | 6px | A single document or sheet surface only |

Arbitrary shadow values (`shadow-[…]`) and every soft or rgba shadow are banned.

### Hover behavior

Hard-shadowed elements **press in** on hover by translating down-right into the shadow, then lose the shadow:

```css
hover:translate-x-px hover:translate-y-px hover:shadow-none
active:translate-x-[2px] active:translate-y-[2px]
```

This is the only hover motion. Things never lift, grow or gain a shadow when you point at them. See [Motion](#motion).

---

## Borders

- **Default**: 1px solid ink (`border border-ink`) — buttons, inputs, selects, dialogs, cards, panels, the page frame
- **Emphasized**: 2px solid (`border-2`) — alerts (in the status color), emphasized cards, panel-header rules
- **Never**: rounded corners (`rounded-none` is the default)
- **Never**: dashed or dotted borders, except for "empty slot" / "hidden" / "draft" states
- **Never**: ad-hoc grey or tinted borders (`border-black/10`, `border-gray-300`). Structural edges are ink; a quiet hairline inside a panel uses `panel-hover`. If a line looks too heavy, remove it

### Focus

Focus is always visible and always Hyper Blue.

```css
/* Controls: buttons, tabs, switches, interactive cards */
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
focus-visible:ring-offset-2 focus-visible:ring-offset-canvas

/* Fields: inputs, textareas, selects */
focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary
```

Never a bare `focus:` variant, and never `outline-none` without one of the replacements above.

---

## Motion

Motion is feedback, not decoration. It tells you a press landed, which state you are in, that something arrived or left. It never tries to entertain. Eight rules:

1. **Feedback only.** Press, state legibility, drag affordance, and the presence of overlays and alerts. Nothing else moves.
2. **One curve and one spring.** The curve is `cubic-bezier(0.16, 1, 0.3, 1)` (exponential decel, no overshoot). The spring is `{ type: 'spring', visualDuration: 0.2, bounce: 0 }`: critically damped, so it never bounces. No bounce or elastic easing anywhere.
3. **Durations.** Press tier 100ms. Surface tier 200ms in, 120ms out. Nothing longer in product UI. The one allowance is a landing hero's 300ms one-shot entrance.
4. **Properties.** `transform` and `opacity`. Color and `box-shadow` are allowed in the press tier only. Banned: `transition-all`, animating layout properties (width, height, top, left, margin), and the animation library's `layout` feature.
5. **Press-in is the only hover/press motion.** No negative translate (no lift), no shadow gain, no scale on press.
6. **Surfaces snap.** Panels, accordions, tabs and route content change instantly. The exceptions are the presence items in the table below.
7. **Interruptible.** Reversible state uses CSS transitions or springs, so a reversal mid-flight carries its velocity. `@keyframes` is for spinners and the hero entrance only. Drag-and-drop animation belongs to the drag library.
8. **Reduced motion.** Honor `prefers-reduced-motion`: transitions drop to 0ms, scroll behavior goes to `auto`, and overlays and menus fade without scaling. A spinner may keep spinning, because it signals work in flight and carries no decoration.

### Where motion lives

| Component | Behavior |
|-----------|----------|
| Dialog (and Confirm, Link dialogs through it) | Overlay opacity 0→1 over 200ms, back over 120ms. Panel fades in with a scale from 0.95 to 1 on the spring; exit mirrors at 120ms. While it exits the dialog is inert, so a second click cannot re-fire a handler |
| Select / dropdown menu | Opacity plus a scale from 0.98, `transform-origin` at the edge it opens from. 120ms in, 80ms out |
| Alerts and banners | Opacity only, 200ms in, 120ms out; no animation on first render |
| List add/remove (cards on a board, entries in an editor) | The outer wrapper fades 150ms in, 120ms out. The inner node stays with the drag library, which owns `transform`. Siblings snap |
| State-label swap ("Save" to "Saved") | Opacity crossfade, 100ms |
| Buttons, chips, toggles, tabs, chevrons | CSS transition at the theme default: 100ms on the expo curve. Name the properties, for example `transition-[transform,box-shadow,background-color]` |
| Drag and sort | The drag library's own transition: 200ms on the expo curve; off under reduced motion |
| Landing hero entrance | CSS `@keyframes`: opacity 0→1 and an 8px rise over 300ms; headline at 0ms, call-to-action at 120ms; static under reduced motion |

### Implementation notes

Set the theme defaults once so a bare `transition-colors` or `transition-[transform,…]` already runs at the press tier:

```css
--default-transition-duration: 100ms;
--default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
```

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

An animation library only earns its weight for presence (mount/unmount) and springs. Load it lazily, keep anything visible at first paint on CSS, and use the library's minimal component (`m`) rather than its full one.

---

## Putting it together

A minimal Swiss-style element uses **canvas or white background + ink border + hard shadow + serif/label-face type**. If your component has those four things and no extras, you're already on style.

See [components.md](components.md) for concrete examples.
