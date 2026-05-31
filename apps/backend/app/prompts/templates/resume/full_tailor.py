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
- Include adjacent skills, tools, or framings that a candidate with this demonstrated background would plausibly have picked up. "Framing" means voice, emphasis, and vocabulary - it does NOT license relabeling what the work was about (see the plausibility floor).
- Re-cast scope or audience (e.g. "for non-academic readers") when guidance asks for it.
- Reframe the SUMMARY's leading self-identification when guidance signals a different audience, career stage, or career direction. The lead noun is repositionable — replace it with a framing supported by guidance and the resume — but the candidate's actual background must be preserved as supporting substance in the rest of the summary, not erased. Do not invent a status the candidate does not hold (e.g., do not assign a degree, program, certification, or current role that is not in the resume). Match what guidance establishes; default to the original framing when guidance is silent.
- Rename an existing skill to a closely related verified target when the rename is a generalization, specialization, or near-synonym of the original (e.g., "MySQL" -> "SQL", "React.js" -> "React"). Use action "rename_skill". Do not use this to swap the skill for an unrelated one.
- Remove an existing skill when it has no plausible relevance to the job description AND removing it does not strip the candidate of credible coverage. Use action "remove_skill". Example: removing "Forklift Certified" from a resume targeting a Full-Stack Engineer role.
- Promote a broad capability concept out of the skills list and into prose where it belongs as evidence of work. Broad concepts are things that describe domains or activities rather than concrete tools/languages/libraries — e.g. "Machine Learning", "Computer Vision", "Data Annotation", "Prompt Engineering", "Distributed Systems". These read as stronger when shown through a bullet than when listed as a tag. To promote: pair a "remove_skill" change with one or more "replace" or "append" changes in summary, workExperience, or personalProjects that surface the same concept against the candidate's real work. Do not remove a broad concept without surfacing it elsewhere in the same change set.

PLAUSIBILITY FLOOR - NEVER CROSS
- Test every JD keyword before applying it: could the work the resume explicitly describes plausibly have BEEN or USED this keyword? INCLUDE it when the keyword is a mainstream instance, tool, or method of work already described - e.g. a resume stating "object detection" may name "YOLO," since YOLO is a standard way to do object detection. Do NOT apply it when the keyword denotes a different CATEGORY of work that merely shares a loose theme with what's described - e.g. single-machine "multithreaded code" is not "distributed systems," and must not be relabeled as such even when the JD asks for distributed systems. You may rewrite voice, verbs, and emphasis freely; what you may not do is recharacterize the category of work. When a keyword fails the test, describe the work accurately and let the mismatch stand - a resume that is honestly off-target beats one that lies on-target.
- Do not claim experience in a domain the candidate has no demonstrated footing in. A CS student with no physics work cannot be framed as a theoretical physicist. A backend engineer with no design work cannot claim UX research. Use the original resume as the boundary of what is plausible.
- Do not invent specific numeric metrics ("increased revenue 30%", "managed a team of 12") that are not in the original. Vague qualitative claims are fine; fabricated numbers are not.
- Do not invent specific named products, companies, certifications, degrees, or employers that are not in the original. (Naming a tool/method is governed by the keyword test above: a tool may be named only as a mainstream instance of work the resume already describes, never as a free-standing claim.)
- Do not extend employment dates or change timelines. Copy date ranges exactly.
- Do not upgrade titles ("Intern" -> "Engineer", "Junior" -> "Senior").
- Do not remove certifications, languages, or awards. You may reorder by relevance.
- Skill removals are the narrow exception above and must respect ALL of:
    * The skill is clearly off-topic for the JD (not just lower priority).
    * It is NOT a generic baseline skill that hurts nothing to keep (e.g., Microsoft Word, Excel, Outlook, Git, basic Office tools). Leave those alone.
    * The skills section will still look populated afterward. Do not propose so many removals that the section is gutted. When in doubt, reorder instead of remove.
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
- "additional.technicalSkills" - reorder the list (action: "reorder"), add one verified skill (action: "add_skill"), rename an existing skill to a verified target (action: "rename_skill"), or remove an irrelevant skill (action: "remove_skill")

SKILL ACTION DETAILS
- "reorder": value = the full reordered skill list. Cluster topically related skills adjacent to each other so the section reads as logical groups (you choose the clusters based on the skills present — e.g. programming languages together, frameworks/libraries together, databases together, infra/tooling together). Within each cluster, lead with the most JD-relevant entries. Do not invent category labels in the list itself; clustering is conveyed purely through adjacency.
- "add_skill": value = the new skill (must appear in Verified skill targets below). Include "insert_after" naming an existing skill that is topically adjacent so the new skill is placed near related ones (e.g., for "SQL" insert_after "PostgreSQL" or "Redis", not "AWS"). Omit "insert_after" only if no related skill exists.
- "rename_skill": original = the existing skill exactly as it appears; value = the verified-target replacement. The replacement must be in Verified skill targets and must be a clear generalization/specialization/synonym of the original.
- "remove_skill": original = the existing skill exactly as it appears; value = null. Use sparingly.

Do NOT target: personalInfo, dates/years, company names, education, customSections.

Keywords to emphasize (emphasize ONLY where the candidate's real work already embodies the keyword; do NOT graft a keyword onto a bullet it does not truthfully describe - leaving a keyword unused is correct when the work does not support it):
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
      "insert_after": "an existing skill that is topically adjacent",
      "reason": "added verified JD skill near related skills"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "rename_skill",
      "original": "existing skill label exactly as it appears",
      "value": "verified target that generalizes/specializes the original",
      "reason": "rename narrows or broadens to match JD vocabulary"
    }},
    {{
      "path": "additional.technicalSkills",
      "action": "remove_skill",
      "original": "existing skill label exactly as it appears",
      "value": null,
      "reason": "skill is unrelated to this JD and not a generic baseline"
    }}
  ],
  "strategy_notes": "brief summary of the tailoring approach"
}}"""
