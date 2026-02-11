---
name: ui-review
description: |
  Review UI changes against Swiss International Style design system. Checks colors, typography, borders, shadows, spacing, and anti-patterns. Use before committing any frontend UI changes.
---

# UI Review

> Verify frontend changes comply with Swiss International Style before committing.

## Step 1: Run Automated Checks

```bash
# Forbidden rounded corners
rg 'rounded-(sm|md|lg|xl|2xl|3xl|full)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Forbidden gradients
rg '(bg-gradient|from-|via-|to-)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Forbidden soft shadows
rg 'shadow-(sm|md|lg|xl|2xl|inner)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n

# Forbidden blur
rg '(blur-|backdrop-blur)' apps/frontend/ --glob '*.{tsx,jsx,css}' --no-heading -n
```

## Step 2: Manual Review

For each changed file check:

### Colors
- [ ] Background: Canvas `#F0F0E8` or white
- [ ] Text: Ink `#000000`
- [ ] Links: Hyper Blue `#1D4ED8`
- [ ] Success: Signal Green `#15803D`
- [ ] Error: Alert Red `#DC2626`
- [ ] No colors outside the Swiss palette

### Typography
- [ ] Headers: `font-serif`
- [ ] Body: `font-sans`
- [ ] Labels: `font-mono text-sm uppercase tracking-wider`

### Borders & Shadows
- [ ] All elements: `rounded-none`
- [ ] Borders: `border-2 border-black`
- [ ] Shadows: hard `shadow-[Xpx_Xpx_0px_0px_#000000]`
- [ ] Hover: translate into shadow space

### Components
- [ ] Buttons: square corners, hard shadow, press effect
- [ ] Cards: white bg, black border, hard shadow
- [ ] Inputs: `rounded-none`, black border

## Anti-Pattern Quick Scan

Flag immediately if found in changed files:

| Anti-Pattern | Why |
|-------------|-----|
| `rounded-sm/md/lg/xl/full` | Sharp corners only |
| `bg-gradient-*` | No gradients |
| `shadow-sm/md/lg/xl` | Hard shadows only |
| `blur-*` / `backdrop-blur` | No blur effects |
| Pastel colors | Swiss palette is bold |

## Step 3: Report

```
[FAIL] file:line - Description of violation
[WARN] file:line - Potential issue to verify
[PASS] All checks passed
```

## Reference

Full design system: `docs/agent/design/style-guide.md`
