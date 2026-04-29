"""Prompt templates for the ATS two-pass pipeline."""

ATS_SCORE_PROMPT = """You are an ATS (Applicant Tracking System) engine. Analyze the job description and resume below.

Score using these weighted categories. Do NOT exceed the listed maximum for each:
- skills_match: 0-30 points  (explicit hard skills: programming languages, domain skills, certifications)
- experience_match: 0-25 points  (years of experience, seniority level, role progression match)
- domain_match: 0-20 points  (industry knowledge, domain terminology, sector-specific language)
- tools_match: 0-15 points  (specific tools, platforms, software, technologies named in JD)
- achievement_match: 0-10 points  (quantified results, measurable impacts, specific accomplishments)

Decision rules (apply AFTER scoring):
- total_score >= 75 → decision = "PASS"
- 60 <= total_score < 75 → decision = "BORDERLINE"
- total_score < 60 → decision = "REJECT" — you MUST provide at least 10 distinct warning_flags

For keyword_table: extract the 20-30 most important keywords/phrases from the JD. For each, state whether it appears in the resume and in which section. Use section names: "summary", "workExperience", "education", "additional", or null if not found.

For warning_flags: be concrete and specific. Write "Missing 3+ years of product management experience — resume shows 1 year" not "lacks experience". Every flag must name a specific gap.

Output ONLY the following JSON object. No explanation, no markdown:
{{
  "score_breakdown": {{
    "skills_match": <integer 0-30>,
    "experience_match": <integer 0-25>,
    "domain_match": <integer 0-20>,
    "tools_match": <integer 0-15>,
    "achievement_match": <integer 0-10>
  }},
  "total_score": <integer 0-100>,
  "decision": "PASS" | "BORDERLINE" | "REJECT",
  "keyword_table": [
    {{"keyword": "...", "found_in_resume": true, "section": "workExperience"}},
    {{"keyword": "...", "found_in_resume": false, "section": null}}
  ],
  "missing_keywords": ["keyword1", "keyword2"],
  "warning_flags": ["Specific flag 1", "Specific flag 2"]
}}

Job Description:
{job_description}

Resume:
{resume_text}"""


ATS_OPTIMIZE_PROMPT = """You are an ATS resume optimizer. Improve the resume below to better match the job description, guided by the gap analysis.

{critical_truthfulness_rules}

Gap Analysis:
Missing Keywords: {missing_keywords}

Warning Flags:
{warning_flags}

Score Breakdown: {score_breakdown}

Optimization rules:
- Weave missing keywords into existing bullets ONLY where the candidate's actual experience supports them
- If the resume contains any of these exact phrases — "product judgment", "operating in ambiguity", "structured thinking", "data-driven decision making" — preserve them verbatim in the output
- Do NOT add those PM phrases if they do not appear anywhere in the original resume text
- Strengthen vague action verbs ("worked on" → "led", "helped with" → "drove")
- Improve the summary to lead with the most JD-relevant experience
- Provide 5-10 specific, actionable optimization_suggestions explaining what changed and why

Job Description:
{job_description}

Original Resume (JSON):
{resume_json}

Output ONLY this JSON. The optimized_resume field must match the schema exactly:
{{
  "optimized_resume": {schema},
  "optimization_suggestions": ["suggestion1", "suggestion2"]
}}"""
