"""Fernet encryption for API keys at rest.

The symmetric secret lives at ``data/.secret_key`` (auto-generated, ``chmod
600``, gitignored). It is loaded once and used to encrypt/decrypt provider keys
so plaintext exists in memory only at call time.

Resilience: a missing secret is generated on demand; a key that fails to
decrypt (e.g. the secret was rotated/lost) is treated as empty rather than
crashing — the user is prompted to re-enter, and stored ciphertext is never
recoverable without the original secret.
"""

import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None
_loaded_from: Path | None = None


def _secret_path() -> Path:
    return settings.data_dir / ".secret_key"


def _load_fernet() -> Fernet:
    """Load (or generate) the Fernet instance, cached per secret path."""
    global _fernet, _loaded_from
    path = _secret_path()
    if _fernet is not None and _loaded_from == path:
        return _fernet

    if path.exists():
        key = path.read_bytes().strip()
    else:
        key = Fernet.generate_key()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Write with restrictive permissions from the start.
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, key)
        finally:
            os.close(fd)
        try:
            os.chmod(path, 0o600)
        except OSError:  # pragma: no cover - platform dependent (e.g. Windows)
            pass
        logger.info("Generated new encryption secret at %s", path)

    _fernet = Fernet(key)
    _loaded_from = path
    return _fernet


def reset_cache() -> None:
    """Drop the cached Fernet (used by tests that point data_dir elsewhere)."""
    global _fernet, _loaded_from
    _fernet = None
    _loaded_from = None


def encrypt(plaintext: str) -> str:
    """Encrypt a plaintext secret; returns ciphertext as a string."""
    if not plaintext:
        return ""
    return _load_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(ciphertext: str) -> str:
    """Decrypt ciphertext; returns "" if it can't be decrypted (lost secret)."""
    if not ciphertext:
        return ""
    try:
        return _load_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError) as e:
        logger.warning("Failed to decrypt a stored API key (secret rotated/lost?): %s", e)
        return ""
