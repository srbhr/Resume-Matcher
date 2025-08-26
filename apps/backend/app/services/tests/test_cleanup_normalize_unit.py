import os
import sys
import re
import pytest

# Ensure the backend 'apps/backend' path is importable so 'app' package resolves
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))  # -> apps/backend
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.services.score_improvement_service import ScoreImprovementService  # type: ignore
from app.core.config import settings  # type: ignore


def test_cleanup_normalizes_german_labels_and_sections():
    md = (
        "# Max Mustermann\n\n"
        "## Profil\n"
        "Erfahrener Mitarbeiter im Backoffice. Sicherer Umgang mit MS-Office.\n\n"
        "## Skills\n"
        "Verwaltung, Fahrtenbuch, Ordnungswidrigkeiten\n"
        "Leasing, Übergaben, MS-Office\n\n"
        "## Anschreiben\n"
        "Bitte beachten Sie mein Wasserzeichen.\n\n"
        "## Suggested Additions (Baseline)\n"
        "Missing keywords: Foo, Bar\n\n"
        "TODO\n\n"
        "## Berufserfahrung\n"
        "- Koordination eines Poolfuhrparks\n"
        "- Koordination eines Poolfuhrparks\n"
    )

    cleaned = ScoreImprovementService._cleanup_and_normalize(md)

    # English baseline labels normalized to German
    assert f"## {settings.RESUME_SUGGESTED_ADDITIONS_HEADER}" in cleaned
    assert f"{settings.RESUME_MISSING_KEYWORDS_LABEL}: Foo, Bar" in cleaned

    # Anschreiben / Cover Letter section removed
    assert "## Anschreiben" not in cleaned

    # Kompetenzen/Skills section is single line
    skills_label_re = re.compile(rf"(?m)^##\s*({'|'.join(map(re.escape, settings.RESUME_HEADERS_SKILLS))})\s*$")
    m = skills_label_re.search(cleaned)
    assert m is not None
    start = m.end()
    next_hdr = re.compile(r"(?m)^##\s+")
    m_next = next_hdr.search(cleaned, pos=start)
    section = cleaned[start:(m_next.start() if m_next else len(cleaned))]
    assert len([ln for ln in section.strip().splitlines() if ln.strip()]) == 1

    # MS-Office expanded if generic mention existed
    assert "MS‑Office (Excel, Outlook, Word)" in cleaned or "MS-Office (Excel, Outlook, Word)" in cleaned

    # Duplicate consecutive lines removed
    occ = cleaned.count("- Koordination eines Poolfuhrparks")
    assert occ == 1

    # Ends with newline (formatter behavior)
    assert cleaned.endswith("\n")
