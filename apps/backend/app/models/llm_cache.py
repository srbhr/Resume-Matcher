from __future__ import annotations

import json
from sqlalchemy import Column, String, Text, Integer, DateTime, text, ForeignKey
from sqlalchemy.orm import Mapped

from .base import Base


class LLMCache(Base):
    __tablename__ = "llm_cache"

    # Suppress rowcount confirmation warnings that can appear when our background
    # cleanup issues raw DELETE statements with LIMIT (SQLite can report an
    # unexpected rowcount in some scenarios). Disabling confirmation avoids
    # noisy, non-actionable warnings in logs and tests.
    __mapper_args__ = {"confirm_deleted_rows": False}

    cache_key: Mapped[str] = Column(String, primary_key=True, unique=True, index=True)
    model: Mapped[str] = Column(String, nullable=False, index=True)
    strategy: Mapped[str] = Column(String, nullable=False, index=True)
    prompt_hash: Mapped[str] = Column(String, nullable=False, index=True)
    response_json: Mapped[str] = Column(Text, nullable=False)
    tokens_in: Mapped[int] = Column(Integer, nullable=True)
    tokens_out: Mapped[int] = Column(Integer, nullable=True)
    ttl_seconds: Mapped[int] = Column(Integer, nullable=False, default=86400)
    created_at: Mapped[str] = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )

    def as_dict(self) -> dict:
        return json.loads(self.response_json)


class LLMCacheIndex(Base):
    """Aux index mapping domain entities to cache keys for precise invalidation.

    For each cache entry we can store zero or more (entity_type, entity_id) links.
    entity_type examples: 'resume', 'job'.
    """
    __tablename__ = "llm_cache_index"

    id: Mapped[int] = Column(Integer, primary_key=True, autoincrement=True)
    cache_key: Mapped[str] = Column(String, ForeignKey("llm_cache.cache_key", ondelete="CASCADE"), index=True, nullable=False)
    entity_type: Mapped[str] = Column(String, index=True, nullable=False)
    entity_id: Mapped[str] = Column(String, index=True, nullable=False)
    created_at: Mapped[str] = Column(
        DateTime(timezone=True),
        server_default=text("CURRENT_TIMESTAMP"),
        nullable=False,
        index=True,
    )

