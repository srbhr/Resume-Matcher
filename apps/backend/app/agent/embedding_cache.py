from __future__ import annotations

import time
import hashlib
from collections import OrderedDict
from typing import Tuple


class EmbeddingCache:
    """Simple in-memory TTL + LRU cache for embeddings.

    Keyed by (provider, model, sha256(text)). Not process-shared.
    """

    def __init__(self, max_size: int = 2000, ttl_seconds: int = 24 * 3600) -> None:
        self._store: OrderedDict[str, Tuple[float, list[float]]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl_seconds

    @staticmethod
    def _hash_text(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _make_key(self, provider: str, model: str, text: str) -> str:
        return f"{provider}:{model}:{self._hash_text(text)}"

    def get(self, provider: str, model: str, text: str) -> list[float] | None:
        key = self._make_key(provider, model, text)
        now = time.time()
        item = self._store.get(key)
        if not item:
            return None
        ts, vec = item
        if now - ts > self._ttl:
            # expired
            self._store.pop(key, None)
            return None
        # refresh LRU order
        self._store.move_to_end(key)
        return vec

    def set(self, provider: str, model: str, text: str, embedding: list[float]) -> None:
        key = self._make_key(provider, model, text)
        self._store[key] = (time.time(), embedding)
        self._store.move_to_end(key)
        if len(self._store) > self._max_size:
            self._store.popitem(last=False)


# Singleton cache instance for the process
embedding_cache = EmbeddingCache()
