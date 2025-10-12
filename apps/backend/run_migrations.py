#!/usr/bin/env python3
"""
Script to run Alembic migrations programmatically.
This can be run manually or integrated into the application startup.
"""
import os
import sys
from pathlib import Path

# Add the backend directory to the path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from alembic.config import Config
from alembic import command


def run_migrations(command_name: str = "upgrade", revision: str = "head"):
    """
    Run Alembic migrations.
    
    Args:
        command_name: The migration command to run (upgrade, downgrade, current, etc.)
        revision: The target revision (default: "head" for latest)
    """
    # Get the path to alembic.ini
    alembic_cfg_path = backend_dir / "alembic.ini"
    
    if not alembic_cfg_path.exists():
        raise FileNotFoundError(f"Alembic configuration not found at {alembic_cfg_path}")
    
    # Create Alembic config
    alembic_cfg = Config(str(alembic_cfg_path))
    
    # Set the script location to be relative to this file
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    
    # Run the migration command
    if command_name == "upgrade":
        print(f"Running migrations: upgrade to {revision}...")
        command.upgrade(alembic_cfg, revision)
        print("✓ Migrations completed successfully!")
    elif command_name == "downgrade":
        print(f"Running migrations: downgrade to {revision}...")
        command.downgrade(alembic_cfg, revision)
        print("✓ Downgrade completed successfully!")
    elif command_name == "current":
        print("Current migration revision:")
        command.current(alembic_cfg)
    elif command_name == "history":
        print("Migration history:")
        command.history(alembic_cfg)
    else:
        raise ValueError(f"Unknown command: {command_name}")


if __name__ == "__main__":
    # Parse command line arguments
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        rev = sys.argv[2] if len(sys.argv) > 2 else "head"
    else:
        cmd = "upgrade"
        rev = "head"
    
    try:
        run_migrations(cmd, rev)
    except Exception as e:
        print(f"✗ Error running migrations: {e}", file=sys.stderr)
        sys.exit(1)

