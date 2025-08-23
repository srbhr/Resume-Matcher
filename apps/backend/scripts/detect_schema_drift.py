"""Schema drift detection script.

Compares the SQLAlchemy metadata (current models) against the latest Alembic
migration state. Exits with non-zero status if autogeneration would produce
new changes (i.e., drift detected).

Usage (from backend root):
  python -m scripts.detect_schema_drift

Optionally set environment variables used by app configuration before running.
"""
from __future__ import annotations
import sys
from pathlib import Path
from alembic.config import Config
from alembic import command
from alembic.runtime.environment import EnvironmentContext
from alembic.migration import MigrationContext
from io import StringIO
from contextlib import contextmanager

BACKEND_ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_CFG_PATH = BACKEND_ROOT / "alembic.ini"


def load_alembic_config() -> Config:
    cfg = Config(str(ALEMBIC_CFG_PATH))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    return cfg


def has_drift(cfg: Config) -> bool:
    from app.base import Base  # metadata import
    # Create an engine from app settings (SQLAlchemy 2.x no longer attaches engines to metadata)
    from app.core.database import get_engine_sync  # type: ignore
    engine = get_engine_sync()

    with engine.connect() as connection:
        mc = MigrationContext.configure(connection)
        diffs = []  # type: ignore[var-annotated]
        autogen_context = {"imports": set()}
        from alembic.autogenerate import compare_metadata
        diffs = compare_metadata(mc, Base.metadata, autogen_context=autogen_context)
        return bool(diffs)


def main() -> int:
    cfg = load_alembic_config()
    drift = has_drift(cfg)
    if drift:
        print("Schema drift detected: run alembic revision --autogenerate", file=sys.stderr)
        return 1
    print("No schema drift detected ✅")
    return 0

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
