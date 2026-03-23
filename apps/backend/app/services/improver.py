"""Resume improvement service using LLM."""

import copy
import json
import logging
import re
from difflib import SequenceMatcher
from dataclasses import dataclass
from typing import Any, Callable

from app.llm import complete_json
from app.prompts import (
    CRITICAL_TRUTHFULNESS_RULES,
    DEFAULT_IMPROVE_PROMPT_ID,
    DIFF_IMPROVE_PROMPT,
    DIFF_STRATEGY_INSTRUCTIONS,
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPTS,
    get_language_name,
)
from app.prompts.templates import IMPROVE_SCHEMA_EXAMPLE
from app.schemas import ResumeData, ResumeFieldDiff, ResumeDiffSummary
from app.schemas.models import ImproveDiffResult, ResumeChange

logger = logging.getLogger(__name__)

# LLM-011: Prompt injection patterns to sanitize
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?above",
    r"forget\s+(everything|all)",
    r"new\s+instructions?:",
    r"system\s*:",
    r"<\s*/?\s*system\s*>",
    r"\[\s*INST\s*\]",
    r"\[\s*/\s*INST\s*\]",
]


@dataclass(frozen=True)
class DiffConfidence:
    added: str
    removed: str
    modified: str


def _sanitize_user_input(text: str) -> str:
    """LLM-011: Sanitize user input to prevent prompt injection.

    Removes or redacts common injection patterns that could manipulate LLM behavior.
    """
    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized, flags=re.IGNORECASE)
    return sanitized


def _check_for_truncation(data: dict[str, Any]) -> None:
    """LLM-006: Log warnings for obvious truncation signs before Pydantic validation.

    Note: personalInfo is intentionally excluded — the improve prompts tell the
    LLM to skip it, and _preserve_personal_info() restores it from the original.
    """

    # Check for suspiciously empty required arrays
    if "workExperience" in data and data["workExperience"] == []:
        logger.warning(
            "Resume has empty workExperience - possible truncation or unusual resume"
        )


# ---------------------------------------------------------------------------
# Diff-based improvement: path resolution, applier, verifier, LLM generator
# ---------------------------------------------------------------------------

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")

# Allowed path patterns — only these can be modified by diffs
_ALLOWED_PATH_PATTERNS = [
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^additional\.technicalSkills$"),
]

# Blocked path prefixes — always rejected
_BLOCKED_PATH_PREFIXES = frozenset({
    "personalInfo",
    "customSections",
    "sectionMeta",
})

# Blocked field names — rejected when they appear as the leaf of a path
_BLOCKED_FIELD_NAMES = frozenset({
    "years",
    "company",
    "institution",
    "title",
    "degree",
    "name",
    "role",
    "github",
    "website",
    "location",
    "id",
})

_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")


def _is_path_allowed(path: str) -> bool:
    """Check if a path is in the allowed whitelist."""
    return any(p.match(path) for p in _ALLOWED_PATH_PATTERNS)


def _is_path_blocked(path: str) -> bool:
    """Check if a path matches any blocked pattern."""
    for prefix in _BLOCKED_PATH_PREFIXES:
        if path == prefix or path.startswith(prefix + ".") or path.startswith(prefix + "["):
            return True

    # Check if the leaf field is blocked
    segments = path.split(".")
    if segments:
        last_segment = segments[-1]
        field_name = re.sub(r"\[\d+\]$", "", last_segment)
        # "description" is the one allowed field that shares a name pattern
        if field_name in _BLOCKED_FIELD_NAMES and field_name != "description":
            return True

    if path.startswith("education"):
        return True

    return False


def _resolve_path(data: dict[str, Any], path: str) -> tuple[Any, bool]:
    """Resolve a dot+bracket path to a value in the data dict.

    Returns:
        (value, success). On failure returns (None, False).
    """
    current: Any = data
    for segment_match in _PATH_SEGMENT_RE.finditer(path):
        key = segment_match.group(1)
        index_str = segment_match.group(2)

        if not isinstance(current, dict) or key not in current:
            return None, False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return None, False
            current = current[index]

    return current, True


def _set_at_path(data: dict[str, Any], path: str, value: Any) -> bool:
    """Set a value at the given path. Returns True on success."""
    segments = list(_PATH_SEGMENT_RE.finditer(path))
    if not segments:
        return False

    # Navigate to parent of the target
    current: Any = data
    for seg in segments[:-1]:
        key = seg.group(1)
        index_str = seg.group(2)

        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return False
            current = current[index]

    # Set on the final segment
    last = segments[-1]
    key = last.group(1)
    index_str = last.group(2)

    if index_str is not None:
        if not isinstance(current, dict) or key not in current:
            return False
        target = current[key]
        index = int(index_str)
        if not isinstance(target, list) or index < 0 or index >= len(target):
            return False
        target[index] = value
    else:
        if not isinstance(current, dict):
            return False
        current[key] = value

    return True


def _verify_original_matches(actual: Any, expected: str | None) -> bool:
    """Verify that the original text from the diff matches the actual value."""
    if expected is None:
        return True  # No verification needed (e.g. append, reorder)
    if not isinstance(actual, str):
        return False
    return actual.strip().casefold() == expected.strip().casefold()


def apply_diffs(
    original: dict[str, Any],
    changes: list[ResumeChange],
) -> tuple[dict[str, Any], list[ResumeChange], list[ResumeChange]]:
    """Apply verified diffs to original resume.

    Each change goes through 4 gates:
    1. Path is in allowed whitelist
    2. Path is not in blocked list
    3. Path resolves to an actual value in the original
    4. Original text matches (for replace actions)

    For reorder: validates the new list contains exactly the same items.

    Args:
        original: The original resume data (ResumeData-compatible dict)
        changes: List of changes from the LLM

    Returns:
        (result_dict, applied_changes, rejected_changes)
    """
    result = copy.deepcopy(original)
    applied: list[ResumeChange] = []
    rejected: list[ResumeChange] = []

    for change in changes:
        path = change.path
        action = change.action

        # Gate 1: Path must be in allowed whitelist
        if not _is_path_allowed(path):
            logger.info("Diff rejected (not in allowed list): %s", path)
            rejected.append(change)
            continue

        # Gate 2: Path must not be blocked
        if _is_path_blocked(path):
            logger.info("Diff rejected (blocked path): %s", path)
            rejected.append(change)
            continue

        # Gate 3: Path must resolve to a real value
        actual_value, resolved = _resolve_path(result, path)
        if not resolved:
            logger.info("Diff rejected (path not found): %s", path)
            rejected.append(change)
            continue

        if action == "replace":
            # Gate 4: Original text must match what's actually there
            if not _verify_original_matches(actual_value, change.original):
                logger.info(
                    "Diff rejected (original mismatch): path=%s expected=%r actual=%r",
                    path,
                    change.original,
                    actual_value,
                )
                rejected.append(change)
                continue

            # Replace must use a string value (not list)
            if not isinstance(change.value, str):
                logger.info("Diff rejected (replace with non-string value): %s", path)
                rejected.append(change)
                continue

            if not _set_at_path(result, path, change.value):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "append":
            if not isinstance(actual_value, list):
                logger.info("Diff rejected (append to non-list): %s", path)
                rejected.append(change)
                continue
            # Append must use a non-empty string (not list, to avoid nested lists)
            if not isinstance(change.value, str) or not change.value.strip():
                logger.info("Diff rejected (append non-string or empty value): %s", path)
                rejected.append(change)
                continue
            actual_value.append(change.value)
            applied.append(change)

        elif action == "reorder":
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue
            # Validate same items (case-insensitive)
            orig_set = sorted(s.casefold() for s in actual_value if isinstance(s, str))
            new_set = sorted(s.casefold() for s in change.value if isinstance(s, str))
            if orig_set != new_set:
                logger.info("Diff rejected (reorder items mismatch): %s", path)
                rejected.append(change)
                continue
            # Preserve original casing: map new order back to original strings
            casefold_to_originals: dict[str, list[str]] = {}
            for item in actual_value:
                if isinstance(item, str):
                    casefold_to_originals.setdefault(item.casefold(), []).append(item)
            reordered: list[str] = []
            for item in change.value:
                if isinstance(item, str):
                    originals = casefold_to_originals.get(item.casefold(), [])
                    reordered.append(originals.pop(0) if originals else item)
            if not _set_at_path(result, path, reordered):
                rejected.append(change)
                continue
            applied.append(change)

        else:
            logger.info("Diff rejected (unknown action): %s", action)
            rejected.append(change)

    return result, applied, rejected


def _count_description_words(data: dict[str, Any]) -> int:
    """Count total words in all description and summary fields."""
    total = 0
    for key in ("workExperience", "personalProjects"):
        for entry in data.get(key, []):
            if isinstance(entry, dict):
                desc = entry.get("description", [])
                if isinstance(desc, list):
                    total += sum(len(str(d).split()) for d in desc)
                elif isinstance(desc, str):
                    total += len(desc.split())
    summary = data.get("summary", "")
    if isinstance(summary, str):
        total += len(summary.split())
    return total


def verify_diff_result(
    original: dict[str, Any],
    result: dict[str, Any],
    applied_changes: list[ResumeChange],
    job_keywords: dict[str, Any],
) -> list[str]:
    """Local quality checks on the diff result. Returns list of warnings.

    All checks are local (zero LLM cost). Warnings are informational —
    they don't block the response.
    """
    warnings: list[str] = []

    # Check 1: No empty result
    if not applied_changes:
        warnings.append("No changes were applied — resume returned unchanged")
        return warnings

    # Check 2: Section counts preserved
    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        result_count = len(result.get(key, []))
        if orig_count != result_count:
            warnings.append(
                f"Section count changed: {label} ({orig_count} → {result_count})"
            )

    # Check 3: Identity fields unchanged
    for key, id_fields in [
        ("workExperience", ["company", "title"]),
        ("education", ["institution", "degree"]),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for i, (orig, res) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig, dict) or not isinstance(res, dict):
                continue
            for field in id_fields:
                o_val = str(orig.get(field, "")).strip()
                r_val = str(res.get(field, "")).strip()
                if o_val and o_val != r_val:
                    warnings.append(
                        f"Identity field changed: {key}[{i}].{field} "
                        f"('{o_val}' → '{r_val}')"
                    )

    # Check 4: Word count ratio
    orig_words = _count_description_words(original)
    result_words = _count_description_words(result)
    if orig_words > 0 and result_words > orig_words * 1.8:
        warnings.append(
            f"Word count increased significantly: "
            f"{orig_words} → {result_words} ({result_words / orig_words:.1f}x)"
        )

    # Check 5: Invented metrics (covers both replace and append)
    for change in applied_changes:
        if change.action in ("replace", "append") and isinstance(change.value, str):
            new_metrics = set(_METRIC_RE.findall(change.value))
            # For append, original is None — any metric is potentially invented
            original_text = change.original or ""
            old_metrics = set(_METRIC_RE.findall(original_text))
            invented = new_metrics - old_metrics
            if invented:
                warnings.append(
                    f"Possible invented metric in {change.path}: "
                    f"{', '.join(invented)} (not in original)"
                )

    return warnings


async def generate_resume_diffs(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> ImproveDiffResult:
    """Generate targeted resume diffs via LLM.

    Instead of asking the LLM for the full resume, asks for a list of
    targeted changes. Each change specifies a path, action, and new value.

    Args:
        original_resume: Resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords
        language: Output language code (en, es, zh, ja)
        prompt_id: Strategy id (nudge/keywords/full)
        original_resume_data: Structured resume JSON

    Returns:
        ImproveDiffResult with list of changes and strategy notes
    """
    keywords_str = _prepare_keywords_for_prompt(job_keywords)
    output_language = get_language_name(language)

    selected_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    if selected_id not in DIFF_STRATEGY_INSTRUCTIONS:
        logger.warning(
            "Unknown prompt_id '%s'; using default diff strategy.",
            selected_id,
        )
    strategy_instruction = DIFF_STRATEGY_INSTRUCTIONS.get(
        selected_id, DIFF_STRATEGY_INSTRUCTIONS[DEFAULT_IMPROVE_PROMPT_ID]
    )

    # LLM-011: Sanitize job description
    sanitized_jd = _sanitize_user_input(job_description)

    # Use structured JSON if available with month precision, else markdown
    if original_resume_data is not None:
        if _has_month_in_dates(original_resume_data):
            resume_input = json.dumps(original_resume_data)
        else:
            resume_input = original_resume
    else:
        resume_input = original_resume

    prompt = DIFF_IMPROVE_PROMPT.format(
        strategy_instruction=strategy_instruction,
        output_language=output_language,
        job_keywords=keywords_str,
        job_description=sanitized_jd,
        original_resume=resume_input,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON with targeted changes.",
        max_tokens=4096,
    )

    # Parse result — handle LLM ignoring diff format gracefully
    raw_changes = result.get("changes", [])
    if not isinstance(raw_changes, list):
        logger.warning("LLM returned non-list changes: %s", type(raw_changes))
        raw_changes = []

    changes: list[ResumeChange] = []
    for raw in raw_changes:
        if not isinstance(raw, dict):
            continue
        try:
            changes.append(
                ResumeChange(
                    path=str(raw.get("path", "")),
                    action=raw.get("action", "replace"),
                    original=raw.get("original"),
                    value=raw.get("value", ""),
                    reason=str(raw.get("reason", "")),
                )
            )
        except Exception as e:
            logger.warning("Skipping malformed change: %s — %s", raw, e)

    strategy_notes = str(result.get("strategy_notes", ""))
    if not raw_changes and "changes" not in result:
        strategy_notes = "LLM output had no changes key — returned zero diffs"
        logger.warning("LLM output missing 'changes' key: %s", list(result.keys()))

    return ImproveDiffResult(changes=changes, strategy_notes=strategy_notes)


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Extract keywords and requirements from job description.

    Args:
        job_description: Raw job description text

    Returns:
        Structured keywords and requirements
    """
    # LLM-011: Sanitize job description before using in prompt
    sanitized_jd = _sanitize_user_input(job_description)
    prompt = EXTRACT_KEYWORDS_PROMPT.format(job_description=sanitized_jd)

    return await complete_json(
        prompt=prompt,
        system_prompt="You are an expert job description analyzer.",
    )


MONTH_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
    re.IGNORECASE,
)


def _has_month_in_dates(data: dict[str, Any]) -> bool:
    """Check whether any years field in the structured data includes a month."""
    for section_key in ("workExperience", "education", "personalProjects"):
        entries = data.get(section_key, [])
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, dict):
                years = entry.get("years", "")
                if isinstance(years, str) and MONTH_PATTERN.search(years):
                    return True
    custom_sections = data.get("customSections", {})
    if isinstance(custom_sections, dict):
        for section in custom_sections.values():
            if isinstance(section, dict) and section.get("sectionType") == "itemList":
                items = section.get("items", [])
                if not isinstance(items, list):
                    continue
                for item in items:
                    if isinstance(item, dict):
                        years = item.get("years", "")
                        if isinstance(years, str) and MONTH_PATTERN.search(years):
                            return True
    return False


def _prepare_keywords_for_prompt(job_keywords: dict[str, Any]) -> str:
    """Format job keywords as a focused, readable list for the LLM prompt.

    Extracts only actionable fields (skills and keywords) and drops
    informational fields that add noise without helping the LLM tailor.
    """
    sections: list[str] = []

    required = job_keywords.get("required_skills", [])
    if required:
        sections.append("Required skills to emphasize:\n- " + "\n- ".join(str(s) for s in required))

    preferred = job_keywords.get("preferred_skills", [])
    if preferred:
        sections.append(
            "Preferred skills (include only if resume supports them):\n- "
            + "\n- ".join(str(s) for s in preferred)
        )

    keywords = job_keywords.get("keywords", [])
    if keywords:
        sections.append("Additional keywords to weave in naturally:\n- " + "\n- ".join(str(k) for k in keywords))

    return "\n\n".join(sections) if sections else "No specific keywords extracted."


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Improve resume to better match job description.

    Args:
        original_resume: Original resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords
        language: Output language code (en, es, zh, ja)
        prompt_id: Which tailor prompt to use
        original_resume_data: Structured resume JSON; used instead of
            markdown when available for higher-fidelity LLM input

    Returns:
        Improved resume data matching ResumeData schema

    LLM-006: Validates for truncation before Pydantic validation.
    LLM-011: Sanitizes job description to prevent prompt injection.
    """
    keywords_str = _prepare_keywords_for_prompt(job_keywords)
    output_language = get_language_name(language)

    selected_prompt_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    prompt_template = IMPROVE_RESUME_PROMPTS.get(
        selected_prompt_id, IMPROVE_RESUME_PROMPTS[DEFAULT_IMPROVE_PROMPT_ID]
    )
    if selected_prompt_id not in CRITICAL_TRUTHFULNESS_RULES:
        logger.warning(
            "Missing truthfulness rules for prompt '%s'; using default rules.",
            selected_prompt_id,
        )
    truthfulness_rules = CRITICAL_TRUTHFULNESS_RULES.get(
        selected_prompt_id, CRITICAL_TRUTHFULNESS_RULES[DEFAULT_IMPROVE_PROMPT_ID]
    )

    # LLM-011: Sanitize job description to prevent prompt injection
    sanitized_jd = _sanitize_user_input(job_description)

    # Use structured JSON when available for higher-fidelity LLM input,
    # but fall back to raw markdown if the structured data has truncated
    # (year-only) dates — the markdown preserves months from the original PDF.
    if original_resume_data is not None:
        if _has_month_in_dates(original_resume_data):
            resume_input = json.dumps(original_resume_data)
        else:
            logger.info(
                "Structured resume data has year-only dates; using raw markdown "
                "to preserve month precision."
            )
            resume_input = original_resume
    else:
        resume_input = original_resume

    prompt = prompt_template.format(
        job_description=sanitized_jd,
        job_keywords=keywords_str,
        original_resume=resume_input,
        schema=IMPROVE_SCHEMA_EXAMPLE,
        output_language=output_language,
        critical_truthfulness_rules=truthfulness_rules,
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON.",
        max_tokens=8192,
    )

    # LLM-006: Pre-validation check for truncation signs
    _check_for_truncation(result)

    # Validate against schema
    validated = ResumeData.model_validate(result)
    return validated.model_dump()


def _format_entry_label(parts: list[str], fallback: str) -> str:
    label = " | ".join([part for part in parts if part])
    return label if label else fallback


def _format_experience_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("title", ""),
            entry.get("company", ""),
            entry.get("years", ""),
        ],
        f"Work experience #{index + 1}",
    )


def _format_education_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("degree", ""),
            entry.get("institution", ""),
            entry.get("years", ""),
        ],
        f"Education #{index + 1}",
    )


def _format_project_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("name", ""),
            entry.get("role", ""),
            entry.get("years", ""),
        ],
        f"Project #{index + 1}",
    )


def _normalize_entry(
    entry: dict[str, Any],
    ignore_keys: set[str] | None,
) -> dict[str, Any]:
    """Return an entry dict with ignored keys removed for diff comparisons.

    Ignored keys are excluded so entry-level change detection can skip fields
    that are diffed separately (e.g., description lists).
    """
    if ignore_keys is None:
        return entry
    return {key: value for key, value in entry.items() if key not in ignore_keys}


def _append_entry_changes(
    changes: list[ResumeFieldDiff],
    field_key: str,
    field_type: str,
    original_items: list[dict[str, Any]],
    improved_items: list[dict[str, Any]],
    formatter: Callable[[dict[str, Any], int], str],
    ignore_keys: set[str] | None = None,
) -> None:
    min_len = min(len(original_items), len(improved_items))

    for idx in range(min_len):
        original_entry = original_items[idx]
        improved_entry = improved_items[idx]
        if _normalize_entry(original_entry, ignore_keys) != _normalize_entry(
            improved_entry, ignore_keys
        ):
            changes.append(
                ResumeFieldDiff(
                    field_path=f"{field_key}[{idx}]",
                    field_type=field_type,
                    change_type="modified",
                    original_value=formatter(original_entry, idx),
                    new_value=formatter(improved_entry, idx),
                    confidence="medium",
                )
            )

    for idx in range(min_len, len(improved_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="added",
                new_value=formatter(improved_items[idx], idx),
                confidence="high",
            )
        )

    for idx in range(min_len, len(original_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="removed",
                original_value=formatter(original_items[idx], idx),
                confidence="medium",
            )
        )


def _normalize_string_list(value: Any, field_name: str) -> list[str]:
    """Normalize string list values and log any non-string entries.

    Accepts lists of strings or objects containing name/label/value keys.
    """
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    invalid_count = 0
    for item in value:
        if isinstance(item, str):
            stripped = item.strip()
            if stripped:
                normalized.append(stripped)
            continue
        if isinstance(item, dict):
            candidate = item.get("name") or item.get("label") or item.get("value")
            if isinstance(candidate, str):
                stripped = candidate.strip()
                if stripped:
                    normalized.append(stripped)
                else:
                    invalid_count += 1
            else:
                invalid_count += 1
            continue
        if item is None:
            continue
        invalid_count += 1
    if invalid_count:
        logger.warning("Skipped non-string entries in %s: %d", field_name, invalid_count)
    return normalized


def _build_string_index(value: Any, field_name: str) -> dict[str, str]:
    """Build a case-insensitive index for string list comparisons."""
    items = _normalize_string_list(value, field_name)
    index: dict[str, str] = {}
    for item in items:
        key = item.casefold()
        if key not in index:
            index[key] = item
    return index


def _extract_description_list(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return []
    return _normalize_string_list(entry.get("description", []), "workExperience.description")


def _append_list_changes(
    changes: list[ResumeFieldDiff],
    field_path: str,
    field_type: str,
    original_items: list[str],
    improved_items: list[str],
    confidences: DiffConfidence,
) -> None:
    matcher = SequenceMatcher(a=original_items, b=improved_items, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            for item in original_items[i1:i2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="removed",
                        original_value=item,
                        confidence=confidences.removed,
                    )
                )
        elif tag == "insert":
            for item in improved_items[j1:j2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="added",
                        new_value=item,
                        confidence=confidences.added,
                    )
                )
        elif tag == "replace":
            original_segment = original_items[i1:i2]
            improved_segment = improved_items[j1:j2]
            segment_len = max(len(original_segment), len(improved_segment))
            for offset in range(segment_len):
                original_value = (
                    original_segment[offset] if offset < len(original_segment) else None
                )
                new_value = (
                    improved_segment[offset] if offset < len(improved_segment) else None
                )
                if original_value is not None and new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="modified",
                            original_value=original_value,
                            new_value=new_value,
                            confidence=confidences.modified,
                        )
                    )
                elif new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="added",
                            new_value=new_value,
                            confidence=confidences.added,
                        )
                    )
                elif original_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="removed",
                            original_value=original_value,
                            confidence=confidences.removed,
                        )
                    )


def calculate_resume_diff(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> tuple[ResumeDiffSummary, list[ResumeFieldDiff]]:
    """Compute the diff between original and improved resumes.

    Args:
        original: Original resume data dict
        improved: Improved resume data dict

    Returns:
        (diff summary, detailed change list)
    """
    changes: list[ResumeFieldDiff] = []

    # 1. Compare summary
    original_summary = (original.get("summary") or "").strip()
    improved_summary = (improved.get("summary") or "").strip()
    if original_summary != improved_summary:
        if original_summary and not improved_summary:
            change_type = "removed"
        elif improved_summary and not original_summary:
            change_type = "added"
        else:
            change_type = "modified"
        changes.append(
            ResumeFieldDiff(
                field_path="summary",
                field_type="summary",
                change_type=change_type,
                original_value=original_summary or None,
                new_value=improved_summary or None,
                confidence="medium",
            )
        )

    # 2. Compare skills (order changes are intentionally ignored)
    orig_skills = _build_string_index(
        original.get("additional", {}).get("technicalSkills", []),
        "additional.technicalSkills",
    )
    new_skills = _build_string_index(
        improved.get("additional", {}).get("technicalSkills", []),
        "additional.technicalSkills",
    )
    orig_skill_keys = set(orig_skills)
    new_skill_keys = set(new_skills)
    for skill_key in new_skill_keys - orig_skill_keys:
        changes.append(ResumeFieldDiff(
            field_path="additional.technicalSkills",
            field_type="skill",
            change_type="added",
            new_value=new_skills[skill_key],
            confidence="high"  # Newly added skills are high risk
        ))

    for skill_key in orig_skill_keys - new_skill_keys:
        changes.append(ResumeFieldDiff(
            field_path="additional.technicalSkills",
            field_type="skill",
            change_type="removed",
            original_value=orig_skills[skill_key],
            confidence="medium"
        ))

    # 3. Compare work experience descriptions
    original_experiences = original.get("workExperience", [])
    improved_experiences = improved.get("workExperience", [])
    max_experience_len = max(len(original_experiences), len(improved_experiences))
    confidences = DiffConfidence(added="medium", removed="low", modified="medium")
    for idx in range(max_experience_len):
        original_entry = (
            original_experiences[idx] if idx < len(original_experiences) else None
        )
        improved_entry = (
            improved_experiences[idx] if idx < len(improved_experiences) else None
        )
        if not original_entry and not improved_entry:
            continue
        _append_list_changes(
            changes,
            field_path=f"workExperience[{idx}].description",
            field_type="description",
            original_items=_extract_description_list(original_entry),
            improved_items=_extract_description_list(improved_entry),
            confidences=confidences,
        )

    # 4. Compare certifications (order changes are intentionally ignored)
    orig_certs = _build_string_index(
        original.get("additional", {}).get("certificationsTraining", []),
        "additional.certificationsTraining",
    )
    new_certs = _build_string_index(
        improved.get("additional", {}).get("certificationsTraining", []),
        "additional.certificationsTraining",
    )
    orig_cert_keys = set(orig_certs)
    new_cert_keys = set(new_certs)
    for cert_key in new_cert_keys - orig_cert_keys:
        changes.append(ResumeFieldDiff(
            field_path="additional.certificationsTraining",
            field_type="certification",
            change_type="added",
            new_value=new_certs[cert_key],
            confidence="high"
        ))

    for cert_key in orig_cert_keys - new_cert_keys:
        changes.append(ResumeFieldDiff(
            field_path="additional.certificationsTraining",
            field_type="certification",
            change_type="removed",
            original_value=orig_certs[cert_key],
            confidence="medium"
        ))

    # 5. Compare added/removed/modified entries
    # Descriptions are diffed separately; ignore them when detecting entry-level changes.
    _append_entry_changes(
        changes,
        "workExperience",
        "experience",
        original.get("workExperience", []),
        improved.get("workExperience", []),
        _format_experience_entry,
        {"description"},
    )
    _append_entry_changes(
        changes,
        "education",
        "education",
        original.get("education", []),
        improved.get("education", []),
        _format_education_entry,
    )
    _append_entry_changes(
        changes,
        "personalProjects",
        "project",
        original.get("personalProjects", []),
        improved.get("personalProjects", []),
        _format_project_entry,
    )

    # 6. Build summary
    summary = ResumeDiffSummary(
        total_changes=len(changes),
        skills_added=len([c for c in changes if c.field_type == "skill" and c.change_type == "added"]),
        skills_removed=len([c for c in changes if c.field_type == "skill" and c.change_type == "removed"]),
        descriptions_modified=len(
            [
                c
                for c in changes
                if c.field_type == "description" and c.change_type == "modified"
            ]
        ),
        certifications_added=len([c for c in changes if c.field_type == "certification" and c.change_type == "added"]),
        high_risk_changes=len([c for c in changes if c.confidence == "high"])
    )

    return summary, changes


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate improvement suggestions based on job keywords.

    Args:
        job_keywords: Extracted job keywords

    Returns:
        List of improvement suggestions
    """
    improvements = []

    # Generate suggestions based on required skills
    required_skills = job_keywords.get("required_skills", [])
    for skill in required_skills[:3]:  # Top 3 required skills
        improvements.append(
            {
                "suggestion": f"Emphasized '{skill}' to match job requirements",
                "lineNumber": None,
            }
        )

    # Generate suggestions based on key responsibilities
    responsibilities = job_keywords.get("key_responsibilities", [])
    for resp in responsibilities[:2]:  # Top 2 responsibilities
        improvements.append(
            {
                "suggestion": f"Aligned experience with: {resp}",
                "lineNumber": None,
            }
        )

    # Default improvement if none generated
    if not improvements:
        improvements.append(
            {
                "suggestion": "Resume content optimized for better keyword alignment with job description",
                "lineNumber": None,
            }
        )

    return improvements
