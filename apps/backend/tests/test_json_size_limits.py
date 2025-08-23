import json
import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import status

from app.base import create_app

@pytest.mark.anyio("asyncio")
async def test_job_upload_json_size_limit_exceeded():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Construct payload just above limit (settings.MAX_JSON_BODY_SIZE_KB = 256)
        # We assume 256KB -> 262144 bytes. We'll create ~ 263000 bytes.
        big_text = "A" * (262144 + 800)
        payload = {
            "job_descriptions": [big_text],
            "resume_id": "00000000-0000-0000-0000-000000000000"
        }
        resp = await client.post("/api/v1/job/upload", json=payload)
    assert resp.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, resp.text
    body = resp.json()
    # BodySizeLimitMiddleware returns envelope with 'error' OR legacy detail; accept either
    detail_text = body.get("detail") or body.get("error", {}).get("message", "")
    assert "exceeds" in detail_text

@pytest.mark.anyio("asyncio")
async def test_job_upload_json_size_limit_under():
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        ok_text = "B" * (256 * 1024 - 500)  # just under limit
        payload = {
            "job_descriptions": [ok_text],
            "resume_id": "00000000-0000-0000-0000-000000000000"
        }
        resp = await client.post("/api/v1/job/upload", json=payload)
        # Could be 200 or 500 depending on downstream resume/job linkage; we only assert not 413
        assert resp.status_code != status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
