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
  <div className="w-1/2 border-r-2 border-black">
    {/* editor */}
  </div>
  <div className="w-1/2">
    {/* preview */}
  </div>
</div>
```

The hard black divider is what makes this Swiss instead of generic. Don't use a thin grey divider — it weakens the structure.

### Sidebar + content

```jsx
<div className="flex h-full">
  <aside className="w-64 border-r-2 border-black p-6">
    {/* nav */}
  </aside>
  <main className="flex-1 p-8">
    {/* content */}
  </main>
</div>
```

Fixed sidebar width (256px / `w-64`), fluid content. Resist the urge to make the sidebar collapsible with smooth animations — if it collapses, it snaps.

---

## Panel headers

Each major panel gets a labeled header with a status square + monospace caption. This is a defining Swiss-style flourish.

```jsx
// Editor panel
<div className="flex items-center gap-2 mb-4">
  <div className="w-3 h-3 bg-blue-700" />
  <span className="font-mono text-xs uppercase tracking-wider">Editor Panel</span>
</div>

// Preview panel
<div className="flex items-center gap-2 mb-4">
  <div className="w-3 h-3 bg-green-700" />
  <span className="font-mono text-xs uppercase tracking-wider">Live Preview</span>
</div>
```

The color of the square encodes the panel's role (input, output, status, etc.). Pick once per project and stay consistent.

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

A common trick: **more whitespace on the right** than the left, **more on the bottom** than the top. It creates a directional weight that pulls the eye through the page.

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
- Don't soften dividers — borders are 1–2px black, never grey
- Don't animate panel transitions — they snap
