---
name: resume-matcher
description: Use Resume Matcher with no API key, with you doing the AI work. Sets up the app, creates a master resume, tailors it to job descriptions (pasted in chat or saved in jobs/), writes cover letters and outreach messages, and exports PDFs. Use when the user asks about resumes, CVs, job descriptions, tailoring, cover letters, or setting up or running Resume Matcher.
argument-hint: "[setup | tailor | <job description>]"
---

# Resume Matcher, driven by you

You are the AI. The `resume-matcher` command stores, validates, scores and renders what you write, in the same database as the web app, so everything you save appears at <http://localhost:3000>. The user makes small edits there.

Work in this order: **set up** (once), **master resume** (once), **tailor** (per job), **hand off** to the UI. Skip a step that is already done. Talk to the user in their language.

## The command

From the repository root:

```bash
uv run --directory apps/backend resume-matcher <tool> [arguments]
```

- `resume-matcher --help` lists the tools; `resume-matcher <tool> --help` shows one tool's arguments as a JSON schema.
- Arguments are either one JSON object (`'{"resume_id": "…"}'`, `@args.json`, or `-` for stdin) or fields: `key=value` (string), `key=@file` (string from a file), `key:=json` (any JSON value), `key:=@file.json` (JSON from a file).
- **Use absolute paths.** `--directory` runs the command from `apps/backend`, so a relative path resolves from there.
- The result is JSON on stdout. Exit code 1: the tool failed and stderr says why. Exit code 2: the command line was wrong.
- Write argument files (large JSON such as a whole resume) to `jobs/.work/` in this repository. It is gitignored and inside every agent's sandbox.

**Docker install:** run the same tools inside the container, from its backend folder so they use the app's data:

```bash
docker exec -i -w /app/backend resume-matcher python -m app.mcp_server.cli <tool> [arguments]
```

File arguments are then read inside the container, so pass a whole JSON object on stdin instead: `… add_job - < /abs/path/jobs/.work/add_job.json`. To import a resume file, copy it in first (`docker cp ~/resume.pdf resume-matcher:/tmp/resume.pdf`) and pass `file_path=/tmp/resume.pdf`.

## 1. Set up (once)

Check whether the app is already running:

```bash
curl -s http://localhost:3000/api/v1/health
```

`{"status":"healthy"}` means it is up: go to **Agent mode** below. Otherwise ask the user which install they want, and recommend local when `uv` and Node are installed:

- **Local** needs Python 3.13+, [uv](https://docs.astral.sh/uv/) and Node.js 24+ (`uv --version`, `node --version`). Start the two servers and keep both running (in the background, or ask the user to run each in its own terminal):

  ```bash
  # Backend, from apps/backend
  cp .env.example .env              # only if .env does not exist yet
  uv sync
  uv run playwright install chromium   # once, for PDF rendering
  uv run app                        # API on http://127.0.0.1:8000

  # Frontend, from apps/frontend
  npm install
  npm run dev                       # web app on http://localhost:3000
  ```

  On Windows use PowerShell: `Copy-Item .env.example .env` instead of `cp`.

- **Docker** needs Docker Desktop or Docker Engine. From the repository root, run `docker compose up -d --build`. Building from this checkout includes the command-line tool, which older published images lack. The app is on <http://localhost:3000>.

Wait until the health check answers before going on. More detail and troubleshooting: [SETUP.md](../../../SETUP.md).

### Agent mode

```bash
curl -s http://localhost:3000/api/v1/status
```

If `agent_mode` is `false`, ask the user before switching it on. It makes the app stop calling an AI model and show prompts for you instead. Saved API keys are kept, and the user can switch back in Settings at any time.

```bash
curl -s -X PUT http://localhost:3000/api/v1/config/llm-api-key \
  -H 'Content-Type: application/json' -d '{"provider":"agent"}'
```

On Windows: `Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/v1/config/llm-api-key -ContentType 'application/json' -Body '{"provider":"agent"}'`. The user can also pick **Coding agent** under Settings > LLM configuration.

## 2. Master resume (once)

Run `get_status`. If `master_resumes` is 0, ask the user for their resume file (PDF, DOCX, Markdown or text). If they have none, interview them: contact details, each role with dates and achievements, education, skills.

1. `extract_document_text file_path=/abs/path/resume.pdf` turns the file into Markdown.
2. `get_resume_schema` gives the structure. Build `resume_data` from the Markdown **faithfully**: copy names, employers, titles, dates and bullets as written; do not improve or invent anything yet.
3. `create_master_resume resume_data:=@/abs/path/jobs/.work/master.json` (optionally `title=…`).
4. Ask the user to check it at `http://localhost:3000/resumes/<resume_id>` and fix anything in the editor.

With several masters (up to 5, e.g. one per career track), `list_resumes` shows them; tailor from the one that fits the job, or the default.

## 3. Tailor (per job)

Job descriptions come pasted in chat, or as `.md`/`.txt` files in `jobs/` (ignore `jobs/README.md` and the `jobs/done/` and `jobs/.work/` folders). For each job:

1. **Add the job.** Read it and extract the keywords, then:
   `add_job job_description=@/abs/path/jobs/acme.md company="Acme" role="Platform Engineer" keywords:=@/abs/path/jobs/.work/acme-keywords.json`
   The keywords object has `required_skills`, `preferred_skills`, `experience_requirements`, `education_requirements`, `key_responsibilities` and `keywords` (lists of short strings). For pasted text, save it to `jobs/.work/<name>.md` first, or pass the JSON object form.
2. **Read the source.** `get_resume resume_id=<master id>`. Start from its `resume_data` exactly as returned, including `sectionMeta` and `customSections`; a copy from anywhere else fails validation.
3. **Write the tailored version** by the rules below.
4. **Save and check:** `tailor_and_verify @/abs/path/jobs/.work/acme-tailor.json` with `{"source_resume_id", "job_id", "resume_data", "title": "<Role> @ <Company>"}`. It validates, saves a new resume (the master is untouched), renders the PDF, parse-checks it, scores it and adds an Applied card to the tracker.
   - `saved: false`: read `validation.violations`, fix them (or adopt `validation.repaired_resume_data`) and call it again.
   - `validation.grounding_warnings` are advisory: check each one against the source and fix anything unsupported.
5. **Fix `issues`**, then re-check with `verify_resume resume_id=<id>`. Stop after two or three rounds and tell the user what is left.

   | Issue | What to do |
   |---|---|
   | `injectable_keywords` | Work those keywords into existing bullets or the skills list; the master supports them |
   | `over_page_limit` | Tighten the summary and bullets; do not drop roles |
   | `multi_column`, `low_order_fidelity` | Suggest a single-column template such as `swiss-single` |
   | `garbled_glyphs`, `fields_missing` | Check unusual characters and empty fields |
   | `render_failed` | The web app is not running at the URL in `render_error`: start it |

   Edit with `update_resume resume_id=<id> resume_data:=@…` (it replaces the whole resume, so start from `get_resume`), then `recalculate_ats_score resume_id=<id>`.
6. **Batch from `jobs/`:** after each job, move its file to `jobs/done/` so a rerun skips it.

### Tailoring rules

These are the rules the app's own tailoring follows, and the validator enforces most of them.

- Keep `personalInfo`, employers, job titles, locations, dates (`years`, copied exactly, months included), the number of entries and the number of bullets.
- Never add a skill, tool, technology, certification, employer, metric or responsibility the source does not contain. Never raise seniority.
- Rephrase existing bullets to use the job's wording where the source already shows that experience. Reorder skills by relevance, but never remove one.
- Rewrite the summary for the role from facts already in the resume.
- Write in the resume's language. No em dashes. Avoid stock phrases such as "spearheaded", "leveraged", "orchestrated", "utilized", "synergy", "cutting-edge" and "results-driven".
- If the job needs something the user has not shown, say so; do not paper over it.

## 4. Hand off to the UI

When done, give the user a short table: role and company, ATS score (`resume.ats_score.score.overall_score`), pages, remaining issues, and the link `http://localhost:3000/builder?id=<resume_id>`. Then tell them:

- The dashboard lists every resume: <http://localhost:3000/dashboard>.
- In the editor they can change any text, section order, template and formatting. Changes save automatically, and **Download** exports the PDF.
- The application tracker is at <http://localhost:3000/tracker>.
- The app's AI buttons show a prompt to paste back to you.

## Other requests

The app's AI buttons hand these prompts to you:

| Request | Tools |
|---|---|
| Cover letter | `get_resume_job resume_id=<id>`, write it (100 to 150 words in 3 or 4 short paragraphs, using only facts from the resume), `set_cover_letter resume_id=<id> content=@…` |
| Outreach message | Same, 70 to 100 words, opening with something specific from the job, then `set_outreach_message` |
| Enhance a resume | Ask the user about missing results, numbers and tools; then `get_resume`, edit, `update_resume`. Add only what they told you |
| Rewrite parts | Show the user the changes first, then `update_resume` |
| Interview prep | Answer in the chat from `get_resume` and `get_resume_job`; the app does not store it in agent mode |
| PDF file | `export_resume_pdf resume_id=<id>` writes `data/exports/<id>-<template>.pdf` (pass `output_path` for elsewhere), or use **Download** in the editor |
| Tracker | `list_applications`, `update_application` |

## Boundaries

- No tool deletes anything. `update_resume`, `set_*`, `set_job_keywords` and `update_application` overwrite what they target: read it first.
- Change the app's settings only to switch on agent mode, and only after the user agrees.
- The user's resume, job descriptions and exports stay out of git: `jobs/` and `apps/backend/data/` are gitignored. Never commit them.
- Prefer MCP? The same tools run as an MCP server (`resume-matcher-mcp`); see [SETUP.md](../../../SETUP.md#use-resume-matcher-from-claude-code-or-claude-desktop-mcp).
