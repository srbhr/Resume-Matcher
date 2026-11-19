"""config.json together with the encrypted API-key store.

Kept out of ``app.config`` because the key store lives in the database, which
imports ``app.config`` for its settings.
"""

import logging
from typing import Any

from app.config import _read_config_json, _write_config_json, settings

logger = logging.getLogger(__name__)


def load_config_file() -> dict[str, Any]:
    """Load non-secret configuration, with decrypted API keys injected.

    API keys live in the encrypted SQLite store, not config.json. They are
    injected here under ``api_keys`` so ``resolve_api_key(stored, provider)``
    keeps resolving per-provider keys everywhere ``stored`` is built from this
    function. ``save_config_file`` strips them again, so they never round-trip
    back to disk.
    """
    config = _read_config_json()
    config["api_keys"] = get_api_keys_from_config()
    return config


def save_config_file(config: dict[str, Any]) -> None:
    """Save non-secret configuration to config.json.

    Secrets (``api_keys`` map and the legacy single ``api_key``) are stripped
    before writing — they belong to the encrypted store only.
    """
    config = dict(config)
    config.pop("api_keys", None)
    config.pop("api_key", None)
    _write_config_json(config)


def get_api_keys_from_config() -> dict[str, str]:
    """Get decrypted API keys from the encrypted SQLite store.

    Returns:
        Dictionary with key-store provider names as keys and plaintext keys as
        values (entries that fail to decrypt are omitted).
    """
    from app.crypto import decrypt
    from app.database import db

    decrypted: dict[str, str] = {}
    for provider, ciphertext in db.get_api_key_ciphertexts().items():
        plaintext = decrypt(ciphertext)
        if plaintext:
            decrypted[provider] = plaintext
    return decrypted


def save_api_keys_to_config(api_keys: dict[str, str]) -> None:
    """Replace the encrypted key store with ``api_keys`` (encrypting each).

    Replace-all semantics mirror the legacy ``config["api_keys"] = api_keys``;
    the config router reads-merges-saves the full map.
    """
    from app.crypto import encrypt
    from app.database import db

    # Encrypt everything first, then swap in a single transaction, so a partial
    # failure (encryption error or DB write) can never wipe previously stored
    # keys mid-replace.
    ciphertexts = {provider: encrypt(key) for provider, key in api_keys.items() if key}
    db.replace_api_keys(ciphertexts)


def delete_api_key_from_config(provider: str) -> None:
    """Delete a specific API key from the encrypted store."""
    from app.database import db

    db.delete_api_key(provider)


def clear_all_api_keys() -> None:
    """Clear all API keys from the encrypted store and any legacy config slots."""
    from app.database import db

    db.clear_api_keys()
    # Defensively clear any legacy plaintext remnants from config.json.
    config = _read_config_json()
    if "api_keys" in config or "api_key" in config:
        config.pop("api_keys", None)
        config.pop("api_key", None)
        _write_config_json(config)


def migrate_legacy_keys() -> None:
    """Fold legacy plaintext keys from config.json into the encrypted store.

    Idempotent and non-clobbering: an existing config.json ``api_keys`` map and
    the legacy single ``api_key`` (mapped to its key-store provider via the
    active provider) are written to the encrypted store **only if that provider
    slot is empty**, then removed from config.json. This eliminates the
    legacy-shadow bug where ``resolve_api_key`` returned one shared key for
    every provider.
    """
    config = _read_config_json()
    legacy_map = config.get("api_keys")
    legacy_single = config.get("api_key")
    if not legacy_map and not legacy_single:
        return

    from app.crypto import encrypt
    from app.database import db

    existing = set(db.get_api_key_ciphertexts().keys())

    if isinstance(legacy_map, dict):
        for provider, key in legacy_map.items():
            if key and provider not in existing:
                db.set_api_key_ciphertext(provider, encrypt(key))
                existing.add(provider)

    if legacy_single:
        # Map the active LLM provider to its key-store provider name.
        provider = config.get("provider") or settings.llm_provider
        key_provider = _LEGACY_PROVIDER_KEY_MAP.get(provider, provider)
        if key_provider not in existing:
            db.set_api_key_ciphertext(key_provider, encrypt(legacy_single))

    # Strip the legacy slots from config.json now that they're in the store.
    config.pop("api_keys", None)
    config.pop("api_key", None)
    _write_config_json(config)


# Mirror of llm._PROVIDER_KEY_MAP, duplicated to avoid importing llm.py (which
# pulls in litellm) at config import time.
_LEGACY_PROVIDER_KEY_MAP: dict[str, str] = {
    "openai": "openai",
    "openai_compatible": "openai_compatible",
    "azure_foundry": "azure_foundry",
    "anthropic": "anthropic",
    "gemini": "google",
    "openrouter": "openrouter",
    "deepseek": "deepseek",
    "groq": "groq",
    "ollama": "ollama",
}
