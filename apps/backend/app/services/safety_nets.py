"""Tailoring safety nets: what an AI result may never lose or invent.

They run after every tailoring, on top of the diff path block-list and
``finalize_ai_resume``, as defense in depth.
"""

import copy
import logging
from typing import Any

from app.services.improver import MONTH_PATTERN

logger = logging.getLogger(__name__)


def _has_month(date_str: str) -> bool:
    """Return True if the date string contains a month name."""
    return bool(MONTH_PATTERN.search(date_str))


def restore_original_dates(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore original date/years values that the LLM may have truncated.

    Compares each entry's ``years`` field in the tailored resume against
    the corresponding entry in the original.  If the original has more
    date precision (e.g. includes a month) and the tailored version lost
    it, the original value is restored.
    """
    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)

    for section_key in ("workExperience", "education", "personalProjects"):
        orig_entries = original_data.get(section_key, [])
        result_entries = result.get(section_key, [])
        for idx, orig_entry in enumerate(orig_entries):
            if idx >= len(result_entries):
                break
            if not isinstance(orig_entry, dict) or not isinstance(
                result_entries[idx], dict
            ):
                continue
            orig_years = orig_entry.get("years", "")
            result_years = result_entries[idx].get("years", "")
            if (
                isinstance(orig_years, str)
                and isinstance(result_years, str)
                and orig_years
                and orig_years != result_years
                and _has_month(orig_years)
                and not _has_month(result_years)
            ):
                logger.info(
                    "Restoring date in %s[%d]: %r → %r",
                    section_key,
                    idx,
                    result_years,
                    orig_years,
                )
                result_entries[idx]["years"] = orig_years

    # Custom sections (itemList)
    orig_custom = original_data.get("customSections", {})
    result_custom = result.get("customSections", {})
    if isinstance(orig_custom, dict) and isinstance(result_custom, dict):
        for section_key, orig_section in orig_custom.items():
            if not isinstance(orig_section, dict):
                continue
            result_section = result_custom.get(section_key)
            if not isinstance(result_section, dict):
                continue
            if orig_section.get("sectionType") != "itemList":
                continue
            orig_items = orig_section.get("items", [])
            result_items = result_section.get("items", [])
            for idx, orig_item in enumerate(orig_items):
                if idx >= len(result_items):
                    break
                if not isinstance(orig_item, dict) or not isinstance(
                    result_items[idx], dict
                ):
                    continue
                orig_years = orig_item.get("years", "")
                result_years = result_items[idx].get("years", "")
                if (
                    isinstance(orig_years, str)
                    and isinstance(result_years, str)
                    and orig_years
                    and orig_years != result_years
                    and _has_month(orig_years)
                    and not _has_month(result_years)
                ):
                    result_items[idx]["years"] = orig_years

    return result


def preserve_original_skills(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore any skills, certs, languages, or awards dropped by the LLM.

    This is a hard safety net: regardless of what the LLM returns, no
    original item from these lists is ever lost.  Dropped items are
    appended at the end of the improved list.
    """
    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)

    orig_additional = original_data.get("additional", {})
    if not isinstance(orig_additional, dict):
        return result
    result_additional = result.setdefault("additional", {})

    list_fields = [
        "technicalSkills",
        "certificationsTraining",
        "languages",
        "awards",
    ]
    for field in list_fields:
        orig_items = orig_additional.get(field, [])
        if not isinstance(orig_items, list) or not orig_items:
            continue
        current_items = result_additional.get(field, [])
        if not isinstance(current_items, list):
            current_items = []

        # Build a case-insensitive index of what the LLM kept
        current_lower = {
            item.casefold() for item in current_items if isinstance(item, str)
        }

        # Append any originals that were dropped
        restored = 0
        for item in orig_items:
            if isinstance(item, str) and item.casefold() not in current_lower:
                current_items.append(item)
                current_lower.add(item.casefold())
                restored += 1

        if restored:
            logger.info("Restored %d dropped items in additional.%s", restored, field)
        result_additional[field] = current_items

    return result


def protect_custom_sections(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Protect custom sections from LLM hallucination.

    - If an item originally had description: [], revert any fabricated descriptions.
    - If the LLM added items that weren't in the original, remove them.
    """
    if not original_data:
        return improved_data

    orig_custom = original_data.get("customSections")
    if not isinstance(orig_custom, dict) or not orig_custom:
        return improved_data

    result = copy.deepcopy(improved_data)
    result_custom = result.get("customSections")
    if not isinstance(result_custom, dict):
        return result

    for section_key, orig_section in orig_custom.items():
        if not isinstance(orig_section, dict):
            continue
        result_section = result_custom.get(section_key)
        if not isinstance(result_section, dict):
            # Section was removed by LLM — restore original
            result_custom[section_key] = copy.deepcopy(orig_section)
            logger.info("Restored missing custom section: %s", section_key)
            continue

        section_type = orig_section.get("sectionType", "")
        if section_type == "itemList":
            orig_items = orig_section.get("items", [])
            result_items = result_section.get("items", [])
            if not isinstance(orig_items, list) or not isinstance(result_items, list):
                continue

            # Trim any items the LLM added beyond the original count
            if len(result_items) > len(orig_items):
                logger.info(
                    "Trimming %d hallucinated items from customSections.%s",
                    len(result_items) - len(orig_items),
                    section_key,
                )
                result_items = result_items[: len(orig_items)]

            # Revert fabricated descriptions on items that had empty descriptions
            for idx, orig_item in enumerate(orig_items):
                if idx >= len(result_items):
                    break
                if not isinstance(orig_item, dict):
                    continue
                orig_desc = orig_item.get("description")
                if isinstance(orig_desc, list) and len(orig_desc) == 0:
                    result_desc = result_items[idx].get("description")
                    if isinstance(result_desc, list) and len(result_desc) > 0:
                        logger.info(
                            "Reverted fabricated description on customSections.%s.items[%d]",
                            section_key,
                            idx,
                        )
                        result_items[idx]["description"] = []

            result_section["items"] = result_items

    result["customSections"] = result_custom
    return result


def preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Preserve personal info from original, return warnings if unable.

    Uses deep copy to prevent mutation of original data.
    """
    warnings: list[str] = []

    if not original_data:
        warnings.append(
            "Original resume data unavailable - personal info may be AI-generated"
        )
        return improved_data, warnings

    original_info = original_data.get("personalInfo")
    if not isinstance(original_info, dict):
        warnings.append("Original personal info missing or invalid")
        return improved_data, warnings

    # SVC-001: Use deep copy to prevent any mutation of original data
    result = copy.deepcopy(improved_data)
    result["personalInfo"] = copy.deepcopy(original_info)
    return result, warnings
