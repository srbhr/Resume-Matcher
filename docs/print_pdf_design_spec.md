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

## Summary
Headless Chromium provides **pixel-perfect, ATS-friendly PDFs** while keeping the app local. It adds one dependency (`playwright`) and a Chromium install step but avoids client-side rendering inconsistencies.
