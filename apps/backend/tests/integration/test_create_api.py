"""Integration tests for the create-resume wizard endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

pytestmark = pytest.mark.asyncio


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@patch("app.routers.creation.draft_section", new_callable=AsyncMock)
@patch("app.routers.creation.get_llm_config")
async def test_draft_section_returns_fragment(mock_cfg, mock_draft, client):
    mock_cfg.return_value = type("C", (), {"api_key": "sk-x", "provider": "openai"})()
    mock_draft.return_value = {
        "id": 0,
        "title": "Engineer",
        "company": "Google",
        "location": None,
        "years": "",
        "description": ["Did X"],
    }
    async with client:
        resp = await client.post(
            "/api/v1/resumes/draft-section", json={"section": "work", "answers": "google"}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["section"] == "work"
    assert body["data"]["company"] == "Google"


@patch("app.routers.creation.get_llm_config")
async def test_draft_section_guards_unconfigured_llm(mock_cfg, client):
    mock_cfg.return_value = type("C", (), {"api_key": "", "provider": "openai"})()
    async with client:
        resp = await client.post(
            "/api/v1/resumes/draft-section", json={"section": "skills", "answers": "python"}
        )
    assert resp.status_code == 400


async def test_create_resume_becomes_master_when_none_exists(client, isolated_db):
    payload = {
        "processed_data": {
            "personalInfo": {"name": "James"},
            "workExperience": [
                {"id": 1, "title": "Eng", "company": "G", "years": "2020", "description": ["x"]}
            ],
        },
        "title": "James Resume",
    }
    async with client:
        resp = await client.post("/api/v1/resumes", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_master"] is True
    assert body["processing_status"] == "ready"
    # It is persisted and fetchable as the master.
    master = await isolated_db.get_master_resume()
    assert master is not None
    assert master["processed_data"]["personalInfo"]["name"] == "James"


async def test_second_create_is_not_master(client, isolated_db):
    await isolated_db.create_resume(
        content="{}",
        content_type="json",
        is_master=True,
        processed_data={"personalInfo": {"name": "Existing"}},
        processing_status="ready",
    )
    async with client:
        resp = await client.post(
            "/api/v1/resumes", json={"processed_data": {"personalInfo": {"name": "New"}}}
        )
    assert resp.status_code == 200
    assert resp.json()["is_master"] is False
