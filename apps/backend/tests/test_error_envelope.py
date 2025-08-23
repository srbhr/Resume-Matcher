import httpx
import pytest
from httpx import ASGITransport
from app.base import create_app

NOT_FOUND_RESUME = "11111111-1111-1111-1111-111111111111"
NOT_FOUND_JOB = "22222222-2222-2222-2222-222222222222"

@pytest.mark.asyncio
async def test_get_resume_not_found_error_envelope():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.get(f"/api/v1/resume?resume_id={NOT_FOUND_RESUME}")
        assert r.status_code == 404
        body = r.json()
        assert set(body.keys()) == {"request_id", "error"}
        assert body["error"]["code"] == "RESUME_NOT_FOUND"
        assert "message" in body["error"]

@pytest.mark.asyncio
async def test_get_job_not_found_error_envelope():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.get(f"/api/v1/job?job_id={NOT_FOUND_JOB}")
        assert r.status_code == 404
        body = r.json()
        assert body["error"]["code"] == "JOB_NOT_FOUND"

@pytest.mark.asyncio
async def test_match_parsing_error_envelope():
    # Provide clearly invalid UUIDs that should trip validation/parsing path inside service (may produce 422)
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        payload = {"resume_id": NOT_FOUND_RESUME, "job_id": NOT_FOUND_JOB}
        r = await client.post("/api/v1/match", json=payload)
        # Could be 404 or 422 depending on service behavior; ensure envelope present not 500
        assert r.status_code in (404, 422)
        body = r.json()
        assert "error" in body and "code" in body["error"]

@pytest.mark.asyncio
async def test_resume_improve_missing_ids():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Missing resume_id/job_id triggers domain errors -> envelope
        r = await client.post("/api/v1/resume/improve", json={})
        assert r.status_code in (404, 422)
        body = r.json()
        assert "error" in body
        assert "code" in body["error"]
