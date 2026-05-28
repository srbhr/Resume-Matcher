"""ATS score computation utilities.

Calculates an ATS-style breakdown score from already-processed resume and job data:
  - keyword_match: final keyword match % from the refinement pipeline
  - skills_coverage: overlap between resume technical skills and JD required skills
  - section_completeness: presence of essential resume sections (local, no LLM)

The overall_score is a weighted composite of the three sub-scores.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Weights must sum to 1.0
_WEIGHTS = {
    "keyword_match": 0.55,
    "skills_coverage": 0.25,
    "section_completeness": 0.20,
}

# Patterns to detect resume section headings
_SECTION_PATTERNS = {
    "summary": ["summary", "objective", "profile", "about"],
    "experience": ["experience", "work history", "employment"],
    "education": ["education", "academic", "degree"],
    "skills": ["skills", "technologies", "competencies", "technical"],
}


def _extract_all_text(data: dict[str, Any]) -> str:
    """Flatten all string values from a resume dict into a single text block."""
    parts: list[str] = []

    def _walk(obj: Any) -> None:
        if isinstance(obj, str):
            parts.append(obj)
        elif isinstance(obj, list):
            for item in obj:
                _walk(item)
        elif isinstance(obj, dict):
            for v in obj.values():
                _walk(v)

    _walk(data)
    return " ".join(parts)


def _keyword_in_text(keyword: str, text_lower: str) -> bool:
    """Whole-word match against pre-lowercased text to avoid false positives.

    Args:
        keyword: The keyword to search for (will be lowercased internally).
        text_lower: Full text that has already been lowercased by the caller.
    """
    escaped = re.escape(keyword.strip().lower())
    if not escaped:
        return False
    return bool(re.search(rf"(?<!\w){escaped}(?!\w)", text_lower))


def _compute_skills_coverage(
    resume: dict[str, Any],
    job_keywords: dict[str, Any],
) -> float:
    """Return skills coverage score (0–100).

    Checks how many required_skills / preferred_skills from the JD appear
    in the resume's technicalSkills list (falls back to full-text search).
    """
    jd_skills: list[str] = []
    jd_skills.extend(job_keywords.get("required_skills", []))
    jd_skills.extend(job_keywords.get("preferred_skills", []))

    if not jd_skills:
        return 0.0

    resume_skills: list[str] = (
        resume.get("additional", {}).get("technicalSkills", []) or []
    )
    resume_text = _extract_all_text(resume).lower()
    resume_skills_lower = {s.lower() for s in resume_skills if isinstance(s, str)}

    matched = 0
    for skill in jd_skills:
        if not isinstance(skill, str):
            continue
        skill_lower = skill.lower()
        # Direct skill list match or whole-word text match (resume_text is pre-lowercased)
        if skill_lower in resume_skills_lower or _keyword_in_text(skill, resume_text):
            matched += 1

    return min(100.0, (matched / len(jd_skills)) * 100)


def _compute_section_completeness(resume: dict[str, Any]) -> float:
    """Return section completeness score (0–100).

    Checks the structured resume dict for the presence of key sections.
    If no structured sections are detected, falls back to scanning all
    extracted text for common section heading keywords.
    """
    found = 0

    # Structured-data fast path
    if resume.get("summary"):
        found += 1
    if resume.get("workExperience"):
        found += 1
    if resume.get("education"):
        found += 1
    skills = resume.get("additional", {}).get("technicalSkills", [])
    if skills:
        found += 1

    # If none of the structured checks fired, fall back to text scanning
    if found == 0:
        text = _extract_all_text(resume).lower()
        for patterns in _SECTION_PATTERNS.values():
            if any(p in text for p in patterns):
                found += 1

    total = len(_SECTION_PATTERNS)  # 4
    return (found / total) * 100


def _generate_recommendations(
    keyword_score: float,
    skills_score: float,
    section_score: float,
    missing_keywords: list[str],
    injectable_keywords: list[str],
) -> list[str]:
    tips: list[str] = []

    if keyword_score < 60 and missing_keywords:
        top = ", ".join(missing_keywords[:5])
        tips.append(f"Add these high-priority missing keywords: {top}.")

    if injectable_keywords:
        top_injectable = ", ".join(injectable_keywords[:5])
        tips.append(
            f"The following skills are in your master resume but not in this tailored version — consider adding them: {top_injectable}."
        )

    if skills_score < 60:
        tips.append(
            "Expand your Skills section to include more of the tools and technologies listed in the job description."
        )

    if section_score < 75:
        tips.append(
            "Make sure your resume includes all key sections: Summary, Work Experience, Education, and Skills."
        )

    if keyword_score >= 80 and skills_score >= 80:
        tips.append(
            "Strong keyword and skills alignment. Consider quantifying your achievements with metrics and numbers."
        )

    if not tips:
        tips.append(
            "Your resume is well-aligned with the job description. Review for any niche certifications or tools to add."
        )

    return tips


def compute_ats_score(
    refined_resume: dict[str, Any],
    job_keywords: dict[str, Any],
    keyword_match_percentage: float,
    missing_keywords: list[str],
    injectable_keywords: list[str],
) -> dict[str, Any]:
    """Compute the ATS score breakdown dict.

    Args:
        refined_resume: The fully refined resume data dict.
        job_keywords: Extracted JD keywords dict (required_skills, preferred_skills, …).
        keyword_match_percentage: Final keyword match % from refiner.calculate_keyword_match.
        missing_keywords: Keywords absent from the tailored resume (non-injectable).
        injectable_keywords: Keywords absent but present in the master resume.

    Returns:
        Dict with overall_score, sub_scores, missing_keywords,
        injectable_keywords, and recommendations.
    """
    kw_score = min(100.0, max(0.0, keyword_match_percentage))
    sk_score = _compute_skills_coverage(refined_resume, job_keywords)
    sec_score = _compute_section_completeness(refined_resume)

    overall = (
        kw_score * _WEIGHTS["keyword_match"]
        + sk_score * _WEIGHTS["skills_coverage"]
        + sec_score * _WEIGHTS["section_completeness"]
    )

    return {
        "overall_score": round(overall, 1),
        "sub_scores": {
            "keyword_match": round(kw_score, 1),
            "skills_coverage": round(sk_score, 1),
            "section_completeness": round(sec_score, 1),
        },
        "missing_keywords": missing_keywords[:10],
        "injectable_keywords": injectable_keywords[:10],
        "recommendations": _generate_recommendations(
            kw_score,
            sk_score,
            sec_score,
            missing_keywords,
            injectable_keywords,
        ),
    }
