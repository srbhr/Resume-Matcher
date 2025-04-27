PROMPT = """
You are an expert resume editor and talent acquisition specialist. Your task is to revise the following resume so that it aligns as closely as possible with the provided job description and extracted job keywords, in order to maximize the cosine similarity between the resume and the job keywords.

Instructions:
- Carefully review the job description and the list of extracted job keywords.
- Update the candidate's resume by:
  - Emphasizing and incorporating relevant skills, experiences, and keywords from the job description and keyword list.
  - Rewriting, adding, or removing resume content as needed to better match the job requirements.
  - Maintaining a natural, professional tone and avoiding keyword stuffing.
- ONLY output the updated resume. Do not include any explanations, commentary, or formatting outside of the resume itself.

Job Description:
{raw_job_description}

Extracted Job Keywords:
{extracted_job_keywords}

Original Resume:
{raw_resume}

[Optional: Extracted Resume Keywords:
{extracted_resume_keywords}]

ONLY OUTPUT THE UPDATED RESUME.

"""
