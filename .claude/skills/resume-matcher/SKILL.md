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
- Write argument files (large JSON such as a whole resume) to `jobs/.work/` in this repository (`mkdir -p jobs/.work` first). It is gitignored and inside every agent's sandbox.
- To shorten it, define a shell function, not a variable (zsh does not split a command stored in a variable): `rmx() { uv run --directory "$PWD/apps/backend" resume-matcher "$@"; }`

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

`{"status":"healthy"}` means it is up: go to **Agent mode** below. Otherwise ask the user which install they want (if their request already says, that is the answer), and recommend local when `uv` and Node are installed:

- **Local** needs Python 3.13+, [uv](https://docs.astral.sh/uv/) and Node.js 24.22.1, pinned in `.nvmrc` (`uv --version`, `node --version`). Install once, then start the backend, wait for it, and start the frontend. Both are long-running: start them in the background so they keep running after you finish (never in the foreground, which blocks you).

  ```bash
  # From the repository root
  mkdir -p jobs/.work
  (cd apps/backend && { [ -f .env ] || cp .env.example .env; } && uv sync && uv run playwright install chromium)
  (cd apps/frontend && npm install)

  (cd apps/backend && nohup uv run app > ../../jobs/.work/backend.log 2>&1 &)    # API on :8000
  for i in $(seq 60); do curl -sf http://127.0.0.1:8000/api/v1/health > /dev/null && break; sleep 2; done
  (cd apps/frontend && nohup npm run dev > ../../jobs/.work/frontend.log 2>&1 &) # web app on :3000
  for i in $(seq 60); do curl -sf http://localhost:3000/api/v1/health > /dev/null && break; sleep 2; done
  ```

  If a health check still fails after two minutes, read the log in `jobs/.work/`. On Windows use PowerShell: `Copy-Item .env.example .env` instead of `cp`, and start each server with `Start-Process` (or ask the user to run each in its own PowerShell window). Until agent mode is on, the backend log shows an LLM health-check error from the placeholder key in `.env`; it is harmless.

- **Docker** needs Docker Desktop or Docker Engine. From the repository root, run `docker compose up -d --build`. Building from this checkout includes the command-line tool, which older published images lack. The app is on <http://localhost:3000>.

Wait until the health check answers before going on. More detail and troubleshooting: [SETUP.md](../../../SETUP.md).

### Agent mode

```bash
curl -s http://localhost:3000/api/v1/status
```

If `agent_mode` is `false`, ask the user before switching it on (a request that already asks for agent mode, or for no API key, counts as yes). It makes the app stop calling an AI model and show prompts for you instead. Saved API keys are kept, and the user can switch back in Settings at any time.

```bash
curl -s -X PUT http://localhost:3000/api/v1/config/llm-api-key \
  -H 'Content-Type: application/json' -d '{"provider":"agent"}'
```

On Windows: `Invoke-RestMethod -Method Put -Uri http://localhost:3000/api/v1/config/llm-api-key -ContentType 'application/json' -Body '{"provider":"agent"}'`. The user can also pick **Coding agent** under Settings > LLM configuration.

## 2. Master resume (once)

Run `get_status`. If `master_resumes` is 0, ask the user for their resume file (PDF, DOCX, Markdown or text). If they have none, interview them: contact details, each role with dates and achievements, education, skills.

1. `extract_document_text file_path=/abs/path/resume.pdf` turns the file into Markdown.
2. Build `resume_data` from the Markdown **faithfully**: copy names, employers, titles, dates and bullets as written; do not improve or invent anything yet. `get_resume_schema` has the full structure; most resumes need only this much (leave out `sectionMeta` and `customSections` on a new master, and the app fills them in):

   ```json
   {"personalInfo": {"name": "Ada Lovelace", "title": "Engineer", "email": "ada@example.com",
                     "phone": "+1 555 0100", "location": "London", "linkedin": "", "github": "", "website": ""},
    "summary": "One or two sentences from the resume.",
    "workExperience": [{"id": 1, "title": "Engineer", "company": "Analytical Engines", "location": "London",
                        "years": "Jan 2020 - Present", "description": ["Bullet one", "Bullet two"]}],
    "education": [{"id": 1, "institution": "University", "degree": "B.Sc. Mathematics", "years": "2014 - 2018"}],
    "personalProjects": [],
    "additional": {"technicalSkills": ["Python"], "languages": [], "certificationsTraining": [], "awards": []}}
   ```
3. `create_master_resume resume_data:=@/abs/path/jobs/.work/master.json` (optionally `title=…`).
4. Ask the user to check it at `http://localhost:3000/resumes/<resume_id>` and fix anything in the editor.

With several masters (up to 5, e.g. one per career track), `list_resumes` shows them; tailor from the one that fits the job, or the default.

## 3. Tailor (per job)

Job descriptions come pasted in chat, or as `.md`/`.txt` files in `jobs/` (ignore `jobs/README.md` and the `jobs/done/` and `jobs/.work/` folders). For each job:

1. **Add the job.** Read it and extract the keywords, then:
   `add_job job_description=@/abs/path/jobs/acme.md company="Acme" role="Platform Engineer" keywords:=@/abs/path/jobs/.work/acme-keywords.json`
   The keywords object has `required_skills`, `preferred_skills`, `experience_requirements`, `education_requirements`, `key_responsibilities` and `keywords` (lists of short strings); company and role go in the `company` and `role` arguments. A job pasted in chat is saved to `jobs/.work/<company>.md` first (scratch, not the batch); files the user saved in `jobs/` are the batch.
2. **Read the source.** `get_resume resume_id=<master id>`. Start from its `resume_data` exactly as returned, including `sectionMeta` and `customSections`; a copy from anywhere else fails validation.
3. **Write the tailored version** by the rules below.
4. **Save and check:** `tailor_and_verify @/abs/path/jobs/.work/acme-tailor.json` with `{"source_resume_id", "job_id", "resume_data", "title": "<Role> @ <Company>"}`. It validates, saves a new resume (the master is untouched), renders the PDF, parse-checks it, scores it and adds an Applied card to the tracker. Call it **once per job**: every successful call adds another resume and tracker card, so fix things afterwards with `update_resume`.
   - The result is long. The fields you need: `saved`, `resume.resume_id`, `score.overall_score`, `score.missing_keywords`, `page_count` and `issues` (`verify_resume` returns the same `score`, `page_count` and `issues`).
   - `saved: false`: nothing was written. Read `validation.violations`, fix them (or adopt `validation.repaired_resume_data`) and call it again.
   - `validation.grounding_warnings` are advisory: check each one against the source and fix anything unsupported.
5. **Fix `issues`**, then re-check with `verify_resume resume_id=<id>`. Stop after two or three rounds and tell the user what is left.

   | Issue | What to do |
   |---|---|
   | `injectable_keywords` | Work those keywords into existing bullets or the skills list; the master supports them |
   | `over_page_limit` | Tighten the summary and bullets; do not drop roles |
   | `multi_column`, `low_order_fidelity` | Suggest a single-column template such as `swiss-single` |
   | `garbled_glyphs`, `fields_missing` | Check unusual characters and empty fields |
   | `no_job_keywords` | The job was added without keywords, so there is no score: extract them, call `set_job_keywords`, then `verify_resume` |
   | `weak_writing` | A line has an em dash or a weak opener: `writing.findings` gives each path. Fix it in the writing rounds below |
   | `render_failed` | The web app is not running at the URL in `render_error`: start it |

   Edit with `update_resume resume_id=<id> resume_data:=@…` (it replaces the whole resume, so start from `get_resume`), then `recalculate_ats_score resume_id=<id>`.
6. **Run two writing rounds.** The app's own tailoring critiques and rewrites once; you have no API cost, so do it twice. Each round:
   1. Critique the summary and every bullet against the writing rubric below, together with the `writing.findings` that `verify_resume` returned.
   2. Rewrite only the lines that break the rubric. Every number, name, tool and skill of the original line stays; add none. A line with no number gets its outcome or scope from what the line already says; if a real number would help, ask the user instead of guessing.
   3. `update_resume`, then `verify_resume`. `writing.score` should rise and `weak_writing` should clear.
7. **Batch from `jobs/`:** after each job, move its file to `jobs/done/` so a rerun skips it.

### Writing rubric

The app's critique prompt uses this exact text (a test keeps the two in sync).

<!-- writing-rubric:start -->
- Start every bullet with a strong action verb in the past tense (present tense for a current role). Never open with "Responsible for", "Helped with", "Assisted in", "Involved in", "Participated in", "Worked on" or "Tasked with".
- Shape each bullet as Challenge, Action, Result: the situation, what the candidate did, and what changed because of it.
- State the result. Keep every number in the source exactly. Never invent a number, percentage, amount, count or time saved, and never add size words ("significantly", "dramatically", "greatly") the source does not use.
- When the source has no number, state the result through scope and outcome the source already gives: who used the work, what it replaced, what it made possible, how often it ran.
- Keep every fact: each number, name, product, tool, skill and outcome in the original stays in the rewrite. Add none.
- One idea per bullet, at most about 35 words. No first-person pronouns ("I", "my").
- No em dashes ("—") or double hyphens ("--"). Use a comma, a semicolon or a new sentence.
- Avoid stock phrases such as "spearheaded", "leveraged", "orchestrated", "utilized", "synergy", "cutting-edge" and "results-driven".
<!-- writing-rubric:end -->

### Tailoring rules

These are the rules the app's own tailoring follows, and the validator enforces most of them.

- Keep `personalInfo`, employers, job titles, locations, dates (`years`, copied exactly, months included), the number of entries and the number of bullets.
- Never add a skill, tool, technology, certification, employer, metric or responsibility the source does not contain. Never raise seniority.
- Rephrase existing bullets to use the job's wording where the source already shows that experience. Reorder skills by relevance, but never remove one.
- Rewrite the summary for the role from facts already in the resume.
- Write in the resume's language. No em dashes. Avoid stock phrases such as "spearheaded", "leveraged", "orchestrated", "utilized", "synergy", "cutting-edge" and "results-driven".
- If the job needs something the user has not shown, say so; do not paper over it. `score.missing_keywords` lists what the resume does not support: report those to the user as gaps they can add in the editor if they really have them. A low score from honest gaps is the right result.
- The `date_consistency` part of the score is low when the source mixes date formats (`Mar 2022 - Present` beside `2015 - 2019`). Keep the dates as written and tell the user they can make the formats match in their master resume.

## 4. Hand off to the UI

When done, give the user a short table: role and company, ATS score (`score.overall_score`), pages, remaining issues and gaps, and the link `http://localhost:3000/builder?id=<resume_id>`. Then tell them:

- The dashboard lists every resume: <http://localhost:3000/dashboard>. Open pages update on their own within a few seconds of each save, so there is no need to reload.
- In the editor they can change any text, section order, template and formatting. Changes save automatically, and **Download** exports the PDF.
- The application tracker is at <http://localhost:3000/tracker>.
- The app's AI buttons show a prompt to paste back to you.
- If they are editing a resume while you save it, the editor asks them whether to keep their edits or take yours. Prefer to work on resumes they are not editing.

## Other requests

The app's AI buttons hand these prompts to you:

| Request | Tools |
|---|---|
| Cover letter | `get_resume_job resume_id=<id>`, write it like the app's default: under one page, 200 to 300 words in 3 or 4 paragraphs (a hook tied to one detail of the job, two or three matching examples from the resume, why this company using what the job description says, a specific close). Greet a named person only if the job names one, else "Dear Hiring Manager"; use only facts from the resume and the job description, `set_cover_letter resume_id=<id> content=@…` |
| Outreach message | Same, 70 to 100 words, opening with something specific from the job, then `set_outreach_message` |
| Enhance a resume | Ask the user about missing results, numbers and tools; then `get_resume`, edit, `update_resume`. Add only what they told you |
| Rewrite parts | Show the user the changes first, then `update_resume` |
| Improve writing | Run the two writing rounds from step 6 on that resume, with no job: `get_resume`, critique, rewrite, `update_resume`, `verify_resume` |
| Interview prep | Answer in the chat from `get_resume` and `get_resume_job`; the app does not store it in agent mode |
| PDF file | `export_resume_pdf resume_id=<id>` writes `data/exports/<id>-<template>.pdf` (pass `output_path` for elsewhere), or use **Download** in the editor |
| Tracker | `list_applications`, `update_application` |

## Boundaries

- No tool deletes anything. `update_resume`, `set_*`, `set_job_keywords` and `update_application` overwrite what they target: read it first.
- Change the app's settings only to switch on agent mode, and only after the user agrees.
- The user's resume, job descriptions and exports stay out of git: `jobs/` and `apps/backend/data/` are gitignored. Never commit them.
- Prefer MCP? The same tools run as an MCP server (`resume-matcher-mcp`); see [SETUP.md](../../../SETUP.md#use-resume-matcher-from-claude-code-or-claude-desktop-mcp).
