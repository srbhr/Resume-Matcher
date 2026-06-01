#!/usr/bin/env python3
"""Verify every frontend locale file structurally matches ``en.json``.

The frontend declares ``type Messages = typeof en`` and
``const allMessages: Record<Locale, Messages>``, so a locale JSON that is
*missing* a key present in ``en.json`` makes ``tsc`` / ``next build`` fail. That
is exactly the break that shipped to ``main`` and only surfaced (post-merge)
inside the Docker publish job — the incident that motivated the testing work.

This check reproduces and prevents it with **pure stdlib** — no Node, npm, or
nvm — so it runs fast inside the local pre-push hook regardless of shell setup.

Exit code: 0 = all locales match; 1 = at least one locale is missing keys.
Extra keys (present in a locale but not in ``en``) are reported as warnings only
(they don't break the ``typeof en`` build, but signal drift worth cleaning up).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

MESSAGES_DIR = Path(__file__).resolve().parents[1] / "apps" / "frontend" / "messages"
REFERENCE = "en.json"


def key_paths(obj: Any, prefix: str = "") -> set[str]:
    """Return the set of dotted key paths (branches + leaves) in a nested dict."""
    paths: set[str] = set()
    if isinstance(obj, dict):
        for key, value in obj.items():
            path = f"{prefix}.{key}" if prefix else key
            paths.add(path)
            paths |= key_paths(value, path)
    return paths


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str]) -> int:
    # Optional argv[1] overrides the messages dir (used by tests / the hook).
    messages_dir = Path(argv[1]).resolve() if len(argv) > 1 else MESSAGES_DIR

    reference_file = messages_dir / REFERENCE
    if not reference_file.exists():
        print(f"locale-parity: reference {reference_file} not found", file=sys.stderr)
        return 1

    reference_keys = key_paths(_load(reference_file))
    failed = False

    for path in sorted(messages_dir.glob("*.json")):
        if path.name == REFERENCE:
            continue
        locale_keys = key_paths(_load(path))
        missing = reference_keys - locale_keys
        extra = locale_keys - reference_keys

        if missing:
            failed = True
            print(f"locale-parity: ✗ {path.name} is MISSING keys from {REFERENCE}:", file=sys.stderr)
            for key in sorted(missing):
                print(f"    missing: {key}", file=sys.stderr)
        if extra:
            print(f"locale-parity: ⚠ {path.name} has extra keys not in {REFERENCE} (non-fatal):", file=sys.stderr)
            for key in sorted(extra):
                print(f"    extra:   {key}", file=sys.stderr)

    if failed:
        print(
            "locale-parity: locale files are out of sync with en.json — this would "
            "break `next build` (type Messages = typeof en). Add the missing keys.",
            file=sys.stderr,
        )
        return 1

    print("locale-parity: ✓ all locale files match en.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
