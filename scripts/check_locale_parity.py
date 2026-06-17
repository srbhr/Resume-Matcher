#!/usr/bin/env python3
"""Verify every frontend locale file structurally matches ``en.json``.

The frontend declares ``type Messages = typeof en`` and
``const allMessages: Record<Locale, Messages>``, so a locale JSON that is
*missing* a key present in ``en.json`` — or that has a key of a *different shape*
(an object where ``en`` has a string, or vice versa) — makes ``tsc`` /
``next build`` fail. That is exactly the break that shipped to ``main`` and only
surfaced (post-merge) inside the Docker publish job — the incident that
motivated the testing work.

This check reproduces and prevents it with **pure stdlib** — no Node, npm, or
nvm — so it runs fast inside the local pre-push hook regardless of shell setup.

Exit code: 0 = all locales match; 1 = at least one locale is missing keys, has a
key whose shape (leaf vs. object) differs from ``en``, or is not valid JSON.
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


def _node_kind(value: Any) -> str:
    """Classify a JSON value by the type ``typeof en`` would infer for it.

    ``bool`` is checked before ``int`` because ``bool`` is a subclass of ``int``
    in Python (``isinstance(True, int)`` is ``True``).
    """
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if value is None:
        return "null"
    return "string"


def key_kinds(obj: Any, prefix: str = "") -> dict[str, str]:
    """Map every dotted key path to its JSON *kind* (object/array/string/number/…).

    Comparing *kinds* — not just key presence — is what catches a locale whose
    ``a.b`` is an object (or a number, or an array) where ``en`` has a string:
    the key path is still present, so a presence-only check passes, yet it still
    breaks ``next build`` because the locale is no longer assignable to
    ``typeof en``. Tracking the full JSON type (rather than a coarse
    branch/leaf) catches primitive/array mismatches too, and keeps this in lock-
    step with the frontend in-suite guard. Recursion descends into objects only
    (the only container these message files nest with).
    """
    kinds: dict[str, str] = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            path = f"{prefix}.{key}" if prefix else key
            kinds[path] = _node_kind(value)
            kinds.update(key_kinds(value, path))
    return kinds


def _load(path: Path) -> dict[str, Any]:
    """Parse a locale JSON file; raise ``ValueError`` with a clean message on bad JSON."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path.name} is not valid JSON: {exc}") from exc


def main(argv: list[str]) -> int:
    # Optional argv[1] overrides the messages dir (used by tests / the hook).
    messages_dir = Path(argv[1]).resolve() if len(argv) > 1 else MESSAGES_DIR

    reference_file = messages_dir / REFERENCE
    if not reference_file.exists():
        print(f"locale-parity: reference {reference_file} not found", file=sys.stderr)
        return 1

    try:
        reference_kinds = key_kinds(_load(reference_file))
    except ValueError as exc:
        print(f"locale-parity: ✗ {exc}", file=sys.stderr)
        return 1

    reference_paths = set(reference_kinds)
    failed = False

    for path in sorted(messages_dir.glob("*.json")):
        if path.name == REFERENCE:
            continue
        try:
            locale_kinds = key_kinds(_load(path))
        except ValueError as exc:
            failed = True
            print(f"locale-parity: ✗ {exc}", file=sys.stderr)
            continue

        locale_paths = set(locale_kinds)
        missing = reference_paths - locale_paths
        extra = locale_paths - reference_paths
        mismatched = {
            p
            for p in reference_paths & locale_paths
            if reference_kinds[p] != locale_kinds[p]
        }

        if missing:
            failed = True
            print(f"locale-parity: ✗ {path.name} is MISSING keys from {REFERENCE}:", file=sys.stderr)
            for key in sorted(missing):
                print(f"    missing: {key}", file=sys.stderr)
        if mismatched:
            failed = True
            print(
                f"locale-parity: ✗ {path.name} has keys whose JSON type differs "
                f"from {REFERENCE} — this breaks `next build`:",
                file=sys.stderr,
            )
            for key in sorted(mismatched):
                print(
                    f"    type-mismatch: {key} "
                    f"({REFERENCE}={reference_kinds[key]}, {path.name}={locale_kinds[key]})",
                    file=sys.stderr,
                )
        if extra:
            print(f"locale-parity: ⚠ {path.name} has extra keys not in {REFERENCE} (non-fatal):", file=sys.stderr)
            for key in sorted(extra):
                print(f"    extra:   {key}", file=sys.stderr)

    if failed:
        print(
            "locale-parity: locale files are out of sync with en.json — this would "
            "break `next build` (type Messages = typeof en). Fix the missing / "
            "mismatched keys.",
            file=sys.stderr,
        )
        return 1

    print("locale-parity: ✓ all locale files match en.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
