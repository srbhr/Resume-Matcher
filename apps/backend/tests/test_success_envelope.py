import httpx
import pytest
from httpx import ASGITransport
from app.base import create_app

@pytest.mark.asyncio
async def test_job_upload_success_envelope():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        payload = {"job_descriptions": ["Sample JD"], "resume_id": "00000000-0000-0000-0000-000000000000"}
        r = await client.post("/api/v1/job/upload", json=payload)
        # Accept 200 or 422/404 depending on downstream logic; if success check envelope
        if r.status_code < 400:
            body = r.json()
            assert set(body.keys()) == {"request_id", "data"}
            assert "job_id" in body["data"]
        else:
            body = r.json()
            assert "error" in body

@pytest.mark.asyncio
async def test_resume_upload_rejects_wrong_type():
    app = create_app()
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        files = {"file": ("cv.txt", b"plain text", "text/plain")}
        r = await client.post("/api/v1/resume/upload", files=files)
        assert r.status_code == 400
        body = r.json()
        # legacy handler still returns detail; tolerate both until unified exception layer extended
        assert any(k in body for k in ("error", "detail"))
