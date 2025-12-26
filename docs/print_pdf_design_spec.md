# Headless-PDF Design Spec (ATS-Friendly, Offline, Swiss Style)

## Purpose
Provide pixel-perfect, offline-first, ATS-friendly PDF export using **headless Chromium** with minimal dependencies. This spec supports **resume templates**, **one-page fit**, and **Swiss design system** styling in a Next.js + Tailwind codebase.

## Key Requirement Summary
- **ATS-friendly**: PDFs must be **text-based** (selectable text).
- **Offline-first**: Runs locally with no external network reliance.
- **Minimal dependencies**: Only `playwright` + Chromium.
- **Swiss styling**: Maintain typography hierarchy and hard-edged framing.

## Why Headless Chromium is the Best Fit
- **Pixel-perfect output** (matches on-screen HTML/CSS).
- **Text remains real** → ATS extraction works.
- **Template-friendly** via dedicated print routes.
- **Local-only** once Chromium is installed.

## Alternatives (Summary)
- **html2canvas + jsPDF**: Rasterizes DOM → **not ATS-friendly**.
- **jsPDF (text-based)**: ATS-friendly but requires rebuilding layout manually.
- **Browser print**: Lightweight but inconsistent across environments and harder to lock pixel-perfect output.

---

## Design System Alignment (PDF Output)
PDF styles must preserve Swiss design intent while remaining **clean and ATS-friendly**.
- **Typography**: Serif headings, sans body, mono metadata.
- **Borders**: 1px black.
- **Radius**: none.
- **Shadows**: removed in PDF.
- **Backgrounds**: white, no textures or grids.

---

## Implementation Plan (High Level)

### 1) Printable Route (Frontend)
Add a dedicated printable route:
- `/print/resumes/[id]?template=default`

Render only the resume content (no chrome). This is the source that headless Chromium captures.

### 2) Headless PDF Endpoint (Backend)
Add:
- `GET /api/v1/resumes/{id}/pdf?template=default`

Backend loads the printable route in Chromium and returns PDF bytes.

### 3) Download Button Wiring
Viewer and builder download buttons call the backend PDF endpoint and stream the file.

### 4) Template Support
Add a `template` prop/class on the `Resume` component and create template-specific CSS overrides.

### 3) Download Button Wiring
Viewer and builder download buttons call the backend PDF endpoint and stream the file.

### 4) Template Support
Add a `template` prop/class on the `Resume` component and create template-specific CSS overrides.

---

## Required Changes to Existing Code

### Resume Component
Add:
- `template` prop or class (e.g., `resume-template-default`).
- `resume-body` wrapper class.

### Printable Route
Add:
- `/print/resumes/[id]` page to render resume only.

### Backend
Add:
- Playwright-based renderer.
- `/api/v1/resumes/{id}/pdf` endpoint.

---

## PDF Rendering Details (Backend)
- Launch Chromium via Playwright.
- Load local route: `http://localhost:3000/print/resumes/{id}?template=...`
- Wait for `.resume-print` and fonts (`document.fonts.ready`).
- Export PDF with `format: A4`, `print_background: true`, standard margins.

---

## ATS-Friendliness Checklist
- No rasterization.
- Semantic HTML headings/lists.
- No SVG text.
- Standard fonts and readable spacing.

---

## Cover Letter PDF Support

The PDF rendering system also supports cover letter generation using the same headless Chromium approach.

### Cover Letter Print Route
- **URL:** `/print/cover-letter/[id]?pageSize=A4|LETTER`
- **Selector:** `.cover-letter-print`
- **API Endpoint:** `GET /api/v1/resumes/{id}/cover-letter/pdf`

### Cover Letter Flow
1. Backend calls `render_resume_pdf(url, pageSize, selector=".cover-letter-print")`
2. Playwright navigates to `/print/cover-letter/{id}?pageSize={pageSize}`
3. Frontend print page fetches cover letter data via API (`GET /resumes?resume_id={id}`)
4. Page renders with `.cover-letter-print` class
5. Playwright captures PDF

---

## Critical CSS Requirement: Print Visibility Rules

**IMPORTANT:** When adding new printable content types (like cover letters), you MUST add CSS visibility rules in `globals.css`.

The print media query hides ALL content by default:
```css
@media print {
  body * {
    visibility: hidden !important;
  }
}
```

To make content visible in PDFs, add the class to the visibility whitelist:

```css
@media print {
  .resume-print,
  .resume-print *,
  .cover-letter-print,
  .cover-letter-print * {
    visibility: visible !important;
  }

  .resume-print,
  .cover-letter-print {
    width: 100% !important;
    max-width: 210mm !important;
    min-height: 297mm !important;
    /* ... other print styles */
  }
}
```

**If you forget this step, Playwright will generate blank PDFs** because the content remains hidden.

### Adding New Print Content Types

When adding a new printable document type (e.g., `.report-print`):
1. Create the print route: `/print/reports/[id]/page.tsx`
2. Use a unique class: `className="report-print bg-white"`
3. **Add to globals.css visibility rules:**
   ```css
   .resume-print,
   .resume-print *,
   .cover-letter-print,
   .cover-letter-print *,
   .report-print,
   .report-print * {
     visibility: visible !important;
   }
   ```
4. Update `render_resume_pdf()` call with `selector=".report-print"`

---

## Summary
Headless Chromium provides **pixel-perfect, ATS-friendly PDFs** while keeping the app local. It adds one dependency (`playwright`) and a Chromium install step but avoids client-side rendering inconsistencies.
