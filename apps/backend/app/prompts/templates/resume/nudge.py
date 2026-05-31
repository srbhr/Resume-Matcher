"""Light-nudge diff prompt.

Used when the user picks "Light nudge" mode in the improve flow — the most
conservative strategy. The prompt only allows rephrasing existing bullets where
the resume already has a clear match for the JD; it never adds bullets.
"""

RESUME_NUDGE_PROMPT = """Given this resume and job description, output a JSON object with targeted changes to better align the resume with the job.

RULES:
1. Only modify content — never change names, companies, dates, institutions, or degrees
2. Do not invent metrics or achievements not supported by the original resume text
3. Do not add new work entries, education entries, or project entries
4. Make minimal edits. Only rephrase where there is a clear match. Do not add new bullet points.
5. Each change MUST include the original text (copied exactly) so it can be verified
6. For each change, explain WHY it helps match the job description
7. Generate all new text in {output_language}
8. Do not use em dash characters
9. Keep changes minimal and targeted — do not rewrite content that already aligns well
10. Exception to rule 2: you may add a skill only if it appears in the verified skill targets below

DATES AND ONGOING STATUS:
- Today's date is {current_date}. Entries may carry a boolean "current" flag (and the resume a "_meta.current_date" anchor). "current": true means a job/project is ongoing, or for education that the degree is in progress and the candidate is currently enrolled. A degree is also in progress when its end date is later than today.
- You may make the summary reflect an in-progress degree by describing the candidate as a current student at that level in that EXACT field (e.g. "Master's student in Computer Science"). This is supported by the resume, not invented. Copy the field of study verbatim from the degree - never swap "Computer Science" for "software engineering" or similar.

SUMMARY QUALITY — if you rephrase the summary, improve it by subtraction: cut filler any candidate could claim ("hands-on experience", "real-world applications", "results-driven") and vague buzzwords ("systems thinking", "cross-functional collaboration") that point at nothing concrete. Do not add new claims; keep only what is anchored to work the resume already shows.

BULLET QUALITY — when you rephrase a bullet, improve it in place without adding claims: lead with a strong action verb and replace weak lead-ins ("Responsible for", "Duties included", "Helped with", "Worked on") with the action itself; prefer active voice and implied first person with no pronouns; keep past tense for completed roles and present tense for current ones. Surface only scope or results the original already states — never add a metric or outcome that is not there.

PATHS you can target:
- "summary" — the resume summary text
- "workExperience[i].description[j]" — a specific bullet (i = entry index, j = bullet index)
- "personalProjects[i].description[j]" — a specific project bullet
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
      "value": "the rephrased text",
      "reason": "why this change helps"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "reorder",
      "original": null,
      "value": ["most relevant skill first", "then next", "..."],
      "reason": "reordered to prioritize JD-relevant skills"
    }}
  ],
  "strategy_notes": "brief summary of the tailoring approach"
}}"""
