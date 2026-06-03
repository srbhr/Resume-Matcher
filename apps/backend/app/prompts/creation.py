"""LLM prompts for the conversational create-resume wizard.

Each prompt turns a user's plain answers into one structured ``ResumeData``
fragment. They follow the same anti-fabrication discipline as the tailoring
prompts: shape and lightly polish what the candidate actually said; never
invent employers, dates, metrics, tools, or technologies.
"""

_ANTI_FABRICATION = """CRITICAL RULES - NEVER VIOLATE:
- Use ONLY facts the candidate stated. Do NOT invent employers, institutions,
  job titles, dates, numbers/metrics, tools, or technologies.
- Shape and lightly polish their words into resume phrasing. You may rephrase
  for impact, but add no new claims.
- If the answer is thin, write fewer/shorter bullets rather than padding with
  invented content.
- Do NOT use the em dash character anywhere."""

DRAFT_WORK_PROMPT = """You are a professional resume writer helping {name} ({role}) describe a job.
Output ONLY a JSON object, no other text.

IMPORTANT: Write all text in {output_language}.

{anti_fabrication}

The candidate's answer about this job:
{answers}

Produce one work-experience entry. Use "" for anything not stated; do not guess.
Write 2-4 concise, action-oriented bullets from what they said.

Output exactly this JSON shape:
{{
  "title": "job title as stated",
  "company": "company as stated",
  "location": "",
  "years": "dates exactly as stated, e.g. 'Jan 2020 - Present' or ''",
  "description": ["bullet 1", "bullet 2"]
}}""".replace("{anti_fabrication}", _ANTI_FABRICATION)

DRAFT_EDUCATION_PROMPT = """You are a professional resume writer helping {name} describe their education.
Output ONLY a JSON object, no other text.

IMPORTANT: Write all text in {output_language}.

{anti_fabrication}

The candidate's answer about their education:
{answers}

Produce one education entry. Use "" for anything not stated.

Output exactly this JSON shape:
{{
  "institution": "school as stated",
  "degree": "degree as stated",
  "years": "dates as stated or ''",
  "description": ""
}}""".replace("{anti_fabrication}", _ANTI_FABRICATION)

DRAFT_PROJECT_PROMPT = """You are a professional resume writer helping {name} describe a project.
Output ONLY a JSON object, no other text.

IMPORTANT: Write all text in {output_language}.

{anti_fabrication}

The candidate's answer about this project:
{answers}

Produce one project entry. Use "" for anything not stated. Write 1-3 concise bullets.

Output exactly this JSON shape:
{{
  "name": "project name as stated",
  "role": "their role as stated or ''",
  "years": "dates as stated or ''",
  "github": "",
  "website": "",
  "description": ["bullet 1"]
}}""".replace("{anti_fabrication}", _ANTI_FABRICATION)

DRAFT_SKILLS_PROMPT = """Extract the candidate's skills from their answer. Output ONLY a JSON object.

IMPORTANT: Write all text in {output_language}.

{anti_fabrication}

The candidate's answer about their skills:
{answers}

Normalize into a clean, de-duplicated list of individual skills (split comma/and lists).
Do NOT add skills they did not mention.

Output exactly this JSON shape:
{{
  "technicalSkills": ["Skill One", "Skill Two"]
}}""".replace("{anti_fabrication}", _ANTI_FABRICATION)

DRAFT_SUMMARY_PROMPT = """Write a 2-3 sentence professional summary for {name}'s resume.
Output ONLY a JSON object, no other text.

IMPORTANT: Write all text in {output_language}.

{anti_fabrication}

Base it ONLY on the resume content below. Do not introduce new facts.

Resume so far (JSON):
{resume_json}

Output exactly this JSON shape:
{{
  "summary": "the professional summary text"
}}""".replace("{anti_fabrication}", _ANTI_FABRICATION)
