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
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),                # Google API keys
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-]+=*"),  # Authorization: Bearer <token>
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

    ``provider`` / ``model`` / ``api_base`` are preserved (needed in the manifest,
    not secrets); ``api_key`` and every entry under ``api_keys`` are replaced.
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
