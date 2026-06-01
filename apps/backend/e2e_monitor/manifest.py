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
