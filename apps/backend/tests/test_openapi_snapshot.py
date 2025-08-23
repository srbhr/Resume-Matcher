import json
from pathlib import Path
from app.base import create_app

SNAPSHOT_PATH = Path(__file__).parent / "openapi.snapshot.json"


def build_current_spec():
    app = create_app()
    return app.openapi()


def test_openapi_snapshot_up_to_date():
    current = build_current_spec()
    if not SNAPSHOT_PATH.exists():
        # First run bootstrap - create snapshot and pass
        SNAPSHOT_PATH.write_text(json.dumps(current, indent=2, sort_keys=True))
        return
    # Read snapshot with utf-8-sig to gracefully strip a BOM that can be
    # introduced on Windows shells (e.g. PowerShell Out-File -Encoding utf8).
    saved = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8-sig"))
    assert saved == current, "OpenAPI spec changed – update snapshot if intentional"


def test_openapi_snapshot_keys():
    current = build_current_spec()
    assert "paths" in current and "components" in current
