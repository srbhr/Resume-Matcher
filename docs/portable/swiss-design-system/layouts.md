# Layouts

How to compose Swiss-style components into full pages. The system rewards mathematical grids and asymmetric balance over centered, decorative arrangements.

> Sibling docs: [tokens](tokens.md) · [components](components.md) · [anti-patterns](anti-patterns.md)

---

## Grid systems

Swiss design is grid-first. Pick a column count up front and stick to it.

### Dashboard / index grid

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

5-column on large screens is unusual on purpose — it creates the asymmetric rhythm the style is known for. 3- or 4-column also works; avoid 2-column for collections (too symmetric).

### Editor + preview split

```jsx
<div className="flex h-full">
  <div className="w-1/2 border-r border-ink">
    {/* editor */}
  </div>
  <div className="w-1/2">
    {/* preview */}
  </div>
</div>
```

The hard ink divider is what makes this Swiss instead of generic. Don't use a thin grey divider — it weakens the structure. Each half opens with a [panel header](#panel-headers): blue square for the editor, green for the preview.

### Page shell: PageFrame + PageHeader

Every app page sits in the same shell: a framed sheet on a blueprint grid, with one standard header. Build it once and every page inherits it.

```jsx
<PageFrame>
  <PageHeader>
    <PageHeader.Back href="/dashboard">Back</PageHeader.Back>
    <PageHeader.Title>Settings</PageHeader.Title>
    <PageHeader.Subtitle>Manage your account</PageHeader.Subtitle>
    <PageHeader.Actions>{/* at most one primary */}</PageHeader.Actions>
  </PageHeader>

  <div className="p-8 md:p-12">
    <div className="max-w-4xl space-y-6">{/* content, left-aligned */}</div>
  </div>
</PageFrame>
```

**PageFrame**

- The page is canvas with the **blueprint grid** behind it (below), `min-h-screen`, with `px-4 py-12 md:px-8` around the frame
- The frame is `border border-ink bg-canvas shadow-sw-lg`, centred in the viewport. Content inside it is left-aligned
- `width`: `narrow` (`max-w-4xl`) for a single-column page of forms or settings, where a wider frame would leave an empty right side; `default` (`max-w-[86rem]`); or `wide` (`max-w-[104rem]`)
- `height="screen"` fills the dynamic viewport (`h-dvh`, frame `max-h-full overflow-hidden`) for views that scroll inside their panels instead of the page

**PageHeader** (`<header class="border-b border-ink p-8 md:p-12">`)

| Part | Recipe |
|------|--------|
| `Back` | An outline `sm` link built with the button class, an arrow icon and a label. One back-link style on every page |
| `Title` | `<h1>`, serif, bold, **uppercase**, `text-4xl md:text-5xl`, `text-balance` |
| `Subtitle` | A `//` line in the label face, bold, uppercase, `steel`, `max-w-[60ch]` |
| `Actions` | A wrapping row with `gap-3`. At most one primary button |

**Heading scale** (one size per level, no per-page exceptions): page H1 `text-4xl md:text-5xl` serif bold uppercase · dialog title `text-2xl` serif bold uppercase · section header `text-xl`–`text-2xl` serif bold sentence case · caption `text-xs` label face uppercase. A landing hero is a poster, not an app page, and keeps its own display size.

**The blueprint grid** is the house signature. Define it once, as a utility, and never repeat it inline:

```css
@utility bg-blueprint {
  background-image:
    linear-gradient(rgb(29 78 216 / 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgb(29 78 216 / 0.1) 1px, transparent 1px);
  background-size: 40px 40px;
}
```

It is a field of 1px Hyper Blue hairlines at 10% opacity, not a tonal gradient; that is the one use of a gradient function the pack allows.

**Exception: full-height working views.** An editor or a board needs every pixel of height for the work. Those views (full-height editors or boards) use a **compact single-row header** (title and actions on one line) in place of the stacked back-link / title / subtitle block. Usability beats style where the work area needs the height; everything else about the shell (canvas, ink borders, hard shadows, tokens) still applies.

---

## Panel headers

Each major panel gets a labeled header with a status square + label-face caption. This is a defining Swiss-style flourish.

```jsx
// Editor panel
<div className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink pb-2">
  <div className="flex min-w-0 items-center gap-2">
    <span aria-hidden="true" className="size-3 shrink-0 bg-primary" />
    <h2 className="truncate font-mono text-xs font-bold uppercase tracking-wider text-ink">Editor</h2>
  </div>
</div>

// Preview panel: the same, with bg-success on the square
```

The color of the square encodes the panel's role: blue for input (the editor), green for output (the preview), ink for the rest. Pick once per project and stay consistent. Actions for the panel go in the right-hand slot. See [components.md](components.md#panel-headers).

---

## Whitespace

Asymmetric balance comes from **uneven** padding around content blocks.

```jsx
// Symmetric — feels generic
<div className="p-8">
  <h1>Title</h1>
  <p>Body</p>
</div>

// Asymmetric — feels Swiss
<div className="pt-6 pb-12 pl-8 pr-16">
  <h1>Title</h1>
  <p>Body</p>
</div>
```

A common trick: **more whitespace on the right** than the left, **more on the bottom** than the top. It creates a directional weight that pulls the eye through the page. A left-aligned content measure (`max-w-4xl`, never `mx-auto`) inside a wide frame gives you the right-hand whitespace for free.

---

## Page dimensions (for print/PDF layouts)

If you're targeting print, anchor on standard page sizes:

```typescript
const PAGE_SIZES = {
  A4:     { width: 210,   height: 297   },  // mm — international standard
  LETTER: { width: 215.9, height: 279.4 },  // mm — US standard
};

// Convert mm to px at 96 DPI
const mmToPx = (mm: number) => mm * 3.7795275591;
```

For browser-based PDF rendering (e.g., headless Chromium), set the page size on the print stylesheet:

```css
@page {
  size: A4;
  margin: 0;
}
```

---

## Typography rhythm

Headers should sit **closer** to the content they introduce than to the content above them. The default browser margins do the opposite — fix this.

```jsx
<h2 className="font-serif text-2xl font-bold mt-12 mb-2">Section Title</h2>
<p className="font-sans">Content directly under the header.</p>
```

`mt-12 mb-2` (asymmetric vertical) is the default; reach for it instinctively.

---

## Anti-patterns to avoid

See [anti-patterns.md](anti-patterns.md) for the full list. The layout-specific ones:

- Don't center everything — Swiss style is left-aligned by default
- Don't use card carousels — show the grid
- Don't soften dividers — borders are 1–2px ink, never grey
- Don't animate panel, tab or route transitions — they snap (the only moving parts are the presence items in [Motion](tokens.md#motion))
- Don't build a page shell by hand — use the frame and header above
