"""Regression tests for config path ownership and atomic persistence."""

import json
import os
import stat
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import pytest

import app.config as config_module
from app.config import load_config_file, save_config_file, settings
from app.config_cache import invalidate_config_cache, load_config
from app.routers.config import _get_config_path


def test_imported_config_path_is_owned_by_data_dir(
    imported_config_file_path: Path,
    backend_test_data_dir: Path,
) -> None:
    """Changing DATA_DIR before import must redirect the config alias too."""
    assert imported_config_file_path == backend_test_data_dir / "config.json"


def test_config_readers_and_writers_follow_runtime_data_dir(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    imported_config_file_path: Path,
) -> None:
    """A runtime DATA_DIR override must move config save, load, and cache I/O."""
    owned_data_dir = tmp_path / "owned"
    monkeypatch.setattr(settings, "data_dir", owned_data_dir)
    # Restore the compatibility alias to its untouched import-time value. A
    # changed alias is intentionally honored for downstream monkeypatch users.
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", imported_config_file_path)

    save_config_file({"provider": "anthropic", "api_key": "must-not-persist"})
    invalidate_config_cache()

    assert json.loads(settings.config_path.read_text()) == {"provider": "anthropic"}
    assert load_config_file()["provider"] == "anthropic"
    assert load_config() == {"provider": "anthropic"}


def test_legacy_config_path_monkeypatch_remains_supported(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Existing callers that monkeypatch CONFIG_FILE_PATH keep controlling I/O."""
    compatibility_path = tmp_path / "compatibility" / "config.json"
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", compatibility_path)

    save_config_file({"provider": "gemini"})

    assert json.loads(compatibility_path.read_text()) == {"provider": "gemini"}
    assert load_config_file()["provider"] == "gemini"
    assert load_config() == {"provider": "gemini"}
    assert _get_config_path() == compatibility_path


def test_cached_config_follows_a_changed_compatibility_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = tmp_path / "first.json"
    second = tmp_path / "second.json"
    first.write_text('{"language": "en"}')
    second.write_text('{"language": "fr"}')
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", first)
    assert load_config() == {"language": "en"}
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", second)
    assert load_config() == {"language": "fr"}


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions and symlink contract")
def test_atomic_save_preserves_symlink_target_and_existing_permissions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "managed.json"
    target.write_text('{"provider": "old"}')
    target.chmod(0o640)
    link = tmp_path / "config.json"
    link.symlink_to(target)
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", link)

    save_config_file({"provider": "gemini"})

    assert link.is_symlink()
    assert json.loads(target.read_text()) == {"provider": "gemini"}
    assert stat.S_IMODE(target.stat().st_mode) == 0o640


@pytest.mark.skipif(os.name == "nt", reason="Directory fsync is a POSIX contract")
def test_atomic_save_syncs_the_replaced_directory_entry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "config.json"
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", path)
    real_fsync = os.fsync
    synced_snapshots: list[dict[str, Any]] = []

    def observe_fsync(fd: int) -> None:
        if stat.S_ISDIR(os.fstat(fd).st_mode):
            synced_snapshots.append(json.loads(path.read_text()))
        real_fsync(fd)

    monkeypatch.setattr(os, "fsync", observe_fsync)
    save_config_file({"provider": "gemini"})
    assert synced_snapshots == [{"provider": "gemini"}]


def test_failed_atomic_replace_preserves_snapshot_and_removes_temp_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A replace failure must preserve the old JSON and leave no temp artifact."""
    config_path = tmp_path / "config.json"
    config_path.write_text('{"provider": "sentinel"}')
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", config_path)

    def fail_replace(source: str | Path, destination: str | Path) -> None:
        del source, destination
        raise OSError("synthetic replace failure")

    monkeypatch.setattr(os, "replace", fail_replace)

    with pytest.raises(OSError, match="synthetic replace failure"):
        save_config_file({"provider": "openai"})

    assert json.loads(config_path.read_text()) == {"provider": "sentinel"}
    assert list(tmp_path.glob(".config.json.*.tmp")) == []


def test_concurrent_snapshot_replacements_are_serialized(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Concurrent saves install complete snapshots one at a time."""
    config_path = tmp_path / "config.json"
    monkeypatch.setattr(config_module, "CONFIG_FILE_PATH", config_path)
    real_replace = os.replace
    writers = 8
    start = threading.Barrier(writers)
    observation_lock = threading.Lock()
    active_replacements = 0
    maximum_active_replacements = 0

    def observed_replace(source: str | Path, destination: str | Path) -> None:
        nonlocal active_replacements, maximum_active_replacements
        with observation_lock:
            active_replacements += 1
            maximum_active_replacements = max(
                maximum_active_replacements, active_replacements
            )
        try:
            time.sleep(0.01)
            real_replace(source, destination)
        finally:
            with observation_lock:
                active_replacements -= 1

    monkeypatch.setattr(os, "replace", observed_replace)
    snapshots: list[dict[str, Any]] = [
        {"writer": index, "payload": str(index) * 4096}
        for index in range(writers)
    ]

    def save_after_barrier(snapshot: dict[str, Any]) -> None:
        start.wait()
        save_config_file(snapshot)

    with ThreadPoolExecutor(max_workers=writers) as executor:
        list(executor.map(save_after_barrier, snapshots))

    assert maximum_active_replacements == 1
    assert json.loads(config_path.read_text()) in snapshots
    assert list(tmp_path.glob(".config.json.*.tmp")) == []
