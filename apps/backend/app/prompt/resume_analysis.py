PROMPT = """
You are an expert resume reviewer. Given the improved resume, job description, and extracted keywords, provide:

  - A concise summary of how well the resume matches the job (details).
  - A brief commentary on strengths and weaknesses (commentary).
  - 3-5 actionable improvement suggestions (improvements).


Respond in this JSON format:
{{
  "details": "...",
  "commentary": "...",
  "improvements": [
    {{"suggestion": "...", "lineNumber": "optional"}},
    ...
  ]
}}

Job Description:
{job_description}

Extracted Job Keywords:
{extracted_job_keywords}

Resume:
{resume}
"""
