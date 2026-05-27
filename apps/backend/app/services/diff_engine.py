"""Diff engine for computing human-readable hunks from document changes.

Supports two document families:
  - Structured (resume / CV): compares ResumeData JSON dicts at the
    bullet-point / field level using the existing calculate_resume_diff().
  - Plain text (cover letter / outreach): uses difflib to find changed
    blocks in the raw text.
"""

import re
import uuid
from difflib import SequenceMatcher
from typing import Any

from app.schemas import DiffHunk, ResumeFieldDiff
from app.services.improver import calculate_resume_diff


# ---------------------------------------------------------------------------
# Resume / CV  →  per-bullet DiffHunk list
# ---------------------------------------------------------------------------

def _humanize_path(
    resume_json: dict[str, Any],
    diff: ResumeFieldDiff,
) -> str:
    """Convert a ResumeFieldDiff into a human-readable label."""

    path = diff.field_path

    if path == "summary":
        return "Professional Summary"

    if path.startswith("additional.technicalSkills"):
        return "Skills"

    if path.startswith("additional.certificationsTraining"):
        return "Certifications"

    m = re.match(r"workExperience\[(\d+)]", path)
    if m:
        idx = int(m.group(1))
        entries = resume_json.get("workExperience", [])
        if idx < len(entries):
            entry = entries[idx]
            title = entry.get("title", "")
            company = entry.get("company", "")
            parts = [p for p in (title, company) if p]
            label = " @ ".join(parts) if parts else f"Experience #{idx + 1}"
        else:
            label = f"Experience #{idx + 1}"
        if diff.field_type == "description":
            return f"{label} — bullet"
        return label

    m = re.match(r"education\[(\d+)]", path)
    if m:
        idx = int(m.group(1))
        entries = resume_json.get("education", [])
        if idx < len(entries):
            entry = entries[idx]
            degree = entry.get("degree", "")
            inst = entry.get("institution", "")
            parts = [p for p in (degree, inst) if p]
            return " — ".join(parts) if parts else f"Education #{idx + 1}"
        return f"Education #{idx + 1}"

    m = re.match(r"personalProjects\[(\d+)]", path)
    if m:
        idx = int(m.group(1))
        entries = resume_json.get("personalProjects", [])
        if idx < len(entries):
            return entries[idx].get("name", "") or f"Project #{idx + 1}"
        return f"Project #{idx + 1}"

    return path


def _change_type_reason(diff: ResumeFieldDiff) -> str:
    if diff.change_type == "added":
        return "Added"
    if diff.change_type == "removed":
        return "Removed"
    return "Modified"


def compute_resume_hunks(
    original_json: dict[str, Any],
    proposed_json: dict[str, Any],
) -> list[DiffHunk]:
    """Diff two ResumeData dicts and return per-field DiffHunks."""

    _, field_diffs = calculate_resume_diff(original_json, proposed_json)

    hunks: list[DiffHunk] = []
    for diff in field_diffs:
        hunks.append(
            DiffHunk(
                hunk_id=str(uuid.uuid4()),
                label=_humanize_path(original_json, diff),
                original_text=diff.original_value or "",
                proposed_text=diff.new_value or "",
                reason=_change_type_reason(diff),
                field_path=diff.field_path,
                change_type=diff.change_type,
            )
        )

    return hunks


# ---------------------------------------------------------------------------
# Plain text (cover letter / outreach)  →  line-level DiffHunk list
# ---------------------------------------------------------------------------

def compute_text_hunks(
    original_text: str,
    proposed_text: str,
) -> list[DiffHunk]:
    """Diff two plain-text documents and return per-block DiffHunks."""

    orig_lines = original_text.splitlines(keepends=True)
    prop_lines = proposed_text.splitlines(keepends=True)

    matcher = SequenceMatcher(None, orig_lines, prop_lines, autojunk=False)
    hunks: list[DiffHunk] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue

        orig_block = "".join(orig_lines[i1:i2]).strip()
        prop_block = "".join(prop_lines[j1:j2]).strip()

        if tag == "delete":
            label = f"Line{'s' if (i2 - i1) > 1 else ''} {i1 + 1}–{i2}"
            reason = "Removed"
        elif tag == "insert":
            label = f"After line {i1}"
            reason = "Added"
        else:
            label = f"Line{'s' if (i2 - i1) > 1 else ''} {i1 + 1}–{i2}"
            reason = "Modified"

        hunks.append(
            DiffHunk(
                hunk_id=str(uuid.uuid4()),
                label=label,
                original_text=orig_block,
                proposed_text=prop_block,
                reason=reason,
            )
        )

    return hunks
