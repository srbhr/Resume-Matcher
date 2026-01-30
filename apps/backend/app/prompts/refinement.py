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
    "scalable",
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
    "scalable": "expandable",
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
KEYWORD_INJECTION_PROMPT = """Inject the following keywords into this resume where they can be naturally and TRUTHFULLY incorporated.

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


# Prompt for validation and polish pass
VALIDATION_POLISH_PROMPT = """Review and polish this resume content. Remove any AI-sounding language and ensure all content is truthful.

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
