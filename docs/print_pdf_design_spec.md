# Print-to-PDF Design Spec (ATS-Friendly, Offline, Swiss Style)

## Purpose
Provide a lightweight, offline-first, ATS-friendly PDF export using **native browser print** without adding heavy dependencies. This spec outlines how to support **resume templates**, **one-page fit**, and **Swiss design system** styling in a Next.js + Tailwind codebase.

## Key Requirement Summary
- **ATS-friendly**: PDFs must be **text-based** (selectable text).
- **Offline-first**: No server-side rendering or network reliance.
- **Minimal dependencies**: Avoid heavy libraries like `html2canvas`/`jsPDF`.
- **Swiss styling**: Maintain typography hierarchy and hard-edged framing.

## Why Browser Print is the Best Fit
- **Text remains real** (not rasterized) → ATS extraction works.
- **Lightweight** (no new dependencies or binaries).
- **Offline compatible** on local machines.
- **Flexible** enough for multiple templates with print-specific CSS.

## Alternatives (Summary)
- **html2canvas + jsPDF**: Rasterizes DOM → **not ATS-friendly**.
- **jsPDF (text-based)**: ATS-friendly but requires rebuilding layout manually.
- **Server-side rendering (Puppeteer/Playwright)**: High quality, but heavy deps and not ideal for offline local use.

---

## Design System Alignment (Print Output)
Print styles must preserve Swiss design intent while remaining **clean and ATS-friendly**.
- **Typography**: Serif headings, sans body, mono metadata.
- **Borders**: 1px black.
- **Radius**: none.
- **Shadows**: removed in print.
- **Backgrounds**: white, no textures or grids.

---

## Proposed Implementation Plan (High Level)

### 1) Template System (Print-Safe)
Support multiple resume templates by applying a template class/attribute to the resume container:
- `resume-template-default`
- `resume-template-compact`
- `resume-template-classic`

**Where:**
- `apps/frontend/components/dashboard/resume-component.tsx`

**Requirement:**
Each template must define both **screen** and **print** rules.

---

### 2) Print Styles (Global CSS, Tailwind-Compatible)
Add a global `@media print` block in:
- `apps/frontend/app/(default)/css/globals.css`

This is safe in Tailwind projects because it is **print-only**.

**Core print rules:**
- Hide UI: buttons, headers, footers, dialogs.
- Force resume container to A4/Letter size.
- Remove shadows, backgrounds, and grid textures.
- Ensure content is real text (no SVG text).
 - Scope print output to the `.resume-print` container (hide everything else via `visibility`).

Example pattern:
```css
@media print {
  body { background: #fff; }
  .no-print { display: none !important; }
  body * { visibility: hidden !important; }
  .resume-print, .resume-print * { visibility: visible !important; }
  .resume-print { max-width: 210mm; min-height: 297mm; margin: 0 auto; }
  .resume-print * { box-shadow: none !important; }
}
```

---

### 3) One-Page Fit Strategy
Enable a “Fit to One Page” toggle in the viewer:
- Measure resume height.
- Compare to page height (A4/Letter).
- Apply scale factor if overflow.
- If still long, reduce spacing or hide low-priority sections.

**Where:**
- `apps/frontend/app/(default)/resumes/[id]/page.tsx`

**Default:**
Allow multi-page. Fit-to-one-page is optional.

---

### 4) Viewer UI (Swiss Style)
Add a “Download PDF” button in the resume viewer:
- Uses `window.print()`.
- Styled with Swiss hard shadows and borders.

Add optional controls:
- Page size toggle (A4 vs Letter).
- Fit-to-one-page toggle.

Mark UI controls with `.no-print` to hide them during print.

---

## Required Changes to Existing Code

### Resume Component
Add:
- `template` prop or `data-template` attribute.
- `resume-print` class on outer container.
- `resume-body` class on the resume content wrapper.
- `resume-scale` class for any on-screen scaling that should be removed in print.

### Viewer Page
Add:
- Download PDF button.
- Optional print settings panel.
- `.no-print` classes on UI.

### Global Print CSS
Add:
- `@media print` rules in `globals.css`.
- Template-specific print overrides.

---

## ATS-Friendliness Checklist
- No rasterization (avoid canvas/image PDF).
- Semantic HTML for headings and lists.
- No SVG text in print.
- Standard fonts and proper spacing.

---

## Summary
Browser print is the **best minimal solution** for offline ATS-friendly PDFs:
- Text-based PDFs.
- Low dependency footprint.
- Compatible with template system and Swiss design rules.

If future requirements demand pixel-perfect, cross-browser fidelity, a bundled headless renderer may be considered — but it adds significant weight.
