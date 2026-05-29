"""Shared resume-module prompt utilities and schemas."""

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

RESUME_PARSE_PROMPT = """Extract this resume into JSON. Output ONLY the JSON object, no other text.

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

RESUME_EXPAND_TO_CV_PROMPT = """Expand this resume into a long-form CV. Output ONLY the JSON object, no other text.

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

RESUME_CONDENSE_FROM_CV_PROMPT = """Condense this CV into a concise one-to-two-page resume. Output ONLY the JSON object, no other text.

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
