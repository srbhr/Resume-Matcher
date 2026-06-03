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
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)

_fernet: Fernet | None = None
_loaded_from: Path | None = None


def _secret_path() -> Path:
    return settings.data_dir / ".secret_key"


def _write_secret(path: Path, key: bytes, *, exclusive: bool = False) -> None:
    """Atomically write the secret with 0600 perms.

    The key is written **in full** to a temp file in the same directory (mode
    0600 via ``mkstemp``), fsync'd, then moved into place atomically — so a
    concurrent reader can never observe a partial key. With ``exclusive=True``
    the move is an atomic hard-link that raises ``FileExistsError`` if the
    target already exists (first-run generation must not clobber a secret that
    may already have encrypted data); otherwise it is an atomic replace (used to
    overwrite a corrupt/unreadable secret).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".secret_key.tmp.")
    tmp = Path(tmp_name)
    try:
        remaining = key
        while remaining:
            written = os.write(fd, remaining)
            if written == 0:
                # Guard against a 0-byte write spinning forever.
                raise OSError("os.write wrote 0 bytes to the secret file")
            remaining = remaining[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    try:
        if exclusive:
            # Atomic + exclusive: fails if the target exists, and the linked
            # file is already complete (no partial-read window).
            os.link(tmp, path)
        else:
            os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def _load_fernet() -> Fernet:
    """Load (or generate) the Fernet instance, cached per secret path."""
    global _fernet, _loaded_from
    path = _secret_path()
    if _fernet is not None and _loaded_from == path:
        return _fernet

    if path.exists():
        key = path.read_bytes().strip()
        # Re-assert restrictive perms in case the file pre-existed (or was
        # copied) with broader permissions before this hardening (best-effort).
        try:
            os.chmod(path, 0o600)
        except OSError:  # pragma: no cover - platform dependent (e.g. Windows)
            pass
    else:
        key = Fernet.generate_key()
        try:
            _write_secret(path, key, exclusive=True)
            logger.info("Generated new encryption secret at %s", path)
        except FileExistsError:
            # Another caller generated the secret first — use theirs so we
            # never overwrite a key that may already have encrypted data.
            key = path.read_bytes().strip()

    try:
        _fernet = Fernet(key)
    except (ValueError, TypeError):
        # A corrupt/invalid secret would otherwise crash every encrypt/decrypt
        # call. Regenerate a fresh secret (previously stored ciphertext is
        # already unrecoverable) so key save/read flows keep working.
        logger.warning("Invalid encryption secret at %s; regenerating.", path)
        key = Fernet.generate_key()
        _write_secret(path, key)
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
