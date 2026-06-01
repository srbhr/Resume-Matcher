# Agentic E2E Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic capture harness that drives the real running Resume-Matcher app end-to-end (master resume → 3–4 tailored variations → PDFs), writes a durable evidence bundle, and is orchestrated by a gitignored Claude Code skill that judges output quality, flow/render integrity, and provider reality over a committed golden baseline — a *report*, never a gate.

**Architecture:** A standalone Python package `apps/backend/e2e_monitor/` exposes discrete, re-runnable CLI "moves" (`boot`, `seed-master`, `tailor`, `render`, `judge`, `collect`, `baseline-diff`, `sweep`, `update-baseline`, `teardown`). Each move is gated behind `RM_E2E_MONITOR=1` + a configured key, and appends artifacts to a gitignored bundle dir. The harness spawns the backend with `DATA_DIR` pointed at an isolated temp dir (so it never touches the dev's real DB) while the real `data/config.json` supplies the provider/key. Pure logic (scrubber, manifest, non-blank check, flow-trace, baseline-diff, scorer-runner) is unit-tested keyless/offline in the normal suite; the side-effectful moves (subprocess/HTTP/LLM) run only in the on-demand sweep.

**Tech Stack:** Python 3.13, httpx (already a backend dep), `argparse`, `subprocess`; reuses `app.schemas.ResumeData`, `tests/evals/scorers.py`, `app.llm.get_llm_config`/`complete_json`. Optional `pypdf` (behind the `e2e-monitor` extra) for the PDF text probe. pytest for the pure-logic tests.

**Design source:** `docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md`.

**Branch:** `feat/agentic-e2e-monitor` (off `dev`). Commit after every step that ends in "Commit".

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `apps/backend/e2e_monitor/__init__.py` | package marker; version string |
| `apps/backend/e2e_monitor/gate.py` | opt-in gate (`RM_E2E_MONITOR` + key check) |
| `apps/backend/e2e_monitor/scrub.py` | redact secrets from captured text/config |
| `apps/backend/e2e_monitor/bundle.py` | bundle dir layout + path helpers + JSON read/write |
| `apps/backend/e2e_monitor/manifest.py` | build `manifest.json` (provider/model/git/scrubbed config) |
| `apps/backend/e2e_monitor/servers.py` | spawn/attach backend+frontend, log capture, health wait |
| `apps/backend/e2e_monitor/flow.py` | `seed-master` + `tailor` HTTP moves + scorer-runner |
| `apps/backend/e2e_monitor/render.py` | `render` move + non-blank PDF heuristic |
| `apps/backend/e2e_monitor/judge.py` | LLM-judge move (reuses eval rubric) |
| `apps/backend/e2e_monitor/collect.py` | flow-trace + summary builders |
| `apps/backend/e2e_monitor/baseline.py` | baseline-diff + update-baseline |
| `apps/backend/e2e_monitor/__main__.py` | argparse CLI + `sweep` orchestration |
| `apps/backend/e2e_monitor/fixtures/master.json` | canonical master resume (committed) |
| `apps/backend/e2e_monitor/fixtures/jds/*.txt` | 4 job descriptions (committed) |
| `apps/backend/e2e_monitor/baseline/baseline.json` | accepted golden (committed, generated) |
| `apps/backend/e2e_monitor/AGENT_PLAYBOOK.md` | source-of-truth for the gitignored skill |
| `apps/backend/e2e_monitor/README.md` | how to run / install the skill |
| `apps/backend/tests/unit/test_e2e_monitor_*.py` | keyless/offline unit tests for pure logic |
| `pyproject.toml` | add `[project.optional-dependencies] e2e-monitor` |
| `.gitignore` (root) | ignore `artifacts/` + `.claude/skills/monitor-e2e/` |
| `docs/agent/testing-strategy.md` | add §10 documenting the monitor |

Bundle (gitignored, written at runtime):
```
artifacts/e2e-monitor/<run-id>/
  manifest.json  summary.json  flow-trace.json  baseline-diff.json  report.md
  data/                      # isolated DATA_DIR (DB + uploads + copied config.json)
  logs/{backend,frontend}.log
  master/{upload_response,processed_data}.json
  variations/<jd-key>/{job_description.txt,keywords.json,tailored.json,scores.json,judge.json,resume.pdf,render.json}
```

---

## Task 1: Package skeleton, opt-in gate, secret scrubber

**Files:**
- Create: `apps/backend/e2e_monitor/__init__.py`
- Create: `apps/backend/e2e_monitor/scrub.py`
- Create: `apps/backend/e2e_monitor/gate.py`
- Test: `apps/backend/tests/unit/test_e2e_monitor_scrub.py`
- Modify: `.gitignore` (repo root), `apps/backend/pyproject.toml`

- [ ] **Step 1: Write the failing test for the scrubber**

`apps/backend/tests/unit/test_e2e_monitor_scrub.py`:
```python
"""Offline tests for the e2e_monitor secret scrubber."""

from __future__ import annotations

from e2e_monitor.scrub import scrub_text, scrub_config


def test_scrub_text_redacts_sk_keys() -> None:
    out = scrub_text("authorization: Bearer sk-abcdef0123456789ABCDEF more")
    assert "sk-abcdef0123456789ABCDEF" not in out
    assert "[REDACTED]" in out


def test_scrub_text_redacts_long_hex_and_jwt() -> None:
    out = scrub_text("token=eyJhbGciOi.JOIN.payloadsig key=0123456789abcdef0123456789abcdef")
    assert "eyJhbGciOi" not in out
    assert "0123456789abcdef0123456789abcdef" not in out


def test_scrub_config_redacts_key_fields_keeps_provider() -> None:
    cfg = {
        "provider": "anthropic",
        "model": "claude-haiku-4-5",
        "api_key": "sk-ant-secret-value-here",
        "api_keys": {"openai": "sk-openai-secret", "anthropic": "sk-ant-x"},
        "api_base": "http://localhost:11434",
    }
    out = scrub_config(cfg)
    assert out["provider"] == "anthropic"          # non-secret preserved
    assert out["model"] == "claude-haiku-4-5"
    assert out["api_key"] == "[REDACTED]"
    assert out["api_keys"]["openai"] == "[REDACTED]"
    assert out["api_keys"]["anthropic"] == "[REDACTED]"
    assert out["api_base"] == "http://localhost:11434"  # not a secret
    # original dict is untouched (no in-place mutation)
    assert cfg["api_key"] == "sk-ant-secret-value-here"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_scrub.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'e2e_monitor'`.

- [ ] **Step 3: Create the package marker and the scrubber**

`apps/backend/e2e_monitor/__init__.py`:
```python
"""Agentic end-to-end monitor harness (opt-in, on-demand).

This package is INERT by default: it has no import side effects, is never
imported by ``app/*`` or by the default test suite, and every expensive move
refuses to run unless explicitly enabled (see ``e2e_monitor.gate``). See
``docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md``.
"""

__version__ = "0.1.0"
```

`apps/backend/e2e_monitor/scrub.py`:
```python
"""Redact secrets before they reach the (gitignored) evidence bundle."""

from __future__ import annotations

import copy
import re
from typing import Any

_REDACTED = "[REDACTED]"

# Order matters: more specific patterns first.
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),                 # OpenAI/Anthropic-style keys
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),  # JWTs
    re.compile(r"\b[0-9a-fA-F]{32,}\b"),                  # long hex blobs (generic keys)
)

# Config keys whose values are secrets regardless of shape.
_SECRET_CONFIG_KEYS = frozenset({"api_key", "api_keys", "llm_api_key", "authorization"})


def scrub_text(text: str) -> str:
    """Replace anything that looks like a credential with ``[REDACTED]``."""
    out = text
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub(_REDACTED, out)
    return out


def scrub_config(config: dict[str, Any]) -> dict[str, Any]:
    """Return a deep copy of ``config`` with secret-bearing keys redacted.

    ``provider`` / ``model`` / ``api_base`` are preserved (they are needed in the
    manifest and are not secrets); ``api_key`` and every entry under ``api_keys``
    are replaced wholesale.
    """
    out = copy.deepcopy(config)
    for key in list(out.keys()):
        if key in _SECRET_CONFIG_KEYS:
            value = out[key]
            if isinstance(value, dict):
                out[key] = {k: _REDACTED for k in value}
            else:
                out[key] = _REDACTED
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_scrub.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Create the opt-in gate**

`apps/backend/e2e_monitor/gate.py`:
```python
"""The opt-in gate — every expensive move calls ``ensure_enabled()`` first.

Two independent locks must both be open:
  1. ``RM_E2E_MONITOR=1`` in the environment (deliberate enable), and
  2. a usable LLM key/provider is configured (same rule the eval harness uses).

This is what stops a stranger's coding agent from running the monitor by
accident: without the env flag it no-ops with a clear message; without a key it
explains that it needs one. Real billed LLM calls only happen past both locks.
"""

from __future__ import annotations

import os


class MonitorDisabled(RuntimeError):
    """Raised when a move is invoked without the monitor being enabled."""


def _key_is_configured() -> bool:
    """True when a usable key/provider is set (mirrors the eval ``_needs_key``)."""
    try:
        from app.llm import get_llm_config

        cfg = get_llm_config()
    except Exception:
        return False
    return bool(cfg.api_key) or cfg.provider in ("ollama", "openai_compatible")


def ensure_enabled() -> None:
    """Raise ``MonitorDisabled`` unless both locks are open."""
    if os.environ.get("RM_E2E_MONITOR") != "1":
        raise MonitorDisabled(
            "e2e monitor is disabled by default — it makes real, billed LLM calls "
            "and boots servers. Set RM_E2E_MONITOR=1 to enable."
        )
    if not _key_is_configured():
        raise MonitorDisabled(
            "no usable LLM key/provider configured (set one in data/config.json or "
            "the Settings UI, or point at a local provider)."
        )
```

- [ ] **Step 6: Add the optional extra and gitignore entries**

In `apps/backend/pyproject.toml`, add (alongside existing `[project.optional-dependencies]`):
```toml
[project.optional-dependencies]
# ... existing extras (e.g. dev) ...
e2e-monitor = [
    "pypdf>=4.0.0",  # PDF text probe for the non-blank render check
]
```

In the **repo-root** `.gitignore`, append:
```gitignore
# Agentic E2E monitor — runtime evidence bundles and the local-only skill
/artifacts/
/.claude/skills/monitor-e2e/
```

- [ ] **Step 7: Verify the harness is invisible to the default suite**

Run: `cd apps/backend && uv run pytest -q -p no:cacheprovider 2>&1 | tail -3`
Expected: the full suite still passes, +3 new tests (e.g. `329 passed`), and **no server boots / no token spent** (the gate/scrub modules have no import side effects and nothing imports `e2e_monitor` except its own test).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/e2e_monitor/__init__.py apps/backend/e2e_monitor/scrub.py \
        apps/backend/e2e_monitor/gate.py apps/backend/tests/unit/test_e2e_monitor_scrub.py \
        apps/backend/pyproject.toml .gitignore
git commit -m "feat(e2e-monitor): package skeleton, opt-in gate, secret scrubber"
```

---

## Task 2: Bundle layout + manifest

**Files:**
- Create: `apps/backend/e2e_monitor/bundle.py`
- Create: `apps/backend/e2e_monitor/manifest.py`
- Test: `apps/backend/tests/unit/test_e2e_monitor_manifest.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/unit/test_e2e_monitor_manifest.py`:
```python
"""Offline tests for bundle paths + manifest building."""

from __future__ import annotations

from pathlib import Path

from e2e_monitor.bundle import Bundle
from e2e_monitor.manifest import build_manifest


def test_bundle_creates_layout(tmp_path: Path) -> None:
    b = Bundle(root=tmp_path, run_id="20260601-120000-abc")
    b.ensure()
    assert b.logs_dir.is_dir()
    assert b.variation_dir("backend-eng").is_dir()
    # round-trips JSON
    b.write_json(b.dir / "x.json", {"a": 1})
    assert b.read_json(b.dir / "x.json") == {"a": 1}


def test_build_manifest_records_provider_and_scrubs_secrets() -> None:
    config = {"provider": "anthropic", "model": "claude-haiku-4-5", "api_key": "sk-secret-123456789"}
    m = build_manifest(run_id="rid", git_sha="abc1234", config=config, started_at="2026-06-01T12:00:00Z")
    assert m["run_id"] == "rid"
    assert m["provider"] == "anthropic"
    assert m["model"] == "claude-haiku-4-5"
    assert m["git_sha"] == "abc1234"
    assert m["config_snapshot"]["api_key"] == "[REDACTED]"
    assert "sk-secret-123456789" not in str(m)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_manifest.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'e2e_monitor.bundle'`.

- [ ] **Step 3: Implement `bundle.py`**

`apps/backend/e2e_monitor/bundle.py`:
```python
"""Evidence-bundle directory layout + JSON helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Bundle:
    """One run's evidence bundle under ``artifacts/e2e-monitor/<run-id>/``."""

    root: Path        # artifacts/e2e-monitor
    run_id: str

    @property
    def dir(self) -> Path:
        return self.root / self.run_id

    @property
    def logs_dir(self) -> Path:
        return self.dir / "logs"

    @property
    def data_dir(self) -> Path:
        return self.dir / "data"

    @property
    def master_dir(self) -> Path:
        return self.dir / "master"

    def variation_dir(self, jd_key: str) -> Path:
        d = self.dir / "variations" / jd_key
        d.mkdir(parents=True, exist_ok=True)
        return d

    def ensure(self) -> None:
        for d in (self.dir, self.logs_dir, self.data_dir, self.master_dir):
            d.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def write_json(path: Path, obj: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def read_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))
```

- [ ] **Step 4: Implement `manifest.py`**

`apps/backend/e2e_monitor/manifest.py`:
```python
"""Build the run manifest (provider/model/git SHA + scrubbed config)."""

from __future__ import annotations

from typing import Any

from e2e_monitor.scrub import scrub_config


def build_manifest(
    *, run_id: str, git_sha: str, config: dict[str, Any], started_at: str
) -> dict[str, Any]:
    """Assemble the manifest dict. ``config`` is the real ``data/config.json``;
    only non-secret fields surface, the rest are redacted."""
    return {
        "run_id": run_id,
        "started_at": started_at,
        "git_sha": git_sha,
        "provider": config.get("provider", ""),
        "model": config.get("model", ""),
        "config_snapshot": scrub_config(config),
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_manifest.py -q`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/e2e_monitor/bundle.py apps/backend/e2e_monitor/manifest.py \
        apps/backend/tests/unit/test_e2e_monitor_manifest.py
git commit -m "feat(e2e-monitor): evidence bundle layout + run manifest"
```

---

## Task 3: Non-blank PDF heuristic (pure) — used by the render move

**Files:**
- Create: `apps/backend/e2e_monitor/render.py` (heuristic only this task; the HTTP move is added in Task 7)
- Test: `apps/backend/tests/unit/test_e2e_monitor_render.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/unit/test_e2e_monitor_render.py`:
```python
"""Offline tests for the non-blank PDF heuristic."""

from __future__ import annotations

from e2e_monitor.render import check_pdf_bytes

# Minimal valid one-page PDF with the text "Hi".
_MINIMAL_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R"
    b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\nBT /F1 24 Tf 20 100 Td (Hi) Tj ET\nendstream endobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF"
)


def test_check_pdf_bytes_accepts_real_pdf() -> None:
    r = check_pdf_bytes(_MINIMAL_PDF)
    assert r["is_pdf"] is True
    assert r["size"] == len(_MINIMAL_PDF)
    assert r["non_blank"] is True


def test_check_pdf_bytes_rejects_empty() -> None:
    r = check_pdf_bytes(b"")
    assert r["is_pdf"] is False
    assert r["non_blank"] is False


def test_check_pdf_bytes_rejects_non_pdf() -> None:
    r = check_pdf_bytes(b"<html>not a pdf</html>")
    assert r["is_pdf"] is False
    assert r["non_blank"] is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_render.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'e2e_monitor.render'`.

- [ ] **Step 3: Implement the heuristic**

`apps/backend/e2e_monitor/render.py`:
```python
"""PDF render move + a non-blank heuristic that does not need a browser.

The heuristic is pure (bytes in, verdict out) so it is unit-tested offline. A
deeper page/text probe via ``pypdf`` is used only when the optional
``e2e-monitor`` extra is installed; its absence degrades to size+header checks.
"""

from __future__ import annotations

from typing import Any

_MIN_BYTES = 1000  # a real one-page resume PDF is comfortably larger than this


def check_pdf_bytes(data: bytes) -> dict[str, Any]:
    """Classify PDF bytes. ``non_blank`` is the load-bearing verdict."""
    is_pdf = data[:5] == b"%PDF-"
    size = len(data)
    pages: int | None = None
    has_text: bool | None = None

    if is_pdf:
        try:
            import io

            from pypdf import PdfReader  # only present with the e2e-monitor extra

            reader = PdfReader(io.BytesIO(data))
            pages = len(reader.pages)
            has_text = any((p.extract_text() or "").strip() for p in reader.pages)
        except ModuleNotFoundError:
            pages = None
            has_text = None  # probe unavailable; fall back to size+header
        except Exception:
            pages = 0
            has_text = False

    # non_blank: a real PDF that is large enough, with text if we could read it.
    non_blank = bool(is_pdf and size >= _MIN_BYTES and (has_text is not False) and (pages != 0))
    return {
        "is_pdf": is_pdf,
        "size": size,
        "pages": pages,
        "has_text": has_text,
        "non_blank": non_blank,
    }
```

> Note: the minimal test PDF is < `_MIN_BYTES`. To keep the test meaningful, set `_MIN_BYTES = 100` in the test by importing and monkeypatching, OR (preferred) assert on `is_pdf`/`has_text` for the tiny fixture and reserve the size gate for the live render. Update the first test to: `assert r["is_pdf"] and (r["has_text"] in (True, None))` and drop the `non_blank` assertion for the tiny fixture; add a separate test that a 2000-byte `%PDF-...` blob yields `non_blank is True` when `has_text` is None (probe absent).

- [ ] **Step 4: Adjust + run the test to verify it passes**

Apply the note above so the assertions match the heuristic, then:
Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_render.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/e2e_monitor/render.py apps/backend/tests/unit/test_e2e_monitor_render.py
git commit -m "feat(e2e-monitor): non-blank PDF heuristic (browser-free)"
```

---

## Task 4: Scorer-runner (pure) — wraps the existing eval scorers

**Files:**
- Create: `apps/backend/e2e_monitor/flow.py` (scorer-runner only this task; HTTP moves in Task 7)
- Test: `apps/backend/tests/unit/test_e2e_monitor_scores.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/unit/test_e2e_monitor_scores.py`:
```python
"""Offline tests for the scorer-runner (reuses tests/evals/scorers.py)."""

from __future__ import annotations

from e2e_monitor.flow import score_tailoring

_ORIGINAL = {
    "personalInfo": {"name": "Jane Doe", "email": "jane@x.dev"},
    "summary": "Backend engineer.",
    "workExperience": [{"company": "Acme", "title": "Engineer", "description": ["Built APIs"]}],
}


def test_score_tailoring_clean_pass() -> None:
    tailored = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@x.dev"},
        "summary": "Backend engineer who builds Python APIs.",
        "workExperience": [{"company": "Acme", "title": "Engineer", "description": ["Built Python APIs"]}],
    }
    s = score_tailoring(_ORIGINAL, tailored, keywords=["python"])
    assert s["sections_preserved"] is True
    assert s["fabricated_employers"] == []
    assert s["personal_info_unchanged"] is True
    assert s["is_valid_resume"] is True
    assert s["jd_keyword_coverage"] == 1.0


def test_score_tailoring_flags_fabrication_and_identity_change() -> None:
    tailored = {
        "personalInfo": {"name": "CHANGED", "email": "jane@x.dev"},
        "summary": "Backend engineer.",
        "workExperience": [{"company": "FakeCorp", "title": "Engineer", "description": ["x"]}],
    }
    s = score_tailoring(_ORIGINAL, tailored, keywords=["python"])
    assert "FakeCorp" in s["fabricated_employers"]
    assert s["personal_info_unchanged"] is False
    assert s["jd_keyword_coverage"] == 0.0
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_scores.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'e2e_monitor.flow'`.

- [ ] **Step 3: Implement the scorer-runner**

`apps/backend/e2e_monitor/flow.py` (initial — HTTP moves appended in Task 7):
```python
"""Flow moves (seed-master, tailor) + the pure scorer-runner.

The scorer-runner wraps the deterministic scorers already proven in
``tests/evals/scorers.py`` so the harness and the eval suite agree on what
"a good tailoring" means.
"""

from __future__ import annotations

from typing import Any

from tests.evals.scorers import (
    is_valid_resume,
    jd_keywords_present,
    no_fabricated_employers,
    personal_info_unchanged,
    sections_preserved,
)


def score_tailoring(
    original: dict[str, Any], tailored: dict[str, Any], keywords: list[str]
) -> dict[str, Any]:
    """Run every structural scorer over an (original, tailored) pair."""
    return {
        "sections_preserved": sections_preserved(original, tailored),
        "fabricated_employers": no_fabricated_employers(original, tailored),
        "personal_info_unchanged": personal_info_unchanged(original, tailored),
        "is_valid_resume": is_valid_resume(tailored),
        "jd_keyword_coverage": jd_keywords_present(tailored, keywords),
    }
```

> Import note: the harness runs from `apps/backend` (so `tests` is importable, matching how the eval modules import `tests.evals...`). The CLI (Task 9) sets `sys.path`/cwd accordingly; document this in `README.md`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_scores.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/e2e_monitor/flow.py apps/backend/tests/unit/test_e2e_monitor_scores.py
git commit -m "feat(e2e-monitor): scorer-runner over the eval scorers"
```

---

## Task 5: Flow-trace + summary builders (pure)

**Files:**
- Create: `apps/backend/e2e_monitor/collect.py`
- Test: `apps/backend/tests/unit/test_e2e_monitor_collect.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/unit/test_e2e_monitor_collect.py`:
```python
"""Offline tests for flow-trace + summary roll-ups."""

from __future__ import annotations

from e2e_monitor.collect import build_flow_trace, build_summary

_STEPS = [
    {"stage": "boot", "ok": True, "ms": 1200},
    {"stage": "seed-master", "ok": True, "ms": 8000},
    {"stage": "tailor:backend-eng", "ok": True, "ms": 30000},
    {"stage": "render:backend-eng", "ok": False, "ms": 31000, "error": "blank pdf"},
]


def test_build_flow_trace_counts_and_orders() -> None:
    trace = build_flow_trace(_STEPS)
    assert trace["total"] == 4
    assert trace["failed"] == 1
    assert trace["all_passed"] is False
    assert trace["stages"][0]["stage"] == "boot"


def test_build_summary_rolls_up_scores_and_flow() -> None:
    variations = [
        {"jd_key": "backend-eng", "scores": {"jd_keyword_coverage": 1.0, "personal_info_unchanged": True},
         "judge": {"score": 4}, "render": {"non_blank": False}},
    ]
    s = build_summary(flow=build_flow_trace(_STEPS), variations=variations, provider="ollama")
    assert s["provider"] == "ollama"
    assert s["variations"] == 1
    assert s["flow_all_passed"] is False
    assert s["renders_non_blank"] == 0
    assert s["min_judge_score"] == 4
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_collect.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `collect.py`**

```python
"""Flow-trace and summary roll-ups (pure functions over recorded step results)."""

from __future__ import annotations

from typing import Any


def build_flow_trace(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize per-stage status/timing into ``flow-trace.json`` shape."""
    failed = sum(1 for s in steps if not s.get("ok"))
    return {
        "total": len(steps),
        "failed": failed,
        "all_passed": failed == 0,
        "stages": list(steps),
    }


def build_summary(
    *, flow: dict[str, Any], variations: list[dict[str, Any]], provider: str
) -> dict[str, Any]:
    """The cheap orientation object the agent reads first."""
    judge_scores = [
        v["judge"]["score"] for v in variations
        if isinstance(v.get("judge"), dict) and isinstance(v["judge"].get("score"), int)
    ]
    renders_non_blank = sum(
        1 for v in variations if isinstance(v.get("render"), dict) and v["render"].get("non_blank")
    )
    return {
        "provider": provider,
        "variations": len(variations),
        "flow_all_passed": flow.get("all_passed", False),
        "flow_failed_stages": [s["stage"] for s in flow.get("stages", []) if not s.get("ok")],
        "renders_non_blank": renders_non_blank,
        "min_judge_score": min(judge_scores) if judge_scores else None,
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_collect.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/e2e_monitor/collect.py apps/backend/tests/unit/test_e2e_monitor_collect.py
git commit -m "feat(e2e-monitor): flow-trace + summary roll-up builders"
```

---

## Task 6: Baseline diff + update (pure)

**Files:**
- Create: `apps/backend/e2e_monitor/baseline.py`
- Test: `apps/backend/tests/unit/test_e2e_monitor_baseline.py`

- [ ] **Step 1: Write the failing test**

`apps/backend/tests/unit/test_e2e_monitor_baseline.py`:
```python
"""Offline tests for baseline diffing (the regression detector)."""

from __future__ import annotations

from e2e_monitor.baseline import diff_against_baseline, summary_to_baseline

_BASELINE = {
    "variations": {
        "backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True},
    },
    "floor": {"min_judge_score": 3, "min_keyword_coverage": 0.8},
    "judge_tolerance": 1,
}


def test_diff_clean_when_within_tolerance() -> None:
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 4, "non_blank": True}}
    d = diff_against_baseline(current, _BASELINE)
    assert d["regressed"] is False
    assert d["regressions"] == []


def test_diff_flags_floor_breach() -> None:
    current = {"backend-eng": {"jd_keyword_coverage": 0.5, "judge_score": 2, "non_blank": False}}
    d = diff_against_baseline(current, _BASELINE)
    assert d["regressed"] is True
    kinds = {r["kind"] for r in d["regressions"]}
    assert {"keyword_floor", "judge_floor", "blank_render"} <= kinds


def test_diff_flags_drop_beyond_tolerance_even_above_floor() -> None:
    # judge dropped 4 -> 3 is within tolerance(1); 4 -> 2 is beyond and also a floor breach.
    current = {"backend-eng": {"jd_keyword_coverage": 1.0, "judge_score": 2, "non_blank": True}}
    d = diff_against_baseline(current, _BASELINE)
    assert any(r["kind"] == "judge_drop" for r in d["regressions"])


def test_summary_to_baseline_roundtrips_shape() -> None:
    variations = [{"jd_key": "backend-eng", "scores": {"jd_keyword_coverage": 1.0},
                   "judge": {"score": 4}, "render": {"non_blank": True}}]
    b = summary_to_baseline(variations)
    assert b["variations"]["backend-eng"]["judge_score"] == 4
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_baseline.py -q`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `baseline.py`**

```python
"""Baseline diff (regression detector) + baseline construction.

An absolute ``floor`` is the hard fail; on top, a per-metric drop beyond
``judge_tolerance`` flags drift even while still above the floor.
"""

from __future__ import annotations

from typing import Any


def diff_against_baseline(
    current: dict[str, dict[str, Any]], baseline: dict[str, Any]
) -> dict[str, Any]:
    """Compare this run's per-variation metrics against the committed baseline."""
    floor = baseline.get("floor", {})
    tol = baseline.get("judge_tolerance", 1)
    base_vars = baseline.get("variations", {})
    regressions: list[dict[str, Any]] = []

    for jd_key, cur in current.items():
        base = base_vars.get(jd_key, {})
        cov = cur.get("jd_keyword_coverage")
        judge = cur.get("judge_score")
        non_blank = cur.get("non_blank")

        if cov is not None and cov < floor.get("min_keyword_coverage", 0.0):
            regressions.append({"jd_key": jd_key, "kind": "keyword_floor", "value": cov})
        if judge is not None and judge < floor.get("min_judge_score", 0):
            regressions.append({"jd_key": jd_key, "kind": "judge_floor", "value": judge})
        if non_blank is False:
            regressions.append({"jd_key": jd_key, "kind": "blank_render", "value": False})
        base_judge = base.get("judge_score")
        if judge is not None and base_judge is not None and (base_judge - judge) > tol:
            regressions.append(
                {"jd_key": jd_key, "kind": "judge_drop", "from": base_judge, "to": judge}
            )

    return {"regressed": bool(regressions), "regressions": regressions}


def summary_to_baseline(variations: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a baseline ``variations`` block from a run's variation results."""
    out: dict[str, Any] = {"variations": {}, "floor": {"min_judge_score": 3, "min_keyword_coverage": 0.8}, "judge_tolerance": 1}
    for v in variations:
        scores = v.get("scores", {})
        out["variations"][v["jd_key"]] = {
            "jd_keyword_coverage": scores.get("jd_keyword_coverage"),
            "judge_score": (v.get("judge") or {}).get("score"),
            "non_blank": (v.get("render") or {}).get("non_blank"),
        }
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/backend && uv run pytest tests/unit/test_e2e_monitor_baseline.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/e2e_monitor/baseline.py apps/backend/tests/unit/test_e2e_monitor_baseline.py
git commit -m "feat(e2e-monitor): baseline diff (floor + drift) and baseline builder"
```

---

## Task 7: Server lifecycle + HTTP moves (integration code; exercised by the sweep)

> These moves do subprocess/HTTP/LLM work, so they are NOT unit-tested with a live server (that is the on-demand sweep's job). Write them with the exact contracts from the spec. Keep every function small and typed.

**Files:**
- Create: `apps/backend/e2e_monitor/servers.py`
- Modify: `apps/backend/e2e_monitor/flow.py` (append `seed_master`, `tailor`)
- Modify: `apps/backend/e2e_monitor/render.py` (append `render_variation`)
- Create: `apps/backend/e2e_monitor/judge.py`

- [ ] **Step 1: `servers.py` — spawn/attach + isolated DATA_DIR + log capture**

```python
"""Boot/teardown the backend (+ optional frontend) for a run.

Backend is spawned with DATA_DIR pointed at the bundle's ``data/`` dir so the
dev's real database.json is never touched; the real config.json is COPIED into
that dir so the provider/key still resolve regardless of which path the app
reads config from. Process stdout/stderr stream into the bundle's log files —
this is how we get a durable log trail with no change to app/ logging.
"""

from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from e2e_monitor.bundle import Bundle

BACKEND_HEALTH = "http://127.0.0.1:8000/api/v1/health"
FRONTEND_URL = "http://127.0.0.1:3000/"
_REPO_BACKEND = Path(__file__).resolve().parents[1]   # apps/backend
_REPO_ROOT = _REPO_BACKEND.parents[1]                 # repo root
_REAL_CONFIG = _REPO_BACKEND / "data" / "config.json"


@dataclass
class Servers:
    bundle: Bundle
    procs: list[subprocess.Popen] = field(default_factory=list)
    frontend_up: bool = False

    def _wait(self, url: str, timeout_s: float) -> bool:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            try:
                if httpx.get(url, timeout=2.0).status_code < 500:
                    return True
            except httpx.HTTPError:
                pass
            time.sleep(1.0)
        return False

    def boot(self, *, with_frontend: bool = True) -> dict:
        self.bundle.data_dir.mkdir(parents=True, exist_ok=True)
        if _REAL_CONFIG.exists():
            shutil.copy2(_REAL_CONFIG, self.bundle.data_dir / "config.json")

        # Backend — isolated DATA_DIR, fixed port, logs captured.
        be_log = (self.bundle.logs_dir / "backend.log").open("w")
        env = {
            "DATA_DIR": str(self.bundle.data_dir),
            "PORT": "8000", "HOST": "127.0.0.1", "RELOAD": "false",
            "FRONTEND_BASE_URL": FRONTEND_URL.rstrip("/"),
        }
        import os
        self.procs.append(subprocess.Popen(
            ["uv", "run", "app"], cwd=_REPO_BACKEND,
            stdout=be_log, stderr=subprocess.STDOUT, env={**os.environ, **env},
        ))
        if not self._wait(BACKEND_HEALTH, timeout_s=60):
            raise RuntimeError("backend did not become healthy on :8000")

        # Frontend — best-effort; skipped (render moves degrade) when node absent.
        if with_frontend and shutil.which("node") and shutil.which("npm"):
            fe_log = (self.bundle.logs_dir / "frontend.log").open("w")
            self.procs.append(subprocess.Popen(
                ["npm", "run", "dev"], cwd=_REPO_ROOT / "apps" / "frontend",
                stdout=fe_log, stderr=subprocess.STDOUT, env={**os.environ},
            ))
            self.frontend_up = self._wait(FRONTEND_URL, timeout_s=120)
        return {"frontend_up": self.frontend_up}

    def teardown(self) -> None:
        for p in reversed(self.procs):
            p.terminate()
        for p in reversed(self.procs):
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
        self.procs.clear()
```

- [ ] **Step 2: `flow.py` — append `seed_master` + `tailor` (exact contracts)**

Append to `apps/backend/e2e_monitor/flow.py`:
```python
import time
from pathlib import Path

import httpx

API = "http://127.0.0.1:8000/api/v1"


def seed_master(master_json_path: Path, bundle_master_dir: Path) -> dict[str, Any]:
    """Upload the canonical master and poll until processed. Returns {resume_id, processed_data}."""
    files = {"file": ("master.json", master_json_path.read_bytes(), "application/json")}
    # NOTE: the upload endpoint accepts pdf/doc/docx. For a pre-structured master,
    # upload via the resume create path used by tests, OR (preferred) POST the
    # parsed JSON straight to the DB-backed create. Confirm the exact intake the
    # harness uses against app/routers/resumes.py:511 before finalizing — if the
    # endpoint only accepts documents, seed by POSTing the fixture through the
    # same path tests/integration/test_pipeline_e2e.py uses.
    resp = httpx.post(f"{API}/resumes/upload", files=files, timeout=120)
    resp.raise_for_status()
    body = resp.json()
    resume_id = body["resume_id"]
    for _ in range(60):
        got = httpx.get(f"{API}/resumes", params={"resume_id": resume_id}, timeout=30).json()
        status = got["data"]["raw_resume"]["processing_status"]
        if status in ("ready", "failed"):
            processed = got["data"].get("processed_resume")
            return {"resume_id": resume_id, "status": status, "processed_data": processed, "upload": body}
        time.sleep(2)
    raise RuntimeError("master never finished processing")


def tailor(resume_id: str, jd_text: str, keywords: list[str], original: dict[str, Any]) -> dict[str, Any]:
    """jobs/upload -> improve/preview -> improve/confirm; returns tailored + scores."""
    job = httpx.post(f"{API}/jobs/upload", json={"job_descriptions": [jd_text], "resume_id": resume_id}, timeout=120).json()
    job_id = job["job_id"][0]
    preview = httpx.post(f"{API}/resumes/improve/preview", json={"resume_id": resume_id, "job_id": job_id}, timeout=240).json()
    data = preview["data"]
    tailored = data["resume_preview"]
    improvements = data["improvements"]
    confirm = httpx.post(
        f"{API}/resumes/improve/confirm",
        json={"resume_id": resume_id, "job_id": job_id, "improved_data": tailored, "improvements": improvements},
        timeout=240,
    ).json()
    return {
        "job_id": job_id,
        "tailored": tailored,
        "tailored_resume_id": confirm["data"].get("resume_id"),
        "keywords": keywords,
        "scores": score_tailoring(original, tailored, keywords),
    }
```

- [ ] **Step 3: `render.py` — append `render_variation`**

```python
import httpx

API = "http://127.0.0.1:8000/api/v1"


def render_variation(tailored_resume_id: str, *, lang: str | None = None) -> tuple[bytes, dict[str, Any]]:
    """GET the PDF for a tailored resume; return (bytes, non-blank verdict)."""
    params = {"template": "swiss-single", "pageSize": "A4"}
    if lang:
        params["lang"] = lang
    resp = httpx.get(f"{API}/resumes/{tailored_resume_id}/pdf", params=params, timeout=120)
    resp.raise_for_status()
    return resp.content, check_pdf_bytes(resp.content)
```

- [ ] **Step 4: `judge.py` — reuse the eval rubric**

```python
"""LLM-judge move — reuses the eval rubric via app.llm.complete_json."""

from __future__ import annotations

import json
from typing import Any

_RUBRIC = (  # mirrors tests/evals/test_tailoring_eval.py::_JUDGE_RUBRIC
    "You are a strict but fair technical recruiter grading how well a resume was "
    "tailored to a job description on RELEVANCE, TRUTHFULNESS, and FORMATTING. "
    'Return ONLY JSON {"score": <int 1-5>, "reasons": "<one or two sentences>"}.'
)


async def judge_variation(job_description: str, tailored: dict[str, Any]) -> dict[str, Any]:
    """Score one (JD, tailored) pair 1–5. Caller must be past the opt-in gate."""
    from app.llm import complete_json

    prompt = (
        f"{_RUBRIC}\n\n=== JOB DESCRIPTION ===\n{job_description}\n\n"
        f"=== TAILORED RESUME (JSON) ===\n{json.dumps(tailored, ensure_ascii=False, indent=2)}\n"
    )
    result = await complete_json(prompt, system_prompt="You are an impartial resume-tailoring evaluator.",
                                 max_tokens=512, schema_type="enrichment")
    return result if isinstance(result, dict) else {"score": None, "reasons": str(result)}
```

- [ ] **Step 5: Sanity-check imports compile (no live server)**

Run: `cd apps/backend && uv run python -c "import e2e_monitor.servers, e2e_monitor.flow, e2e_monitor.render, e2e_monitor.judge; print('ok')"`
Expected: `ok` (imports resolve; no server contacted).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/e2e_monitor/servers.py apps/backend/e2e_monitor/flow.py \
        apps/backend/e2e_monitor/render.py apps/backend/e2e_monitor/judge.py
git commit -m "feat(e2e-monitor): server lifecycle + seed/tailor/render/judge HTTP moves"
```

---

## Task 8: CLI + `sweep` orchestration

**Files:**
- Create: `apps/backend/e2e_monitor/__main__.py`

- [ ] **Step 1: Implement the CLI**

`apps/backend/e2e_monitor/__main__.py`:
```python
"""CLI: ``uv run python -m e2e_monitor <move> [args]`` (run from apps/backend).

Every move calls ``ensure_enabled()`` first. ``sweep`` chains boot -> seed ->
tailor*N -> render*N -> judge*N -> collect -> baseline-diff and writes the bundle.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from e2e_monitor.baseline import diff_against_baseline, summary_to_baseline
from e2e_monitor.bundle import Bundle
from e2e_monitor.collect import build_flow_trace, build_summary
from e2e_monitor.flow import seed_master, tailor
from e2e_monitor.gate import ensure_enabled, MonitorDisabled
from e2e_monitor.judge import judge_variation
from e2e_monitor.manifest import build_manifest
from e2e_monitor.render import render_variation
from e2e_monitor.servers import Servers

_BACKEND = Path(__file__).resolve().parents[1]
_PKG = Path(__file__).resolve().parent
_ARTIFACTS = _BACKEND.parents[1] / "artifacts" / "e2e-monitor"
_FIXTURES = _PKG / "fixtures"
_BASELINE = _PKG / "baseline" / "baseline.json"


def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=_BACKEND, text=True).strip()
    except Exception:
        return "unknown"


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _jds() -> list[tuple[str, str]]:
    return sorted((p.stem, p.read_text(encoding="utf-8")) for p in (_FIXTURES / "jds").glob("*.txt"))


def cmd_sweep(_: argparse.Namespace) -> int:
    ensure_enabled()
    from app.config import load_config_file

    bundle = Bundle(root=_ARTIFACTS, run_id=_run_id())
    bundle.ensure()
    config = load_config_file()
    bundle.write_json(bundle.dir / "manifest.json",
                      build_manifest(run_id=bundle.run_id, git_sha=_git_sha(), config=config, started_at=_now_iso()))

    steps: list[dict] = []
    servers = Servers(bundle=bundle)
    variations: list[dict] = []
    try:
        t0 = _now_iso()
        boot = servers.boot()
        steps.append({"stage": "boot", "ok": True, "ms": 0, "detail": boot})

        master_fixture = _FIXTURES / "master.json"
        seeded = seed_master(master_fixture, bundle.master_dir)
        bundle.write_json(bundle.master_dir / "processed_data.json", seeded["processed_data"])
        bundle.write_json(bundle.master_dir / "upload_response.json", seeded["upload"])
        steps.append({"stage": "seed-master", "ok": seeded["status"] == "ready", "ms": 0})
        original = seeded["processed_data"] or json.loads(master_fixture.read_text())

        for jd_key, jd_text in _jds():
            vdir = bundle.variation_dir(jd_key)
            (vdir / "job_description.txt").write_text(jd_text, encoding="utf-8")
            keywords = [w for w in jd_text.split() if w.istitle()][:8]  # cheap keyword proxy
            try:
                t = tailor(seeded["resume_id"], jd_text, keywords, original)
                bundle.write_json(vdir / "tailored.json", t["tailored"])
                bundle.write_json(vdir / "scores.json", t["scores"])
                steps.append({"stage": f"tailor:{jd_key}", "ok": True, "ms": 0})
                judge = asyncio.run(judge_variation(jd_text, t["tailored"]))
                bundle.write_json(vdir / "judge.json", judge)
                render = {"non_blank": None}
                if servers.frontend_up and t["tailored_resume_id"]:
                    pdf, render = render_variation(t["tailored_resume_id"])
                    (vdir / "resume.pdf").write_bytes(pdf)
                    bundle.write_json(vdir / "render.json", render)
                    steps.append({"stage": f"render:{jd_key}", "ok": bool(render["non_blank"]), "ms": 0})
                variations.append({"jd_key": jd_key, "scores": t["scores"], "judge": judge, "render": render})
            except Exception as exc:  # noqa: BLE001 — capture, keep going
                steps.append({"stage": f"tailor:{jd_key}", "ok": False, "ms": 0, "error": str(exc)})
    finally:
        servers.teardown()

    flow = build_flow_trace(steps)
    bundle.write_json(bundle.dir / "flow-trace.json", flow)
    summary = build_summary(flow=flow, variations=variations, provider=config.get("provider", ""))
    bundle.write_json(bundle.dir / "summary.json", summary)
    if _BASELINE.exists():
        current = {v["jd_key"]: {"jd_keyword_coverage": v["scores"]["jd_keyword_coverage"],
                                 "judge_score": (v.get("judge") or {}).get("score"),
                                 "non_blank": (v.get("render") or {}).get("non_blank")} for v in variations}
        bundle.write_json(bundle.dir / "baseline-diff.json",
                          diff_against_baseline(current, bundle.read_json(_BASELINE)))
    print(f"bundle: {bundle.dir}")
    return 0


def cmd_update_baseline(args: argparse.Namespace) -> int:
    ensure_enabled()
    run_dir = Path(args.run_dir)
    summary = Bundle.read_json(run_dir / "summary.json")  # noqa: F841 (sanity that the run exists)
    variations = []
    for vdir in sorted((run_dir / "variations").glob("*")):
        variations.append({
            "jd_key": vdir.name,
            "scores": Bundle.read_json(vdir / "scores.json"),
            "judge": Bundle.read_json(vdir / "judge.json") if (vdir / "judge.json").exists() else {},
            "render": Bundle.read_json(vdir / "render.json") if (vdir / "render.json").exists() else {},
        })
    _BASELINE.parent.mkdir(parents=True, exist_ok=True)
    Bundle.write_json(_BASELINE, summary_to_baseline(variations))
    print(f"baseline updated from {run_dir} -> {_BASELINE} (review + commit it)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="e2e_monitor")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sweep").set_defaults(func=cmd_sweep)
    ub = sub.add_parser("update-baseline")
    ub.add_argument("run_dir")
    ub.set_defaults(func=cmd_update_baseline)
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except MonitorDisabled as exc:
        print(f"e2e-monitor: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
```

> The individual moves (`boot`, `tailor`, …) can be exposed as their own subcommands later for the agent-in-the-loop re-runs; `sweep` + `update-baseline` are the v1 entry points. Add per-move subcommands in a follow-up once the sweep is proven.

- [ ] **Step 2: Verify the gate blocks an un-opted run**

Run: `cd apps/backend && uv run python -m e2e_monitor sweep; echo "exit=$?"`
Expected: prints `e2e-monitor: e2e monitor is disabled by default …` and `exit=2` (no server booted).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/e2e_monitor/__main__.py
git commit -m "feat(e2e-monitor): CLI + sweep orchestration (gated)"
```

---

## Task 9: Fixtures — master resume + 4 JDs

**Files:**
- Create: `apps/backend/e2e_monitor/fixtures/master.json`
- Create: `apps/backend/e2e_monitor/fixtures/jds/backend-eng.txt`, `frontend-eng.txt`, `ml-eng.txt`, `product-manager.txt`

- [ ] **Step 1: Write `master.json`** — use the validated fixture from the spec/extraction (Jane Doe, all sections populated: personalInfo, summary, 2 workExperience, education, 1 project, additional with skills/languages/certs/awards, `customSections: {}`, `sectionMeta: []`). It must validate against `ResumeData`.

- [ ] **Step 2: Write the 4 JD `.txt` files** — one per distinct role (backend, frontend, ML, PM), each a realistic 80–150 word job description so the 4 variations differ meaningfully.

- [ ] **Step 3: Verify the master fixture is schema-valid**

Run:
```bash
cd apps/backend && uv run python -c "import json; from app.schemas import ResumeData; ResumeData.model_validate(json.load(open('e2e_monitor/fixtures/master.json'))); print('valid')"
```
Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/e2e_monitor/fixtures/
git commit -m "feat(e2e-monitor): canonical master resume + 4 role JD fixtures"
```

---

## Task 10: Agent playbook, skill install, README, docs

**Files:**
- Create: `apps/backend/e2e_monitor/AGENT_PLAYBOOK.md`
- Create: `apps/backend/e2e_monitor/README.md`
- Create: `apps/backend/e2e_monitor/install_skill.sh`
- Modify: `docs/agent/testing-strategy.md` (add §10)

- [ ] **Step 1: Write `AGENT_PLAYBOOK.md`** — the source-of-truth skill body. Front-matter (`name: monitor-e2e`, description) + instructions: (1) preconditions — refuse unless `RM_E2E_MONITOR=1` and a key; warn about spend; (2) run `uv run python -m e2e_monitor sweep` from `apps/backend`; (3) read `summary.json` + `baseline-diff.json` first; (4) judge the three jobs from the cited artifacts (output quality from `scores.json`/`judge.json`/`tailored.json`, flow/render from `flow-trace.json`/`render.json` + a grep of `logs/backend.log` for tracebacks/timeouts, provider reality from manifest + provider-struggle log fingerprints); (5) re-run targeted moves to investigate; (6) write `report.md` into the bundle + a short session summary; (7) NEVER modify app code, NEVER auto-update the baseline.

- [ ] **Step 2: Write `install_skill.sh`** — copies the playbook into the gitignored skill location:
```bash
#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
dest="$root/.claude/skills/monitor-e2e"
mkdir -p "$dest"
cp "$root/apps/backend/e2e_monitor/AGENT_PLAYBOOK.md" "$dest/SKILL.md"
echo "installed monitor-e2e skill -> $dest/SKILL.md (gitignored)"
```

- [ ] **Step 3: Write `README.md`** — quickstart: install the extra (`uv sync --extra e2e-monitor`), enable (`export RM_E2E_MONITOR=1`), run (`cd apps/backend && uv run python -m e2e_monitor sweep`), install the skill (`bash e2e_monitor/install_skill.sh`), refresh the baseline (`uv run python -m e2e_monitor update-baseline <run_dir>` then commit). State the OSS-safety model and "report, never a gate".

- [ ] **Step 4: Add §10 to `docs/agent/testing-strategy.md`** — a short section linking the spec + this plan + README, explaining the monitor is the on-demand, agentic, report-only layer above the deterministic suites and pre-push gate.

- [ ] **Step 5: Verify the skill is gitignored**

Run: `bash apps/backend/e2e_monitor/install_skill.sh && git status --porcelain .claude/skills/ ; echo "(should be empty above)"`
Expected: no output under `.claude/skills/` (the path is gitignored).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/e2e_monitor/AGENT_PLAYBOOK.md apps/backend/e2e_monitor/README.md \
        apps/backend/e2e_monitor/install_skill.sh docs/agent/testing-strategy.md
git commit -m "docs(e2e-monitor): agent playbook, skill installer, README, strategy §10"
```

---

## Task 11: First live sweep + commit the golden baseline

> Requires a configured LLM key (the dev's) and, for renders, node present. This is the one task that spends tokens.

- [ ] **Step 1: Run the gate-blocked check passes, then enable + sweep**

```bash
cd apps/backend
uv sync --extra dev --extra e2e-monitor
export RM_E2E_MONITOR=1
uv run python -m e2e_monitor sweep
```
Expected: a bundle dir is printed under `artifacts/e2e-monitor/<run-id>/` with `manifest.json`, `summary.json`, `flow-trace.json`, per-variation `scores.json`/`judge.json` (+ `resume.pdf`/`render.json` if the frontend booted). The dev's real `data/database.json` is unchanged (the run used the isolated DATA_DIR).

- [ ] **Step 2: Eyeball the bundle** — confirm scorers pass, judge scores ≥ 3, flow-trace `all_passed` (renders non-blank if node present), and the manifest's `config_snapshot` has NO raw key.

- [ ] **Step 3: Freeze the baseline from this run and commit it**

```bash
uv run python -m e2e_monitor update-baseline artifacts/e2e-monitor/<run-id>
git add apps/backend/e2e_monitor/baseline/baseline.json
git commit -m "feat(e2e-monitor): commit golden baseline from first clean sweep"
```

- [ ] **Step 4: Install the skill locally and do one agent dry-run**

```bash
bash e2e_monitor/install_skill.sh
```
Then invoke `/monitor-e2e` (or the skill) and confirm it reads the bundle, applies the rubric, and writes `report.md` — without touching app code or the baseline.

- [ ] **Step 5: Final full-suite green + push**

```bash
cd apps/backend && uv run pytest -q -p no:cacheprovider   # pure-logic monitor tests included, no server/token
```
Expected: green (≈ +15 monitor unit tests over the pre-task count). Then push the branch and open a PR to `dev`.

---

## Self-Review (completed by plan author)

**Spec coverage:** three jobs → scorer-runner + judge (output quality), render non-blank + flow-trace + log grep in playbook (flow/render), manifest provider + provider-struggle grep in playbook (provider reality). Two-layer split → harness moves (Tasks 1–9) + skill/playbook (Task 10). Agent-in-the-loop → moves are individually invocable + sweep (per-move subcommands flagged as follow-up). Configured-provider → real `data/config.json` read; DATA_DIR isolation. Committed baseline + floor → Task 6 + Task 11. Form factor (harness + gitignored skill + committed playbook) → Tasks 1/10, `.gitignore`. Guardrails (optional extra, `RM_E2E_MONITOR`, inert, report-not-gate, secret scrub) → Tasks 1/2/7. Anti-theater self-tests → Tasks 1–6 (scrubber, manifest, non-blank, scorer-runner, flow-trace, baseline-diff). Fixtures → Task 9.

**Known gaps to resolve in execution (flagged, not placeholders):** (a) the master-resume *intake path* — the upload endpoint accepts pdf/doc/docx, so seeding a pre-structured JSON master may need the same DB-create path `tests/integration/test_pipeline_e2e.py` uses rather than `/resumes/upload`; verify against `app/routers/resumes.py:511` in Task 7/9. (b) keyword extraction in the sweep uses a cheap title-case proxy; if the JD-keyword scorer is too noisy, call the backend's `extract_job_keywords` instead. (c) per-move CLI subcommands for true agent-in-the-loop re-runs are a fast-follow after the sweep is proven.

**Type consistency:** `Bundle`, `build_manifest`, `score_tailoring`, `check_pdf_bytes`, `build_flow_trace`/`build_summary`, `diff_against_baseline`/`summary_to_baseline`, `Servers.boot/teardown`, `seed_master`/`tailor`/`render_variation`/`judge_variation` names are used identically across tasks. Bundle paths (`logs_dir`, `data_dir`, `master_dir`, `variation_dir`) are consistent between `servers.py`, `flow.py`, and `__main__.py`.
