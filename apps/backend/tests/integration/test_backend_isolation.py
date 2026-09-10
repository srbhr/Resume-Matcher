"""Integration coverage for default test isolation and real startup migration."""

import json
import socket
from pathlib import Path
from typing import Any

import pytest
from tinydb import TinyDB

from app import crypto
from app.config import get_api_keys_from_config, settings
from app.main import app


def test_unstubbed_provider_connection_is_denied() -> None:
    """A provider socket cannot escape the deterministic backend test process."""
    with pytest.raises(RuntimeError, match="External network access blocked"):
        socket.create_connection(("api.openai.com", 443))


async def test_real_startup_migrates_only_temporary_storage(
    isolated_backend_state: Any,
    tmp_path: Path,
) -> None:
    """Real lifespan migration uses isolated config, crypto, and imported DB aliases."""
    assert settings.data_dir == tmp_path / "data"
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    legacy_db_path = settings.db_path
    legacy_config_path = settings.config_path
    legacy_resume = {
        "resume_id": "legacy-resume",
        "content": "# Synthetic resume",
        "is_master": True,
        "created_at": "2026-09-05T00:00:00+00:00",
        "updated_at": "2026-09-05T00:00:00+00:00",
    }
    tinydb = TinyDB(legacy_db_path)
    try:
        tinydb.table("resumes").insert(legacy_resume)
    finally:
        tinydb.close()
    legacy_config_path.write_text(
        json.dumps(
            {
                "provider": "openai",
                "model": "synthetic-model",
                "api_key": "synthetic-legacy-key",
            }
        )
    )

    async with app.router.lifespan_context(app):
        migrated = await isolated_backend_state.get_resume("legacy-resume")
        assert migrated is not None
        assert migrated["content"] == "# Synthetic resume"
        assert get_api_keys_from_config() == {"openai": "synthetic-legacy-key"}
        assert crypto.decrypt(
            isolated_backend_state.get_api_key_ciphertexts()["openai"]
        ) == "synthetic-legacy-key"

    assert not legacy_db_path.exists()
    assert legacy_db_path.with_suffix(".json.migrated").exists()
    assert json.loads(legacy_config_path.read_text()) == {
        "provider": "openai",
        "model": "synthetic-model",
    }
