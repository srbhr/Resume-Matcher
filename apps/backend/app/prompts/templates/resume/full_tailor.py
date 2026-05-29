"""Full-tailoring diff prompt.

Used when the user picks "Full tailor" mode in the improve flow. This mode
permits aggressive rewriting and reframing of the resume to align with the
job description, bounded by a plausibility floor that forbids cross-domain
fabrication. User guidance (appended at runtime by `_append_user_guidance`
in `app.services.improver`) is authoritative on voice, tone, audience, and
how aggressively to bend.

Forked from `RESUME_IMPROVE_PROMPT` so the full-tailor rules can state their
own constraints coherently instead of overriding rules in a shared scaffold.
"""

RESUME_FULL_TAILOR_PROMPT = """Tailor this resume to the job description. Output a JSON object with targeted changes, nothing else.

FULL TAILOR MODE
The user has opted in to bending the resume toward the job description. User guidance (if provided at the end of the prompt) is authoritative on voice, framing, tone, audience, and how aggressively to bend. Honor it.

WHAT YOU MAY DO
- Rewrite bullets: change wording, voice, action verbs, sentence structure, and framing. Rewrites must REPLACE the original (action: "replace"). Never produce output that is the original text followed by additional clauses tacked on.
- Add new bullets that elaborate on or reframe work the candidate actually did.
- Reframe academic/research work in industry terms (or vice versa) when guidance supports it.
- Include adjacent skills, tools, or framings that a candidate with this demonstrated background would plausibly have picked up.
- Re-cast scope or audience (e.g. "for non-academic readers") when guidance asks for it.

PLAUSIBILITY FLOOR - NEVER CROSS
- Do not claim experience in a domain the candidate has no demonstrated footing in. A CS student with no physics work cannot be framed as a theoretical physicist. A backend engineer with no design work cannot claim UX research. Use the original resume as the boundary of what is plausible.
- Do not invent specific numeric metrics ("increased revenue 30%", "managed a team of 12") that are not in the original. Vague qualitative claims are fine; fabricated numbers are not.
- Do not invent specific named tools, products, companies, certifications, degrees, or employers that are not in the original.
- Do not extend employment dates or change timelines. Copy date ranges exactly.
- Do not upgrade titles ("Intern" -> "Engineer", "Junior" -> "Senior").
- Do not remove existing skills, certifications, languages, or awards. You may reorder by relevance.
- Do not claim native/fluent proficiency in a language not listed.
- If user guidance pushes past the plausibility floor, follow guidance up to the floor and stop. Do not silently sand down the guidance, but do not fabricate to satisfy it either.

FORMAT RULES
- Only modify content - never change personalInfo, names, companies, dates, institutions, or degrees.
- Each change MUST include the original text (copied exactly) at the targeted path so it can be verified.
- For each change, explain WHY it helps match the job description or honor user guidance.
- Generate all new text in {output_language}.
- Do not use em dash characters.
- For skills: only add a skill that appears in the verified skill targets below.
- Prefer reframing existing facts over inventing new ones. A real bullet rewritten in JD-aligned language beats a plausible-sounding bullet that didn't happen.

PATHS you can target
- "summary" - the resume summary text
- "workExperience[i].description[j]" - a specific bullet (i = entry index, j = bullet index)
- "workExperience[i].description" - append a new bullet (action: "append")
- "personalProjects[i].description[j]" - a specific project bullet
- "personalProjects[i].description" - append a new project bullet
- "additional.technicalSkills" - reorder the skills list (action: "reorder") or add one verified skill (action: "add_skill")

Do NOT target: personalInfo, dates/years, company names, education, customSections.

Keywords to emphasize:
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
      "value": "the rewritten text",
      "reason": "why this change helps"
    }},
    {{
      "path": "summary",
      "action": "replace",
      "original": "the current summary text",
      "value": "the rewritten summary",
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
