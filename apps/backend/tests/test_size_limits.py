import os
import pytest
import httpx
from httpx import ASGITransport
from app.base import create_app
from app.core import settings

@pytest.mark.asyncio
async def test_resume_upload_size_limit(tmp_path):
    app = create_app()
    big_size = (settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024) + 10
    big_bytes = b"0" * big_size
    tmp_file = tmp_path / "big.pdf"
    tmp_file.write_bytes(big_bytes)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        with tmp_file.open('rb') as f:
            files = {"file": ("big.pdf", f, "application/pdf")}
            r = await client.post("/api/v1/resumes/upload", files=files)
    assert r.status_code == 413, r.text

@pytest.mark.asyncio
async def test_job_upload_json_size_limit(monkeypatch):
    app = create_app()

    # Build JSON just over limit
    over = (settings.MAX_JSON_BODY_SIZE_KB * 1024) + 50
    payload = {"job_markdown": "A" * (over - 30)}  # compensate for JSON overhead

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        r = await client.post("/api/v1/jobs/upload", json=payload, headers={"Content-Type": "application/json"})
    assert r.status_code == 413, r.text
