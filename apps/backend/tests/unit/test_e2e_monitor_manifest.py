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
