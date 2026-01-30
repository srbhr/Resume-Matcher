"""Multi-pass resume refinement service.

This module provides functionality to refine an initially tailored resume through
multiple passes:
1. Keyword injection - add missing JD keywords where supported by master resume
2. AI phrase removal - replace AI-generated buzzwords with simpler alternatives
3. Master alignment validation - ensure no fabricated content was added
"""

import copy
import hashlib
import json
import logging
import re
from functools import lru_cache
from typing import Any

from app.llm import complete_json
from app.prompts.refinement import (
    AI_PHRASE_BLACKLIST,
    AI_PHRASE_REPLACEMENTS,
    KEYWORD_INJECTION_PROMPT,
)
from app.schemas.refinement import (
    AlignmentReport,
    AlignmentViolation,
    KeywordGapAnalysis,
    RefinementConfig,
    RefinementResult,
)

logger = logging.getLogger(__name__)

# LLM-012: Job description truncation limits
MAX_JD_LENGTH = 2000
MIN_TRUNCATION_WARNING_LENGTH = 1500


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check if keyword exists as a whole word in text.

    SVC-010: Uses word boundaries instead of substring matching to avoid
    false positives like 'python' matching 'pythonic' or 'go' matching 'going'.
    """
    # Escape special regex characters in keyword
    escaped = re.escape(keyword.lower())
    # Use word boundaries
    pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text.lower()))


async def refine_resume(
    initial_tailored: dict[str, Any],
    master_resume: dict[str, Any],
    job_description: str,
    job_keywords: dict[str, Any],
    config: RefinementConfig | None = None,
) -> RefinementResult:
    """Multi-pass refinement of an initially tailored resume.

    Args:
        initial_tailored: Output from improve_resume() first pass
        master_resume: Original master resume data (source of truth)
        job_description: Raw job description text
        job_keywords: Extracted job keywords
        config: Refinement configuration

    Returns:
        RefinementResult with refined data and analysis
    """
    if config is None:
        config = RefinementConfig()

    current = _deep_copy(initial_tailored)
    passes = 0
    ai_phrases_found: list[str] = []
    keyword_analysis: KeywordGapAnalysis | None = None
    alignment: AlignmentReport | None = None

    # Pass 1: Keyword injection (if enabled)
    if config.enable_keyword_injection:
        keyword_analysis = analyze_keyword_gaps(job_keywords, current, master_resume)
        if keyword_analysis.injectable_keywords:
            logger.info(
                "Injecting %d keywords: %s",
                len(keyword_analysis.injectable_keywords),
                keyword_analysis.injectable_keywords,
            )
            try:
                current = await inject_keywords(
                    current,
                    keyword_analysis.injectable_keywords,
                    master_resume,
                    job_description,
                )
                passes += 1
            except Exception as e:
                logger.warning("Keyword injection failed: %s", e)

    # Pass 2: AI phrase removal and polish (local, no LLM call)
    if config.enable_ai_phrase_removal:
        current, removed = remove_ai_phrases(current)
        ai_phrases_found.extend(removed)
        if removed:
            logger.info("Removed %d AI phrases: %s", len(removed), removed)
            passes += 1

    # Pass 3: Master alignment validation
    # LLM-008: Alignment validation is MANDATORY - not optional fallback
    if config.enable_master_alignment_check:
        alignment = validate_master_alignment(current, master_resume)
        if not alignment.is_aligned:
            # Count critical violations
            critical_violations = [
                v for v in alignment.violations if v.severity == "critical"
            ]
            logger.warning(
                "Alignment violations found: %d total, %d critical",
                len(alignment.violations),
                len(critical_violations),
            )

            if critical_violations:
                # LLM-008: Block resume with fabricated content
                logger.error(
                    "Critical alignment violations detected - blocking resume: %s",
                    [v.value for v in critical_violations],
                )
                # Fix violations before returning
                current = fix_alignment_violations(current, alignment.violations)
                passes += 1
            else:
                # Non-critical violations - fix and continue
                current = fix_alignment_violations(current, alignment.violations)
                passes += 1

    # Calculate final match percentage
    final_match = calculate_keyword_match(current, job_keywords)

    return RefinementResult(
        refined_data=current,
        passes_completed=passes,
        keyword_analysis=keyword_analysis,
        alignment_report=alignment,
        ai_phrases_removed=ai_phrases_found,
        final_match_percentage=final_match,
    )


def analyze_keyword_gaps(
    jd_keywords: dict[str, Any],
    tailored: dict[str, Any],
    master: dict[str, Any],
) -> KeywordGapAnalysis:
    """Analyze which JD keywords are missing from the tailored resume.

    Args:
        jd_keywords: Extracted job keywords with required_skills, preferred_skills, etc.
        tailored: Current tailored resume data
        master: Master resume data (source of truth)

    Returns:
        KeywordGapAnalysis with missing, injectable, and non-injectable keywords
    """
    # Extract text content from resumes
    tailored_text = _extract_all_text(tailored).lower()
    master_text = _extract_all_text(master).lower()

    # Get all keywords from JD
    all_jd_keywords: set[str] = set()
    all_jd_keywords.update(jd_keywords.get("required_skills", []))
    all_jd_keywords.update(jd_keywords.get("preferred_skills", []))
    all_jd_keywords.update(jd_keywords.get("keywords", []))

    # Find missing keywords
    missing: list[str] = []
    injectable: list[str] = []
    non_injectable: list[str] = []

    for keyword in all_jd_keywords:
        if not _keyword_in_text(keyword, tailored_text):
            missing.append(keyword)
            if _keyword_in_text(keyword, master_text):
                injectable.append(keyword)
            else:
                non_injectable.append(keyword)

    # Calculate percentages
    total = len(all_jd_keywords) if all_jd_keywords else 1
    current_match = (total - len(missing)) / total * 100
    potential_match = (total - len(non_injectable)) / total * 100

    return KeywordGapAnalysis(
        missing_keywords=missing,
        injectable_keywords=injectable,
        non_injectable_keywords=non_injectable,
        current_match_percentage=current_match,
        potential_match_percentage=potential_match,
    )


def remove_ai_phrases(data: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Remove AI-generated phrases from resume content.

    This is a local operation that doesn't require an LLM call.
    It performs case-insensitive replacement of blacklisted phrases.

    Args:
        data: Resume data dictionary

    Returns:
        Tuple of (cleaned data, list of removed phrases)
    """
    removed: list[str] = []

    def clean_text(text: str) -> str:
        cleaned = text
        for phrase in AI_PHRASE_BLACKLIST:
            if phrase.lower() in cleaned.lower():
                removed.append(phrase)
                replacement = AI_PHRASE_REPLACEMENTS.get(phrase.lower(), "")
                # Case-insensitive replacement
                pattern = re.compile(re.escape(phrase), re.IGNORECASE)
                cleaned = pattern.sub(replacement, cleaned)
        return cleaned

    def clean_recursive(obj: Any) -> Any:
        if isinstance(obj, str):
            return clean_text(obj)
        elif isinstance(obj, list):
            return [clean_recursive(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: clean_recursive(v) for k, v in obj.items()}
        return obj

    cleaned_data = clean_recursive(data)
    return cleaned_data, list(set(removed))


def validate_master_alignment(
    tailored: dict[str, Any],
    master: dict[str, Any],
) -> AlignmentReport:
    """Verify tailored resume doesn't contain fabricated content.

    Checks that all skills, certifications, and work experience companies
    in the tailored resume exist in the master resume.

    Args:
        tailored: Tailored resume data
        master: Master resume data (source of truth)

    Returns:
        AlignmentReport with violations and confidence score
    """
    violations: list[AlignmentViolation] = []

    # Check skills
    tailored_skills = set(
        s.lower()
        for s in tailored.get("additional", {}).get("technicalSkills", [])
        if isinstance(s, str)
    )
    master_skills = set(
        s.lower()
        for s in master.get("additional", {}).get("technicalSkills", [])
        if isinstance(s, str)
    )

    for skill in tailored_skills - master_skills:
        violations.append(
            AlignmentViolation(
                field_path="additional.technicalSkills",
                violation_type="fabricated_skill",
                value=skill,
                severity="critical",
            )
        )

    # Check certifications
    tailored_certs = set(
        c.lower()
        for c in tailored.get("additional", {}).get("certificationsTraining", [])
        if isinstance(c, str)
    )
    master_certs = set(
        c.lower()
        for c in master.get("additional", {}).get("certificationsTraining", [])
        if isinstance(c, str)
    )

    for cert in tailored_certs - master_certs:
        violations.append(
            AlignmentViolation(
                field_path="additional.certificationsTraining",
                violation_type="fabricated_cert",
                value=cert,
                severity="critical",
            )
        )

    # Check work experience companies (should not add new companies)
    tailored_companies = set(
        exp.get("company", "").lower()
        for exp in tailored.get("workExperience", [])
        if isinstance(exp, dict)
    )
    master_companies = set(
        exp.get("company", "").lower()
        for exp in master.get("workExperience", [])
        if isinstance(exp, dict)
    )

    for company in tailored_companies - master_companies:
        if company:  # Skip empty strings
            violations.append(
                AlignmentViolation(
                    field_path="workExperience",
                    violation_type="fabricated_company",
                    value=company,
                    severity="critical",
                )
            )

    is_aligned = len([v for v in violations if v.severity == "critical"]) == 0
    confidence = 1.0 - (len(violations) * 0.1)  # Decrease confidence per violation

    return AlignmentReport(
        is_aligned=is_aligned,
        violations=violations,
        confidence_score=max(0.0, confidence),
    )


def _prepare_job_description(job_description: str) -> tuple[str, bool]:
    """LLM-012: Prepare job description for prompt, with truncation warning.

    Returns:
        Tuple of (truncated_text, was_truncated)
    """
    was_truncated = len(job_description) > MAX_JD_LENGTH

    if was_truncated:
        logger.warning(
            "Job description truncated from %d to %d characters",
            len(job_description),
            MAX_JD_LENGTH,
        )

    return job_description[:MAX_JD_LENGTH], was_truncated


def _validate_resume_structure(data: dict[str, Any]) -> bool:
    """LLM-014: Validate resume maintains required structure after keyword injection.

    Returns:
        True if structure is valid, False otherwise.
    """
    # Check for required top-level keys
    required_keys = ["personalInfo"]
    for key in required_keys:
        if key not in data:
            logger.warning("Resume structure invalid: missing '%s'", key)
            return False

    # Check that arrays are still arrays
    array_fields = ["workExperience", "education", "personalProjects"]
    for field in array_fields:
        if field in data and not isinstance(data[field], list):
            logger.warning("Resume structure invalid: '%s' is not a list", field)
            return False

    return True


async def inject_keywords(
    tailored: dict[str, Any],
    keywords_to_inject: list[str],
    master: dict[str, Any],
    job_description: str,
) -> dict[str, Any]:
    """Use LLM to inject missing keywords into appropriate sections.

    Args:
        tailored: Current tailored resume
        keywords_to_inject: Keywords that are in master but missing from tailored
        master: Master resume (source of truth)
        job_description: Job description for context

    Returns:
        Updated resume data with keywords injected

    LLM-012: Truncates job description with warning.
    LLM-014: Validates result structure before returning.
    """
    # LLM-012: Prepare job description with truncation handling
    truncated_jd, was_truncated = _prepare_job_description(job_description)
    if was_truncated:
        logger.info(
            "Job description was truncated for keyword injection (original: %d chars)",
            len(job_description),
        )

    prompt = KEYWORD_INJECTION_PROMPT.format(
        keywords_to_inject=json.dumps(keywords_to_inject),
        current_resume=json.dumps(tailored, indent=2),
        master_resume=json.dumps(master, indent=2),
        job_description=truncated_jd,
    )

    try:
        result = await complete_json(
            prompt=prompt,
            system_prompt=(
                "You are a resume editor. Inject keywords naturally without adding "
                "fabricated content. Return only valid JSON matching the input schema."
            ),
            max_tokens=8192,
        )

        # LLM-014: Validate the result maintains required structure
        if not isinstance(result, dict):
            logger.warning("Keyword injection returned non-dict: %s", type(result))
            return tailored

        if not _validate_resume_structure(result):
            logger.warning("Keyword injection corrupted resume structure, using original")
            return tailored

        return result

    except Exception as e:
        logger.warning("Keyword injection failed: %s", e)
        return tailored


def fix_alignment_violations(
    tailored: dict[str, Any],
    violations: list[AlignmentViolation],
) -> dict[str, Any]:
    """Remove or correct alignment violations.

    This is a local operation that removes fabricated content.

    Args:
        tailored: Tailored resume data
        violations: List of alignment violations to fix

    Returns:
        Fixed resume data
    """
    fixed = _deep_copy(tailored)

    for violation in violations:
        if violation.severity != "critical":
            continue

        if violation.violation_type == "fabricated_skill":
            skills = fixed.get("additional", {}).get("technicalSkills", [])
            fixed.setdefault("additional", {})["technicalSkills"] = [
                s for s in skills if s.lower() != violation.value.lower()
            ]

        elif violation.violation_type == "fabricated_cert":
            certs = fixed.get("additional", {}).get("certificationsTraining", [])
            fixed.setdefault("additional", {})["certificationsTraining"] = [
                c for c in certs if c.lower() != violation.value.lower()
            ]

        elif violation.violation_type == "fabricated_company":
            # SVC-002: Remove the fabricated work experience entry
            logger.error(
                "Critical: Fabricated company detected: %s", violation.value
            )
            if "workExperience" in fixed:
                fixed["workExperience"] = [
                    exp
                    for exp in fixed["workExperience"]
                    if exp.get("company", "").lower() != violation.value.lower()
                ]
                logger.info(
                    "Removed fabricated company '%s' from resume",
                    violation.value,
                )

    return fixed


def calculate_keyword_match(
    resume: dict[str, Any],
    jd_keywords: dict[str, Any],
) -> float:
    """Calculate keyword match percentage.

    Args:
        resume: Resume data dictionary
        jd_keywords: Extracted job keywords

    Returns:
        Match percentage (0.0 to 100.0)
    """
    resume_text = _extract_all_text(resume).lower()

    all_keywords: set[str] = set()
    all_keywords.update(jd_keywords.get("required_skills", []))
    all_keywords.update(jd_keywords.get("preferred_skills", []))
    all_keywords.update(jd_keywords.get("keywords", []))

    # SVC-009: Return 0% if no keywords (not 100% - that's misleading)
    if not all_keywords:
        logger.warning("No keywords found in job description")
        return 0.0

    # SVC-010: Use word boundary matching instead of substring
    matched = sum(1 for kw in all_keywords if _keyword_in_text(kw, resume_text))
    return (matched / len(all_keywords)) * 100


def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text content from resume data for keyword matching.

    SVC-011: Uses caching to avoid repeated extraction on same resume data.

    Args:
        data: Resume data dictionary

    Returns:
        Concatenated text from all resume sections
    """
    # Create a cache key from the data
    data_json = json.dumps(data, sort_keys=True, default=str)
    return _extract_all_text_cached(data_json)


@lru_cache(maxsize=100)
def _extract_all_text_cached(data_json: str) -> str:
    """Cached implementation of text extraction.

    SVC-011: LRU cache avoids re-extracting text from the same resume
    multiple times during a single refinement pass.
    """
    data = json.loads(data_json)
    parts: list[str] = []

    # Summary
    if data.get("summary"):
        parts.append(str(data["summary"]))

    # Work experience
    for exp in data.get("workExperience", []):
        if isinstance(exp, dict):
            parts.append(str(exp.get("title", "")))
            parts.append(str(exp.get("company", "")))
            desc = exp.get("description", [])
            if isinstance(desc, list):
                parts.extend(str(d) for d in desc)

    # Education
    for edu in data.get("education", []):
        if isinstance(edu, dict):
            parts.append(str(edu.get("degree", "")))
            parts.append(str(edu.get("institution", "")))
            if edu.get("description"):
                parts.append(str(edu["description"]))

    # Projects
    for proj in data.get("personalProjects", []):
        if isinstance(proj, dict):
            parts.append(str(proj.get("name", "")))
            parts.append(str(proj.get("role", "")))
            desc = proj.get("description", [])
            if isinstance(desc, list):
                parts.extend(str(d) for d in desc)

    # Additional
    additional = data.get("additional", {})
    if isinstance(additional, dict):
        skills = additional.get("technicalSkills", [])
        if isinstance(skills, list):
            parts.extend(str(s) for s in skills)
        certs = additional.get("certificationsTraining", [])
        if isinstance(certs, list):
            parts.extend(str(c) for c in certs)

    return " ".join(p for p in parts if p)


def _deep_copy(data: dict[str, Any]) -> dict[str, Any]:
    """Create a deep copy of a dictionary.

    Uses copy.deepcopy for reliability. JSON serialization is avoided
    because it can't handle all Python types and loses type information.
    """
    return copy.deepcopy(data)
