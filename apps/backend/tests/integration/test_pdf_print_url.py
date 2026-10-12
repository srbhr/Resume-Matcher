"""GET /resumes/{id}/pdf validates its template and encodes the print URL."""

from typing import Any
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlsplit

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Database
from app.main import app
from app.routers import resumes as resumes_router


@pytest.fixture
async def resume_id(isolated_db: Database, sample_resume: dict[str, Any]) -> str:
    resume = await isolated_db.create_resume(
        content="# Resume", processed_data=sample_resume, processing_status="ready"
    )
    return resume["resume_id"]


@pytest.mark.parametrize(
    "template", ["unknown", "modern&lang=xx", "modern#", "swiss-single?x=1"]
)
async def test_unknown_templates_are_rejected_before_rendering(
    resume_id: str, monkeypatch: pytest.MonkeyPatch, template: str
) -> None:
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/resumes/{resume_id}/pdf", params={"template": template}
        )

    assert response.status_code == 422
    render.assert_not_awaited()


async def test_print_url_carries_exactly_the_requested_settings(
    resume_id: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/resumes/{resume_id}/pdf",
            params={"template": "modern-deedy", "compactMode": "true", "lang": "pt-BR"},
        )

    assert response.status_code == 200
    url = urlsplit(render.await_args.args[0])
    assert url.path == f"/print/resumes/{resume_id}"
    query = parse_qs(url.query)
    assert query["template"] == ["modern-deedy"]
    assert query["compactMode"] == ["true"]
    assert query["lang"] == ["pt-BR"]
    assert all(len(values) == 1 for values in query.values())
