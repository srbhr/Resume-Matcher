"""Structural scorers for the eval harness.

These are **pure, deterministic** functions: given an original resume and a
tailored one, they check invariants that must hold regardless of the exact
wording the LLM produced. They never call an LLM, never touch the network, and
never read from disk — so they run for free in the normal test suite and form
the cheap first line of defence against "a prompt change broke something."

The invariants encoded here mirror the truthfulness / preservation rules the
tailoring pipeline is supposed to honour:

* every resume section that was populated must survive tailoring,
* the candidate's employment history may be re-worded but not fabricated,
* the JD's keywords should actually appear in the output,
* the result must still validate against ``ResumeData``,
* and the candidate's identity (``personalInfo``) must be left untouched.

All functions take/return concrete types (backend rule: type hints on every
function). The LLM-as-judge layer lives separately in
``tests/evals/test_tailoring_eval.py``.
"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.schemas import ResumeData

# Top-level resume sections whose presence we care about. ``workExperience``
# and ``education`` are the load-bearing ones a tailoring must never drop.
_TRACKED_SECTIONS: tuple[str, ...] = (
    "summary",
    "workExperience",
    "education",
    "personalProjects",
    "additional",
)


def _is_nonempty(value: Any) -> bool:
    """Return True when ``value`` carries real content.

    Empty strings, empty lists/dicts, ``None``, and dicts whose values are all
    themselves empty (e.g. an ``additional`` block of empty lists) count as
    empty. Everything else is considered present.
    """
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set)):
        return len(value) > 0
    if isinstance(value, dict):
        return any(_is_nonempty(v) for v in value.values())
    return True


def _iter_text_fragments(value: Any) -> list[str]:
    """Recursively collect every string fragment inside ``value``."""
    fragments: list[str] = []
    if value is None:
        return fragments
    if isinstance(value, str):
        if value:
            fragments.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            fragments.extend(_iter_text_fragments(item))
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            fragments.extend(_iter_text_fragments(item))
    else:
        fragments.append(str(value))
    return fragments


def flatten_resume_text(data: dict) -> str:
    """Flatten an entire resume dict into one lowercased text blob.

    Used for case-insensitive keyword search across every field — summary,
    bullets, skills, custom sections, the lot.
    """
    return " ".join(_iter_text_fragments(data)).lower()


def _employer_names(data: dict) -> list[str]:
    """Return the (stripped, non-empty) company names in ``workExperience``."""
    names: list[str] = []
    for entry in data.get("workExperience", []) or []:
        if not isinstance(entry, dict):
            continue
        company = entry.get("company")
        if isinstance(company, str) and company.strip():
            names.append(company.strip())
    return names


def sections_preserved(original: dict, tailored: dict) -> bool:
    """No populated top-level section may vanish during tailoring.

    For each tracked section that was non-empty in ``original``, the same
    section must still be non-empty in ``tailored``. Sections that were empty
    to begin with are ignored (tailoring is allowed to leave them empty).

    Returns True when every originally-populated section survives, else False.
    """
    for section in _TRACKED_SECTIONS:
        if _is_nonempty(original.get(section)) and not _is_nonempty(
            tailored.get(section)
        ):
            return False
    return True


def no_fabricated_employers(original: dict, tailored: dict) -> list[str]:
    """Detect company names that appear in ``tailored`` but not in ``original``.

    Tailoring may re-word bullets but must never invent an employer the
    candidate never worked for. Comparison is case-insensitive and
    whitespace-trimmed.

    Returns the list of fabricated company names (in the casing they appear in
    ``tailored``). An empty list means the work history is truthful.
    """
    original_names = {name.lower() for name in _employer_names(original)}
    fabricated: list[str] = []
    seen: set[str] = set()
    for name in _employer_names(tailored):
        key = name.lower()
        if key not in original_names and key not in seen:
            fabricated.append(name)
            seen.add(key)
    return fabricated


def jd_keywords_present(tailored: dict, keywords: list[str]) -> float:
    """Fraction (0.0–1.0) of ``keywords`` that appear in the tailored resume.

    Matching is case-insensitive substring search over the flattened resume
    text. With an empty ``keywords`` list there is nothing to miss, so the
    score is 1.0.
    """
    if not keywords:
        return 1.0
    haystack = flatten_resume_text(tailored)
    hits = sum(1 for kw in keywords if kw and kw.lower() in haystack)
    return hits / len(keywords)


def is_valid_resume(data: dict) -> bool:
    """Return True iff ``data`` validates against the ``ResumeData`` schema."""
    try:
        ResumeData.model_validate(data)
    except ValidationError:
        return False
    return True


def personal_info_unchanged(original: dict, tailored: dict) -> bool:
    """Return True iff the ``personalInfo`` block is byte-for-byte identical.

    The candidate's identity (name, contact details) must never be rewritten by
    tailoring. A missing block is treated as an empty dict on either side.
    """
    return original.get("personalInfo", {}) == tailored.get("personalInfo", {})
