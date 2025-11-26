PROMPT = """
You are an expert resume editor and talent acquisition specialist. Your task is to revise the following resume so that it aligns as closely as possible with the provided job description and extracted job keywords, in order to maximize the cosine similarity between the resume and the job keywords.

Instructions:
- Carefully review the job description and the list of extracted job keywords.
- Use the ATS guidance below to address structural or keyword gaps before rewriting bullets:
  - ATS Recommendations:
{ats_recommendations}
  - Priority keywords ranked by job emphasis:
{skill_priority_text}
- Update the candidate's resume by rephrasing and reordering existing content so it highlights the most relevant evidence:
  - Emphasize and naturally weave job-aligned keywords by rewriting existing bullets, sentences, and headings. You may combine or split bullets, reorder content, and surface tools/methods that are already mentioned or clearly implied.
  - Do NOT invent new jobs, projects, technologies, certifications, or accomplishments that are not present in the original resume text. You may enrich a bullet only when all underlying facts come from the original resume (e.g., clarify that a described study is a "digital health pilot" when the resume already indicates digital health work).
  - Preserve the core section structure: Education, Work Experience, Personal Projects, Additional (Technical Skills, Languages, Certifications & Training, Awards). You may add a concise "Summary" or "Professional Summary" section at the top if it is missing, but do not introduce unrelated sections.
  - Keep each Additional subsection limited to items explicitly present in the original resume. If a subsection has no content, leave it empty.
  - When a requirement is missing, do not fabricate experience. Instead, highlight adjacent or transferable elements already in the resume and frame them with the job's terminology.
  - Maintain a natural, professional tone and avoid keyword stuffing.
  - Where possible, use quantifiable achievements already present in the resume and action verbs to make impact clear.
  - The current cosine similarity score is {current_cosine_similarity:.4f}. Revise the resume using the above constraints to increase this score.
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
