"""Cover letter generation prompt."""

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
