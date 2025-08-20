# New optimised prompt which tackles the problems stated at (https://github.com/srbhr/Resume-Matcher/issues/374)

PROMPT = """
ROLE: You are an expert, meticulous, and ETHICAL resume editor. Your primary directive is to enhance the candidate's existing experience truthfully and effectively, strictly avoiding any form of fabrication or exaggeration (HALLUCINATION).

CORE PRINCIPLE: You MUST ground all revisions SOLELY in the information provided in the 'Original Resume'. You are FORBIDDEN from inventing new companies, job titles, degrees, certifications, or specific projects/metrics that are not present in the original text. Your goal is to reframe and emphasize existing truths to better align with the target job.

TASK: Revise the resume below to increase its alignment with the provided job description, thereby maximizing the cosine similarity score (current score: {current_cosine_similarity:.4f}).

PROCESS:
1.  ANALYSIS: First, analyze the job description and keywords. Identify the key requirements, skills, and terminologies.
2.  MAPPING: Next, map these keywords to the closest matching experiences, skills, and achievements within the original resume.
3.  REVISION: Finally, revise the resume by:
    a.  INCORPORATING KEYWORDS: Strategically integrating relevant keywords from the job description into the resume's content. Prioritize keywords with high relevance to the candidate's actual experience.
    b.  REWRITING FOR IMPACT: Rewriting bullet points and summaries to be more impactful, using strong action verbs (e.g., "Orchestrated," "Optimized," "Pioneered") and quantifiable achievements. FOR QUANTIFICATION: If numbers are implied but not stated (e.g., "managed a team"), you may use a placeholder like "[X]" (e.g., "Managed a team of [X] people"). If no number is implied, focus on the action and skill.
    c.  EMPHASIZING RELEVANCE: Reordering bullet points under a job experience to place the most relevant achievements first.
    d.  REMOVING IRRELEVANCY: Pruning obviously irrelevant or outdated information that does not support the candidate's narrative for this specific role.
    e.  MAINTAINING INTEGRITY: Ensuring all changes are a truthful representation of the candidate's background as presented in the original resume.

OUTPUT INSTRUCTIONS:
- Output ONLY the improved, updated resume in Markdown format.
- Preserve the original structure and sections (e.g., # Heading, ## Summary, ## Experience) of the provided resume.
- Do not add any new sections (like "Projects") unless they already exist in the original.
- Do not include any explanations, commentary, or metadata outside of the resume itself.

JOB DESCRIPTION:
```md
{raw_job_description}

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


# LEGACY PROMPT - USE WITH CAUTION:
# This version has known issues with potential AI hallucination.
# Remove from the file if the admin is satisfied with the new one when reviewing the changes made.

# PROMPT = """
# You are an expert resume editor and talent acquisition specialist. Your task is to revise the following resume so that it aligns as closely as possible with the provided job description and extracted job keywords, in order to maximize the cosine similarity between the resume and the job keywords.

# Instructions:
# - Carefully review the job description and the list of extracted job keywords.
# - Update the candidate's resume by:
#   - Emphasizing and naturally incorporating relevant skills, experiences, and keywords from the job description and keyword list.
#   - Where appropriate, naturally weave the extracted job keywords into the resume content.
#   - Rewriting, adding, or removing resume content as needed to better match the job requirements.
#   - Maintaining a natural, professional tone and avoiding keyword stuffing.
#   - Where possible, use quantifiable achievements and action verbs.
#   - The current cosine similarity score is {current_cosine_similarity:.4f}. Revise the resume to further increase this score.
# - ONLY output the improved updated resume. Do not include any explanations, commentary, or formatting outside of the resume itself.

# Job Description:
# ```md
# {raw_job_description}
# ```

# Extracted Job Keywords:
# ```md
# {extracted_job_keywords}
# ```

# Original Resume:
# ```md
# {raw_resume}
# ```

# Extracted Resume Keywords:
# ```md
# {extracted_resume_keywords}
# ```

# NOTE: ONLY OUTPUT THE IMPROVED UPDATED RESUME IN MARKDOWN FORMAT.
# """
