"""LLM prompt templates for AI-powered resume enrichment."""

ANALYZE_RESUME_PROMPT = """You are a professional resume analyst. Analyze this resume to identify items in Experience and Projects sections that have weak, vague, or incomplete descriptions.

IMPORTANT: Generate ALL output text (questions, placeholders, summaries, weakness reasons) in {output_language}.

RESUME DATA (JSON):
{resume_json}

WEAK DESCRIPTION INDICATORS:
1. Generic phrases: "responsible for", "worked on", "helped with", "assisted in", "involved in"
2. Missing metrics/impact: No numbers, percentages, dollar amounts, or measurable outcomes
3. Unclear scope: Vague about team size, project scale, user count, or responsibilities
4. No technologies/tools: Missing specific tech stack, tools, or methodologies used
5. Passive voice without ownership: Not clear what the candidate personally accomplished
6. Too brief: Single short bullet that doesn't explain the work

GOOD DESCRIPTION EXAMPLES (for reference):
- "Led migration of 15 microservices to Kubernetes, reducing deployment time by 60%"
- "Built real-time analytics dashboard using React and D3.js, serving 10K daily users"
- "Architected payment processing system handling $2M monthly transactions"

TASK:
1. Review each Experience and Project item's description bullets
2. Identify items that would benefit from more detail
3. Generate a MAXIMUM of 6 questions total across ALL items (not per item)
4. Prioritize the most impactful questions that will yield the best improvements
5. If multiple items need enhancement, distribute questions wisely (e.g., 2-3 per item)
6. Questions should help extract: metrics, technologies, scope, impact, and specific contributions

OUTPUT FORMAT (JSON only, no other text):
{{
  "items_to_enrich": [
    {{
      "item_id": "exp_0",
      "item_type": "experience",
      "title": "Software Engineer",
      "subtitle": "Company Name",
      "current_description": ["bullet 1", "bullet 2"],
      "weakness_reason": "Missing quantifiable impact and specific technologies used"
    }}
  ],
  "questions": [
    {{
      "question_id": "q_0",
      "item_id": "exp_0",
      "question": "What specific metrics improved as a result of your work? (e.g., performance gains, cost savings, user growth)",
      "placeholder": "e.g., Reduced API response time by 40%, saved $50K annually"
    }},
    {{
      "question_id": "q_1",
      "item_id": "exp_0",
      "question": "What technologies, frameworks, or tools did you use in this role?",
      "placeholder": "e.g., Python, FastAPI, PostgreSQL, Redis, AWS Lambda"
    }},
    {{
      "question_id": "q_2",
      "item_id": "exp_0",
      "question": "What was the scale of your work? (team size, users served, data volume)",
      "placeholder": "e.g., Team of 5, serving 100K users, processing 1M requests/day"
    }},
    {{
      "question_id": "q_3",
      "item_id": "exp_0",
      "question": "What was your specific contribution or ownership in this project?",
      "placeholder": "e.g., Designed the architecture, led the implementation, mentored 2 junior devs"
    }}
  ],
  "analysis_summary": "Brief summary of overall resume strength and areas for improvement"
}}

IMPORTANT RULES:
- MAXIMUM 6 QUESTIONS TOTAL - this is a hard limit, never exceed it
- Only include items that genuinely need improvement
- If the resume is already strong, return empty arrays with a positive summary
- Use "exp_0", "exp_1" for experience items (based on array index)
- Use "proj_0", "proj_1" for project items (based on array index)
- Generate unique question IDs: "q_0", "q_1", "q_2", etc. (max q_5)
- Questions should be specific to the role/project context
- Keep questions conversational but professional
- Placeholder text should give concrete examples
- Prioritize quality over quantity - ask the most impactful questions first"""

ENHANCE_DESCRIPTION_PROMPT = """You are a professional resume writer. Your goal is to ADD new bullet points to this resume item using the additional context provided by the candidate. DO NOT rewrite or replace existing bullets - only add new ones.

IMPORTANT: Generate ALL output text (bullet points) in {output_language}.

ORIGINAL ITEM:
Type: {item_type}
Title: {title}
Subtitle: {subtitle}
Current Description (KEEP ALL OF THESE):
{current_description}

CANDIDATE'S ADDITIONAL CONTEXT:
{answers}

TASK:
Generate NEW bullet points to ADD to the existing description. The original bullets will be kept as-is.
New bullets should be:
1. Action-oriented: Start with strong verbs (Led, Built, Architected, Implemented, Optimized)
2. Quantified: Include metrics, numbers, percentages where the candidate provided them
3. Technically specific: Mention technologies, tools, and methodologies
4. Impact-focused: Clearly state the business or technical outcome
5. Ownership-clear: Show what the candidate personally did vs. the team

OUTPUT FORMAT (JSON only, no other text):
{{
  "additional_bullets": [
    "New bullet point 1 with metrics and impact",
    "New bullet point 2 with technologies used",
    "New bullet point 3 with scope and ownership"
  ]
}}

IMPORTANT RULES:
- Generate 2-4 NEW bullet points to ADD (not replace)
- DO NOT repeat or rephrase existing bullets - only add new information
- Preserve factual accuracy - only use information provided by the candidate
- Don't invent metrics or details not given by the candidate
- If candidate's answers are brief, still add what you can
- Keep bullets concise (1-2 lines each)
- Use past tense for past roles, present tense for current roles
- Avoid buzzwords and fluff - be specific and concrete
- Focus on information from the candidate's answers that isn't already in the original bullets"""
