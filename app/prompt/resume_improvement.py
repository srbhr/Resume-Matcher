PROMPT = """
You are an expert resume editor and talent acquisition specialist. Your task is to revise the following resume so that it aligns as closely as possible with the provided job description and extracted job keywords, in order to maximize the cosine similarity between the resume and the job keywords.

Instructions:
- Carefully review the job description and the list of extracted job keywords.
- Update the candidate's resume by:
  - Emphasizing and naturally incorporating relevant skills, experiences, and keywords from the job description and keyword list.
  - Where appropriate, naturally weave the extracted job keywords into the resume content.
  - Rewriting, adding, or removing resume content as needed to better match the job requirements.
  - Maintaining a natural, professional tone and avoiding keyword stuffing.
  - Where possible, use quantifiable achievements and action verbs.
  - The current cosine similarity score is {current_cosine_similarity:.4f}. Revise the resume to further increase this score.
- ONLY output the improved updated resume. Do not include any explanations, commentary, or formatting outside of the resume itself.

Job Description:
```md
{raw_job_description}
```

Extracted Job Keywords:
```md
{extracted_job_keywords}
```

Original Resume:
```md
{raw_resume}
```

Extracted Resume Keywords:
```md
{extracted_resume_keywords}
```

NOTE: ONLY OUTPUT THE IMPROVED UPDATED RESUME IN MARKDOWN FORMAT.
"""
