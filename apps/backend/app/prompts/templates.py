"""LLM prompt templates for resume processing."""

# Language code to full name mapping
LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "zh": "Chinese (Simplified)",
    "ja": "Japanese",
    "pt": "Brazilian Portuguese",
}


def get_language_name(code: str) -> str:
    """Get full language name from code."""
    return LANGUAGE_NAMES.get(code, "English")


# Schema with example values - used for prompts to show LLM expected format
RESUME_SCHEMA_EXAMPLE = """{
  "personalInfo": {
    "name": "John Doe",
    "title": "Software Engineer",
    "email": "john@example.com",
    "phone": "+1-555-0100",
    "location": "San Francisco, CA",
    "website": "https://johndoe.dev",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe"
  },
  "summary": "Experienced software engineer with 5+ years...",
  "workExperience": [
    {
      "id": 1,
      "title": "Senior Software Engineer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "years": "Jan 2020 - Present",
      "description": [
        "Led development of microservices architecture",
        "Improved system performance by 40%"
      ]
    }
  ],
  "education": [
    {
      "id": 1,
      "institution": "University of California",
      "degree": "B.S. Computer Science",
      "years": "2014 - 2018",
      "description": "Graduated with honors"
    }
  ],
  "personalProjects": [
    {
      "id": 1,
      "name": "Open Source Tool",
      "role": "",
      "years": "2021",
      "description": [
        "Built CLI tool with 1000+ GitHub stars",
        "Used by 50+ companies worldwide"
      ]
    },
    {
      "id": 2,
      "name": "Hackathons",
      "role": "",
      "years": "2022, 2023",
      "description": [
        "ProjectAlpha (2022): Built XYZ for ABC.",
        "ProjectBeta (2023): Co-developed something else."
      ]
    }
  ],
  "additional": {
    "technicalSkills": ["Python", "JavaScript", "AWS", "Docker"],
    "languages": ["English (Native)", "Spanish (Conversational)"],
    "certificationsTraining": ["AWS Solutions Architect"],
    "awards": ["Employee of the Year 2022"]
  },
  "customSections": {
    "publications": {
      "sectionType": "itemList",
      "items": [
        {
          "id": 1,
          "title": "Paper Title",
          "subtitle": "Journal Name",
          "years": "Jun 2023",
          "description": ["Brief description of the publication"]
        }
      ]
    },
    "volunteer_work": {
      "sectionType": "text",
      "text": "Description of volunteer activities..."
    }
  }
}"""

# Schema for improve prompts - excludes personalInfo (preserved from original)
IMPROVE_SCHEMA_EXAMPLE = """{
  "summary": "Experienced software engineer with 5+ years...",
  "workExperience": [
    {
      "id": 1,
      "title": "Senior Software Engineer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "years": "Jan 2020 - Present",
      "description": [
        "Led development of microservices architecture",
        "Improved system performance by 40%"
      ]
    }
  ],
  "education": [
    {
      "id": 1,
      "institution": "University of California",
      "degree": "B.S. Computer Science",
      "years": "2014 - 2018",
      "description": "Graduated with honors"
    }
  ],
  "personalProjects": [
    {
      "id": 1,
      "name": "Open Source Tool",
      "role": "Creator & Maintainer",
      "years": "Mar 2021 - Present",
      "description": [
        "Built CLI tool with 1000+ GitHub stars",
        "Used by 50+ companies worldwide"
      ]
    }
  ],
  "additional": {
    "technicalSkills": ["Python", "JavaScript", "AWS", "Docker"],
    "languages": ["English (Native)", "Spanish (Conversational)"],
    "certificationsTraining": ["AWS Solutions Architect"],
    "awards": ["Employee of the Year 2022"]
  },
  "customSections": {
    "publications": {
      "sectionType": "itemList",
      "items": [
        {
          "id": 1,
          "title": "Paper Title",
          "subtitle": "Journal Name",
          "years": "Jun 2023",
          "description": ["Brief description of the publication"]
        }
      ]
    },
    "volunteer_work": {
      "sectionType": "text",
      "text": "Description of volunteer activities..."
    }
  }
}"""

PARSE_RESUME_PROMPT = """Extract this resume into JSON. Output ONLY the JSON object, no other text.

You are a STRUCTURE-ONLY extractor. Your job is to place the resume's existing text into the correct JSON fields. You are NOT a writer, editor, summarizer, or proofreader.

ABSOLUTE PRESERVATION RULES — DO NOT VIOLATE:
- Copy text VERBATIM from the source resume. Character-for-character identical.
- DO NOT rephrase, reword, paraphrase, shorten, expand, or "clean up" any text.
- DO NOT fix spelling, grammar, capitalization, or punctuation — even if it looks wrong.
- DO NOT remove, drop, skip, or omit any content from the resume. Every bullet, sentence, skill, date, and item must appear in the output.
- DO NOT merge, combine, or split bullet points or sentences.
- DO NOT reorder bullets, items, or sections.
- DO NOT infer, guess, or fabricate any value that is not literally present in the source.
- DO NOT normalize, reformat, or "standardize" dates, separators, phone numbers, URLs, or any other text. Copy them exactly as written (e.g. if the source says "2020-2021", output "2020-2021", not "2020 - 2021"; if it says "Current" or "Ongoing", keep that word — do not change it to "Present").
- DO NOT translate. Keep the original language.
- DO NOT add content that is not in the source (no invented summaries, descriptions, skills, achievements, or fields).
- If a field has no value in the source, use "" for text, [] for arrays, null for optional fields. NEVER fill it in yourself.

What you ARE allowed to do (structure only):
- Place text into the appropriate JSON field (e.g., job title → workExperience[].title).
- Split clearly delimited bullet lists into array elements WITHOUT modifying their text. Strip only the bullet marker character itself ("- ", "* ", "• ", "1. "); leave the bullet's text untouched.
- Number IDs starting from 1.
- Route non-standard sections (Publications, Volunteer Work, Research, Hobbies, etc.) into customSections using snake_case keys derived from the original section name.
- Format hyperlinks as markdown links: `[visible text](url)`. If the source shows the URL as the visible text (e.g. "https://example.com"), keep it as a bare URL — do not invent display text. If the source shows display text with an underlying hyperlink (e.g. "my portfolio" linking to https://example.com), output `[my portfolio](https://example.com)`. Apply this anywhere a link appears: bullet descriptions, summary, project entries, custom sections, etc. (Note: dedicated personalInfo fields like email, phone, website, linkedin, github should still be raw values, not markdown links.)

Project groups:
- If the Projects section contains a parent header with bulleted child projects underneath (e.g., a "Hackathons" header followed by two bulleted sub-projects), output ONE Project entry for the group — not one entry per child:
  - `name` = the parent header text, verbatim.
  - `years` = the parent header's date verbatim if present; otherwise "".
  - `role` = "" (do NOT fabricate a role for the group or its children).
  - `description` = each child sub-bullet preserved verbatim as a bullet, including any inline date prefix like "(2026):" and the full text after it. Do NOT promote children into their own Project entries. Do NOT invent per-child `role` or `years`.
- Standalone projects (no parent header) become their own Project entry as normal.

Custom section types:
- "text": Single text block (e.g., objective, statement)
- "itemList": List of items with title, subtitle, years, description (e.g., publications, research)
- "stringList": Simple list of strings (e.g., hobbies, interests)

Example output format (shows shape only — copy YOUR resume's text verbatim, do not borrow these example values):
{schema}

Resume to parse:
{resume_text}"""

EXTRACT_KEYWORDS_PROMPT = """Extract job requirements as JSON. Output ONLY the JSON object, no other text.

Example format:
{{
  "required_skills": ["Python", "AWS"],
  "preferred_skills": ["Kubernetes"],
  "experience_requirements": ["5+ years"],
  "education_requirements": ["Bachelor's in CS"],
  "key_responsibilities": ["Lead team"],
  "keywords": ["microservices", "agile"],
  "experience_years": 5,
  "seniority_level": "senior"
}}

Extract numeric years (e.g., "5+ years" → 5) and infer seniority level.

Job description:
{job_description}"""

CRITICAL_TRUTHFULNESS_RULES_TEMPLATE = """CRITICAL TRUTHFULNESS RULES - NEVER VIOLATE:
1. DO NOT add any skill, tool, technology, or certification that is not explicitly mentioned in the original resume
2. DO NOT invent numeric achievements (e.g., "increased by 30%") unless they exist in original
3. DO NOT add company names, product names, or technical terms not in the original
4. DO NOT upgrade experience level (e.g., "Junior" -> "Senior")
5. DO NOT add languages, frameworks, or platforms the candidate hasn't used
6. DO NOT extend employment dates or change timelines. Copy date ranges exactly as they appear, including months.
7. {rule_7}
8. Preserve factual accuracy - only use information provided by the candidate
9. NEVER remove existing skills, certifications, languages, or awards. You may reorder by relevance, but every original item must remain.

Violation of these rules could cause serious problems for the candidate in job interviews.
"""


def _build_truthfulness_rules(rule_7: str) -> str:
    return CRITICAL_TRUTHFULNESS_RULES_TEMPLATE.format(rule_7=rule_7)


CRITICAL_TRUTHFULNESS_RULES = {
    "nudge": _build_truthfulness_rules(
        "DO NOT add new bullet points or content - only rephrase existing content"
    ),
    "keywords": _build_truthfulness_rules(
        "You may rephrase existing bullet points to include keywords, but do NOT add new bullet points"
    ),
    "full": _build_truthfulness_rules(
        "You may expand existing bullet points or add new ones that elaborate on existing work, but DO NOT invent entirely new responsibilities"
    ),
}

IMPROVE_RESUME_PROMPT_NUDGE = """Lightly nudge this resume toward the job description. Output ONLY the JSON object, no other text.

{critical_truthfulness_rules}

IMPORTANT: Generate ALL text content (summary, descriptions, skills) in {output_language}.
Do NOT include personalInfo in your output - it will be preserved from the original resume.

Rules:
- Make minimal, conservative edits only where there is a clear existing match
- Do NOT change the candidate's role, industry, or seniority level
- Do NOT introduce new tools, technologies, or certifications not already present
- Do NOT add new bullet points or sections
- Preserve original bullet count and ordering within each section
- Keep proper nouns (names, company names, locations) unchanged
- For customSections: preserve exact structure, item count, titles, subtitles, and years. If an item's description is an empty array [] in the original, keep it empty []. Do NOT generate descriptions for items that had none.
- Copy the "years" field values EXACTLY as they appear in the original resume (including any month prefixes like "Jan 2020 - Present"). Do not shorten, reformat, or drop months.
- If the resume is non-technical, do NOT add technical jargon
- Do NOT use em dash ("—") anywhere in the writing/output, even if it exists, remove it

Job Description:
{job_description}

Keywords to emphasize (only if already supported by resume content):
{job_keywords}

Original Resume:
{original_resume}

Output in this JSON format:
{schema}"""

IMPROVE_RESUME_PROMPT_KEYWORDS = """Enhance this resume with relevant keywords from the job description. Output ONLY the JSON object, no other text.

{critical_truthfulness_rules}

IMPORTANT: Generate ALL text content (summary, descriptions, skills) in {output_language}.
Do NOT include personalInfo in your output - it will be preserved from the original resume.

Rules:
- Strengthen alignment by weaving in relevant keywords where evidence already exists
- You may rephrase bullet points to include keyword phrasing
- Do NOT introduce new skills, tools, or certifications not in the resume
- Do NOT change role, industry, or seniority level
- For customSections: preserve exact structure, item count, titles, subtitles, and years. If an item's description is an empty array [] in the original, keep it empty []. Do NOT generate descriptions for items that had none.
- Copy the "years" field values EXACTLY as they appear in the original resume (including any month prefixes like "Jan 2020 - Present"). Do not shorten, reformat, or drop months.
- If resume is non-technical, keep language non-technical while still aligning keywords
- Do NOT use em dash ("—") anywhere in the writing/output, even if it exists, remove it

Job Description:
{job_description}

Keywords to emphasize:
{job_keywords}

Original Resume:
{original_resume}

Output in this JSON format:
{schema}"""

IMPROVE_RESUME_PROMPT_FULL = """Tailor this resume for the job. Output ONLY the JSON object, no other text.

{critical_truthfulness_rules}

IMPORTANT: Generate ALL text content (summary, descriptions, skills) in {output_language}.
Do NOT include personalInfo in your output - it will be preserved from the original resume.

Rules:
- Make targeted adjustments to bullet points to align with job description phrasing. Preserve the candidate's original details and voice - adjust wording, do not rewrite entirely.
- DO NOT invent new information
- Preserve existing action verbs. Do not invent quantifiable achievements not in the original.
- Keep proper nouns (names, company names, locations) unchanged
- Translate job titles, descriptions, and skills to {output_language}
- For customSections: preserve exact structure, item count, titles, subtitles, and years. If an item's description is an empty array [] in the original, keep it empty []. Do NOT generate descriptions for items that had none.
- Improve custom section content the same way as standard sections
- Copy the "years" field values EXACTLY as they appear in the original resume (including any month prefixes like "Jan 2020 - Present"). Do not shorten, reformat, or drop months.
- Calculate and emphasize total relevant experience duration when it matches requirements
- Do NOT use em dash ("—") anywhere in the writing/output, even if it exists, remove it

Job Description:
{job_description}

Keywords to emphasize:
{job_keywords}

Original Resume:
{original_resume}

Output in this JSON format:
{schema}"""

IMPROVE_PROMPT_OPTIONS = [
    {
        "id": "nudge",
        "label": "Light nudge",
        "description": "Minimal edits to better align existing experience.",
    },
    {
        "id": "keywords",
        "label": "Keyword enhance",
        "description": "Blend in relevant keywords without changing role or scope.",
    },
    {
        "id": "full",
        "label": "Full tailor",
        "description": "Comprehensive tailoring using the job description.",
    },
]

IMPROVE_RESUME_PROMPTS = {
    "nudge": IMPROVE_RESUME_PROMPT_NUDGE,
    "keywords": IMPROVE_RESUME_PROMPT_KEYWORDS,
    "full": IMPROVE_RESUME_PROMPT_FULL,
}

DEFAULT_IMPROVE_PROMPT_ID = "keywords"

# Backward-compatible alias
IMPROVE_RESUME_PROMPT = IMPROVE_RESUME_PROMPT_FULL

COVER_LETTER_PROMPT = """Write a cover letter for this job application. It must fit on one page.

IMPORTANT: Write in {output_language}.

Job Description:
{job_description}

Candidate Resume (JSON):
{resume_data}

Requirements:
- 300-350 words maximum (one printed page)
- Structure: salutation, 3-4 body paragraphs, closing sign-off
- Salutation: "Dear Hiring Manager," (use actual name only if clearly stated in the job description)
- Opening paragraph: Reference ONE specific thing from the job description (product, tech stack, or problem they're solving) - not generic excitement about "the role"
- Middle paragraphs: Pick 2-3 qualifications from the resume that DIRECTLY match stated requirements - prioritize relevance over impressiveness
- Closing paragraph: Simple availability to discuss, no desperate enthusiasm
- Sign-off: end with "Sincerely," on its own line, then the candidate's full name on the next line
- If resume shows career transition, frame the pivot as intentional and relevant
- Extract company name from job description - do not use placeholders
- Do NOT invent information not in the resume
- Tone: Confident peer, not eager applicant
- Do NOT use em dash ("—") anywhere in the writing/output, even if it exists, remove it

Output plain text only. No JSON, no markdown formatting."""

OUTREACH_MESSAGE_PROMPT = """Generate a cold outreach message for LinkedIn or email about this job opportunity.

IMPORTANT: Write in {output_language}.

Job Description:
{job_description}

Candidate Resume (JSON):
{resume_data}

Guidelines:
- 70-100 words maximum (shorter than a cover letter)
- First sentence: Reference specific detail from job description (team, product, technical challenge) - never open with "I'm reaching out" or "I saw your posting"
- One sentence on strongest matching qualification with a concrete metric if available
- End with low-friction ask: "Worth a quick chat?" not "I'd love the opportunity to discuss"
- Tone: How you'd message a former colleague, not a stranger
- Do NOT include placeholder brackets
- Do NOT use phrases like "excited about" or "passionate about"
- Do NOT use em dash ("—") anywhere in the writing/output, even if it exists, remove it

Output plain text only. No JSON, no markdown formatting."""

GENERATE_TITLE_PROMPT = """Extract the job title and company name from this job description.

IMPORTANT: Write in {output_language}.

Job Description:
{job_description}

Rules:
- Format: "Role @ Company" (e.g., "Senior Frontend Engineer @ Stripe")
- If the company name is not found, return just the role (e.g., "Senior Frontend Engineer")
- Maximum 60 characters
- Use the most specific role title mentioned
- Do not add any other text, quotes, or formatting

Output the title only, nothing else."""

EXPAND_RESUME_TO_CV_PROMPT = """Expand this resume into a long-form CV. Output ONLY the JSON object, no other text.

A CV (Curriculum Vitae) is more detailed and comprehensive than a resume. It typically:
- Includes more bullet points per role with deeper context and additional achievements
- Adds a fuller summary/profile (3-5 sentences vs 1-2)
- Lists more skills, languages, certifications, awards in full
- Keeps a complete chronological history
- Spells out education, including coursework or honors when present

ABSOLUTE TRUTHFULNESS RULES — DO NOT VIOLATE:
- Do NOT invent employers, dates, titles, skills, technologies, projects, achievements, or metrics that are not present in the source resume.
- You may rephrase existing bullets into longer-form sentences, draw out implied details from context, and reorganize for clarity — but every concrete fact must trace back to the source.
- Keep all existing entries; do not remove anything.
- Preserve dates exactly as written (do not change "Present" to "Current" or vice versa).
- Output in the same language as the source resume.

Output the same JSON shape as the input (matching this schema). Copy IDs and structure 1:1; only enrich content within existing entries:
{schema}

Source resume (JSON):
{resume_json}"""

CONDENSE_CV_TO_RESUME_PROMPT = """Condense this CV into a concise one-to-two-page resume. Output ONLY the JSON object, no other text.

A resume is shorter, more focused, and optimized for fast scanning. Typical adjustments:
- Tighten the summary to 1-2 high-impact sentences
- Reduce bullet points per role to the 3-5 strongest items, prioritizing measurable outcomes
- Trim or merge older roles if they crowd the page; keep the most recent and most relevant
- Keep skills focused; remove obvious or trivial entries
- Preserve every distinct employer/role header — do NOT delete a job entirely; you may merely shorten its description

ABSOLUTE TRUTHFULNESS RULES — DO NOT VIOLATE:
- Do NOT invent or upgrade any fact. Every kept bullet must use words/facts that exist in the source.
- Do NOT change dates, titles, employers, degrees, or institution names.
- Output in the same language as the source CV.

Output the same JSON shape as the input (matching this schema). Maintain IDs from kept items where possible:
{schema}

Source CV (JSON):
{cv_json}"""

# Alias for backward compatibility
RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE

# Diff-based improvement: outputs targeted changes instead of full resume

DIFF_STRATEGY_INSTRUCTIONS = {
    "nudge": "Make minimal edits. Only rephrase where there is a clear match. Do not add new bullet points.",
    "keywords": "Weave in relevant keywords where evidence already exists. You may rephrase bullets but do not add new ones.",
    "full": "Make targeted adjustments. You may rephrase bullets, add verified JD skills, and add new bullets that elaborate on existing work, but do not invent new responsibilities.",
}

SKILL_TARGET_PLAN_PROMPT = """Build a concise skill target plan for tailoring this resume to the job.

Return ONLY a JSON object. Do not rewrite the resume.

Rules:
1. Prefer required and preferred JD skills.
2. Include existing resume skills that are highly relevant to the JD.
3. You may include JD skills that are missing from the resume skills list.
4. Do not include skills unrelated to the JD.
5. Do not include certifications.
6. Generate reasons in {output_language}.

Existing resume skills:
{existing_skills}

JD keywords and skills:
{job_keywords}

Job Description:
{job_description}

Resume JSON:
{original_resume}

Output this exact JSON format:
{{
  "target_skills": [
    {{
      "skill": "skill name",
      "reason": "why this skill should be emphasized"
    }}
  ],
  "strategy_notes": "brief notes for the next editing pass"
}}"""

DIFF_IMPROVE_PROMPT = """Given this resume and job description, output a JSON object with targeted changes to better align the resume with the job.

RULES:
1. Only modify content — never change names, companies, dates, institutions, or degrees
2. Do not invent metrics or achievements not supported by the original resume text
3. Do not add new work entries, education entries, or project entries
4. {strategy_instruction}
5. Each change MUST include the original text (copied exactly) so it can be verified
6. For each change, explain WHY it helps match the job description
7. Generate all new text in {output_language}
8. Do not use em dash characters
9. Keep changes minimal and targeted — do not rewrite content that already aligns well
10. Exception to rule 2: you may add a skill only if it appears in the verified skill targets below
11. Improve work and project bullets around the verified skill targets when the original text supports that alignment

PATHS you can target:
- "summary" — the resume summary text
- "workExperience[i].description[j]" — a specific bullet (i = entry index, j = bullet index)
- "workExperience[i].description" — append a new bullet (action: "append")
- "personalProjects[i].description[j]" — a specific project bullet
- "personalProjects[i].description" — append a new project bullet
- "additional.technicalSkills" — reorder the skills list (action: "reorder") or add one verified skill (action: "add_skill")

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
