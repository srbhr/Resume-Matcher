"""In-process metrics counters for operational insights.

Note: These reset on process restart. For multi-process or production-grade
tracking, export to a persistent metrics backend (Prometheus, Redis, etc.).
"""
from __future__ import annotations

DUPLICATE_RESUME_REUSES: int = 0

# Cache invalidation metrics (in-process)
INVALIDATION_DELETES: int = 0  # total cache rows deleted via API invalidation
LAST_INVALIDATION_AT: str | None = None  # ISO timestamp of last invalidation

__all__ = [
	"DUPLICATE_RESUME_REUSES",
	"INVALIDATION_DELETES",
	"LAST_INVALIDATION_AT",
]
