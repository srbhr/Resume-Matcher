# Swiss International Style — Design System

A portable design system pack inspired by Swiss International Style (also called International Typographic Style or Brutalism). Hard edges, mathematical grids, objective typography, no ornamentation.

This pack is **self-contained**: every file in this directory links only to siblings here. Drop the whole folder into any project and the cross-references keep working.

---

## What you get

| File | Purpose |
|------|---------|
| [tokens.md](tokens.md) | Colors, typography, spacing, shadows, motion — the raw design tokens |
| [components.md](components.md) | Buttons, inputs, selects, cards, dialogs, alerts, status indicators, panel headers, empty states |
| [layouts.md](layouts.md) | Grid systems, the page frame and header, panel patterns, page dimensions |
| [ai-prompt.md](ai-prompt.md) | System prompt for asking an LLM to generate Swiss-style UI |
| [anti-patterns.md](anti-patterns.md) | What NOT to do, plus a pre-merge checklist |

---

## Core principles

1. **Grid-based layouts** — Mathematical precision over visual intuition
2. **Asymmetric balance** — Strategic whitespace, not symmetric centering
3. **Objective typography** — Serif headers, label-face metadata, sans-serif body
4. **Minimal ornamentation** — Hard edges, no gradients, no rounded corners, no decorative icons
5. **Motion is feedback** — Buttons press into their shadow, overlays fade in; nothing moves for its own sake
6. **Accessible by construction** — Every text and text-on-fill pairing in the palette clears WCAG 2.2 AA, and every control has a visible focus ring

If you remember nothing else: **square corners, hard shadows, pure colors, three-font hierarchy**.

---

## Who this is for

- Designers and engineers who want a strict, opinionated visual language
- Projects that benefit from looking distinct from generic SaaS aesthetics
- Teams that want a small, memorizable rule set rather than a sprawling component library

This pack is **prescriptive, not flexible**. It works because the rules are absolute. If you need a softer, more decorative system, this is the wrong starting point.

The rules are enforceable, not aspirational. Pair the pack with a **drift guard**: a test that counts the banned patterns (rounded corners, palette-scale colors, soft shadows, `transition-all`…) and fails when the count changes, plus a contrast test over the palette. See the [pre-merge checklist](anti-patterns.md#pre-merge-checklist).

---

## How to use

1. Read [tokens.md](tokens.md) first — every other file references these values.
2. Then [components.md](components.md) for the building blocks.
3. [layouts.md](layouts.md) when composing pages.
4. Use [ai-prompt.md](ai-prompt.md) when delegating UI generation to an LLM.
5. Review [anti-patterns.md](anti-patterns.md) before shipping.

---

## Stack assumptions

The code samples use **Tailwind CSS v4** utility classes and **React/JSX**, with semantic class names (`bg-primary`, `border-ink`, `shadow-sw-sm`) defined by the theme block in [tokens.md](tokens.md#wiring-the-tokens-tailwind-v4). The token values themselves are framework-agnostic — translate the colors and shadows into your own CSS, vanilla, Vue, Svelte, or whatever. The principles don't change.
