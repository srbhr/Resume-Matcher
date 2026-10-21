"""Prompts for the writing critique, the bullet rewrite and keyword forcing.

WRITING_RUBRIC is also copied verbatim into .claude/skills/resume-matcher/SKILL.md
(between the writing-rubric markers) so agent mode writes to the same standard;
tests/unit/test_writing_rubric_parity.py keeps the two in sync.
"""

WRITING_RUBRIC = """- Start every bullet with a strong action verb in the past tense (present tense for a current role). Never open with "Responsible for", "Helped with", "Assisted in", "Involved in", "Participated in", "Worked on" or "Tasked with".
- Shape each bullet as Challenge, Action, Result: the situation, what the candidate did, and what changed because of it.
- State the result. Keep every number in the source exactly. Never invent a number, percentage, amount, count or time saved, and never add size words ("significantly", "dramatically", "greatly") the source does not use.
- When the source has no number, state the result through scope and outcome the source already gives: who used the work, what it replaced, what it made possible, how often it ran.
- Keep every fact: each number, name, product, tool, skill and outcome in the original stays in the rewrite. Add none.
- One idea per bullet, at most about 35 words. No first-person pronouns ("I", "my").
- No em dashes ("—") or double hyphens ("--"). Use a comma, a semicolon or a new sentence.
- Avoid stock phrases such as "spearheaded", "leveraged", "orchestrated", "utilized", "synergy", "cutting-edge" and "results-driven"."""

WRITING_CRITIQUE_PROMPT = """You are a strict resume reviewer. Review each listed resume line against the rubric. Do not rewrite anything.

Rubric:
{rubric}

For each line, decide:
- "no_outcome": true when the line states an activity but no result, outcome or scope at all (a number is NOT required; "used by the support team daily" is an outcome).
- "weak_opener": true when the line opens with a phrase that describes proximity to work instead of the work ("Responsible for", "Helped with", "Worked on", or the same idea in {output_language}).
- "note": one short, specific suggestion in {output_language}, at most 20 words. Suggest asking the candidate for a number only as a question, never a made-up figure.

List only lines that break the rubric. Copy each path exactly.

Lines (path | text):
{bullets}

Output only this JSON:
{{
  "bullets": [
    {{"path": "workExperience[0].description[1]", "no_outcome": true, "weak_opener": false, "note": "Say what changed after the migration."}}
  ]
}}"""

WRITING_REWRITE_PROMPT = """Rewrite the listed resume lines so they meet the rubric. Output only JSON.

Rubric:
{rubric}

Hard rules:
1. Rewrite only the listed paths. Copy each path and its original text exactly.
2. Every number, name, product, tool and skill in the original line must appear in your rewrite. Add no new ones.
3. Never invent a metric. If the line has no number, state the outcome or scope the line already implies, or leave the result qualitative.
4. Write in {output_language}.
5. The summary stays a summary: 2 to 4 sentences, no bullet points.
{mode_rule}
Context (the full resume, for tone and facts only):
{resume}

Lines to rewrite (path | problems | text):
{targets}

Output this exact JSON:
{{
  "changes": [
    {{"path": "workExperience[0].description[1]", "action": "replace", "original": "the exact original text", "value": "the rewritten line", "reason": "what the rewrite fixed"}}
  ]
}}"""

WRITING_HEAVY_MODE_RULE = "6. Heavy rewrite: you may restructure each line fully into Challenge, Action, Result, as long as rules 2 and 3 hold.\n"

KEYWORD_PLACEMENT_PROMPT = """Work the listed job keywords into this resume. The candidate confirmed each keyword is true for them. Output only JSON.

Hard rules:
1. A skill, tool or technology keyword goes into the skills list with action "add_skill" (value = the keyword exactly as listed).
2. You may also weave each keyword into AT MOST 2 existing lines where it honestly fits the work described: the summary or a work or project bullet. Use action "replace", copying the path and the original text exactly.
3. When a keyword fits no line, use only the skills list (or, for a practice or concept such as "agile", only the summary).
4. In a replaced line keep every number, name, tool and skill the line already has. Add nothing except the keyword itself: no new responsibility, no number, no other tool.
5. Write in {output_language}. No em dashes or double hyphens.

Keywords:
{keywords}

Resume:
{resume}

Job description (for context):
{job_description}

Output this exact JSON:
{{
  "changes": [
    {{"path": "additional.technicalSkills", "action": "add_skill", "original": null, "value": "Kubernetes", "reason": "Kubernetes"}},
    {{"path": "workExperience[0].description[2]", "action": "replace", "original": "the exact original text", "value": "the line with the keyword", "reason": "Kubernetes"}}
  ]
}}

In "reason", put only the keyword the change places."""


FORCED_KEYWORDS_PREP_NOTE = """

Claimed keywords: the candidate added these job keywords to the resume themselves: {keywords}.
Put each one first in "skill_gaps" (as "you listed this, be ready to back it up with a real example") and ask about each in "resume_questions". Do not treat them as proven by the rest of the resume."""
