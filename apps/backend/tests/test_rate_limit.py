import asyncio
import pytest
import httpx
from app.base import create_app
from httpx import ASGITransport

@pytest.mark.asyncio
async def test_rate_limit_headers_and_429(monkeypatch):
    # Ensure rate limit is enabled for this test regardless of global env overrides
    from app.core.config import settings as cfg
    monkeypatch.setenv('RATE_LIMIT_FORCE_DISABLE', 'false')
    cfg.RATE_LIMIT_ENABLED = True  # type: ignore
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # fire more than capacity (default 60), but keep it small to run fast by monkeypatching settings if needed
        # We'll send 65 quick requests to /api/v1/health/ping
        tasks = []
        for i in range(65):
            tasks.append(client.get("/api/v1/health/ping"))
        results = await asyncio.gather(*tasks)
        # At least one should be 429
        status_codes = [r.status_code for r in results]
        assert any(code == 429 for code in status_codes), f"Expected at least one 429, got {status_codes}"
        # Check headers on the first non-200 (or last response)
        limited = next((r for r in results if r.status_code == 429), results[-1])
        assert 'X-RateLimit-Limit' in limited.headers
        assert 'X-RateLimit-Remaining' in limited.headers
        assert 'X-RateLimit-Reset' in limited.headers

@pytest.mark.asyncio
async def test_request_id_header_present():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.get("/api/v1/health/ping")
        assert r.status_code == 200
        assert 'X-Request-ID' in r.headers
        assert r.headers['X-Request-ID']
