# Swiss Realignment — Design

**Date:** 2026-10-10
**Branch:** `dev` (each phase lands as its own green commit, pushed directly)
**Status:** Approved in brainstorming; awaiting spec review
**Sub-project:** 1 of 2. Sub-project 2, Next.js performance, gets its own spec after this one lands.

---

## 1. Goal

Many contributors and AI-assisted edits have pulled the frontend away from its Swiss International Style system. The pack lives in [`docs/portable/swiss-design-system/`](../../portable/swiss-design-system/README.md). This work brings every app surface back to one coherent system and adds polish so the app feels like a finished product. It does **not** restyle the brand: hues, fonts and geometry stay where they are.

**Success means:**

- Every page uses the same tokens, primitives, page frame, focus treatment and state patterns.
- Every text/fill pairing in the token set passes WCAG 2.2 AA. A test computes this.
- Motion is purposeful and consistent: one curve, one spring, and reduced-motion support.
- A failing guard test stops drift from coming back. Its allowlist reaches empty, apart from two dead files.
- The owner's visual review at each phase confirms the look is unchanged except for the ratified items in §11.

### Where the drift comes from (audit summary)

- **Broken foundation tokens.**
  - `font-sans` names `"Geist Sans"`, which is never registered, so body text renders in the system sans.
  - `font-mono` is Space Grotesk.
  - `<body>` uses `text-ink-soft`.
  - The Steel Grey token measures 2.94:1 on Canvas.
  - Tailwind v4's palette renders `blue-700` as `#1447E6`, not the brand `#1D4ED8`. Red, green and orange have the same split, so the app ships two of each brand colour.
- **Drifted primitives, patched at call sites.** 72 of 197 call sites restyle a primitive:
  - Dialog has no padding, so all 11 dialogs patch it.
  - Input and Textarea have a transparent background (37 patches).
  - Card's `interactive` variant lifts on hover.
  - Motion is built into six primitives.
- **Missing primitives, reinvented locally:** about 7 alert recipes, about 7 panel headers, 5 empty states, 2 segmented-control styles, hand-rolled toggles, modals and textareas.
- **No shared page frame.** Seven pages build seven shells, with 3 header styles and 4 back-link styles.
- **Off-palette colour and decoration:** amber, yellow, violet/teal/brown monograms, about 8 invented hex neutrals, more than 10 Sparkles icons, circle status icons and glyphs. The ATS score card is effectively a dark-theme component.
- **Structural UI bugs.**
  - The builder renders interview prep, cover letter and outreach in **both** panels.
  - The ATS card is only visible behind the diff modal.
  - The tracker's "Move to" placeholder renders as selected.
  - Irreversible deletes are confirmed with the orange `warning` button.
  - Several regions have more than one primary button.
- **Accessibility gaps.**
  - Dialogs have no focus trap or focus return.
  - Clickable dashboard tiles can't be reached by keyboard.
  - There are five focus-ring styles, mostly with a white offset halo on Canvas.
  - The Dropdown never announces its value and has no arrow keys.
  - Tabs, segmented groups and switches lack ARIA.

## 2. Decisions log (owner-approved, 2026-10-10)

| # | Topic | Decision |
|---|---|---|
| D1 | Rulebook | **Swiss pack + house style.** The pack defines the rules. Where the app has a consistent convention, it stays and the pack is updated to match. Outliers are fixed. |
| D2 | Macro scope | **Visual + structural UI fixes**, plus a11y gaps in touched components. No changes to data flow, API calls or business logic. |
| D3 | Fonts | **Keep exactly what renders:** body `Helvetica, Arial, sans-serif`; labels and buttons in Space Grotesk; headers in Tailwind's default serif stack. Stop loading Geist. |
| D4 | Colour | **Fix + tidy, same look.** Same hues, each moved only as far as AA requires; one small neutral scale. |
| D5 | Drift guard | **A failing vitest guard** with a two-way count ratchet. |
| D6 | Motion library | **Motion** (motion.dev, MIT), loaded lazily. |
| D7 | Delivery | **Approach A**, foundation-first phases (§10). |
| D8 | Visible changes | All six ratified, plus the three in §5. Full list in §11. |
| D9 | JS budget | Record the existing breach now. A bundle pass belongs to sub-project 2. |
| D10 | Hero entrance | Yes: a CSS one-shot animation on the home page. |
| D11 | Spacing | 12px (`*-3`) joins the scale. |
| D12 | Dialog chrome | 1px ink border, white background, `shadow-sw-lg`, overlay `bg-black/50` as a token. |
| D13 | Title casing | Page H1s and dialog titles are uppercase serif bold. Section headers are sentence-case serif bold. |
| D14 | Selection | Selected segments and toggles use an ink fill with white text. Blue is reserved for primary actions, links and focus. |
| D15 | H1 size | One size for app pages: `text-4xl md:text-5xl` bold. The home hero keeps its poster headline. |
| D16 | Next performance | Sub-project 2, after this one. Its spec covers the `next-*` Vercel skills. |
| D17 | Icons | **Parked to the end.** Candidates: Phosphor, Material Symbols, Solar. Decided with a visual comparison (§13). |
| D18 | Visual baseline | No automated screenshots. The owner reviews each phase using the page list in its commit notes. |
| D19 | Dead code | `components/settings/api-key-menu.tsx` and the unused `TemplateSelector` stay; their guard entries remain allowlisted. |

## 3. Scope

**In scope.** `apps/frontend/app/**` and `apps/frontend/components/**`:
- Tokens (`app/(default)/css/globals.css`) and fonts (`app/layout.tsx`).
- The primitives in `components/ui/**`.
- Every app surface: home, dashboard, builder (including enrichment and preview), tailor, resume wizard, resume viewer, tracker and settings.
- Docs: the Swiss pack, `apps/frontend/CLAUDE.md`, `.claude/CLAUDE.md` and `.impeccable.md`.
- Tests: the guard, a contrast test, and behaviour tests for primitives.

**Out of scope.**
- Printed resume and cover-letter templates (`components/resume/**`, `app/print/**`), which have their own typography.
- The backend.
- Data flow, API and business logic.
- Deleting dead code.
- Moving the ATS card's hardcoded English into i18n.
- Bundle, Cache Components and partial prefetching (sub-project 2).
- The icon family (parked, §13).
- `.github/workflows/`, Docker and CI.

## 4. Tokens (`app/(default)/css/globals.css`)

### 4.1 Colour

Tokens ship as **hex** with oklch in comments, because browser gamut-mapping of oklch drifts at 8 bits. All contrast values below were computed with WCAG relative luminance.

| Token | Hex | Role | vs Canvas | vs White | Text on fill |
|---|---|---|---|---|---|
| `canvas` | `#F0F0E8` | Page background | — | 1.15 | ink 18.33 |
| `white` | `#FFFFFF` | Elevated cards, inputs, dialogs | 1.15 | — | ink 21.0 |
| `ink` | `#000000` | Headings, borders, strong text | 18.33 | 21.0 | — |
| `ink-soft` | `#3D424C` | Body text (house, unchanged) | 8.81 | 10.09 | — |
| `steel` | `#696D75` | Secondary text, placeholders, hairlines | 4.53 | 5.19 | — |
| `paper` | `#F5F5F0` | Sub-panel and header tint | 1.05 | 1.09 | ink 19.2 · steel 4.75 |
| `panel` | `#E5E5E0` | Secondary fills, dialog footer, outline hover | 1.10 | 1.26 | ink 16.6 · ink-soft 7.98 |
| `panel-hover` | `#D8D8D2` | Hover on panel fills | 1.25 | 1.43 | ink 14.7 |
| `primary` | `#1D4ED8` | Links, primary actions, focus | 5.85 | 6.70 | white 6.70 |
| `primary-hover` | `#193CB8` | Primary hover fill | 7.70 | 8.82 | white 8.82 |
| `success` | `#127E3B` | Success text and fill (one value) | 4.50 | 5.16 | white 5.16 |
| `success-hover` | `#016630` | Hover fill | 6.23 | 7.13 | white 7.13 |
| `destructive` | `#D61E21` | Error text and fill (one value) | 4.51 | 5.16 | white 5.16 |
| `destructive-hover` | `#BE0010` | Hover fill | 5.74 | 6.57 | white 6.57 |
| `warning` | `#F97316` | Warning fill, squares, alert border. **Ink text only.** | 2.45 | 2.80 | ink 7.49 |
| `warning-hover` | `#EB5601` | Hover fill | — | — | ink 5.86 |
| `warning-text` | `#B44F02` | Warning labels and icons | 4.52 | 5.17 | — |
| `info-tint` / `success-tint` / `warning-tint` / `destructive-tint` | `#EFF6FF` / `#F0FDF4` / `#FFF7ED` / `#FEF2F2` | Alert fills | — | — | label ≥4.72, ink-soft ≥9.2 |
| `highlight` | `#FFF085` | Keyword `<mark>` only | — | — | ink 18.05 |
| `overlay` | `rgb(0 0 0 / 0.5)` | Dialog backdrop | — | — | — |

**Rules.**
- **The contrast test (§9.2) is the source of truth.** Four tokens sit right at the threshold: `success` 4.50, `destructive` 4.51, `warning-text` 4.52, `steel` 4.53. Phase 1 may nudge any of them by one hex step so it clears 4.5:1 under the test's math, without re-ratification.
- **`steel` is never placed on `panel`** (4.08–4.11:1). Known sites: the settings footer (below), and the page-break label at `paginated-preview.tsx:201` on the builder's `bg-secondary` right panel, which moves to `ink-soft`.
- App code uses semantic tokens only. Tailwind palette scales, raw hex and `rgba()` are banned outside `globals.css` (§9).
- Legacy shadcn-era tokens (`chart-*`, `sidebar-*`, `popover`, `accent`, `muted`, `--muted-foreground: #6b7280`) are deleted where unused and aliased to the table above where used.
- **Settings footer.** `settings/page.tsx:1438-1478` puts steel and green text on `panel`, which measures 4.08–4.11. The footer moves to `bg-canvas`.
- **Ghost hover** uses `panel`. Today's `paper-tint` is off-hue and invisible on Canvas (1.02:1).
- **Neutral mapping.**

  | Today | Becomes |
  |---|---|
  | `paper-tint`, `#F5F5F0`, `#F6F5EE` | `paper` (the tailor page background becomes `canvas`) |
  | `#E5E5E0`, `#E0E0D8` | `panel` |
  | `#D8D8D2`, `#CFCFC7` | `panel-hover` |
  | `#6b7280`, `text-steel-grey`, `text-muted-foreground` | `steel` |

- **Status-shade mapping.**

  | Today | Becomes |
  |---|---|
  | `green-500/600/700` | `success` |
  | `red-500/600/700` | `destructive` |
  | `red-900` / `amber-900` body copy | `ink-soft` |
  | `orange-*`, `amber-*`, `yellow-600` text | `warning-text` |
  | `orange-500`, `amber-500` fills | `warning` |
  | `*-50` / `*-100` tints | `*-tint` |
  | `bg-yellow-200` keyword marks | `highlight` |

### 4.2 Type

- `--font-sans: Helvetica, Arial, sans-serif`. This is what renders today: generic `sans-serif` is Helvetica on macOS and Arial on Windows.
- `--font-mono` (the label-face role) points at the next/font Space Grotesk variable, `var(--font-space-grotesk)`. The name stays `font-mono` and its role is documented.
- `--font-serif` keeps Tailwind's default stack.
- Delete the `Geist` import from `app/layout.tsx` and the duplicate `:root` `--font-sans` / `--font-mono`.
- `<body>` keeps `text-ink-soft` (house).
- The type floor is `text-xs` (12px); `text-[Npx]` is banned.
- Headings get `text-balance` and descriptions get `text-pretty`.
- `tabular-nums` applies to counts, scores and dates.

### 4.3 Shadows

All six `shadow-sw-*` tokens stay, each tied to one role:

| Token | Role |
|---|---|
| `sw-sm` (2px) | Buttons and controls |
| `sw-default` (4px) | Cards and menus |
| `sw-lg` (8px) | Dialogs |
| `sw-xl` (12px) | Home hero frame only |
| `sw-card` (6px) | Resume page sheet only |
| `sw-xs` (1px) | Migrates to `sw-sm` and is then deleted |

Arbitrary `shadow-[…]` and every soft or rgba shadow are banned.

**Owner amendments (round 2, 2026-10-10).** Decided on the second screenshot pass. Where they differ from §4.3, §5 and §6 above, they win; the text above stays as the record of what was first ratified.

- **Nested shadow.** A new role joins the table: `sw-nested` (4px, `rgb(0 0 0 / 0.15)`, hard offset, no blur) is the shadow of every card, panel, box or section that sits inside a page frame or a dialog (choice cards, stat boxes, form section boxes, toggle cards, tracker cards; `Card variant="raised"` and `ToggleSwitch variant="card"`). Solid ink is for what floats or presses: `sw-sm` controls, `sw-default` dropdown menus, listboxes, popovers and toasts (no longer "cards"), `sw-lg` dialogs and the page frame, `sw-xl` home hero only, `sw-card` resume sheet only. Nothing nested keeps a solid shadow, and sibling boxes match. The "every soft or rgba shadow" ban stands for ad-hoc values; the `sw-nested` token is the one translucent shadow. With `sw-xs` deleted, the set is `sm`, `default`, `lg`, `xl`, `card`, `nested`, pinned by `tests/swiss-shadows.test.ts`. The tracker-card resting frame in §5 is therefore `sw-nested`, not `sw-sm`.
- **Narrow page frame.** `PageFrame` gains `width: 'narrow'` (`max-w-4xl`), so §6's `'default' | 'wide'` becomes `'narrow' | 'default' | 'wide'`. It is for single-column form pages: the owner flagged the empty right side the 86rem frame left on settings and tailor.
- **Tile highlight.** Clickable dashboard tiles highlight on hover and keyboard focus with a full `bg-primary` fill and white text, and no ink outline. Keyboard focus keeps the fill and adds a 2px inset white ring. This supersedes the earlier "white lift + blue accent" ruling (white background, 2px ink frame, only the title and mark turning blue, "never a full blue fill") and the "keep `hover:border-ink`" note for dashboard tiles in §5's Card row.
- The Swiss pack (`docs/portable/swiss-design-system/`), `apps/frontend/CLAUDE.md`, `.claude/CLAUDE.md`, `.impeccable.md` and `docs/agent/coding-standards.md` carry the same rules.

### 4.4 Motion tokens

```css
@theme inline {
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --default-transition-duration: 100ms;                        /* was 150ms */
  --default-transition-timing-function: var(--ease-out-expo);  /* was ease-in-out */
}
:root { --duration-press: 100ms; --duration-surface: 200ms; --duration-exit: 120ms; }
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { transition-duration: 0ms !important; }
  .hero-enter { animation: none; opacity: 1; transform: none; }
}
```

- Overriding the two defaults fixes the roughly 16 bare `transition-*` sites with no edits.
- Verify the `--transition-duration-*` → `duration-press` utility namespace on the first build. If it doesn't resolve, fall back to `duration-(--duration-press)`.
- Delete `--animate-gradient` and its keyframes, which have zero uses.
- Remove the `tw-animate-css` import once Dialog moves to Motion. Its only consumer is `dialog.tsx`.

### 4.5 Spacing

- The scale is 4px-based: Tailwind units `1, 2, 3, 4, 6, 8, 12, 16`. 12px is added per D11.
- Banned outside `components/ui/**`: `5, 7, 9, 10, 11, 14` and half-steps.
- Inside primitives, half-steps are allowed for optical icon padding (`ps-4 pe-3.5`).

### 4.6 Brand unification in phase 1

The phase 1 commit overrides the Tailwind palette entries in use inside `@theme`, so every existing class renders the brand value at once, before the sweep renames them:

| Override | Value |
|---|---|
| `--color-blue-700` | `#1D4ED8` |
| `--color-blue-800` | `#193CB8` |
| `--color-green-700` | `#127E3B` |
| `--color-green-800` | `#016630` |
| `--color-red-600` | `#D61E21` |
| `--color-red-700` | `#BE0010` |
| `--color-orange-500` | `#F97316` |
| `--color-orange-600` | `#EB5601` |

The overrides are removed in phase 6, once the guard confirms no palette classes remain.

## 5. Fixing the existing primitives (`components/ui/**`)

These cross-cutting craft rules apply to every primitive (full list in §8):
- **Controls:** `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas`.
- **Fields:** `focus-visible:ring-1 ring-primary` plus `border-primary`.
- **Never** a bare `focus:` or an `outline-none` with no replacement.
- **Hit targets:** 24px is the AA floor, 44px the house target, and hit areas never overlap.
- **Disabled:** `opacity-50 cursor-not-allowed`, never `pointer-events-none`, which kills `title`.

| Primitive | Change |
|---|---|
| **Button** (`button.tsx`) | Keep 1px ink border, `sw-sm`, press-in (`hover:translate-x-px hover:translate-y-px hover:shadow-none`, `active:translate-[2px]`) and hover darkening through the `-hover` tokens. The transition becomes `transition-[transform,box-shadow,background-color] duration-press ease-out-expo`. `warning` gets ink text. `secondary` hover becomes `panel-hover`. New sizes: `icon-sm` (h-8) and `icon-xs` (h-6), both with the hit-area overlay. New variant: `outline-destructive`. Export `buttonClass({ variant, size })` so a `<Link>` can carry button styling. Correct the 2.5.8 comment (AA floor is 24px; 44px is 2.5.5 AAA). |
| **Card** (`card.tsx`) | `interactive`: press-in instead of lift, `transition-[transform,box-shadow,border-color]`, keep `hover:border-ink`, add the control focus ring. `CardTitle` becomes `font-bold`. Delete the stale amber comment. Tracker cards get a visible resting frame (white, 1px ink, `sw-sm`), because they sit on bare canvas. |
| **Input / Textarea** | Background becomes `bg-white` (the pack's elevated field). `aria-invalid:border-destructive`. Keep `text-sm` and `px-3 py-2`. The Textarea's `min-h-[60px]` becomes `min-h-16`. |
| **Label** | The default becomes what all 37 call sites already override it to: `font-mono text-xs uppercase tracking-wider text-steel`. Call sites wire `htmlFor`. |
| **Dialog** (`dialog.tsx`) | **Chrome:** 1px ink border, `bg-white`, `shadow-sw-lg`, built-in `p-6`, `overscroll-contain`. **Header:** left-aligned (drop `text-center`). **Title:** serif `text-2xl` bold uppercase, `text-balance`. **Footer:** standard band, `-mx-6 -mb-6 mt-6 border-t border-ink bg-panel p-4`, right-aligned, primary last. **Close X:** ghost `icon-sm` Button with `aria-label`. **Focus contract:** first tabbable gets focus on open, Tab and Shift+Tab are trapped, focus returns to the trigger on close; Esc and scroll-lock stay. **Width:** a `size` prop replaces the 9 ad-hoc widths: `sm` = `max-w-md`, `md` (default) = `max-w-lg`, `lg` = `max-w-2xl`, `xl` = `max-w-5xl`. `LinkDialog` and the enrichment modal's native `<dialog>` move onto Dialog. Backdrop is `bg-overlay`. |
| **ConfirmDialog** | Remove the 48px `! ? ✓` glyph tiles. The description is set in sans `ink-soft`, not mono. `errorMessage` renders as an Alert (`tone="error"`). Every irreversible delete uses `variant="danger"`: `bulk-action-bar.tsx:63`, `settings/page.tsx:1491,1503`. |
| **Dropdown** | A proper select. **Trigger:** styled as a field (h-10, 1px ink border, `bg-white`, no shadow or press), `aria-labelledby` pointing at the label id plus the value id, `type="button"`. **Options:** selected is `bg-panel font-bold` with an `aria-hidden` Check icon; options are separated with `divide-y divide-ink`, not `-mt-[1px]`. **Keyboard:** arrows, Home, End and Esc; focus enters the list on open and returns on close. **Placeholder:** a real placeholder prop, never rendered as selected; this fixes the tracker "Move to" bug. |
| **ToggleSwitch** | Clicking the row label toggles it. Track at least 24px tall. `variant: 'card' \| 'inline'`; `inline` replaces the two hand-rolled switches in `formatting-controls.tsx:416-450`, which also animate `left`. |
| **RetroTabs** | `role="tablist"`, `tab` and `tabpanel`, `aria-selected` and `aria-controls`, roving tabindex, arrow keys, `type="button"`. Delete the rgba shadow (`:52`) and the hex hover. |
| **RichTextToolbar** | `icon-sm` buttons with a wider `gap` so hit areas don't overlap. Active toggles use ink selection (D14) with `aria-pressed`. |

**Three more visible changes (ratified with §5):**
- Dialogs move from Canvas to a white background.
- Inputs become white.
- Dropdown triggers become fields rather than shadowed buttons.

**API conventions** (from vercel-composition-patterns):
- Appearance is a closed-set string variant or `tone`.
- Structure is compound components and children.
- No boolean mode props, no `render*` props.
- New primitives use React 19 ref-as-prop. The existing `forwardRef` files are left as they are unless edited for another reason.

## 6. New primitives and the page frame

**Server-safe (no `'use client'`):** PageFrame, PageHeader, Alert, StatusIndicator, EmptyState and PanelHeader. Sub-project 2 can turn these into a static shell. Presence animation is added by a separate client wrapper (§7). SegmentedControl needs event handlers, so it is a client component.

| New | Spec | Replaces |
|---|---|---|
| **Alert** (`ui/alert.tsx`) | `tone: 'info' \| 'success' \| 'warning' \| 'error'`. Layout: `border-2 border-{tone} bg-{tone}-tint p-4`, a mono uppercase bold label in the tone's text token, an `ink-soft` sans body, and optional actions as children. No shadow. Role is `alert` for error/warning, `status` otherwise. A composed `LlmSetupAlert` (`components/common/`) unifies the "LLM not configured" banner. | 7 alert recipes; the banner at `dashboard:576-596`, `dashboard:603-628` and `tailor:435-457` |
| **StatusIndicator** | A 12px square (`size-3`) plus a mono uppercase label; the label is always rendered. `tone: 'ready' \| 'warning' \| 'error' \| 'active' \| 'neutral'`. Persistent state uses squares; `Loader2` is only for in-progress work. | Spinner-as-status (`dashboard:484-509`, viewer), circle icons in settings, 8px squares, the builder save pill |
| **PanelHeader** | A square plus a mono `text-xs` uppercase caption, with children as a right-side slot. `tone: 'input' \| 'output' \| 'neutral'`: blue for the editor/input, green for the preview/output, ink otherwise. | About 7 panel-header recipes in the builder, enrichment and tailor |
| **SegmentedControl** | `items`, `value` and `onChange`. `role="radiogroup"` with `role="radio" aria-checked`, roving tabindex and arrow keys, labelled by its heading. Selected options use an ink fill with white text; unselected ones are outline. | 6 groups in `formatting-controls.tsx`, Settings' `SEGMENTED_BUTTON_*`, toolbar toggles |
| **EmptyState** | Left-aligned. A mono uppercase label, one line of sans `ink-soft` copy (`max-w-[60ch]`) and at most one action. No icon tile, no centring. | 5 empty-state recipes: builder item forms, generate prompt, kanban, previews, wizard |
| **PageFrame** | Canvas page; the blueprint-grid background defined **once** as a `globals.css` utility (house signature); a 1px ink frame with `sw-lg`, centred in the viewport with content left-aligned inside. `width: 'default' \| 'wide'`. | Seven page shells: SwissGrid, the tracker's inline copy, settings, tailor, wizard, viewer |
| **PageHeader** | Compound parts: `PageHeader.Back`, an outline `sm` `<Link>` via `buttonClass` with an arrow; `PageHeader.Title`, an `h1` in serif bold uppercase `text-4xl md:text-5xl` with `text-balance`; `PageHeader.Subtitle`, a mono `//` line in `steel`; `PageHeader.Actions`, holding at most one primary. | 3 header styles and 4 back-link styles, including `<Link><Button>` nesting (invalid) |

**Adoption.**
- Dashboard, tracker, settings, tailor, wizard and viewer use `PageFrame` and `PageHeader`.
- The builder keeps its full-width editor shell and adopts `PageHeader` and `PanelHeader`.
- **Builder structural fix:** the right panel shows output only. Interview prep, cover letter, outreach and the generate prompts render in **one** panel (`resume-builder.tsx:1572/1717, 1590/1732, 1599/1742`).
- The tracker checkbox stays native: `size-4` with an ink `accent-color`. A Checkbox primitive isn't justified yet (one call site).

## 7. Motion

**Install** `motion`, pinned to the newest release that is at least 14 days old when phase 4 starts.

**Provider:** `components/common/motion-provider.tsx` (`'use client'`), mounted in `app/(default)/layout.tsx` inside the error boundary and never in `app/print/**`.

```tsx
// motion-features.ts — separate module so the feature chunk splits
import { domAnimation } from 'motion/react';
export default domAnimation;
// motion-provider.tsx
const loadFeatures = () => import('./motion-features').then((r) => r.default);
<LazyMotion features={loadFeatures} strict>
  <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
```

`strict` makes any import of `motion` instead of `m` throw. First load grows by about 5KB gz; measure it in phase 4. No content visible at first paint may depend on Motion.

**Policy:**
1. Motion is **feedback only**: press, state legibility, drag affordance, and presence of overlays and alerts.
2. **One curve and one spring.** The curve is `cubic-bezier(0.16,1,0.3,1)`. The spring is `{ type: 'spring', visualDuration: 0.2, bounce: 0 }`.
3. **Durations.** Press tier 100ms. Surface tier 200ms in and 120ms out. Nothing longer in product UI.
4. **Properties.** `transform` and `opacity`. Colour and `box-shadow` are allowed in the press tier only. Banned: `transition-all`, layout properties, and Motion's `layout`.
5. **Press-in is the only hover/press motion.** No negative translate, no shadow gain, no `whileTap`.
6. **Surfaces snap.** Panels, accordions, tabs and route content change instantly. The exceptions are the presence items below.
7. **Interruptible.** Reversible state uses CSS transitions or springs. `@keyframes` is only for spinners and the hero entrance. Drag stays with dnd-kit.
8. **Reduced motion.** `MotionConfig reducedMotion="user"` plus the CSS block in §4.4. `Loader2` stays. Kanban `scrollBy`/`scrollIntoView` uses `'auto'`, and `useSortable({ transition: null })` applies under reduced motion.

| Component | Tool | Values |
|---|---|---|
| Dialog (and ConfirmDialog, LinkDialog through it) | Motion `AnimatePresence` | Overlay opacity 0→1 over 200ms and back over 120ms. Panel `initial {opacity 0, scale 0.95}` → `{1, 1}`, opacity tweened, scale on the spring; exit mirrors at 120ms. |
| Dropdown menu | Motion | Opacity plus scale 0.98 with `transformOrigin: top`; 120ms in, 80ms out. |
| Alerts (dashboard, builder, tailor, upload dialog) | Client `Presence` wrapper (`m.div`) | Opacity, 200ms in and 120ms out; `initial={false}`. |
| List add/remove (kanban cards, builder entries) | Motion | The outer `m.div` fades 150ms in and 120ms out. The inner node stays dnd-kit's and owns `transform`. Siblings snap. |
| Save → "Saved" label swap (settings) | Motion `mode="wait"` | Opacity crossfade, 100ms. |
| Buttons, chips, toggles, tabs, chevrons | CSS | `duration-press ease-out-expo` |
| Kanban drag and sort | dnd-kit | `useSortable({ transition: { duration: 200, easing: 'cubic-bezier(0.16,1,0.3,1)' } })` |
| Home hero entrance (D10) | CSS `@keyframes` | Opacity 0→1 and `translateY(8px)`→0 over 300ms expo; staggered 0/60/120ms across headline, subtitle and CTA; static under reduced motion. |

**Removals.**
- The spinning `Sparkles` and `Check` (`regenerate-instruction-dialog.tsx:152`, `regenerate-diff-preview.tsx:287`) become `Loader2`.
- The ATS bar's 500ms `width` transition goes.
- `--animate-gradient` goes.
- `tw-animate-css` goes.

**Tests.** `vitest.setup.ts` sets `MotionGlobalConfig.skipAnimations = true`, so exit animations finish instantly and existing assertions stay deterministic in jsdom. Both are verified against `motion` 14.1.0:
- `MotionGlobalConfig` comes from `motion-utils` with `skipAnimations?: boolean`, and is re-exported by `framer-motion`/`motion`.
- Motion only reads `window.matchMedia` behind an `if (window.matchMedia)` guard, so jsdom needs no stub.

App code reads reduced motion through Motion's `useReducedMotion()` (for example the kanban scroll behaviour), never through raw `matchMedia`. Re-check both if the pinned version differs.

## 8. Craft checklist (applies to every touched component)

These are distilled from better-ui, interface-design, web-design-guidelines, interaction-design, frontend-ui-engineering and fixing-accessibility, with the Swiss pack taking priority where they disagree.

1. **Focus:** the specs in §5. Never a bare `focus:` or an unreplaced `outline-none`.
2. **Hit targets:** at least 24×24 (AA, 2.5.8), 44 as the house target, never overlapping.
3. **Icons:** `size={16}` minimum. `strokeWidth` 1.5 beside regular text, 2 beside medium or bold text. Functional icons only. Decorative icons get `aria-hidden`.
4. **Icon-only controls** carry `aria-label` and `title`. No text glyphs (`+ ! ? ✓ •`) used as icons.
5. **Icon plus text buttons:** the icon-side padding is 2px less than the text side (inside primitives only).
6. **`tabular-nums`** on counts, scores and dates.
7. **`text-balance`** on h1–h3; **`text-pretty`** on descriptions.
8. **User strings:** `truncate` or `line-clamp-N`; flex children get `min-w-0`; free text gets `[overflow-wrap:anywhere]`.
9. **Type floor:** `text-xs`.
10. **Native semantics:** `<button type="button">` for actions, `<Link>` for navigation. No `<Card onClick>` without keyboard support. The dashboard tiles become links, and their nested buttons are moved out of the link.
11. **Dialog contract** as in §5.
12. **Select and menu contract** as in §5.
13. **Tabs:** full ARIA tabs semantics. A page-level tab is reflected in the URL.
14. **Segmented groups:** `radiogroup` for single-select, `aria-pressed` for independent toggles.
15. **Switches:** `role="switch"` and `aria-checked`, with a clickable row label.
16. **Forms:** `<Label htmlFor>`; `aria-invalid` plus an inline error with `role="alert"` and `aria-describedby`; `name`, `autocomplete` and `inputmode` where relevant.
17. **States:**
    - Controls: hover, active, focus-visible, disabled.
    - Data: loading, empty, error.
    - Async results: `role="status"`.
18. **Disabled:** `opacity-50 cursor-not-allowed`.
19. **Dates** go through one shared `formatDate(locale)`. No bare `toLocaleDateString()` and no `'en-US'`.
20. **No layout nudges at call sites** (`-mt-[1px]`, `top-[-2px]` and similar). Use gap, grid or divide instead. A primitive may define one structural bleed, such as the Dialog footer's `-mx-6 -mb-6`, so call sites never need one.
21. **Microcopy** (writing-guidelines plus swiss-design's typographic details):
    - `…`, never `...`; curly quotes; `Loading…` and `Saving…`.
    - No "easy", "simple" or "just".
    - Source strings in sentence case, with CSS `uppercase` doing the visual casing.
    - A non-breaking space between a value and its unit.
    - Every new or changed key is mirrored in all locales under `messages/` (en, es, fr, ja, ko, pt-BR, zh).
22. **One primary per region.**
    - Builder header: Save is primary, Download and Reset are outline (`resume-builder.tsx:1403-1443`).
    - Viewer: Enhance and Download.
    - Outreach: a single Copy.
    - Hero: one primary CTA plus outlines.
23. **`<meta name="theme-color" content="#F0F0E8">`** in the root layout.

## 9. Swiss guard and verification

### 9.1 Guard (`apps/frontend/tests/swiss-guard.test.ts`)

It scans `app/**/*.tsx` and `components/**/*.tsx`. It excludes `components/resume/**`, `app/print/**`, tests, and `globals.css`, where tokens are defined.

| Rule | Pattern (summary) |
|---|---|
| radius | `rounded-*` other than `rounded-none` |
| soft-shadow | `shadow`, `shadow-(sm\|md\|lg\|xl\|2xl\|inner)`, arbitrary `shadow-[…]` |
| gradient | `bg-gradient-*`, `bg-linear-*`, `bg-radial-*`, `linear-gradient(` |
| palette | `(bg\|text\|border\|ring\|fill\|stroke\|outline\|divide\|placeholder\|from\|to\|via\|accent\|caret\|decoration)-(slate\|gray\|zinc\|neutral\|stone\|red\|orange\|amber\|yellow\|lime\|green\|emerald\|teal\|cyan\|sky\|blue\|indigo\|violet\|purple\|fuchsia\|pink\|rose)-\d+` |
| raw-colour | `[#hex]` in classes; `#hex` or `rgba?(` inside string literals, `className` values and `style` objects. Comments are stripped before matching, so the hex values in primitive doc-comments don't count. |
| ink-tint | `(text\|border)-black/\d+` |
| dark | `dark:` |
| type-size | `text-\[\d+px\]` |
| spacing | `(p\|m\|gap\|space)[trblxy]?-(5\|7\|9\|10\|11\|14)` and half-steps, outside `components/ui/**` |
| transition | `transition-all` |
| keyframes | `animate-(bounce\|pulse\|ping)` |
| motion-import | `import { motion` from `motion/react` (use `m`) |
| decorative-icon | importing `Sparkles`, `Wand*`, `Star*`, `Heart`, `Zap`, `Rocket`, `PartyPopper` |
| glyph | `✨ ✓ ✔ ⭐ 🚀 •` in JSX text nodes only, not in string props or user content |

**How the ratchet works.**
- `tests/swiss-guard.allowlist.json` stores `{ file: { rule: count } }`. Counting rather than matching lines means unrelated edits don't trip it.
- **The test fails when a count rises** (new drift).
- **It also fails when a count falls** without the allowlist being lowered, so each phase deletes its own lines.
- Failures print `file:line`, the snippet, the rule and a fix hint.
- **End state:** the allowlist is empty except for the two D19 dead files.

**Anti-theater check, in the phase 0 commit notes.** Show the test failing three ways:
- an injected `rounded-lg`;
- a lowered count;
- a raised count.

### 9.2 Contrast test (`apps/frontend/tests/swiss-contrast.test.ts`)

It parses the token hex values from `globals.css` and asserts WCAG AA, 4.5:1, for every text-on-surface and text-on-fill pair in §4.1. It also asserts 3:1 (SC 1.4.11) for non-text graphics that carry meaning on their own: the `primary`, `success` and `destructive` squares and alert borders, and the 1px ink control borders. Changing a token so that any pair falls below its threshold fails the test.

**Exemption:** `warning` (#F97316, 2.45:1 on Canvas) is exempt from the 3:1 non-text check, which keeps the orange unchanged ("same look"). This holds because the orange never carries meaning alone:
- every StatusIndicator square is paired with its label;
- every warning Alert border sits beside a `warning-text` label on a tint;
- warning buttons are identified by their 1px ink border and ink text.

The test encodes the exemption explicitly, with that justification in a comment. The alternative, deepening the fill to `#E26502` (3.01:1, ink text 6.10:1, a visible 5-point darkening), stays available if the owner prefers strict 1.4.11 compliance.

### 9.3 Behaviour tests

Each test is written to fail against the pre-change code where the behaviour is new:
- **Dialog:** focus moves in, Tab cycles, focus returns, Esc closes.
- **Dropdown:** keyboard navigation, the value is announced, the placeholder is never shown as selected.
- **SegmentedControl:** arrows and radio semantics.
- **Alert:** roles per tone.
- **StatusIndicator:** text is always present.
- **ToggleSwitch:** clicking the row label toggles it.
- **Builder:** the right panel renders output only.
- **ConfirmDialog:** delete flows use `danger`.

Existing tests that assert old markup are updated, never deleted or skipped.

### 9.4 Gates per phase

- `npm run lint`, `npm run typecheck`, `npm run test` (guard and contrast included), `npm run build`.
- Locale parity.
- The full `.githooks/pre-push` script, run manually because `core.hooksPath` isn't set in this clone.
- Impeccable `detect --json` once over the changed files.
- The commit notes list the pages the owner should review.
- Bundle: record first-load JS from `.next/diagnostics/route-bundle-stats.json` in phase 0 and again after phase 4.

## 10. Phases (each one is a green commit pushed to `dev`)

| Phase | Contents | Owner review |
|---|---|---|
| **0. Guard first** | Guard test, frozen allowlist, contrast test, recorded bundle numbers. | — |
| **1. Tokens** | §4 in full, including the brand-unification overrides (§4.6) and the font cleanup in `app/layout.tsx`. | All pages: secondary text darker, brand colours unified |
| **2. Fix primitives** | §5 plus behaviour tests. The owner's uncommitted tracker padding edits (`card-detail-modal.tsx:92`, `manual-add-application-dialog.tsx:96`) become unnecessary with built-in Dialog padding. Fold them in only with the owner's go-ahead. | Every dialog, form and dropdown |
| **3. New primitives** | §6, including PageFrame and PageHeader, plus tests. No adoption yet beyond what's needed to test them. | — |
| **4. Motion** | §7: provider, presence items, CSS tokens, reduced motion, hero entrance; `tw-animate-css` removed; bundle re-measured. | Dialogs, menus, alerts, hero |
| **5a. Dashboard + home** | Sweep: palette to tokens, overrides deleted, primitives and PageFrame adopted, structural and a11y fixes. Allowlist shrinks. | Home, dashboard |
| **5b. Builder + enrichment + preview** | Same, plus the one-panel structural fix. | Builder (all tabs), enrichment modal |
| **5c. Tailor + ATS card + diff modal** | Same, plus the ATS card re-skin and making it visible on its own. | Tailor flow |
| **5d. Resume wizard + viewer** | Same. | Wizard, viewer |
| **5e. Tracker** | Same. | Tracker, tracker dialogs |
| **5f. Settings** | Same, plus the footer moving to canvas. | Settings |
| **6. Docs + final audit** | §12 docs reconciliation; remove the §4.6 overrides; an improve-ui pass per surface with a11y findings explicitly requested; Impeccable `detect`. | — |
| **7. Icons (parked)** | §13. | Every surface |

## 11. Visible changes (ratified)

1. Secondary text (`steel`) darkens from 2.94:1 to 4.53:1, in about 173 places.
2. Dashboard tiles and tracker cards press in on hover instead of lifting (7 places).
3. Orange warning buttons get ink text instead of white.
4. One value per brand colour. For example, Tailwind's `#1447E6` blue becomes the brand `#1D4ED8` in 104 places, and red, green and orange are unified the same way.
5. Dialogs: built-in padding, white background, exit animation, focus trapped and returned.
6. Body copy at `red-900`/`amber-900` (3 places) moves to `ink-soft`.
7. Inputs and textareas become white.
8. Dropdown triggers become fields rather than shadowed buttons.
9. Selected segments and toggles become an ink fill (blue is reserved for actions).
10. `//` subtitles become steel instead of blue on the dashboard and tailor.
11. One H1 size for app pages: the dashboard comes down from 7xl and becomes bold.
12. Section headers move from mono to serif bold, sentence case (22 places).
13. Empty states become left-aligned with no icon tiles.
14. The ATS score card is re-skinned into the Swiss system.
15. A home hero entrance: a one-off 300ms fade and rise.

## 12. Docs reconciliation (phase 6)

- **Swiss pack.** Bring `docs/portable/swiss-design-system/*.md` in line with the house conventions ratified here:
  - 1px borders on buttons, inputs and dialogs; 2px on alerts and emphasised cards.
  - The shadow-role table.
  - 12px in the spacing scale.
  - The motion policy from §7, replacing "no transitions".
  - `Loader2` for in-progress work only.
  - Ink selection.
  - The neutral scale and `steel` value.
  - Ink text on warning fills.
  - Fonts as rendered.
  - Dialog chrome; title casing.
  - Update the pre-merge checklist and mention the guard.
- **`apps/frontend/CLAUDE.md`:** the Styling section, the guard and how to update its allowlist, the motion provider and the `m` rule.
- **`.claude/CLAUDE.md`:** the design quick-reference table, with Steel `#696D75` and the new tokens.
- **`.impeccable.md`:**
  - Remove the contradictions: "push toward brutalist", "replace Space Grotesk", the Space Grotesk "forbidden" entry, and "dark mode flagged" (already done).
  - Record D1, D3, D4 and D6.
  - Migrating to Impeccable 4.3's `PRODUCT.md`/`DESIGN.md` format is offered as a follow-up, not done here.
- **`docs/agent/testing-strategy.md`:** add the guard and contrast tests.

## 13. Parked: icon family (phase 7)

- **Current state.**
  - 50 distinct `lucide-react` icons in app UI.
  - Contact and brand icons (`Linkedin`, `Github`, `Phone`, `MapPin`) live almost entirely in the out-of-scope printed templates.
  - 44 files import from the barrel.
- **Candidates:** Phosphor, Google Material Symbols (the Sharp style is the closest fit to Swiss geometry) and Solar.
- **Not suitable for product UI:**
  - Twemoji and Fluent Emoji Flat: emoji are banned in product UI.
  - Arcticons: Android launcher app icons, CC BY-SA.
- **Decision method.** A side-by-side comparison of the 50 in-use icons in each candidate, on Canvas with real buttons and labels. Weigh:
  - licence fit with Apache-2.0;
  - coverage of all 50;
  - tree-shaking and RSC safety;
  - stroke/weight matching against Space Grotesk and Helvetica.
- **Implementation:** a single `components/ui/icons.ts` module mapping app-level names to the chosen library. The guard then bans icon imports anywhere else.
- **Brand logos (later, not part of phase 7).** SVG Logos is a candidate for AI-provider marks, for example in the Settings provider picker when someone selects a provider. Under the pack these render **monochrome** (ink, or `currentColor`) as functional identifiers, never as full-colour decoration. Simple Icons, which ships mono brand SVGs, is the alternative. Check each logo's licence and the provider's trademark usage guidelines before shipping. This item gets its own small design pass.

## 14. Sub-project 2: Next.js performance (separate spec, after this one)

- **next-bundle-optimizer:** fix the existing first-load breach (245–321KB gz against the 250KB budget, per the last build's `route-bundle-stats.json`).
- **next-cache-components-adoption → optimizer:** an instant static shell per route.
- **next-partial-prefetching-adoption → optimizer:** instant dashboard ↔ builder ↔ tailor navigation.
- **next-dev-loop:** runtime verification. It needs `agent-browser`, which requires owner approval to install.

The server-safe primitives in §6 are the hand-off point between the two sub-projects.

## 15. Risks

| Risk | Mitigation |
|---|---|
| Sweep commits collide with the owner's upcoming UI follow-ups | Phases are small and land on `dev` one at a time. The owner can rebase onto any phase. Each surface is one commit. |
| Exit animations break tests that expect an immediate unmount | `MotionGlobalConfig.skipAnimations` in the vitest setup (§7). |
| The guard is too noisy for contributors | Count-based allowlist, fix hints in the output, and documentation in CLAUDE.md. Rules are limited to the pack's explicit bans. |
| The Tailwind v4 `duration-*` namespace doesn't resolve | Fall back to `duration-(--duration-press)`, checked on the first build. |
| The Motion chunk delays the first interaction | `LazyMotion` with async features, nothing at first paint depends on it, and the hero stays CSS. |
| Uppercase titles grow long in other locales | `text-balance`, flexible header layout; spot-check the de-facto longest locales (es, fr, pt-BR) in review. |
| "Same look" is judged by eye | §11 lists every ratified change. Anything else that looks different is a bug against this spec. |
