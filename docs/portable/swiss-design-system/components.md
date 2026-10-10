# Components

Concrete recipes for the building blocks of a Swiss-style interface. Every component here uses tokens defined in [tokens.md](tokens.md).

> Sibling docs: [tokens](tokens.md) · [layouts](layouts.md) · [anti-patterns](anti-patterns.md)

**Build each of these once** and import it. A recipe that gets restyled at the call site is how the style drifts: if a button, field or dialog needs to look different, the shared component is wrong, so fix it there.

---

## Buttons

Square corners, 1px ink border, 2px hard shadow, press-in hover.

```jsx
<button className="
  relative inline-flex items-center justify-center gap-2 rounded-none
  h-10 px-6 py-2
  border border-ink bg-primary text-white
  font-mono text-sm font-medium uppercase tracking-wide
  shadow-sw-sm
  hover:bg-primary-hover hover:translate-x-px hover:translate-y-px hover:shadow-none
  active:translate-x-[2px] active:translate-y-[2px]
  transition-[transform,box-shadow,background-color,color]
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
  focus-visible:ring-offset-2 focus-visible:ring-offset-canvas
  disabled:pointer-events-none disabled:opacity-50
">
  Submit
</button>
```

### Variants

| Variant | Fill | Text | Border | When |
|---------|------|------|--------|------|
| `default` | `bg-primary` | white | ink | The one primary action |
| `success` | `bg-success` | white | ink | Confirm, save, download |
| `destructive` | `bg-destructive` | white | ink | Delete, remove, cancel-with-loss |
| `outline-destructive` | `bg-canvas` | `text-destructive` | `border-destructive` | A destructive action that is not the primary one |
| `warning` | `bg-warning` | **ink** | ink | Risky but reversible |
| `outline` | `bg-canvas` | ink | ink | Secondary actions |
| `secondary` | `bg-panel` | ink | ink | A secondary action that needs a filled look |
| `ghost` | transparent | ink | none | Toolbar and icon buttons |
| `link` | transparent | `text-primary` | none | Inline actions that read as links |

Hover darkens the fill through the matching `-hover` token. `outline` and `ghost` hover to `panel`, `secondary` to `panel-hover`, and `outline-destructive` to `destructive-tint`. Disabled buttons use `disabled:pointer-events-none disabled:opacity-50`. **Warning buttons take ink text, never white.**

**Rule**: only one Primary button per logical screen region. If you find yourself adding a second, demote it to Outline.

### Sizes

| Size | Height | Use |
|------|--------|-----|
| `default` | 40px | Standard button |
| `sm` | 32px, `text-xs` | Header links, inline actions |
| `lg` | 48px | Large, prominent button |
| `icon` | 44px square | Icon-only, house hit target |
| `icon-sm` | 32px square | Toolbars, dialog close |
| `icon-xs` | 24px square | Dense rows (the AA minimum) |

Icon buttons carry a transparent `::before` overlay that enlarges the hit area without changing layout (an `icon-sm` reaches roughly 44px). Keep a `gap-3` or more between neighbours so the hit areas never overlap.

### Buttons that navigate

Navigation is an `<a>`/`<Link>`, not a button. Don't nest a button inside a link (invalid HTML, two tab stops). Export the class recipe as a function, `buttonClass({ variant, size })`, and put it on the link:

```jsx
<Link href="/dashboard" className={buttonClass({ variant: 'outline', size: 'sm' })}>Back</Link>
```

### Don't

- Don't add `transition-all`. Name the properties; see [Motion](tokens.md#motion)
- Don't use icons inside buttons unless they are functional; if you do, use a single mono-colored icon (16px, `aria-hidden`), never decorative. An icon-only button needs an `aria-label` and a `title`
- Don't put a glyph (`+`, `✓`, `•`) in the label as an icon

---

## Inputs

```jsx
<input
  type="text"
  className="
    h-10 w-full rounded-none
    border border-ink bg-white
    px-3 py-2
    font-sans text-sm
    placeholder:text-steel
    aria-invalid:border-destructive
    focus-visible:outline-none focus-visible:border-primary
    focus-visible:ring-1 focus-visible:ring-primary
    disabled:cursor-not-allowed disabled:opacity-50
  "
/>
```

- 1px ink border (inputs are denser than cards)
- Focus state: Hyper Blue border plus a 1px Hyper Blue ring, no glow
- White background only (so they read as elevated against the canvas)
- Invalid state: `aria-invalid="true"` turns the border `destructive`; add an inline error with `role="alert"`, linked by `aria-describedby`

### Labels

Always paired with uppercase label-face labels, wired to the field with `htmlFor`:

```jsx
<label htmlFor="email" className="font-mono text-xs font-medium uppercase leading-none tracking-wider text-steel">
  Email Address
</label>
```

Use one label style everywhere, including the label a select draws for itself.

### Textareas

Same as inputs, with `min-h-16`. If you're embedding textareas inside another keyboard-handled component (modals, command palettes, draggable cards), make sure Enter doesn't bubble up:

```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};
```

---

## Selects, switches, tabs and segmented controls

One rule covers them all: **selected means ink.** A selected segment or an "on" switch is an ink fill with white text. Blue is reserved for actions, links and focus, so a blue fill always means "you can press this".

### Select (dropdown)

A real select, not a styled button.

- **Trigger:** looks like a field. `h-10`, 1px ink border, `bg-white`, no shadow and no press-in. A chevron sits at the right; the current value is shown in bold. `type="button"`, `aria-haspopup="listbox"`, labelled by its label and its value
- **Menu:** white, 1px ink border, `shadow-sw-default`, options separated with `divide-y divide-ink`. The selected option is `bg-panel font-bold` with a check icon (`aria-hidden`). It opens upward when it would be clipped below
- **Placeholder:** a placeholder prop. It is shown in `steel` and nothing is marked selected; a placeholder is never rendered as if it were a value
- **Keyboard:** Arrow keys, Home, End, Escape. Focus moves into the list on open and returns to the trigger on close

### Switch

`role="switch"` with `aria-checked`. A square thumb on a 24px-tall track: `bg-ink` when on, `bg-panel` when off. Clicking the row label toggles it. Two layouts: `card` (the row is a bordered white box with the nested shadow, `shadow-sw-nested`) and `inline`.

### Tabs

`role="tablist"`, `tab` and `tabpanel`, with `aria-selected`, `aria-controls`, a roving tabindex and Left/Right arrow keys. The active tab is white and joins its panel (no bottom border); inactive tabs are `panel` with a 1px ink border.

### Segmented control

Single-select: `role="radiogroup"` with `role="radio"` and `aria-checked`, roving tabindex, arrow keys, labelled by its heading.

```jsx
// selected
<button role="radio" aria-checked="true"  className="min-h-10 rounded-none border border-ink bg-ink px-4 font-mono text-sm uppercase tracking-wider text-white">
// not selected
<button role="radio" aria-checked="false" className="min-h-10 rounded-none border border-ink bg-white px-4 font-mono text-sm uppercase tracking-wider text-ink hover:bg-panel">
```

A thumbnail variant (image or preview pickers) marks the selection with a 2px ink outline and offset instead of a fill. Independent on/off toggles (bold, italic) are not a radio group: use `aria-pressed`, with the same ink fill for "on".

---

## Cards

```jsx
<div className="
  rounded-none
  bg-white
  border border-ink
  shadow-sw-nested
  p-6
">
  <h2 className="font-serif text-2xl font-bold mb-4">Card Title</h2>
  <p className="font-sans text-base">Card body content.</p>
</div>
```

- 1px ink border, same as every other surface
- The nested shadow: a 4px hard offset in translucent ink (15%), no blur. A card sits inside a page frame or a dialog, which already carry the solid shadow, so a card takes the quiet one
- White background to set it apart from the canvas
- A plain grouping with no frame at all is allowed: canvas fill, no border, no shadow
- `shadow-sw-nested` is the one card shadow, static or clickable. A card never carries a solid shadow; solid ink is for what floats (menus, dialogs, the page frame) or presses (buttons)
- Siblings match: if one card in a row has the nested shadow, every card beside it does

### Variants

| Variant | Look | When |
|---------|------|------|
| `default` | Canvas, no border, no shadow | A plain container |
| `outline` | Canvas, `border-2` ink | An emphasized region without a shadow |
| `raised` | White, 1px ink, `shadow-sw-nested`, presses in on hover | A clickable white card inside a frame (cards on a board) |
| `interactive` | Canvas, transparent 2px border, presses in on hover | A clickable tile; it takes the [tile highlight](#clickable-tile-highlight) below, needs a visible focus state and must be reachable by keyboard |
| `ghost` | Transparent | Layout only |

A clickable card presses in on hover like a button; it never lifts. Make the whole tile a link (or give it a real button and keyboard handling), never a bare `onClick` on a `div`.

### Clickable tile highlight

A grid of clickable tiles (navigation or action tiles) highlights with a full blue fill:

- **Hover, and keyboard focus inside the tile:** the tile becomes `bg-primary` and the text, marks and icons on it turn white (white on `primary` is 6.70:1). The fill is the whole highlight.
- **No ink outline.** Don't add an ink border or a 2px frame to the highlighted tile: a second edge next to the fill reads as a mistake.
- **Keyboard focus** uses the same fill plus a 2px inset white ring (`focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white`), because a blue focus ring would vanish into a blue fill.
- Blue still means "you can press this": the whole tile is the action. This is hover and focus feedback, not selection, and a selected thing stays an ink fill.
- A tile also presses in 1px, like any other clickable card. Nothing lifts, and nothing but the fill changes colour.

### Emphasized cards

For the one or two most important cards on a page:

```jsx
<div className="bg-white border-2 border-ink shadow-sw-nested p-8">
```

The 2px border signals "this is the headline element". Use sparingly. A shadow size is a role, not an emphasis dial: don't step a bigger card up to `shadow-sw-default` or `shadow-sw-lg`, which belong to menus, dialogs and the page frame; an emphasized card keeps the nested shadow.

---

## Dialogs / Modals

White panel, 1px ink border, 8px hard shadow. The panel is built from three bands so every dialog has the same rhythm: a header, a scrolling body, a footer.

```jsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Delete project</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogBody>{/* content */}</DialogBody>
    <DialogFooter>
      <Button variant="outline">Cancel</Button>
      <Button variant="destructive">Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

| Part | Look |
|------|------|
| Panel | `bg-white border border-ink shadow-sw-lg`, no padding of its own; `max-h-[90vh]`, flex column |
| Backdrop | `bg-overlay` (ink at 50%), never blurred. A click on it closes the dialog |
| Header | `px-6 pt-6 pb-4`, `border-b border-ink`, left-aligned. Title is serif `text-2xl` bold **uppercase**, `text-balance`; description is sans `ink-soft` |
| Body | `p-6`, scrolls on its own (`overflow-y-auto overscroll-contain`). A box inside it (choice cards, option groups) takes the nested shadow, never a solid one |
| Footer | `px-6 py-4`, `border-t border-ink`, `bg-panel`, right-aligned, primary action last |
| Close | A ghost `icon-sm` button with an `aria-label`, top right |

### Width

A `size` prop replaces ad-hoc widths. Never hand-pick a `max-w-*` at the call site.

| Size | Width | Use |
|------|-------|-----|
| `sm` | `max-w-md` | Confirmations |
| `md` (default) | `max-w-lg` | Short forms |
| `lg` | `max-w-2xl` | Longer forms |
| `xl` | `max-w-5xl` | Side-by-side previews and diffs |

### Focus contract

A dialog without this is not finished:

- Focus moves into the dialog on open: the first focusable element, or an element you name
- Tab and Shift+Tab are trapped inside it
- Focus returns to the element that opened it on close
- Escape closes it; the page behind stops scrolling
- It is labelled by its title (`role="dialog"`, `aria-modal`, `aria-labelledby`)
- While it animates out it is inert, so a second click on "Delete" cannot fire twice

### Confirm dialog

A dialog with a message and two buttons, with a `variant` that picks the confirm button: `danger` (destructive fill) for every irreversible delete, `warning`, `success`, or `default`. No icon tiles or glyphs; the title and the button carry the meaning. An error from the action renders inside the body as an error [Alert](#alerts).

---

## Alerts

Status alerts use the matching status color family. Border is always 2px in the status hue, on a tint, with no shadow.

```jsx
// Error
<div role="alert" className="rounded-none border-2 border-destructive bg-destructive-tint p-4">
  <p className="mb-1 font-mono text-sm font-bold uppercase tracking-wider text-destructive">Error</p>
  <p className="font-sans text-sm text-ink-soft">Something went wrong.</p>
</div>
```

| Tone | Border | Fill | Label | Role |
|------|--------|------|-------|------|
| `info` | `border-primary` | `bg-info-tint` | `text-primary` | `status` |
| `success` | `border-success` | `bg-success-tint` | `text-success` | `status` |
| `warning` | `border-warning` | `bg-warning-tint` | `text-warning-text` | `alert` |
| `error` | `border-destructive` | `bg-destructive-tint` | `text-destructive` | `alert` |

The pattern is always: tint background, status border, label in the status text token, body in `ink-soft`. Put actions below the body as outline buttons (`size="sm"`). One alert component, one recipe: don't hand-roll variants in pages.

---

## Status Indicators

A 12px square + a label-face uppercase label. The label is **always rendered**, so status never depends on color alone.

```jsx
<span className="inline-flex items-center gap-2">
  <span aria-hidden="true" className="size-3 shrink-0 bg-success" />
  <span className="font-mono text-xs font-bold uppercase tracking-wider text-success">Ready</span>
</span>
```

| Tone | Square | Label |
|------|--------|-------|
| `ready` | `bg-success` | `text-success` |
| `warning` | `bg-warning` | `text-warning-text` |
| `error` | `bg-destructive` | `text-destructive` |
| `active` | `bg-primary` | `text-primary` |
| `neutral` | `bg-steel` | `text-steel` |

No circle icons, no dots, no emoji. A **persistent** state is a square. A spinner is only for work that is in flight right now; it is never a resting status.

### Why squares, not circles?

Circles are decorative. Squares are structural. The whole pack is built on rejecting decorative geometry.

---

## Panel headers

A role square, a label-face caption, and an optional right-hand slot for actions, over a 2px ink rule.

```jsx
<div className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink pb-2">
  <div className="flex min-w-0 items-center gap-2">
    <span aria-hidden="true" className="size-3 shrink-0 bg-primary" />
    <h2 className="truncate font-mono text-xs font-bold uppercase tracking-wider text-ink">Editor</h2>
  </div>
  {/* actions */}
</div>
```

The square encodes the panel's role: blue for input (the editor), green for output (the preview), ink for everything else.

---

## Empty states

Left-aligned. An uppercase label, one line of sans `ink-soft` copy (`max-w-[60ch]`), and at most one action. No icon tile, no centering, no illustration.

```jsx
<div className="flex flex-col items-start gap-2 py-6 text-left">
  <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink">No projects yet</p>
  <p className="max-w-[60ch] text-sm text-ink-soft">Create a project and it will appear here.</p>
  <Button variant="outline" size="sm">Create project</Button>
</div>
```

An empty *slot* inside a list may use a framed variant: `border border-dashed border-steel bg-paper p-6`. This is the one place a dashed border is allowed.

---

## Quick reference snippets

```jsx
// Swiss button
<button className="rounded-none border border-ink bg-primary text-white px-6 py-2 font-mono uppercase text-sm font-medium shadow-sw-sm hover:translate-x-px hover:translate-y-px hover:shadow-none">

// Swiss card
<div className="bg-white border border-ink rounded-none shadow-sw-nested p-6">

// Swiss label
<label className="font-mono text-xs font-medium uppercase tracking-wider text-steel">

// Swiss section header (sentence case)
<h2 className="font-serif text-2xl font-bold text-balance">

// Swiss page title (uppercase)
<h1 className="font-serif text-4xl md:text-5xl font-bold uppercase text-balance">
```

For composing these into pages, see [layouts.md](layouts.md).
