"""Prompt templates and blacklists for multi-pass resume refinement."""

# AI Phrase Blacklist - Words and phrases that sound AI-generated
AI_PHRASE_BLACKLIST: set[str] = {
    # Action verbs (overused in AI resume writing)
    "spearheaded",
    "orchestrated",
    "championed",
    "synergized",
    "leveraged",
    "revolutionized",
    "pioneered",
    "catalyzed",
    "operationalized",
    "architected",
    "envisioned",
    "effectuated",
    "endeavored",
    "facilitated",
    "utilized",
    # Corporate buzzwords
    "synergy",
    "synergies",
    "paradigm",
    "paradigm shift",
    "best-in-class",
    "world-class",
    "cutting-edge",
    "bleeding-edge",
    "game-changer",
    "game-changing",
    "disruptive",
    "disruptor",
    "holistic",
    "robust",
    "actionable",
    "impactful",
    "proactive",
    "proactively",
    "stakeholder",
    "deliverables",
    "bandwidth",
    "circle back",
    "deep dive",
    "move the needle",
    "low-hanging fruit",
    "touch base",
    "value-add",
    # Filler phrases
    "in order to",
    "for the purpose of",
    "with a view to",
    "at the end of the day",
    "moving forward",
    "going forward",
    "on a daily basis",
    "on a regular basis",
    "in a timely manner",
    "at this point in time",
    "due to the fact that",
    "in the event that",
    "in light of the fact that",
    # Punctuation patterns
    "\u2014",  # Em-dash
    "---",
    "--",  # Double hyphen often used as em-dash substitute
}

# Replacements for AI phrases - maps AI phrase to simpler alternative
AI_PHRASE_REPLACEMENTS: dict[str, str] = {
    # Action verb replacements
    "spearheaded": "led",
    "orchestrated": "coordinated",
    "championed": "advocated for",
    "synergized": "collaborated",
    "leveraged": "used",
    "revolutionized": "transformed",
    "pioneered": "introduced",
    "catalyzed": "initiated",
    "operationalized": "implemented",
    "architected": "designed",
    "envisioned": "planned",
    "effectuated": "completed",
    "endeavored": "worked",
    "facilitated": "helped",
    "utilized": "used",
    # Buzzword replacements
    "synergy": "collaboration",
    "synergies": "collaborations",
    "paradigm": "approach",
    "paradigm shift": "change",
    "best-in-class": "top-performing",
    "world-class": "high-quality",
    "cutting-edge": "modern",
    "bleeding-edge": "modern",
    "game-changer": "innovation",
    "game-changing": "innovative",
    "disruptive": "innovative",
    "holistic": "comprehensive",
    "robust": "strong",
    "actionable": "practical",
    "impactful": "effective",
    "proactive": "active",
    "proactively": "actively",
    "stakeholder": "team member",
    "deliverables": "outputs",
    "bandwidth": "capacity",
    "circle back": "follow up",
    "deep dive": "analysis",
    "move the needle": "make progress",
    "low-hanging fruit": "quick wins",
    "touch base": "connect",
    "value-add": "benefit",
    # Phrase simplifications
    "in order to": "to",
    "for the purpose of": "to",
    "with a view to": "to",
    "at the end of the day": "",
    "moving forward": "",
    "going forward": "",
    "on a daily basis": "daily",
    "on a regular basis": "regularly",
    "in a timely manner": "promptly",
    "at this point in time": "now",
    "due to the fact that": "because",
    "in the event that": "if",
    "in light of the fact that": "since",
    # Punctuation replacements
    "\u2014": ", ",  # Em-dash to comma
    "---": ", ",
    "--": ", ",
}


# Prompt for injecting missing keywords into a resume
KEYWORD_INJECTION_PROMPT = """Inject ALL of the following keywords into this resume. Be aggressive - every keyword should appear somewhere.

STRATEGY:
1. ADD ALL skills and tools from the keywords list to the technicalSkills section
2. Rewrite bullet points to incorporate keywords, mirroring JD phrasing where possible
3. You MAY add new bullet points if needed to incorporate remaining keywords
4. You MAY add keywords that are NOT in the master resume - the JD is the source of truth for what skills to include
5. Invent realistic metrics and details to support keyword integration

CONSTRAINTS:
1. Do NOT modify certifications - copy certificationsTraining exactly as-is from the master resume
2. Do NOT include spoken languages - set languages to an empty array []
3. Keep company names, job titles, and dates unchanged from the current tailored resume
4. Maintain the exact same JSON structure
5. Do not use em-dashes (\u2014) or their variants (---, --)

Keywords to inject (use ALL of these):
{keywords_to_inject}

Current tailored resume:
{current_resume}

Master resume (reference for context):
{master_resume}

Job description context:
{job_description}

Output the complete resume JSON with ALL keywords integrated. Return ONLY valid JSON."""


# Prompt for validation and polish pass
VALIDATION_POLISH_PROMPT = """Review and polish this resume content. Remove any AI-sounding language and ensure high engineering rigor.

REMOVE or REPLACE:
- Buzzwords: "spearheaded", "synergy", "leverage", "orchestrated", etc.
- Em-dashes (use commas or semicolons instead)
- Overly formal language: "utilized" -> "used", "endeavored" -> "worked"
- Generic filler: "in order to" -> "to"

ENGINEERING RIGOR RULES:
1. Semantic Realism: Ensure technical tools match the scale described. Use Spark, Ray, or Flink for 'distributed' workloads; use Pandas/Scikit-learn for local/single-node workloads.
2. Temporal Accuracy: Technology must match the role's timeline. Use 'MLOps' for 2021–2022; reserve 'LLMOps' or 'GenAI' for 2023 onwards.
3. Business-to-Technical Translation: Frame leadership as technical partnership. Instead of "advised executives", use "Partnered with leadership to solve [Business Problem] by architecting [Technical Solution]."
4. Grounded Metrics: Any metric improvement >25% MUST be paired with the method (e.g., "achieved via semantic chunking" or "fine-tuning on domain-specific datasets").
5. Industry Lexicon: Use standard engineering verbs. Prioritize 'Scalable' over 'Expandable', 'Provisioned' over 'Built', and 'Optimized' over 'Analyzed'.

VERIFY:
- All certifications exist in the master resume (do NOT add new ones) - copy certificationsTraining exactly as-is
- Do NOT include spoken languages - set languages to an empty array []
- Metrics are plausible for the role seniority and industry
- Company names and dates are unchanged from the master resume

Resume to polish:
{resume}

Master resume (verify certifications, companies, and dates against this):
{master_resume}

Output the polished resume JSON. Return ONLY valid JSON."""
