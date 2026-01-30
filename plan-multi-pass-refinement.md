# Multi-Pass Resume Refinement - Implementation Plan

> **Feature:** Iterative AI refinement with validation pass to improve ATS optimization and remove AI-generated phrasing while maintaining master resume alignment.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current Architecture](#current-architecture)
3. [Proposed Solution](#proposed-solution)
4. [Technical Design](#technical-design)
5. [Implementation Phases](#implementation-phases)
6. [File Changes](#file-changes)
7. [API Changes](#api-changes)
8. [Testing Strategy](#testing-strategy)
9. [Risks & Mitigations](#risks-mitigations)
10. [Future Enhancements](#future-enhancements)

---

## Problem Statement

### Current Limitations

The existing resume tailoring pipeline follows a single-pass approach:

```
Master Resume + Job Description -> LLM -> Tailored Resume
```

This produces results with the following issues:

1. **Missing Keywords**: The LLM may not incorporate all relevant JD keywords on the first pass
2. **AI-Generated Phrasing**: Output often contains obvious AI language patterns:
   - Buzzwords: "spearheaded," "synergy," "leverage," "orchestrated"
   - Em-dashes (already addressed in prompts but not validated)
   - Overly formal phrasing: "drove initiatives," "championed efforts"
3. **Master Resume Drift**: The tailored resume may diverge too far from the original, adding skills/experiences the candidate doesn't actually have
4. **No Self-Validation**: No mechanism to verify the output against original requirements

### Success Criteria

1. Higher keyword match percentage (measured via existing `calculateMatchStats()`)
2. Zero instances of blacklisted AI phrases in output
3. No new skills/certifications added that aren't in the master resume
4. All factual claims traceable to master resume content

---

## Current Architecture

### Resume Improvement Flow

**Entry Points** (from `apps/backend/app/routers/resumes.py`):
- `POST /resumes/improve` - Direct improve (lines 635-753)
- `POST /resumes/improve/preview` - Preview without persist (lines 400-510)
- `POST /resumes/improve/confirm` - Confirm and persist (lines 513-632)

**Core Service** (from `apps/backend/app/services/improver.py`):

```python
async def improve_resume(
    original_resume: str,          # Markdown content
    job_description: str,          # Raw JD text
    job_keywords: dict[str, Any],  # Extracted keywords
    language: str = "en",
    prompt_id: str | None = None,  # nudge, keywords, or full
) -> dict[str, Any]:
```

**Current Pipeline Steps**:
1. `extract_job_keywords(job_description)` - Extract structured keywords from JD
2. `improve_resume(...)` - Single LLM call with prompt template
3. `_preserve_personal_info(...)` - Restore original personal info
4. `calculate_resume_diff(...)` - Compare original vs improved
5. `generate_improvements(...)` - Generate suggestion list

### Prompt Templates (from `apps/backend/app/prompts/templates.py`)

Three prompt variants:
- **nudge**: Minimal edits, no new bullet points
- **keywords**: Weave in keywords, may rephrase bullets
- **full**: Comprehensive tailoring with new content allowed

Each includes:
- `CRITICAL_TRUTHFULNESS_RULES` - Anti-fabrication guardrails
- Em-dash prohibition rule
- Language output directive

### Existing Validation

1. **Diff Calculation** (`calculate_resume_diff`): Detects added/removed/modified fields
2. **High-Risk Changes**: Skills and certifications marked as "high" confidence when added
3. **JD Match** (frontend): `keyword-matcher.ts` calculates match percentage post-generation

---

## Proposed Solution

### Multi-Pass Architecture

```
                              +------------------+
                              |   Master Resume  |
                              +--------+---------+
                                       |
                    +------------------v------------------+
                    |          PASS 1: Initial Tailor    |
                    |  (Existing improve_resume logic)   |
                    +------------------+------------------+
                                       |
                    +------------------v------------------+
                    |        PASS 2: Keyword Injection   |
                    |  - Compare output vs JD keywords   |
                    |  - Inject missing keywords where   |
                    |    supported by master resume      |
                    +------------------+------------------+
                                       |
                    +------------------v------------------+
                    |       PASS 3: Validation & Polish  |
                    |  - Remove AI buzzwords/phrases     |
                    |  - Verify no fabricated content    |
                    |  - Check master resume alignment   |
                    +------------------+------------------+
                                       |
                    +------------------v------------------+
                    |          Final Output              |
                    +-------------------------------------+
```

### Key Components

#### 1. AI Phrase Blacklist

A comprehensive list of words/phrases to detect and replace:

```python
AI_PHRASE_BLACKLIST = {
    # Action verbs (overused in AI resume writing)
    "spearheaded", "orchestrated", "championed", "synergized",
    "leveraged", "revolutionized", "pioneered", "streamlined",
    "operationalized", "optimized", "catalyzed", "architected",

    # Corporate buzzwords
    "synergy", "synergies", "paradigm", "paradigm shift",
    "best-in-class", "world-class", "cutting-edge", "bleeding-edge",
    "game-changer", "game-changing", "disruptive", "disruptor",
    "holistic", "robust", "scalable", "actionable", "impactful",

    # Filler phrases
    "in order to", "for the purpose of", "with a view to",
    "at the end of the day", "moving forward", "going forward",
    "on a daily basis", "on a regular basis",

    # Overly formal constructions
    "utilized", "endeavored", "facilitated", "effectuated",

    # Punctuation patterns
    "---",  # Em-dash variants (already in prompts)
}

AI_PHRASE_REPLACEMENTS = {
    "spearheaded": "led",
    "orchestrated": "coordinated",
    "leveraged": "used",
    "utilized": "used",
    "synergy": "collaboration",
    "paradigm shift": "change",
    "best-in-class": "top-performing",
    "world-class": "high-quality",
    "in order to": "to",
    "for the purpose of": "to",
    "endeavored": "worked",
    "facilitated": "helped",
}
```

#### 2. Keyword Gap Analysis

Compare extracted JD keywords against tailored resume:

```python
def analyze_keyword_gaps(
    jd_keywords: dict[str, Any],
    tailored_resume: dict[str, Any],
    master_resume: dict[str, Any],
) -> KeywordGapAnalysis:
    """
    Returns:
        - missing_keywords: Keywords in JD but not in tailored resume
        - injectable_keywords: Missing keywords that exist in master resume (safe to add)
        - non_injectable_keywords: Missing keywords not in master (cannot add truthfully)
    """
```

#### 3. Master Resume Alignment Check

Verify no fabricated content:

```python
def validate_master_alignment(
    tailored_resume: dict[str, Any],
    master_resume: dict[str, Any],
) -> AlignmentReport:
    """
    Checks:
        1. All skills in tailored exist in master
        2. All certifications in tailored exist in master
        3. No new work experience entries (companies/roles)
        4. Description bullet points are expansions, not inventions

    Returns:
        - is_aligned: bool
        - violations: list of specific misalignments
        - confidence_score: 0.0-1.0
    """
```

---

## Technical Design

### New Service Module: `services/refiner.py`

```python
"""Multi-pass resume refinement service."""

import logging
from dataclasses import dataclass
from typing import Any

from app.llm import complete_json
from app.prompts.refinement import (
    KEYWORD_INJECTION_PROMPT,
    VALIDATION_POLISH_PROMPT,
    AI_PHRASE_BLACKLIST,
    AI_PHRASE_REPLACEMENTS,
)

logger = logging.getLogger(__name__)


@dataclass
class RefinementConfig:
    """Configuration for refinement passes."""
    enable_keyword_injection: bool = True
    enable_ai_phrase_removal: bool = True
    enable_master_alignment_check: bool = True
    max_refinement_passes: int = 2  # Limit to prevent infinite loops


@dataclass
class KeywordGapAnalysis:
    """Result of keyword gap analysis."""
    missing_keywords: list[str]
    injectable_keywords: list[str]  # Present in master, safe to add
    non_injectable_keywords: list[str]  # Not in master, cannot add
    current_match_percentage: float
    potential_match_percentage: float  # If injectable keywords are added


@dataclass
class AlignmentViolation:
    """Single alignment violation."""
    field_path: str
    violation_type: str  # "fabricated_skill", "fabricated_cert", "invented_content"
    value: str
    severity: str  # "critical", "warning"


@dataclass
class AlignmentReport:
    """Master resume alignment validation result."""
    is_aligned: bool
    violations: list[AlignmentViolation]
    confidence_score: float


@dataclass
class RefinementResult:
    """Complete refinement result."""
    refined_data: dict[str, Any]
    passes_completed: int
    keyword_analysis: KeywordGapAnalysis | None
    alignment_report: AlignmentReport | None
    ai_phrases_removed: list[str]
    final_match_percentage: float


async def refine_resume(
    initial_tailored: dict[str, Any],
    master_resume: dict[str, Any],
    job_description: str,
    job_keywords: dict[str, Any],
    config: RefinementConfig | None = None,
) -> RefinementResult:
    """
    Multi-pass refinement of an initially tailored resume.

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

    current = initial_tailored.copy()
    passes = 0
    ai_phrases_found: list[str] = []

    # Pass 1: Keyword injection (if enabled)
    if config.enable_keyword_injection:
        keyword_analysis = analyze_keyword_gaps(
            job_keywords, current, master_resume
        )
        if keyword_analysis.injectable_keywords:
            current = await inject_keywords(
                current,
                keyword_analysis.injectable_keywords,
                master_resume,
                job_description,
            )
            passes += 1
    else:
        keyword_analysis = None

    # Pass 2: AI phrase removal and polish
    if config.enable_ai_phrase_removal:
        current, removed = remove_ai_phrases(current)
        ai_phrases_found.extend(removed)
        if removed:
            passes += 1

    # Pass 3: Master alignment validation
    if config.enable_master_alignment_check:
        alignment = validate_master_alignment(current, master_resume)
        if not alignment.is_aligned:
            current = await fix_alignment_violations(
                current, master_resume, alignment.violations
            )
            passes += 1
    else:
        alignment = None

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
    """Analyze which JD keywords are missing from the tailored resume."""
    # Extract text content from tailored resume
    tailored_text = _extract_all_text(tailored).lower()
    master_text = _extract_all_text(master).lower()

    # Get all keywords from JD
    all_jd_keywords = set()
    all_jd_keywords.update(jd_keywords.get("required_skills", []))
    all_jd_keywords.update(jd_keywords.get("preferred_skills", []))
    all_jd_keywords.update(jd_keywords.get("keywords", []))

    # Find missing keywords
    missing = []
    injectable = []
    non_injectable = []

    for keyword in all_jd_keywords:
        kw_lower = keyword.lower()
        if kw_lower not in tailored_text:
            missing.append(keyword)
            if kw_lower in master_text:
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
    """Remove AI-generated phrases from resume content."""
    removed = []

    def clean_text(text: str) -> str:
        cleaned = text
        for phrase in AI_PHRASE_BLACKLIST:
            if phrase.lower() in cleaned.lower():
                removed.append(phrase)
                replacement = AI_PHRASE_REPLACEMENTS.get(
                    phrase.lower(), ""
                )
                # Case-insensitive replacement
                import re
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
    """Verify tailored resume doesn't contain fabricated content."""
    violations = []

    # Check skills
    tailored_skills = set(
        s.lower() for s in tailored.get("additional", {}).get("technicalSkills", [])
    )
    master_skills = set(
        s.lower() for s in master.get("additional", {}).get("technicalSkills", [])
    )

    for skill in tailored_skills - master_skills:
        violations.append(AlignmentViolation(
            field_path="additional.technicalSkills",
            violation_type="fabricated_skill",
            value=skill,
            severity="critical",
        ))

    # Check certifications
    tailored_certs = set(
        c.lower() for c in tailored.get("additional", {}).get("certificationsTraining", [])
    )
    master_certs = set(
        c.lower() for c in master.get("additional", {}).get("certificationsTraining", [])
    )

    for cert in tailored_certs - master_certs:
        violations.append(AlignmentViolation(
            field_path="additional.certificationsTraining",
            violation_type="fabricated_cert",
            value=cert,
            severity="critical",
        ))

    # Check work experience companies (should not add new companies)
    tailored_companies = set(
        exp.get("company", "").lower()
        for exp in tailored.get("workExperience", [])
    )
    master_companies = set(
        exp.get("company", "").lower()
        for exp in master.get("workExperience", [])
    )

    for company in tailored_companies - master_companies:
        if company:  # Skip empty strings
            violations.append(AlignmentViolation(
                field_path="workExperience",
                violation_type="fabricated_company",
                value=company,
                severity="critical",
            ))

    is_aligned = len([v for v in violations if v.severity == "critical"]) == 0
    confidence = 1.0 - (len(violations) * 0.1)  # Decrease confidence per violation

    return AlignmentReport(
        is_aligned=is_aligned,
        violations=violations,
        confidence_score=max(0.0, confidence),
    )


async def inject_keywords(
    tailored: dict[str, Any],
    keywords_to_inject: list[str],
    master: dict[str, Any],
    job_description: str,
) -> dict[str, Any]:
    """Use LLM to inject missing keywords into appropriate sections."""
    prompt = KEYWORD_INJECTION_PROMPT.format(
        current_resume=tailored,
        keywords_to_inject=keywords_to_inject,
        master_resume=master,
        job_description=job_description,
    )

    return await complete_json(
        prompt=prompt,
        system_prompt="You are a resume editor. Inject keywords naturally without adding fabricated content.",
        max_tokens=8192,
    )


async def fix_alignment_violations(
    tailored: dict[str, Any],
    master: dict[str, Any],
    violations: list[AlignmentViolation],
) -> dict[str, Any]:
    """Remove or correct alignment violations."""
    fixed = tailored.copy()

    for violation in violations:
        if violation.severity == "critical":
            if violation.violation_type == "fabricated_skill":
                skills = fixed.get("additional", {}).get("technicalSkills", [])
                fixed["additional"]["technicalSkills"] = [
                    s for s in skills if s.lower() != violation.value.lower()
                ]
            elif violation.violation_type == "fabricated_cert":
                certs = fixed.get("additional", {}).get("certificationsTraining", [])
                fixed["additional"]["certificationsTraining"] = [
                    c for c in certs if c.lower() != violation.value.lower()
                ]
            # For fabricated companies, this is a serious error that shouldn't happen
            # with proper prompts - log but don't auto-fix
            elif violation.violation_type == "fabricated_company":
                logger.error(
                    "Critical: Fabricated company detected: %s", violation.value
                )

    return fixed


def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text content from resume data for keyword matching."""
    parts = []

    # Summary
    if data.get("summary"):
        parts.append(data["summary"])

    # Work experience
    for exp in data.get("workExperience", []):
        parts.append(exp.get("title", ""))
        parts.append(exp.get("company", ""))
        parts.extend(exp.get("description", []))

    # Education
    for edu in data.get("education", []):
        parts.append(edu.get("degree", ""))
        parts.append(edu.get("institution", ""))
        if edu.get("description"):
            parts.append(edu["description"])

    # Projects
    for proj in data.get("personalProjects", []):
        parts.append(proj.get("name", ""))
        parts.append(proj.get("role", ""))
        parts.extend(proj.get("description", []))

    # Additional
    additional = data.get("additional", {})
    parts.extend(additional.get("technicalSkills", []))
    parts.extend(additional.get("certificationsTraining", []))

    return " ".join(str(p) for p in parts if p)


def calculate_keyword_match(
    resume: dict[str, Any],
    jd_keywords: dict[str, Any],
) -> float:
    """Calculate keyword match percentage."""
    resume_text = _extract_all_text(resume).lower()

    all_keywords = set()
    all_keywords.update(jd_keywords.get("required_skills", []))
    all_keywords.update(jd_keywords.get("preferred_skills", []))
    all_keywords.update(jd_keywords.get("keywords", []))

    if not all_keywords:
        return 100.0

    matched = sum(1 for kw in all_keywords if kw.lower() in resume_text)
    return (matched / len(all_keywords)) * 100
```

### New Prompt Templates: `prompts/refinement.py`

```python
"""Prompt templates for multi-pass refinement."""

AI_PHRASE_BLACKLIST = {
    # Action verbs (overused)
    "spearheaded", "orchestrated", "championed", "synergized",
    "leveraged", "revolutionized", "pioneered", "catalyzed",
    "operationalized", "architected", "envisioned",

    # Corporate buzzwords
    "synergy", "synergies", "paradigm", "paradigm shift",
    "best-in-class", "world-class", "cutting-edge", "bleeding-edge",
    "game-changer", "game-changing", "disruptive", "disruptor",
    "holistic", "robust", "scalable", "actionable", "impactful",
    "proactive", "proactively", "stakeholder", "deliverables",

    # Filler phrases
    "in order to", "for the purpose of", "with a view to",
    "at the end of the day", "moving forward", "going forward",
    "on a daily basis", "on a regular basis",

    # Overly formal
    "utilized", "endeavored", "facilitated", "effectuated",

    # Punctuation
    "\u2014",  # Em-dash
    "---",
}

AI_PHRASE_REPLACEMENTS = {
    "spearheaded": "led",
    "orchestrated": "coordinated",
    "leveraged": "used",
    "utilized": "used",
    "endeavored": "worked",
    "facilitated": "helped",
    "synergy": "collaboration",
    "synergies": "collaborations",
    "paradigm shift": "change",
    "best-in-class": "top-performing",
    "world-class": "high-quality",
    "cutting-edge": "modern",
    "bleeding-edge": "modern",
    "in order to": "to",
    "for the purpose of": "to",
    "with a view to": "to",
    "on a daily basis": "daily",
    "on a regular basis": "regularly",
    "proactively": "actively",
    "impactful": "effective",
    "actionable": "practical",
    "holistic": "comprehensive",
}

KEYWORD_INJECTION_PROMPT = """Inject the following keywords into this resume where they can be naturally and TRUTHFULLY incorporated.

CRITICAL RULES:
1. Only add keywords where the master resume provides supporting evidence
2. Do NOT add skills, technologies, or certifications not in the master resume
3. Rephrase existing bullet points to include keywords - do not invent new content
4. Maintain the exact same JSON structure

Keywords to inject (only if supported by master resume):
{keywords_to_inject}

Current tailored resume:
{current_resume}

Master resume (source of truth):
{master_resume}

Job description context:
{job_description}

Output the complete resume JSON with keywords naturally integrated."""

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

Output the polished resume JSON."""
```

---

## Implementation Phases

### Phase 1: Core Refinement Service (Backend)

**Files to create:**
- `apps/backend/app/services/refiner.py` - Main refinement logic
- `apps/backend/app/prompts/refinement.py` - Refinement prompts and blacklists

**Files to modify:**
- `apps/backend/app/services/improver.py` - Import and integrate refiner
- `apps/backend/app/routers/resumes.py` - Add refinement config to improve endpoints

**Estimated changes:** ~400 lines new code, ~50 lines modifications

### Phase 2: API Integration

**Add to improve endpoints:**
- Optional `enable_refinement: bool` parameter (default: True)
- Return refinement metadata in response

**New response fields in `ImproveResumeData`:**
```python
refinement_stats: RefinementStats | None = None

class RefinementStats(BaseModel):
    passes_completed: int
    keywords_injected: int
    ai_phrases_removed: list[str]
    alignment_violations_fixed: int
    initial_match_percentage: float
    final_match_percentage: float
```

### Phase 3: Frontend Display

**Files to modify:**
- `apps/frontend/components/tailor/tailor-result.tsx` - Show refinement stats
- `apps/frontend/components/builder/jd-comparison-view.tsx` - Enhanced match display

**Display elements:**
- Before/after keyword match percentages
- List of AI phrases that were removed
- Alignment confidence score

### Phase 4: Configuration & Settings

**Add to config:**
```json
{
  "refinement": {
    "enabled": true,
    "max_passes": 2,
    "keyword_injection": true,
    "ai_phrase_removal": true,
    "master_alignment_check": true
  }
}
```

**UI in settings:**
- Toggle for multi-pass refinement
- Strictness slider (aggressive vs. conservative)

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/backend/app/services/refiner.py` | Multi-pass refinement service |
| `apps/backend/app/prompts/refinement.py` | Refinement prompts and blacklists |
| `apps/backend/app/schemas/refinement.py` | Refinement-specific Pydantic models |

### Modified Files

| File | Changes |
|------|---------|
| `apps/backend/app/services/improver.py` | Call refiner after initial improve |
| `apps/backend/app/routers/resumes.py` | Add refinement params, return stats |
| `apps/backend/app/schemas/models.py` | Add `RefinementStats` model |
| `apps/frontend/components/tailor/*.tsx` | Display refinement results |
| `apps/frontend/lib/utils/keyword-matcher.ts` | Share blacklist with backend |

---

## API Changes

### Updated: `POST /resumes/improve/preview`

**New request parameters:**
```json
{
  "resume_id": "string",
  "job_id": "string",
  "prompt_id": "string",
  "enable_refinement": true,
  "refinement_config": {
    "keyword_injection": true,
    "ai_phrase_removal": true,
    "master_alignment_check": true
  }
}
```

**New response fields:**
```json
{
  "data": {
    "resume_preview": { ... },
    "refinement_stats": {
      "passes_completed": 2,
      "keywords_injected": 5,
      "ai_phrases_removed": ["spearheaded", "leveraged"],
      "alignment_violations_fixed": 0,
      "initial_match_percentage": 45.2,
      "final_match_percentage": 72.8
    }
  }
}
```

---

## Testing Strategy

### Unit Tests

```python
# tests/test_refiner.py

def test_ai_phrase_removal():
    """AI phrases should be detected and replaced."""
    data = {"summary": "Spearheaded synergy initiatives"}
    cleaned, removed = remove_ai_phrases(data)
    assert "spearheaded" in removed
    assert "synergy" in removed
    assert "Spearheaded" not in cleaned["summary"]

def test_keyword_gap_analysis():
    """Missing injectable keywords should be identified."""
    jd_keywords = {"required_skills": ["Python", "AWS", "Docker"]}
    tailored = {"additional": {"technicalSkills": ["Python"]}}
    master = {"additional": {"technicalSkills": ["Python", "AWS", "Kubernetes"]}}

    analysis = analyze_keyword_gaps(jd_keywords, tailored, master)

    assert "AWS" in analysis.injectable_keywords
    assert "Docker" in analysis.non_injectable_keywords  # Not in master

def test_master_alignment_validation():
    """Fabricated skills should be detected."""
    tailored = {"additional": {"technicalSkills": ["Python", "Quantum Computing"]}}
    master = {"additional": {"technicalSkills": ["Python", "JavaScript"]}}

    report = validate_master_alignment(tailored, master)

    assert not report.is_aligned
    assert any(v.value == "quantum computing" for v in report.violations)
```

### Integration Tests

```python
# tests/test_improve_refinement.py

async def test_full_refinement_pipeline():
    """Complete refinement flow should improve match percentage."""
    # Setup
    master = create_test_master_resume()
    jd = create_test_job_description()

    # First pass
    initial = await improve_resume(master, jd, keywords)
    initial_match = calculate_keyword_match(initial, keywords)

    # Refinement
    result = await refine_resume(initial, master, jd, keywords)

    # Assertions
    assert result.final_match_percentage >= initial_match
    assert len(result.ai_phrases_removed) >= 0
    assert result.alignment_report.is_aligned
```

---

## Risks & Mitigations

### Risk 1: Increased Latency

**Impact:** Multi-pass = multiple LLM calls = longer response times

**Mitigation:**
- Make refinement optional (config toggle)
- Run keyword analysis locally (no LLM call)
- AI phrase removal is local string manipulation
- Only call LLM for keyword injection if gaps exist
- Show progress indicator in frontend

### Risk 2: LLM Token Costs

**Impact:** 2-3x more tokens per improvement

**Mitigation:**
- Keyword injection uses smaller prompts
- Skip refinement passes when not needed
- Cache keyword analysis per job
- Add cost estimate in UI

### Risk 3: Over-Correction

**Impact:** Refinement might degrade quality by removing valid phrasing

**Mitigation:**
- Conservative replacement dictionary
- Only replace exact matches, not partial
- Allow manual override of refinement
- Show diff of what was changed

### Risk 4: False Alignment Violations

**Impact:** Legitimate variations flagged as fabricated

**Mitigation:**
- Fuzzy matching for skill names (case, plurals)
- Industry-standard synonym mapping
- Log violations without auto-fix for review
- Manual "approve" option in UI

---

## Future Enhancements

### 1. Semantic Keyword Matching
Use embeddings to find semantically similar keywords rather than exact matches.

### 2. Industry-Specific Phrase Lists
Different blacklists for tech, marketing, finance, etc.

### 3. A/B Testing
Compare single-pass vs. multi-pass resume performance with ATS scanners.

### 4. User Feedback Loop
Allow users to mark false positives/negatives to improve the blacklist.

### 5. Real-Time Refinement
Stream refinement passes to show progressive improvement in UI.

---

## Definition of Done

- [ ] `refiner.py` service implemented with all core functions
- [ ] `refinement.py` prompts and blacklists defined
- [ ] Refinement integrated into `/improve/preview` and `/improve/confirm`
- [ ] Response includes `refinement_stats`
- [ ] Frontend displays before/after match percentages
- [ ] Frontend shows list of removed AI phrases
- [ ] Configuration allows enabling/disabling refinement
- [ ] Unit tests for all refiner functions
- [ ] Integration tests for full pipeline
- [ ] Documentation updated

---

## Appendix: AI Phrase Blacklist (Complete)

```python
# Action verbs to replace
VERB_REPLACEMENTS = {
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
}

# Buzzwords to simplify
BUZZWORD_REPLACEMENTS = {
    "synergy": "collaboration",
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
    "stakeholder": "team member",
    "deliverables": "outputs",
    "bandwidth": "capacity",
    "circle back": "follow up",
    "deep dive": "analysis",
    "move the needle": "make progress",
    "low-hanging fruit": "quick wins",
    "touch base": "connect",
    "value-add": "benefit",
}

# Phrases to simplify
PHRASE_REPLACEMENTS = {
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
}

# Characters to remove
CHAR_BLACKLIST = {
    "\u2014",  # Em-dash
    "---",
    "--",  # Double hyphen often used as em-dash substitute
}
```

---

*Document created: 2025-01-30*
*Author: Claude Code*
*Status: Draft - Pending Review*
