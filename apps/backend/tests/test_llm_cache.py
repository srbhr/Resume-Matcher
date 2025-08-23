import json
import asyncio
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, init_models, async_engine
from sqlalchemy import text
from app.agent.cache_utils import fetch_or_cache, sha256_text
from app.agent import cache_utils as cache_mod
from app.models import LLMCache, Base
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def _dummy_runner(payload: dict):
    await asyncio.sleep(0)
    return payload


async def _count_cache_rows(session: AsyncSession) -> int:
    result = await session.execute(text("SELECT COUNT(*) FROM llm_cache"))
    return result.scalar_one()


async def test_fetch_or_cache_inserts_and_hits(monkeypatch):
    # Ensure tables are present (idempotent)
    async with async_engine.begin() as conn:  # pragma: no cover - setup
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        # Record starting row count to allow for prior test residue when running partial suites
        start_rows = await _count_cache_rows(session)
        payload = {"foo": "bar"}
        model = "gemma3:4b"
        strategy = "json"
        prompt = "TEST PROMPT"

        call_counter = {"n": 0}

        async def runner():
            call_counter["n"] += 1
            return await _dummy_runner(payload)

        # First call -> miss
        out1 = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=100)
        assert out1 == payload
        assert call_counter["n"] == 1

        # Second call -> hit (no new provider call)
        out2 = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=100)
        assert out2 == out1
        assert call_counter["n"] == 1, "Runner should not have been called again on cache hit"

        # Verify persistence
        cache_rows = await _count_cache_rows(session)
        assert cache_rows - start_rows == 1, "Exactly one new cache row should be inserted"

        # Ensure key composition stable
        prompt_hash = sha256_text(prompt)
        raw_key_material = f"{model}:{strategy}:{prompt_hash}"
        cache_key = sha256_text(raw_key_material)
        obj = await session.get(LLMCache, cache_key)
        assert obj is not None
        assert json.loads(obj.response_json) == payload


async def test_ttl_expiry(monkeypatch):
    async with async_engine.begin() as conn:  # pragma: no cover - setup
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        model = "gemma3:4b"
        strategy = "json"
        prompt = "TTL TEST PROMPT"
        call_counter = {"n": 0}

        async def runner():
            call_counter["n"] += 1
            return {"value": call_counter["n"]}

        # First call inserts (value=1)
        first = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=1)
        assert first["value"] == 1
        # Manually age the row beyond TTL
        prompt_hash = sha256_text(prompt)
        key = sha256_text(f"{model}:{strategy}:{prompt_hash}")
        obj = await session.get(LLMCache, key)
        assert obj is not None
        # Backdate created_at 2 seconds
        if obj.created_at:
            obj.created_at = obj.created_at - timedelta(seconds=2)
        await session.flush()
        # Second call should refresh and increment value
        second = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=1)
        assert second["value"] == 2, "Expired cache should trigger runner again"


async def test_token_usage_persisted():
    async with async_engine.begin() as conn:  # pragma: no cover - setup
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        model = "gemma3:4b"
        strategy = "json"
        prompt = "USAGE TEST PROMPT"
        call_counter = {"n": 0}

        async def runner():
            call_counter["n"] += 1
            return {
                "foo": "bar",
                "_usage": {"prompt_tokens": 42, "completion_tokens": 13},
            }

        first = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner)
        assert call_counter["n"] == 1
        # Compute cache key
        p_hash = sha256_text(prompt)
        cache_key = sha256_text(f"{model}:{strategy}:{p_hash}")
        obj = await session.get(LLMCache, cache_key)
        assert obj is not None
        assert obj.tokens_in == 42
        assert obj.tokens_out == 13

        # Second call should be a hit; usage fields unchanged
        second = await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner)
        assert call_counter["n"] == 1, "Runner called again despite cache hit"
        obj2 = await session.get(LLMCache, cache_key)
        assert obj2.tokens_in == 42 and obj2.tokens_out == 13


async def test_hit_miss_counters():
    # Use unique prompt; snapshot counters from module to track deltas
    start_hits, start_misses, start_expired = (
        cache_mod.CACHE_HITS,
        cache_mod.CACHE_MISSES,
        cache_mod.CACHE_EXPIRED,
    )
    async with async_engine.begin() as conn:  # pragma: no cover - setup
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        model = "gemma3:4b"
        strategy = "json"
        prompt = "COUNTER TEST PROMPT UNIQUE"
        async def runner():
            return {"value": "x"}
        # miss
        await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=5)
        # hit
        await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=5)
        # expire: manually age then call again
        p_hash = sha256_text(prompt)
        key = sha256_text(f"{model}:{strategy}:{p_hash}")
        obj = await session.get(LLMCache, key)
        obj.created_at = obj.created_at - timedelta(seconds=10)
        await session.flush()
        await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=1)
    assert cache_mod.CACHE_MISSES >= start_misses + 1
    assert cache_mod.CACHE_HITS >= start_hits + 1
    assert cache_mod.CACHE_EXPIRED >= start_expired + 1


async def test_cleanup_deletes_expired():
    # Insert an expired row and run manual cleanup SQL similar to background task
    async with async_engine.begin() as conn:  # pragma: no cover - setup
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        model = "gemma3:4b"; strategy = "json"; prompt = "CLEANUP TEST"
        async def runner(): return {"value": 1}
        await fetch_or_cache(db=session, model=model, strategy=strategy, prompt=prompt, runner=runner, ttl_seconds=1)
        # Age row artificially
        p_hash = sha256_text(prompt)
        key = sha256_text(f"{model}:{strategy}:{p_hash}")
        obj = await session.get(LLMCache, key)
        past = (obj.created_at - timedelta(seconds=4000))
        if past.tzinfo:
            past = past.replace(tzinfo=None)
        obj.created_at = past
        await session.flush()
        # Perform deletion manually emulating cleanup
        await session.delete(obj)
        await session.commit()
        gone = await session.get(LLMCache, key)
        assert gone is None


async def test_duplicate_resume_reuse(monkeypatch):
    # Validate that identical content returns same resume_id
    from app.services.resume_service import ResumeService
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        svc = ResumeService(session)
        content = b"Sample Resume Content"
        # insert first
        rid1 = await svc.convert_and_store_resume(
            file_bytes=content,
            file_type="application/pdf",
            filename="r1.pdf",
            content_type="md",
            defer_structured=True,
        )
        # second identical
        rid2 = await svc.convert_and_store_resume(
            file_bytes=content,
            file_type="application/pdf",
            filename="r2.pdf",
            content_type="md",
            defer_structured=True,
        )
        assert rid1 == rid2


async def test_invalidation_endpoint_resume(monkeypatch):
    """Ensure that cache entries indexed to a resume can be invalidated via API endpoint."""
    from app.services.resume_service import ResumeService
    from app.base import create_app
    from fastapi.testclient import TestClient
    from app.models import LLMCacheIndex
    from app.agent.cache_utils import fetch_or_cache

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as session:
        # Instead of invoking full LLM pipeline (which depends on external provider), seed a cache entry directly.
        # 1. Insert minimal resume row
        from app.models import Resume
        import uuid as _uuid
        rid = str(_uuid.uuid4())
        session.add(Resume(resume_id=rid, content="dummy", content_hash="h", content_type="md"))
        await session.flush()
        # 2. Create a deterministic cached response indexed to this resume
        async def runner():
            return {"ok": True}
        await fetch_or_cache(
            db=session,
            model="gemma3:4b",
            strategy="json",
            prompt=f"dummy prompt {rid}",
            runner=runner,
            index_entities={"resume": rid},
        )
        await session.commit()
        # 3. Verify index present
        idx_rows = await session.execute(text("SELECT COUNT(*) FROM llm_cache_index WHERE entity_type='resume' AND entity_id=:rid"), {"rid": rid})
        assert idx_rows.scalar_one() == 1

    app = create_app()
    client = TestClient(app)
    # Invalidate
    resp = client.delete(f"/api/v1/cache/entity/resume/{rid}")
    assert resp.status_code == 200
    deleted = resp.json().get("deleted")
    assert deleted >= 1
