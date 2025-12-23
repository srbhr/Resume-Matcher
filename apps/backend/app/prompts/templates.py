"""LLM prompt templates for resume processing."""

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
      "years": "2020 - Present",
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
      "years": "2021 - Present",
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
  }
}"""

PARSE_RESUME_PROMPT = """Extract resume information into JSON format.

CRITICAL: Your response must be ONLY valid JSON starting with {{ and ending with }}.
Do not include any text, explanation, or markdown - just the JSON object.

Rules:
- Extract only information present in the resume text
- Use empty string "" for missing text fields
- Use empty array [] for missing list fields
- Use null for optional fields (website, linkedin, github, location in experience, description in education)
- Keep years in format "YYYY - YYYY" or "YYYY - Present"
- Number IDs starting from 1

JSON Structure:
```json
{schema}
```

Resume Text:
```
{{resume_text}}
```

Respond with ONLY the JSON object. Start with {{ immediately.""".format(schema=RESUME_SCHEMA_EXAMPLE)

EXTRACT_KEYWORDS_PROMPT = """Extract key requirements from this job description.

CRITICAL: Respond with ONLY valid JSON starting with {{ and ending with }}.
No explanations, no markdown code blocks - just the JSON object.

JSON Structure:
{{
  "required_skills": ["skill1", "skill2"],
  "preferred_skills": ["skill1", "skill2"],
  "experience_requirements": ["5+ years experience", "team leadership"],
  "education_requirements": ["Bachelor's degree in CS"],
  "key_responsibilities": ["Design systems", "Lead team"],
  "keywords": ["python", "aws", "microservices"]
}}

Job Description:
```
{job_description}
```

Respond with ONLY the JSON object. Start with {{ immediately."""

IMPROVE_RESUME_PROMPT = """Revise this resume to align with the job description.

CRITICAL: Respond with ONLY valid JSON starting with {{ and ending with }}.
No explanations, no markdown code blocks - just the JSON object.

Rules:
- Rephrase and reorder content to highlight relevant experience
- Weave job-aligned keywords naturally into existing content
- Do NOT invent new jobs, projects, or skills not in the original
- Maintain professional tone without keyword stuffing
- Use quantifiable achievements and action verbs

Job Description:
```
{job_description}
```

Job Keywords:
{job_keywords}

Original Resume:
```
{original_resume}
```

Output JSON Structure:
```json
{schema}
```

Respond with ONLY the JSON object. Start with {{ immediately."""

# Alias for backward compatibility - used by improver.py
RESUME_SCHEMA = RESUME_SCHEMA_EXAMPLE
