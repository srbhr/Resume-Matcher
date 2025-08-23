import pytest
import httpx
from httpx import ASGITransport
from fastapi import status
from app.base import create_app

@pytest.mark.asyncio
async def test_match_json_body_too_large():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        big = "X" * (256*1024 + 1000)
        payload = {"resume_id": big[:36], "job_id": big[:36]}  # oversize due to added big field? Actually we need to enlarge json -> add field
        # Instead we add a big dummy list
        payload = {"resume_id": "00000000-0000-0000-0000-000000000000", "job_id": "00000000-0000-0000-0000-000000000000", "pad": big}
        resp = await client.post("/api/v1/match", json=payload)
        assert resp.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, resp.text

@pytest.mark.asyncio
async def test_match_json_body_within_limit():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        small_pad = "X" * (10 * 1024)
        payload = {"resume_id": "00000000-0000-0000-0000-000000000000", "job_id": "00000000-0000-0000-0000-000000000000", "pad": small_pad}
        resp = await client.post("/api/v1/match", json=payload)
        assert resp.status_code != status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
