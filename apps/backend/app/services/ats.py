"""ATS score computation utilities.

Calculates an ATS-style breakdown score from already-processed resume and job data.
Every component is deterministic (no LLM call):
  - keyword_match: final keyword match % from the refinement pipeline
  - skills_coverage: overlap between resume technical skills and JD required skills
  - title_match: the posting's exact job title in the resume headline / summary
  - section_completeness: contact info + essential sections present and visible
  - date_consistency: share of resume dates written in a single format

Recruiters search ATS databases with literal keyword and job-title filters, and
parsers miscount experience when date formats are mixed, so those signals are
scored alongside raw keyword coverage.

The overall_score is a weighted composite of the scorable sub-scores. A
component that cannot be evaluated (e.g. the posting has no title, or the
resume has fewer than two dates) is reported as ``None`` and its weight is
redistributed across the remaining components.
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Weights must sum to 1.0
WEIGHTS: dict[str, float] = {
    "keyword_match": 0.40,
    "skills_coverage": 0.20,
    "title_match": 0.15,
    "section_completeness": 0.15,
    "date_consistency": 0.10,
}

# Patterns to detect resume section headings
_SECTION_PATTERNS = {
    "summary": ["summary", "objective", "profile", "about"],
    "experience": ["experience", "work history", "employment"],
    "education": ["education", "academic", "degree"],
    "skills": ["skills", "technologies", "competencies", "technical"],
}

# Title-match scores: exact title in the headline is what recruiters' title
# filters hit; the summary is a weaker placement; word overlap is a near miss.
_TITLE_IN_HEADLINE = 100.0
_TITLE_IN_SUMMARY = 75.0
_TITLE_OVERLAP_MAX = 50.0
_TITLE_STOPWORDS = frozenset(
    {"a", "an", "and", "the", "of", "for", "in", "to", "at", "&"}
)

# Date styles, tried left to right at each position. Month names are matched as
# any run of 3+ letters so the check works in every content language.
_YEAR = r"(?:19|20)\d{2}"
_DATE_PATTERN = re.compile(
    rf"(?P<iso>\b{_YEAR}[-/]\d{{1,2}}\b)"
    rf"|(?P<numeric>\b\d{{1,2}}[/.-]{_YEAR}\b)"
    rf"|(?P<name_year>\b[^\W\d_]{{3,}}\.?,?\s+{_YEAR}\b)"
    rf"|(?P<name_short_year>\b[^\W\d_]{{3,}}\.?\s+'\d{{2}}\b)"
    rf"|(?P<year>\b{_YEAR}\b)"
)
_MIN_DATES_FOR_CONSISTENCY = 2


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


def _title_tokens(text: str) -> set[str]:
    """Lowercased title words, minus filler words like "of" / "and"."""
    return {
        token
        for token in re.findall(r"[^\W_]+", text.lower())
        if token not in _TITLE_STOPWORDS
    }


def _is_section_visible(resume: dict[str, Any], key: str) -> bool:
    """A section hidden via sectionMeta is not rendered, so it cannot be parsed."""
    for meta in resume.get("sectionMeta") or []:
        if isinstance(meta, dict) and meta.get("key") == key:
            return meta.get("isVisible", True) is not False
    return True


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


def compute_title_match(
    resume: dict[str, Any], job_keywords: dict[str, Any]
) -> float | None:
    """Return how literally the posting's job title appears (0–100), or None.

    Scores 100 when the exact title is in the resume headline, 75 when it is
    only in the summary, and up to 50 for partial word overlap with the
    headline (synonyms such as "Product Lead" for "Product Manager" do not
    match recruiter title searches). Returns None when the posting has no title.
    """
    role = job_keywords.get("role")
    if not isinstance(role, str) or not role.strip():
        return None

    personal_info = resume.get("personalInfo") or {}
    headline = str(personal_info.get("title") or "")
    summary = (
        str(resume.get("summary") or "")
        if _is_section_visible(resume, "summary")
        else ""
    )

    if _keyword_in_text(role, headline.lower()):
        return _TITLE_IN_HEADLINE
    if _keyword_in_text(role, summary.lower()):
        return _TITLE_IN_SUMMARY

    role_tokens = _title_tokens(role)
    if not role_tokens:
        return 0.0
    overlap = len(role_tokens & _title_tokens(headline)) / len(role_tokens)
    return round(overlap * _TITLE_OVERLAP_MAX, 1)


def _collect_date_strings(resume: dict[str, Any]) -> list[str]:
    """Gather the ``years`` field of every dated entry in a visible section."""
    entries: list[Any] = []
    for key in ("workExperience", "education", "personalProjects"):
        if _is_section_visible(resume, key):
            entries.extend(resume.get(key) or [])
    for key, section in (resume.get("customSections") or {}).items():
        if isinstance(section, dict) and _is_section_visible(resume, key):
            entries.extend(section.get("items") or [])
    return [
        entry["years"]
        for entry in entries
        if isinstance(entry, dict) and isinstance(entry.get("years"), str)
    ]


def compute_date_consistency(resume: dict[str, Any]) -> float | None:
    """Return the share of dates written in the dominant format (0–100), or None.

    "Present"/"Current" markers are ignored. Returns None when the resume has
    fewer than two dates, since consistency cannot be judged.
    """
    style_counts: dict[str, int] = {}
    for value in _collect_date_strings(resume):
        for match in _DATE_PATTERN.finditer(value):
            style = match.lastgroup
            if style:
                style_counts[style] = style_counts.get(style, 0) + 1

    total = sum(style_counts.values())
    if total < _MIN_DATES_FOR_CONSISTENCY:
        return None
    return round(max(style_counts.values()) / total * 100, 1)


def compute_section_completeness(resume: dict[str, Any]) -> float:
    """Return section completeness score (0–100).

    Checks that contact info (email or phone) and the summary, experience,
    education and skills sections are present and not hidden. If no
    structured sections are detected, falls back to scanning all extracted
    text for common section heading keywords.
    """
    personal_info = resume.get("personalInfo") or {}
    has_contact = bool(personal_info.get("email") or personal_info.get("phone"))
    sections_found = sum(
        [
            bool(resume.get("summary")) and _is_section_visible(resume, "summary"),
            bool(resume.get("workExperience"))
            and _is_section_visible(resume, "workExperience"),
            bool(resume.get("education")) and _is_section_visible(resume, "education"),
            bool((resume.get("additional") or {}).get("technicalSkills"))
            and _is_section_visible(resume, "additional"),
        ]
    )
    if sections_found:
        return (sections_found + has_contact) / (len(_SECTION_PATTERNS) + 1) * 100

    # Legacy/unstructured data: scan the text for section headings. Contact info
    # only counts when it is structured; it can't be detected from free text.
    text = _extract_all_text(resume).lower()
    headings_found = sum(
        1 for patterns in _SECTION_PATTERNS.values() if any(p in text for p in patterns)
    )
    if has_contact:
        return (headings_found + 1) / (len(_SECTION_PATTERNS) + 1) * 100
    return headings_found / len(_SECTION_PATTERNS) * 100


def _in_posting_order(keywords: list[str], job_keywords: dict[str, Any]) -> list[str]:
    """Order keywords as the job posting lists them; unknown ones last, A–Z.

    Callers build these lists from sets, so without this the top-N shown and
    used in recommendations could change between runs.
    """
    rank: dict[str, int] = {}
    for field in ("required_skills", "preferred_skills", "keywords"):
        for keyword in job_keywords.get(field) or []:
            if isinstance(keyword, str):
                rank.setdefault(keyword.lower(), len(rank))
    return sorted(keywords, key=lambda k: (rank.get(k.lower(), len(rank)), k.lower()))


def _generate_recommendations(
    sub_scores: dict[str, float | None],
    role: str,
    missing_keywords: list[str],
    injectable_keywords: list[str],
) -> list[str]:
    tips: list[str] = []
    keyword_score = sub_scores["keyword_match"] or 0.0
    skills_score = sub_scores["skills_coverage"] or 0.0
    section_score = sub_scores["section_completeness"] or 0.0
    title_score = sub_scores["title_match"]
    date_score = sub_scores["date_consistency"]

    if title_score is not None and title_score < _TITLE_IN_HEADLINE:
        tips.append(
            f'Use the exact job title "{role}" in your resume headline. Recruiters '
            "filter by title literally, so synonyms are missed. Edit the headline in "
            "the Builder; tailoring does not change it."
        )

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

    if section_score < 100:
        tips.append(
            "Make sure your resume shows contact details and visible Summary, Work Experience, Education, and Skills sections."
        )

    if date_score is not None and date_score < 100:
        tips.append(
            'Write every date range in one format (e.g. "Jan 2020 - Mar 2023"). Mixed formats can make an ATS miscount your years of experience.'
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
        job_keywords: Extracted JD keywords dict (role, required_skills, …).
        keyword_match_percentage: Final keyword match % from refiner.calculate_keyword_match.
        missing_keywords: Keywords absent from the tailored resume (non-injectable).
        injectable_keywords: Keywords absent but present in the master resume.

    Returns:
        Dict with overall_score, sub_scores (unscorable components are None),
        missing_keywords, injectable_keywords, and recommendations.
    """
    missing_keywords = _in_posting_order(missing_keywords, job_keywords)
    injectable_keywords = _in_posting_order(injectable_keywords, job_keywords)
    sub_scores: dict[str, float | None] = {
        "keyword_match": min(100.0, max(0.0, keyword_match_percentage)),
        "skills_coverage": _compute_skills_coverage(refined_resume, job_keywords),
        "title_match": compute_title_match(refined_resume, job_keywords),
        "section_completeness": compute_section_completeness(refined_resume),
        "date_consistency": compute_date_consistency(refined_resume),
    }

    scored = {key: value for key, value in sub_scores.items() if value is not None}
    total_weight = sum(WEIGHTS[key] for key in scored)
    overall = (
        sum(value * WEIGHTS[key] for key, value in scored.items()) / total_weight
        if total_weight
        else 0.0
    )

    return {
        "overall_score": round(overall, 1),
        "sub_scores": {
            key: (round(value, 1) if value is not None else None)
            for key, value in sub_scores.items()
        },
        "missing_keywords": missing_keywords[:10],
        "injectable_keywords": injectable_keywords[:10],
        "recommendations": _generate_recommendations(
            sub_scores,
            str(job_keywords.get("role") or "").strip(),
            missing_keywords,
            injectable_keywords,
        ),
    }
