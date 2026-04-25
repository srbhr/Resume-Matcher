# Components

Concrete recipes for the building blocks of a Swiss-style interface. Every component here uses tokens defined in [tokens.md](tokens.md).

> Sibling docs: [tokens](tokens.md) · [layouts](layouts.md) · [anti-patterns](anti-patterns.md)

---

## Buttons

Square corners, 2px black border, hard shadow, press-in hover.

```jsx
<button className="
  rounded-none
  border-2 border-black
  bg-blue-700 text-white
  px-4 py-2
  font-mono uppercase tracking-wider text-sm
  shadow-[2px_2px_0px_0px_#000000]
  hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none
  transition-none
">
  Submit
</button>
```

### Variants

| Variant | Background | Text | When |
|---------|------------|------|------|
| Primary | `bg-blue-700` | white | Default action |
| Success | `bg-green-700` | white | Confirm, save, download |
| Destructive | `bg-red-600` | white | Delete, cancel-with-loss |
| Warning | `bg-orange-500` | white | Risky but reversible |
| Outline | transparent | black | Secondary actions |

**Rule**: only one Primary button per logical screen region. If you find yourself adding a second, demote it to Outline.

### Don't

- Don't add `transition` curves — Swiss style is binary, not animated
- Don't use icons inside buttons unless absolutely necessary; if you do, use a single mono-colored icon, never decorative

---

## Inputs

```jsx
<input
  type="text"
  className="
    rounded-none
    border border-black
    bg-white
    px-3 py-2
    font-sans text-base
    focus:outline-none focus:ring-1 focus:ring-blue-700
  "
/>
```

- 1px black border (not 2px — inputs are denser)
- Focus state: 1px Hyper Blue ring, no glow
- White background only (so they read as elevated against the canvas)

### Labels

Always paired with monospace uppercase labels:

```jsx
<label className="font-mono text-sm uppercase tracking-wider mb-1 block">
  Email Address
</label>
```

### Textareas

Same as inputs. If you're embedding textareas inside another keyboard-handled component (modals, command palettes, draggable cards), make sure Enter doesn't bubble up:

```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter') e.stopPropagation();
};
```

---

## Cards

```jsx
<div className="
  bg-white
  border-2 border-black
  rounded-none
  shadow-[4px_4px_0px_0px_#000000]
  p-6
">
  <h2 className="font-serif text-2xl font-bold mb-4">Card Title</h2>
  <p className="font-sans text-base">Card body content.</p>
</div>
```

- 2px border (heavier than inputs because cards are anchors)
- 4px shadow (heavier than buttons because they're stationary)
- White background to lift off the canvas

### Featured / hero cards

For the one or two most important cards on a page:

```jsx
<div className="
  bg-white
  border-2 border-black
  shadow-[8px_8px_0px_0px_#000000]
  p-8
">
```

8px shadow signals "this is the headline element". Use sparingly.

---

## Dialogs / Modals

```jsx
<div className="
  fixed inset-0 bg-black/30 flex items-center justify-center
">
  <div className="
    max-w-md w-full
    bg-white
    border-2 border-black
    shadow-[4px_4px_0px_0px_#000000]
    p-6
  ">
    <h2 className="font-serif text-2xl font-bold mb-4">Confirm</h2>
    {/* content */}
  </div>
</div>
```

- Centered, `max-w-md` by default (wider only if the form genuinely demands it)
- Backdrop is `bg-black/30` — never blurred
- The dialog itself is just a card with extra emphasis

---

## Alerts

Status alerts use the matching status color family. Border is always 2px in the status hue.

```jsx
// Danger
<div className="bg-red-100 border-2 border-red-600 p-4">
  <p className="font-mono uppercase text-sm font-bold text-red-600 mb-1">Error</p>
  <p className="font-sans">Something went wrong.</p>
</div>

// Warning
<div className="bg-orange-100 border-2 border-orange-600 p-4">

// Success
<div className="bg-green-100 border-2 border-green-700 p-4">

// Info
<div className="bg-blue-100 border-2 border-blue-700 p-4">
```

The pattern is always: pale-100 background, 600/700 border and label.

---

## Status Indicators

A 12px square + a monospace uppercase label. No icons, no spinners, no animated dots.

```jsx
// Ready
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-green-700" />
  <span className="font-mono uppercase font-bold text-green-700">STATUS: READY</span>
</div>

// Setup Required
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-orange-500" />
  <span className="font-mono uppercase font-bold text-orange-500">STATUS: SETUP REQUIRED</span>
</div>

// Error
<div className="flex items-center gap-2">
  <div className="w-3 h-3 bg-red-600" />
  <span className="font-mono uppercase font-bold text-red-600">STATUS: ERROR</span>
</div>
```

### Why squares, not circles?

Circles are decorative. Squares are structural. The whole pack is built on rejecting decorative geometry.

---

## Quick reference snippets

```jsx
// Swiss button
<button className="rounded-none border-2 border-black bg-blue-700 text-white px-4 py-2 font-mono uppercase text-sm shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none">

// Swiss card
<div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_0px_#000000] p-6">

// Swiss label
<label className="font-mono text-sm uppercase tracking-wider">

// Swiss section header
<h2 className="font-serif text-2xl font-bold">
```

For composing these into pages, see [layouts.md](layouts.md).
