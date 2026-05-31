"""Keyword-enhancement diff prompt.

Used when the user picks "Keyword enhance" mode in the improve flow. The prompt
weaves JD keywords into existing bullets where the resume already supports them
and may rephrase bullets, but does not invent new ones. The other two strategies
have their own dedicated prompts: ``nudge.py`` (most conservative) and
``full_tailor.py`` (most aggressive).
"""

RESUME_IMPROVE_PROMPT ="""Given this resume and job description, output a JSON object with targeted changes to better align the resume with the job.

RULES:
1. Only modify content — never change names, companies, dates, institutions, or degrees
2. Do not invent metrics or achievements not supported by the original resume text
3. Do not add new work entries, education entries, or project entries
4. Weave in relevant keywords where evidence already exists. You may rephrase bullets but do not add new ones.
5. Each change MUST include the original text (copied exactly) so it can be verified
6. For each change, explain WHY it helps match the job description
7. Generate all new text in {output_language}
8. Do not use em dash characters
9. Keep changes minimal and targeted — do not rewrite content that already aligns well
10. Exception to rule 2: you may add a skill only if it appears in the verified skill targets below
11. Improve work and project bullets around the verified skill targets when the original text supports that alignment

DATES AND ONGOING STATUS:
- Today's date is {current_date}. Entries may carry a boolean "current" flag (and the resume a "_meta.current_date" anchor). "current": true means a job/project is ongoing, or for education that the degree is in progress and the candidate is currently enrolled. A degree is also in progress when its end date is later than today.
- You may make the summary reflect an in-progress degree by describing the candidate as a current student at that level in that EXACT field (e.g. "Master's student in Computer Science"). This is supported by the resume, not invented. Copy the field of study verbatim from the degree - never swap "Computer Science" for "software engineering" or similar.

SUMMARY QUALITY — when you rewrite the summary:
- Lead with the candidate's identity and level, framed toward the target role where the resume supports it (do not promote a level or claim a title the candidate does not hold).
- Front-load the strongest, most JD-relevant qualification; favor concrete specifics over adjectives, and only reuse numbers already in the resume — never invent a metric.
- Weave the JD's vocabulary in naturally; do not stuff keywords. Write in implied first person (no "I", "me", "my") and describe value offered, not goals sought.
- Cut filler any candidate could claim ("hands-on experience", "real-world applications", "results-driven") and vague abstractions ("systems thinking", "cross-functional collaboration") that point at nothing concrete in the resume.
- Do not spend summary clauses advertising baseline competencies assumed for the role; either say something specific about them or leave them to the skills section.
- Aim for a tight 3-4 sentence summary that could only describe this candidate, not any applicant for the role.

BULLET QUALITY — when you rephrase a work or project bullet:
- Lead with a strong, specific action verb. Replace weak lead-ins ("Responsible for", "Duties included", "Helped with", "Worked on", "Assisted with") with the action itself.
- Favor an action + result shape: name what was done and the outcome or impact it produced, not just the task. Make the "so what" explicit wherever the original supports it.
- Surface concrete scope, scale, volume, or frequency the resume already shows; never invent a metric (see rule 2). If no number is supported, state the scope in words.
- Use active voice and implied first person with no pronouns ("Led X", not "I led X" and not the passive "X was led"). Keep past tense for completed roles and present tense for a current/ongoing role, consistent within each entry.
- Cut filler ("various tasks", "as needed", "fast-paced environment") and contextless adjectives. Keep each bullet to one or two lines.

PATHS you can target:
- "summary" — the resume summary text
- "workExperience[i].description[j]" — a specific bullet (i = entry index, j = bullet index)
- "workExperience[i].description" — append a new bullet (action: "append")
- "personalProjects[i].description[j]" — a specific project bullet
- "personalProjects[i].description" — append a new project bullet
- "additional.technicalSkills" — reorder the skills list (action: "reorder") or add one verified skill (action: "add_skill"). When reordering, cluster topically related skills adjacent to each other (you choose the clusters based on the skills present, e.g. languages together, frameworks together, databases together) and lead each cluster with its most JD-relevant entries.

Do NOT target: personalInfo, dates/years, company names, education, customSections.

Keywords to emphasize (only if already supported by resume content):
{job_keywords}

Verified skill targets:
{skill_targets}

Job Description:
{job_description}

Original Resume:
{original_resume}

Output this exact JSON format, nothing else:
{{
  "changes": [
    {{
      "path": "workExperience[0].description[1]",
      "action": "replace",
      "original": "the exact original text at this path",
      "value": "the improved text",
      "reason": "why this change helps"
    }},
    {{
      "path": "summary",
      "action": "replace",
      "original": "the current summary text",
      "value": "the improved summary",
      "reason": "why this change helps"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "reorder",
      "original": null,
      "value": ["most relevant skill first", "then next", "..."],
      "reason": "reordered to prioritize JD-relevant skills"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "add_skill",
      "original": null,
      "value": "verified skill target missing from the skills list",
      "reason": "added verified JD skill for review"
    }}
  ],
  "strategy_notes": "brief summary of the tailoring approach"
}}"""
