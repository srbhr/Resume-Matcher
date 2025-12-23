"""LLM prompt templates for resume processing."""

RESUME_SCHEMA = """{
  "personalInfo": {
    "name": "string",
    "title": "string",
    "email": "string",
    "phone": "string",
    "location": "string",
    "website": "string or null",
    "linkedin": "string or null",
    "github": "string or null"
  },
  "summary": "string",
  "workExperience": [
    {
      "id": "integer (auto-increment starting from 1)",
      "title": "string (job title/role)",
      "company": "string",
      "location": "string or null",
      "years": "string (e.g., '2020 - Present' or '2018 - 2020')",
      "description": ["string (bullet point)"]
    }
  ],
  "education": [
    {
      "id": "integer (auto-increment starting from 1)",
      "institution": "string",
      "degree": "string",
      "years": "string (e.g., '2014 - 2018')",
      "description": "string or null"
    }
  ],
  "personalProjects": [
    {
      "id": "integer (auto-increment starting from 1)",
      "name": "string",
      "role": "string",
      "years": "string (e.g., '2021 - Present')",
      "description": ["string"]
    }
  ],
  "additional": {
    "technicalSkills": ["string"],
    "languages": ["string"],
    "certificationsTraining": ["string"],
    "awards": ["string"]
  }
}"""

PARSE_RESUME_PROMPT = f"""You are a JSON extraction engine. Convert the following resume text into precisely the JSON schema specified below.

Instructions:
- Map each resume section to the schema without inventing information.
- If a field is missing in the source text, use an empty string or empty array as appropriate.
- Preserve bullet points in the description arrays using short factual sentences.
- Use "Present" if an end date is ongoing.
- Keep years in format YYYY or YYYY-MM where available.
- Do not add any extra fields or commentary.
- Output ONLY valid JSON matching the schema.

Schema:
```json
{RESUME_SCHEMA}
```

Resume:
```text
{{resume_text}}
```"""

EXTRACT_KEYWORDS_PROMPT = """Extract the key requirements, skills, and qualifications from this job description.

Return a JSON object with:
{{
  "required_skills": ["skill1", "skill2", ...],
  "preferred_skills": ["skill1", "skill2", ...],
  "experience_requirements": ["requirement1", ...],
  "education_requirements": ["requirement1", ...],
  "key_responsibilities": ["responsibility1", ...],
  "keywords": ["keyword1", "keyword2", ...]
}}

Job Description:
```
{job_description}
```"""

SCORE_RESUME_PROMPT = """You are an ATS (Applicant Tracking System) expert. Score how well this resume matches the job requirements.

Consider:
1. Keyword matches (exact and semantic)
2. Experience alignment
3. Skills coverage
4. Education fit

Return a JSON object:
{{
  "score": <integer 0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "strengths": ["strength1", "strength2"],
  "gaps": ["gap1", "gap2"],
  "skill_comparison": [
    {{
      "skill": "skill name",
      "requiredLevel": "Expert/Advanced/Intermediate/Basic",
      "currentLevel": "Expert/Advanced/Intermediate/Basic/None",
      "gap": "description of gap or 'No gap'"
    }}
  ]
}}

Job Keywords:
```
{job_keywords}
```

Resume:
```
{resume_text}
```"""

IMPROVE_RESUME_PROMPT = """You are an expert resume editor and talent acquisition specialist. Your task is to revise the following resume so that it aligns as closely as possible with the provided job description and extracted job keywords.

Instructions:
- Carefully review the job description and the list of extracted job keywords.
- Update the candidate's resume by rephrasing and reordering existing content to highlight the most relevant evidence.
- Emphasize and naturally weave job-aligned keywords by rewriting existing bullets, sentences, and headings.
- Do NOT invent new jobs, projects, technologies, certifications, or accomplishments not present in the original resume.
- Preserve the core section structure: Personal Info, Summary, Work Experience, Education, Projects, Additional (Skills, Languages, Certifications, Awards).
- Add or improve a concise "Summary" section at the top if missing.
- Maintain a natural, professional tone and avoid keyword stuffing.
- Use quantifiable achievements already present and action verbs to make impact clear.
- When a requirement is missing, highlight adjacent or transferable elements and frame them with the job's terminology.

Current Match Score: {current_score}/100
Target: Improve the score by addressing gaps while staying truthful to the original content.

Job Description:
```
{job_description}
```

Extracted Job Keywords:
{job_keywords}

Original Resume:
```
{original_resume}
```

Output ONLY the improved resume in the exact JSON format matching this schema:
```json
{schema}
```"""
