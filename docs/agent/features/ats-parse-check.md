# ATS Parse-Check

> **Checks whether an ATS text extractor can actually read a resume. Deterministic, no LLM.**

## Overview

The keyword ATS score measures *relevance*: does the resume contain the job's terms. The parse-check measures *parseability*: can a plain text extractor recover the resume's content, structure and order.

It covers two inputs:
- **An uploaded PDF or DOCX file.**
- **Resume Matcher's own render.** The same bytes `GET /resumes/{id}/pdf` returns for a template and its settings. This input also gets a round trip against the structured `ResumeData`.

## How It Works

1. **Extraction** (`services/ats_parse/extract.py`).
   - It runs under the same bounded worker, limiter and deadline as `parse_document`, via `parser.run_bounded_document_job`.
   - PDFs go through the existing bounded preflight first, then pdfminer `extract_pages` with default `LAParams`. That is the reading order MarkItDown and simple ATS readers produce.
   - DOCX body text and tables are read in document order. Headers, footers and text boxes are kept apart.
   - Pages beyond 10 are not analysed.
2. **Checks** (`checks.py`). Each check returns an id, category, severity, status and params. The UI localises the text from the id and params.
3. **Scores.**
   - `overall_score` (parseability) covers the extraction and layout checks; `content_score` covers the content checks.
   - Each score starts at 100. A failure subtracts 30 for high severity, 12 for medium and 4 for low; a warning subtracts half that.
4. **Round trip** (`roundtrip.py`, render only).
   - Every visible field is scored by adjacent-word-pair recall: interleaved columns break pairs. List fields are scored by word recall instead.
   - Each occurrence in the text satisfies one field only, so a phrase repeated in the header cannot stand in for a body field that failed to extract.
   - `order_fidelity` is the Kendall tau of the observed positions against resume order, mapped to 0..1.
   - This measures self-consistency of our render, not the accuracy of any real ATS.

| Check | Category | Severity | Fails / warns when |
|-------|----------|----------|--------------------|
| `text_layer` | extraction | high | Fewer than 50 visible characters (scanned or image-only) |
| `garbled_glyphs` | extraction | high | `(cid:N)`, U+FFFD or private-use glyphs (e.g. small-caps "e" as U+F765) |
| `text_coverage` | extraction | medium | PDF pages with images and under 200 characters |
| `multi_column` | layout | medium | A vertical gutter separates at least 3 boxes per side over 5%+ of the page; DOCX `w:cols > 1` |
| `tables` | layout | medium | DOCX tables |
| `text_boxes` | layout | medium | DOCX text boxes |
| `header_footer_content` | layout | medium | Contact details only in a DOCX header/footer; repeated PDF margin lines |
| `images` | layout | low | Any image |
| `page_count` | layout | low | More than 2 pages, or truncated |
| `contact_info` | content | high | No email (fail); no phone, or email after the first 25% (warn) |
| `section_headings` | content | medium | Experience/Education/Skills not found (all 7 locales, `headings.py`) |
| `dates` | content | low | No years at all |

Rendered resumes report `multi_column.params.expected_by_template` for swiss-two-column, modern-two-column and vivid.

## API

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/v1/ats/parse-check` | multipart `file` (PDF/DOCX, 4MB) | 400 for bad type or empty file, 413 when too large, 422 when unreadable, 504 on timeout |
| POST | `/api/v1/resumes/{id}/parse-check` | `PageFitSettings` (optional) | 404 if not found, 422 without structured data, 503 when render fails; needs the frontend running |

MCP: `parse_check_file` and `parse_check_resume`, both read-only and writing nothing. `verify_resume` and `tailor_and_verify` include the same report (see [mcp-server.md](mcp-server.md)).

UI: the builder's **ATS CHECK** tab posts the current template settings through `checkResumeParse` (`lib/api/ats.ts`), the same mapping the PDF download uses.

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/app/services/ats_parse/` | Engine: `extract`, `checks`, `roundtrip`, `normalize`, `headings`, `models` |
| `apps/backend/app/routers/ats.py` | Both endpoints |
| `apps/backend/app/mcp_server/tools/parse_check_*.py` | MCP tools |
| `apps/frontend/components/builder/ats-check-view.tsx` | ATS CHECK tab |
| `apps/backend/tests/unit/test_ats_parse.py` | Engine tests on real Chromium renders (`assets/pdf-templates`, `tests/fixtures/ats`) |
