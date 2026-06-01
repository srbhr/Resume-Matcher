"""Anti-theater tests for ``scripts/check_locale_parity.py``.

That script is the node-free guard (run by the pre-push hook) for the i18n build
break: a locale JSON that does not structurally match ``en.json`` fails
``next build``. These tests prove the guard actually FIRES on the three failure
modes it must catch:

* a MISSING key,
* a leaf-vs-object SHAPE mismatch (the key path is present but its kind differs —
  the gap a presence-only check would let through; raised by cubic on PR #820),
* MALFORMED JSON (a clean exit 1, not a raw traceback),

and stays quiet (exit 0) when locales match. The script lives at the repo root,
outside the backend package, so it's loaded by file path.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

_SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "check_locale_parity.py"
_spec = importlib.util.spec_from_file_location("check_locale_parity", _SCRIPT)
assert _spec is not None and _spec.loader is not None
clp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(clp)


def _write(dir_path: Path, name: str, data: Any) -> None:
    (dir_path / name).write_text(json.dumps(data), encoding="utf-8")


@pytest.fixture
def messages_dir(tmp_path: Path) -> Path:
    # A non-trivial reference: a nested object plus leaves at two depths.
    _write(tmp_path, "en.json", {"a": {"b": "hi", "c": "yo"}, "d": "z"})
    return tmp_path


def test_passes_when_locale_matches(messages_dir: Path) -> None:
    _write(messages_dir, "es.json", {"a": {"b": "hola", "c": "ya"}, "d": "z"})
    assert clp.main(["prog", str(messages_dir)]) == 0


def test_fails_on_missing_key(messages_dir: Path) -> None:
    _write(messages_dir, "es.json", {"a": {"b": "hola"}, "d": "z"})  # missing a.c
    assert clp.main(["prog", str(messages_dir)]) == 1


def test_fails_on_leaf_vs_object_mismatch(messages_dir: Path) -> None:
    # a.b is a string in en but an object here: the key path a.b is still
    # present, so a presence-only diff PASSES — yet `next build` would fail.
    _write(messages_dir, "es.json", {"a": {"b": {"x": "deep"}, "c": "ya"}, "d": "z"})
    assert clp.main(["prog", str(messages_dir)]) == 1


def test_fails_on_object_vs_leaf_mismatch(messages_dir: Path) -> None:
    # The reverse: a (object in en) is a string here.
    _write(messages_dir, "es.json", {"a": "flat", "d": "z"})
    assert clp.main(["prog", str(messages_dir)]) == 1


def test_fails_on_malformed_json(messages_dir: Path) -> None:
    (messages_dir / "es.json").write_text("{ not valid json ", encoding="utf-8")
    assert clp.main(["prog", str(messages_dir)]) == 1


def test_extra_keys_are_non_fatal(messages_dir: Path) -> None:
    _write(messages_dir, "es.json", {"a": {"b": "hola", "c": "ya"}, "d": "z", "x": "ok"})
    assert clp.main(["prog", str(messages_dir)]) == 0
