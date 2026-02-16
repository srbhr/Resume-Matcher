"""Dual-score JD match analysis service.

Provides ATS keyword matching (with synonym normalization via skill taxonomy)
and semantic similarity scoring (via sentence-transformer embeddings) to
evaluate how well a resume matches a given job description.
"""

import logging
import re
from typing import Any

from app.data.skill_taxonomy import ALIAS_TO_CANONICAL
from app.schemas.match_analysis import (
    ATSScoreResult,
    MatchAnalysisResponse,
    SectionScore,
    SemanticScoreResult,
    SynonymMatch,
)

logger = logging.getLogger(__name__)

# Lazy-loaded sentence-transformer model
_model = None

# Section weights for semantic scoring
SECTION_WEIGHTS: dict[str, float] = {
    "experience": 0.40,
    "skills": 0.30,
    "summary": 0.15,
    "education": 0.10,
    "projects": 0.05,
}

# Category weights for ATS scoring
CATEGORY_WEIGHTS: dict[str, float] = {
    "required_skills": 2.0,
    "preferred_skills": 1.0,
    "keywords": 0.5,
}


def _get_model() -> Any:
    """Lazy-load the sentence-transformer model on first use.

    Returns:
        The loaded SentenceTransformer model instance.
    """
    global _model
    if _model is None:
        logger.info("Loading sentence-transformer model all-MiniLM-L6-v2...")
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("Sentence-transformer model loaded")
    return _model


def _normalize_skill(term: str) -> str:
    """Normalize a skill term to its canonical form via the taxonomy.

    Args:
        term: Raw skill term to normalize.

    Returns:
        The canonical skill name if found, otherwise the lowered/stripped term.
    """
    normalized = term.lower().strip()
    return ALIAS_TO_CANONICAL.get(normalized, normalized)


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check if keyword exists as a whole word in text.

    Uses word boundaries instead of substring matching to avoid
    false positives like 'python' matching 'pythonic'.

    Args:
        keyword: The keyword to search for.
        text: The text to search within.

    Returns:
        True if the keyword is found as a whole word.
    """
    escaped = re.escape(keyword.lower())
    pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text.lower()))


def _extract_section_text(data: dict[str, Any], section: str) -> str:
    """Extract all text from a specific resume section.

    Args:
        data: Resume data dictionary.
        section: Section name (summary, experience, skills, education, projects).

    Returns:
        Space-joined text from the specified section.
    """
    parts: list[str] = []

    if section == "summary":
        if data.get("summary"):
            parts.append(str(data["summary"]))

    elif section == "experience":
        for exp in data.get("workExperience", []):
            if isinstance(exp, dict):
                parts.append(str(exp.get("title", "")))
                parts.append(str(exp.get("company", "")))
                desc = exp.get("description", [])
                if isinstance(desc, list):
                    parts.extend(str(d) for d in desc)

    elif section == "skills":
        additional = data.get("additional", {})
        if isinstance(additional, dict):
            for key in ("technicalSkills", "certificationsTraining", "languages"):
                items = additional.get(key, [])
                if isinstance(items, list):
                    parts.extend(str(item) for item in items)

    elif section == "education":
        for edu in data.get("education", []):
            if isinstance(edu, dict):
                parts.append(str(edu.get("degree", "")))
                parts.append(str(edu.get("institution", "")))
                if edu.get("description"):
                    parts.append(str(edu["description"]))

    elif section == "projects":
        for proj in data.get("personalProjects", []):
            if isinstance(proj, dict):
                parts.append(str(proj.get("name", "")))
                parts.append(str(proj.get("role", "")))
                desc = proj.get("description", [])
                if isinstance(desc, list):
                    parts.extend(str(d) for d in desc)

    return " ".join(p for p in parts if p)


def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text from every resume section.

    Args:
        data: Resume data dictionary.

    Returns:
        Space-joined text from all sections.
    """
    sections = ["summary", "experience", "skills", "education", "projects"]
    return " ".join(
        text
        for section in sections
        if (text := _extract_section_text(data, section))
    )


def calculate_ats_score(
    resume_data: dict[str, Any],
    jd_keywords: dict[str, list[str]],
) -> ATSScoreResult:
    """Calculate weighted ATS keyword score with synonym normalization.

    Scores JD keywords against resume text, using the skill taxonomy to
    resolve synonyms. Keywords are weighted by category importance.

    Args:
        resume_data: Resume data dictionary.
        jd_keywords: Dict with category keys (required_skills, preferred_skills,
            keywords) mapping to lists of keyword strings.

    Returns:
        ATSScoreResult with score, matched/missing keywords, and synonym matches.
    """
    resume_text = _extract_all_text(resume_data)
    resume_text_lower = resume_text.lower()

    # Build canonical skill set from resume text
    # Check individual words
    resume_canonical: set[str] = set()
    for word in resume_text_lower.split():
        canonical = ALIAS_TO_CANONICAL.get(word)
        if canonical:
            resume_canonical.add(canonical)

    # Check multi-word taxonomy aliases against resume text
    for alias, canonical in ALIAS_TO_CANONICAL.items():
        if " " in alias and alias in resume_text_lower:
            resume_canonical.add(canonical)

    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    synonym_matches: list[SynonymMatch] = []
    seen_canonical: set[str] = set()

    matched_weight = 0.0
    total_weight = 0.0

    for category in ("required_skills", "preferred_skills", "keywords"):
        weight = CATEGORY_WEIGHTS.get(category, 0.5)
        keywords = jd_keywords.get(category, [])

        for keyword in keywords:
            canonical = _normalize_skill(keyword)

            # Skip duplicates across categories
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)

            total_weight += weight

            # Check direct match in resume text
            if _keyword_in_text(keyword, resume_text):
                matched_keywords.append(keyword)
                matched_weight += weight
                continue

            # Check synonym match via canonical form
            if canonical in resume_canonical:
                matched_keywords.append(keyword)
                matched_weight += weight
                synonym_matches.append(
                    SynonymMatch(
                        jd_term=keyword,
                        resume_term=canonical,
                        canonical=canonical,
                    )
                )
                continue

            missing_keywords.append(keyword)

    score = round((matched_weight / total_weight) * 100, 1) if total_weight > 0 else 0.0

    return ATSScoreResult(
        score=score,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
        synonym_matches=synonym_matches,
        total_keywords=len(seen_canonical),
    )


def calculate_semantic_score(
    resume_data: dict[str, Any],
    job_description: str,
) -> SemanticScoreResult:
    """Calculate semantic similarity score between resume sections and JD.

    Uses sentence-transformer embeddings to measure how semantically
    relevant each resume section is to the full job description.

    Args:
        resume_data: Resume data dictionary.
        job_description: Full job description text.

    Returns:
        SemanticScoreResult with weighted overall score and per-section scores.
    """
    from sentence_transformers import util as st_util

    model = _get_model()

    jd_embedding = model.encode(job_description, convert_to_tensor=True)

    section_scores: list[SectionScore] = []
    weighted_sum = 0.0

    for section, weight in SECTION_WEIGHTS.items():
        text = _extract_section_text(resume_data, section)

        if not text.strip():
            section_scores.append(SectionScore(section=section, score=0.0))
            continue

        section_embedding = model.encode(text, convert_to_tensor=True)
        similarity = float(st_util.cos_sim(section_embedding, jd_embedding)[0][0])

        # Convert from [-1, 1] to [0, 100] scale
        score = max(0.0, min(100.0, (similarity + 1) * 50))
        score = round(score, 1)

        section_scores.append(SectionScore(section=section, score=score))
        weighted_sum += score * weight

    overall = round(weighted_sum, 1)

    return SemanticScoreResult(
        score=overall,
        section_scores=section_scores,
    )


def analyze_match(
    resume_data: dict[str, Any],
    job_description: str,
    jd_keywords: dict[str, list[str]],
) -> MatchAnalysisResponse:
    """Run full dual-score match analysis.

    Combines ATS keyword matching and semantic similarity into a single
    blended score.

    Args:
        resume_data: Resume data dictionary.
        job_description: Full job description text.
        jd_keywords: Dict with category keys mapping to keyword lists.

    Returns:
        MatchAnalysisResponse with ATS score, semantic score, and combined score.
    """
    ats_result = calculate_ats_score(resume_data, jd_keywords)
    semantic_result = calculate_semantic_score(resume_data, job_description)

    combined = round(0.5 * ats_result.score + 0.5 * semantic_result.score, 1)

    return MatchAnalysisResponse(
        ats_score=ats_result,
        semantic_score=semantic_result,
        combined_score=combined,
    )
