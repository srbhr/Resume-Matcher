# Design Tokens

The atomic values every other file in this pack builds on. Memorize the colors and the three-font hierarchy — those two things define 80% of the visual identity.

> Sibling docs: [components](components.md) · [layouts](layouts.md) · [anti-patterns](anti-patterns.md)

---

## Color Palette

A small, intentional palette. Each color has one job. Don't introduce new colors casually — if a new state shows up, ask whether an existing color already covers it.

| Name | Hex | Usage |
|------|-----|-------|
| Canvas | `#F0F0E8` | Page background — warm off-white, never pure white |
| Ink | `#000000` | Body text, borders, primary structural lines |
| Hyper Blue | `#1D4ED8` | Links, primary actions, focus rings |
| Signal Green | `#15803D` | Success, confirmation, downloads |
| Alert Orange | `#F97316` | Warnings, "needs attention" |
| Alert Red | `#DC2626` | Errors, destructive actions, delete |
| Steel Grey | `#4B5563` | Secondary text, captions, disabled states |

### Why no pure white?

Canvas (`#F0F0E8`) is the default surface. Pure white is jarring against the hard black borders and feels clinical. Use white only for elevated card surfaces sitting on top of the canvas.

### Color rules

- One primary action per screen (Hyper Blue)
- Status colors are loud — they stop you, so use them sparingly
- Steel Grey is your only "soft" color; never invent additional greys

---

## Typography

Three fonts. That's the whole hierarchy.

```css
font-serif   /* Headers — Georgia, Times, "Times New Roman" */
font-sans    /* Body text — Inter, Helvetica, system-ui */
font-mono    /* Metadata, labels — SF Mono, Consolas, "Courier New" */
```

### Role mapping

| Use | Font | Size | Weight | Notes |
|-----|------|------|--------|-------|
| Page headers | serif | 3xl–5xl | bold | Set the tone of the page |
| Section headers | serif | xl–2xl | bold | Anchor major sections |
| Body | sans | base | normal | Default for paragraphs |
| Labels | mono | sm | medium, **uppercase** | Form labels, table headers |
| Metadata | mono | xs | light | Timestamps, IDs, captions |

### Type Scale

```
xs:   12px / 1.4    Captions, metadata
sm:   14px / 1.5    Labels, secondary text
base: 16px / 1.6    Body
lg:   18px / 1.55   Lead paragraphs
xl:   20px / 1.5    Subsection headers
2xl:  24px / 1.4    Section headers
3xl:  30px / 1.3    Page headers
4xl:  36px / 1.2    Hero headers
5xl:  48px / 1.1    Display headers
```

### Why monospace for labels?

Monospace + uppercase signals "this is metadata, not content". It creates instant visual hierarchy without relying on color or size. It's the cheapest way to organize a dense interface.

---

## Spacing Scale

A 4px-based scale. Stick to it. Custom paddings break the rhythm.

```
xs:  4px    (p-1)
sm:  8px    (p-2)
md:  16px   (p-4)   ← default for most cases
lg:  24px   (p-6)
xl:  32px   (p-8)
2xl: 48px   (p-12)
3xl: 64px   (p-16)
```

**Default rule**: when in doubt, use `md` (16px). Tighten to `sm` for dense lists, expand to `lg` or `xl` for breathing room around major sections.

---

## Shadows

Hard shadows only. Never blurred. Never soft. The shadow is a graphic element, not a depth illusion.

```css
/* Buttons */
shadow-[2px_2px_0px_0px_#000000]

/* Cards */
shadow-[4px_4px_0px_0px_#000000]

/* Hero / featured elements */
shadow-[8px_8px_0px_0px_#000000]
```

### Hover behavior

Hard-shadowed elements should "press in" on hover by translating into the shadow:

```css
hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none
```

This produces a tactile click affordance without animation curves or easing.

---

## Borders

- **Default**: 1px solid black (`border border-black`)
- **Emphasized**: 2px solid black (`border-2 border-black`)
- **Never**: rounded corners (`rounded-none` is the default)
- **Never**: dashed or dotted borders, except for "hidden" / "draft" states

---

## Putting it together

A minimal Swiss-style element uses **canvas background + ink border + hard shadow + serif/mono type**. If your component has those four things and no extras, you're already on style.

See [components.md](components.md) for concrete examples.
