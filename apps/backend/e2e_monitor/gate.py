"""The opt-in gate — every expensive move calls ``ensure_enabled()`` first.

Two independent locks must both be open:
  1. ``RM_E2E_MONITOR=1`` in the environment (deliberate enable), and
  2. a usable LLM key/provider is configured (same rule the eval harness uses).
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


def ensure_enabled(*, require_key: bool = True) -> None:
    """Raise ``MonitorDisabled`` unless both locks are open.

    When ``require_key=False`` the LLM key check is skipped (use for offline
    moves such as ``update-baseline`` that need no LLM calls).
    """
    if os.environ.get("RM_E2E_MONITOR") != "1":
        raise MonitorDisabled(
            "e2e monitor is disabled by default — it makes real, billed LLM calls "
            "and boots servers. Set RM_E2E_MONITOR=1 to enable."
        )
    if require_key and not _key_is_configured():
        raise MonitorDisabled(
            "no usable LLM key/provider configured (set one in data/config.json or "
            "the Settings UI, or point at a local provider)."
        )
