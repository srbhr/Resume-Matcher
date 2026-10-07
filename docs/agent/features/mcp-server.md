# MCP Server

> **Lets Claude Code, Cursor, Codex or any MCP client drive Resume Matcher. The agent is the LLM; Resume Matcher is the deterministic editor, validator and renderer.**

## Overview

`app/mcp_server/` exposes Resume Matcher as MCP tools over **stdio**. No LLM key is needed and no tool calls an LLM. The agent writes resume content, and the tools store it, run the same preservation checks as `/improve/confirm`, score it and render PDFs. The server shares `data/resume_matcher.db` with the web app (SQLite WAL), so anything the agent saves shows up in the UI.

No tool deletes data or touches `/config`.

## Setup

```bash
cd apps/backend && uv sync
claude mcp add resume-matcher -- uv run --directory /abs/path/to/apps/backend resume-matcher-mcp
```

Any client works the same way: run the command `uv` with args `run --directory <apps/backend> resume-matcher-mcp`. `python -m app.mcp_server` is equivalent. `--directory` makes `.env` and `data/` resolve exactly as they do for the web app. Set `DATA_DIR` to point at a different data folder.

`export_resume_pdf`, `verify_resume`, `tailor_and_verify` and `parse_check_resume` need the frontend running (`FRONTEND_BASE_URL`, default `http://localhost:3000`) and able to reach a backend on the same data dir. All other tools work without either server running. `verify_resume` and `tailor_and_verify` still return the keyword score when rendering fails.

## Tools

| Group | Tools |
|-------|-------|
| Read | `get_status`, `get_resume_schema`, `list_resumes`, `get_resume`, `get_job`, `get_resume_job`, `list_applications` |
| Ingest / edit | `extract_document_text` (local PDF/DOCX/DOC/MD/TXT → markdown), `create_master_resume`, `update_resume`, `set_resume_title`, `set_cover_letter`, `set_outreach_message`, `set_default_master` |
| Tailoring | `add_job`, `set_job_keywords`, `validate_tailored_resume`, `save_tailored_resume`, `score_resume` |
| Composed | `tailor_and_verify` (validate, save, then verify), `verify_resume` (read-only: one render → page count, parse-check, keyword score, `issues`) |
| Parse-check | `parse_check_file`, `parse_check_resume` (read-only, see [ats-parse-check.md](ats-parse-check.md)) |
| Render | `export_resume_pdf` → `{path, page_count}` (default `data/exports/<id>-<template>.pdf`) |
| Tracker | `create_application`, `update_application` |

## How It Works

1. **Keywords.** `add_job` / `set_job_keywords` store the keywords the agent extracted under `job_keywords` + `job_keywords_hash`. This is the same cache the web tailoring flow reads, so the web UI skips its own extraction for that job.
2. **Validation.** `validate_tailored_resume` and `save_tailored_resume` run `finalize_ai_resume` (its result must equal the candidate) and `_validate_confirm_payload` (personalInfo unchanged plus `validate_confirmed_resume`, with `allow_appended_rows=True`). Any violation rejects the save. The report lists the violating paths and includes a `repaired_resume_data` the agent can adopt. `grounding_review_warnings` are advisory.
3. **Save.** A valid save calls `db.create_tailored_resume` (resume + Improvement link), then creates an `applied` tracker card.
4. **Verify.** `tailor_and_verify` runs the validation from step 2. If it fails, nothing is written and it returns `saved: false` with the full report. Otherwise it saves as in step 3, then runs `verify_resume` on the new resume. `verify_resume` renders the PDF once and takes the page count and the parse-check from the same bytes. It scores against the resume's linked job, or `job_id`, and lists `issues`:

   | Code | When |
   |------|------|
   | `over_page_limit` | `page_count > max_pages` |
   | `multi_column` | the parse-check `multi_column` check fails |
   | `garbled_glyphs` | the `garbled_glyphs` check warns or fails |
   | `low_order_fidelity` | round-trip `order_fidelity < 0.9` |
   | `fields_missing` | any round-trip field is `missing` or `garbled` |
   | `injectable_keywords` | job keywords the master supports but this resume lacks |
   | `render_failed` | rendering failed; `render_error` names the frontend URL |

   The agent loops `update_resume` → `verify_resume` until `issues` is acceptable. The print URL comes from `page_fit.resume_print_url`, which builds the same query as `GET /resumes/{id}/pdf`.
5. **stdio.** Logging goes to stderr; stdout carries only JSON-RPC. Startup and shutdown mirror the FastAPI lifespan (TinyDB import, legacy-key fold-in, PDF renderer close, DB close).

## Key Files

| File | Purpose |
|------|---------|
| `apps/backend/app/mcp_server/server.py` | `MCPServer`, agent instructions, lifespan, `main()` |
| `apps/backend/app/mcp_server/tools/` | One module per tool; `_shared.py` holds common helpers, `__init__.py` registers the read-only and write tool lists |
| `apps/backend/app/services/page_fit.py` | `resume_print_url`, `print_margins`, `count_pdf_pages` |
| `apps/backend/tests/integration/test_mcp_server.py` | In-memory client tests, route/PDF URL parity, stdio hygiene |
