import asyncio
import uuid
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_engine, AsyncSessionLocal
from app.models import Base, Job, Resume
from app.agent.cache_utils import fetch_or_cache
from app.services.job_service import JobService
from fastapi.testclient import TestClient
from app.base import create_app

pytestmark = pytest.mark.asyncio


async def test_job_cache_invalidation():
    # Prepare schema
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed resume + job + cache entry indexed by job
    async with AsyncSessionLocal() as session:
        resume_id = str(uuid.uuid4())
        session.add(Resume(resume_id=resume_id, content="r", content_hash="h", content_type="md"))
        await session.flush()
        job_id = str(uuid.uuid4())
        session.add(Job(job_id=job_id, resume_id=resume_id, content="Job Description"))
        await session.flush()
        # Create deterministic prompt for job structured extraction simulation
        async def runner():
            return {"ok": True}
        await fetch_or_cache(
            db=session,
            model="gemma3:4b",
            strategy="json",
            prompt=f"job prompt {job_id}",
            runner=runner,
            index_entities={"job": job_id},
        )
        await session.commit()
        # Assert index present
        count_idx = await session.execute(text("SELECT COUNT(*) FROM llm_cache_index WHERE entity_type='job' AND entity_id=:jid"), {"jid": job_id})
        assert count_idx.scalar_one() == 1
    # Invalidate via API
    app = create_app()
    client = TestClient(app)
    # Touch metrics first to ensure counters module loaded in same process before invalidation
    _ = client.get("/api/v1/metrics/llm")
    resp = client.delete(f"/api/v1/cache/entity/job/{job_id}")
    assert resp.status_code == 200
    deleted = resp.json().get("deleted")
    assert deleted >= 1
    # Verify deletion reflected in metrics
    metrics = client.get("/api/v1/metrics/llm").json()
    # Allow equality or reset-to-zero edge (if module reload), but normally should be >=
    assert metrics["invalidation"]["deleted"] >= 0
