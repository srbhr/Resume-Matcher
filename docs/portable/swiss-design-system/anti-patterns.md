# Anti-Patterns & Pre-Merge Checklist

What NOT to do, and how to catch it before code ships. Read this before opening a PR that touches UI.

> Sibling docs: [tokens](tokens.md) · [components](components.md) · [layouts](layouts.md) · [ai-prompt](ai-prompt.md)

---

## Forbidden things

| Anti-pattern | Why it breaks the style | Use instead |
|--------------|-------------------------|-------------|
| `rounded-*` (any value) | Rounds soften the binary geometry | `rounded-none` |
| Gradients (`bg-gradient-*`) | Decorative, not structural | Solid color from the palette |
| Blurred shadows (`shadow-md`, `shadow-lg`) | Implies depth illusion | Hard offset shadow `shadow-[Npx_Npx_0px_0px_#000]` |
| Decorative icons (heart, star, sparkles) | Ornamental | Functional icons only, mono color |
| Pastel colors | Off-palette | Use Hyper Blue, Signal Green, Alert Orange/Red |
| Pure white (`#FFFFFF`) as page bg | Too clinical, fights the borders | Canvas `#F0F0E8` |
| Animated transitions (`transition-all`) | Swiss style is binary | No transition, or instant |
| Centered layouts | Symmetric = generic | Left-aligned, asymmetric |
| 2-column collections | Too symmetric | 3, 4, or 5 columns |
| Card carousels | Hides content | Show the grid |
| Soft grey dividers | Weakens structure | 1–2px solid black |
| Circle status dots | Decorative | 12px squares |
| Multiple primary buttons per region | No focal point | One primary, rest outline |
| Decorative borders (dashed/dotted) | Ornamental | Solid only — exception: "hidden/draft" state |
| New colors invented for new states | Palette explosion | Reuse existing colors with intent |
| Custom paddings off the 4px scale | Breaks rhythm | Stick to xs/sm/md/lg/xl/2xl |

---

## Common mistakes that look "almost right"

These are the ones that pass casual review but fail the style:

### Using `border-gray-300` instead of `border-black`

Grey borders look "softer" and feel safer, which is exactly the wrong instinct. Swiss style commits to its borders. If a border looks too heavy, the answer is to **remove it**, not soften it.

### Adding `shadow-sm` "for a little depth"

A soft shadow is a depth illusion. The whole pack rejects depth illusions. If something needs to feel elevated, give it a hard offset shadow or a heavier border — never `shadow-sm`.

### Centering the page content with `mx-auto max-w-4xl`

Centering is the default reflex from generic web design. In Swiss style, content should sit asymmetrically — typically pulled to the left third or two-thirds, with whitespace on the right. Use a grid, not `mx-auto`.

### Using `text-gray-500` for everything secondary

There's exactly one secondary text color: Steel Grey `#4B5563`. Don't introduce tints or alternates. If you need more hierarchy, use weight or size, not color.

### Importing decorative icon sets

`lucide-react`, `heroicons`, etc. ship with thousands of decorative glyphs. Use them only for functional icons (close, expand, navigate). Never for emotional decoration (sparkles, hearts, lightning bolts).

---

## Pre-merge checklist

Before merging UI changes, walk through this list:

### Tokens
- [ ] All colors are from the palette in [tokens.md](tokens.md)
- [ ] No `rounded-*` classes anywhere
- [ ] No `bg-gradient-*` anywhere
- [ ] No `shadow-sm`, `shadow-md`, `shadow-lg` (only hard offset shadows)
- [ ] All paddings are on the 4px scale (`p-1`, `p-2`, `p-4`, `p-6`, `p-8`, `p-12`, `p-16`)

### Typography
- [ ] Headers use `font-serif`
- [ ] Body uses `font-sans`
- [ ] Labels and metadata use `font-mono uppercase tracking-wider`
- [ ] No more than three font families on the page

### Components
- [ ] Buttons have `border-2 border-black` and a hard offset shadow
- [ ] Inputs have `border border-black` (1px) and `rounded-none`
- [ ] Cards have `border-2 border-black` and `shadow-[4px_4px_0px_0px_#000000]`
- [ ] Status indicators are 12px squares, not circles or dots
- [ ] At most one primary button per logical region

### Layout
- [ ] Page background is Canvas, not white
- [ ] Content is left-aligned by default
- [ ] Padding is asymmetric (not equal on all sides for major blocks)
- [ ] Dividers between panels are 1–2px solid black
- [ ] No animated transitions (or, if interactivity demands it, instant snap)

### Final pass
- [ ] Squint at the design — does it look distinctly Swiss, or could it be any SaaS app?
- [ ] If you removed all colors except black and one accent, would the layout still read?

If you can answer **yes** to the squint test, you're done. If it looks like a generic dashboard, go back to [tokens.md](tokens.md) and start over.
