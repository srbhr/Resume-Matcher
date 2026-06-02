"""Agentic end-to-end monitor harness (opt-in, on-demand).

This package is INERT by default: it has no import side effects, is never
imported by ``app/*`` or by the default test suite, and every expensive move
refuses to run unless explicitly enabled (see ``e2e_monitor.gate``). See
``docs/superpowers/specs/2026-06-01-agentic-e2e-monitor-design.md``.
"""

__version__ = "0.1.0"

# Single source of truth for the backend API base the monitor drives. Defined
# here as an inert, side-effect-free constant so render.py / flow.py / servers.py
# don't each hard-code the URL and drift apart.
API_BASE = "http://127.0.0.1:8000/api/v1"
