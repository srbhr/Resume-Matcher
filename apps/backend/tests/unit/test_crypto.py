"""Tests for the Fernet API-key encryption helper."""

import pytest

from app import crypto
from app.config import settings


@pytest.fixture
def isolated_secret(tmp_path, monkeypatch):
    """Point the secret at a temp dir so tests don't touch the real one."""
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    crypto.reset_cache()
    yield tmp_path
    crypto.reset_cache()


class TestCrypto:
    def test_round_trip(self, isolated_secret):
        ciphertext = crypto.encrypt("sk-super-secret")
        assert ciphertext  # non-empty
        assert ciphertext != "sk-super-secret"  # actually encrypted
        assert crypto.decrypt(ciphertext) == "sk-super-secret"

    def test_secret_file_created_with_600_perms(self, isolated_secret):
        crypto.encrypt("x")
        secret = isolated_secret / ".secret_key"
        assert secret.exists()
        # Owner read/write only (mode bits 0o600). Skip the check on platforms
        # that don't support chmod semantics.
        mode = secret.stat().st_mode & 0o777
        assert mode == 0o600

    def test_empty_inputs(self, isolated_secret):
        assert crypto.encrypt("") == ""
        assert crypto.decrypt("") == ""

    def test_undecryptable_returns_empty(self, isolated_secret):
        # Garbage / wrong-secret ciphertext must not raise — treated as empty.
        assert crypto.decrypt("not-a-valid-token") == ""

    def test_rotated_secret_yields_empty(self, isolated_secret, monkeypatch, tmp_path):
        ciphertext = crypto.encrypt("sk-secret")
        # Simulate a lost/rotated secret: new empty data dir.
        new_dir = tmp_path / "rotated"
        new_dir.mkdir()
        monkeypatch.setattr(settings, "data_dir", new_dir)
        crypto.reset_cache()
        assert crypto.decrypt(ciphertext) == ""
