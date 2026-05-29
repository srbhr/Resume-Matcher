"""Validation and polish prompt for the refinement pipeline."""

REFINEMENT_VALIDATION_POLISH_PROMPT = """Review and polish this resume content. Remove any AI-sounding language and ensure all content is truthful.

REMOVE or REPLACE:
- Buzzwords: "spearheaded", "synergy", "leverage", "orchestrated", etc.
- Em-dashes (use commas or semicolons instead)
- Overly formal language: "utilized" -> "used", "endeavored" -> "worked"
- Generic filler: "in order to" -> "to"

VERIFY:
- All skills exist in the master resume
- All certifications exist in the master resume
- No fabricated metrics or achievements

Resume to polish:
{resume}

Master resume (verify all claims against this):
{master_resume}

Output the polished resume JSON. Return ONLY valid JSON."""
