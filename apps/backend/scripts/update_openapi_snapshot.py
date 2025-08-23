"""Utility script to regenerate the tests/openapi.snapshot.json file.

Run inside the backend directory:

    python scripts/update_openapi_snapshot.py

This avoids shell quoting issues on Windows when trying to inline Python one-liners.
"""
from __future__ import annotations
import json
from pathlib import Path
import sys, os

# Ensure parent (backend root) is on path so `app` can be imported when
# executing script directly (not via pytest which already adjusts sys.path).
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.base import create_app

def main() -> None:
    app = create_app()
    spec = app.openapi()
    out_path = Path(__file__).resolve().parent.parent / "tests" / "openapi.snapshot.json"
    # Explicitly write UTF-8 without BOM.
    out_path.write_bytes(json.dumps(spec, indent=2, sort_keys=True).encode("utf-8"))
    print(f"Wrote OpenAPI snapshot to {out_path}")

if __name__ == "__main__":  # pragma: no cover
    main()
