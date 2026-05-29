"""Keyword injection prompt for the refinement pipeline."""

REFINEMENT_KEYWORD_INJECTION_PROMPT = """Inject the following keywords into this resume where they can be naturally and TRUTHFULLY incorporated.

CRITICAL RULES:
1. Only add keywords where the master resume provides supporting evidence
2. Do NOT add skills, technologies, or certifications not in the master resume
3. Rephrase existing bullet points to include keywords - do not invent new content
4. Maintain the exact same JSON structure
5. Do not use em-dashes (—) or their variants (---, --)

Keywords to inject (only if supported by master resume):
{keywords_to_inject}

Current tailored resume:
{current_resume}

Master resume (source of truth):
{master_resume}

Job description context:
{job_description}

Output the complete resume JSON with keywords naturally integrated. Return ONLY valid JSON."""
