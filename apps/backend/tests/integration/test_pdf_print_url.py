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


@pytest.mark.parametrize(
    "params",
    [
        {"marginTop": "40"},
        {"pageSize": "A3"},
        {"headerFont": "cursive"},
        {"linkStyle": "button"},
        {"listSkills": "bullets"},
        {"lang": "english"},
        {"fontSize": "0"},
    ],
)
async def test_out_of_range_settings_are_rejected_before_rendering(
    resume_id: str, monkeypatch: pytest.MonkeyPatch, params: dict[str, str]
) -> None:
    """The print settings model keeps every bound and allowed value the separate
    query parameters had."""
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(f"/api/v1/resumes/{resume_id}/pdf", params=params)

    assert response.status_code == 422
    render.assert_not_awaited()


async def test_margins_and_page_size_reach_the_renderer(
    resume_id: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    render = AsyncMock(return_value=b"%PDF")
    monkeypatch.setattr(resumes_router, "render_resume_pdf", render)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            f"/api/v1/resumes/{resume_id}/pdf",
            params={
                "pageSize": "LETTER",
                "marginTop": "12",
                "marginRight": "14",
                "marginBottom": "16",
                "marginLeft": "18",
                "listCertifications": "comma",
            },
        )

    assert response.status_code == 200
    url, page_size = render.await_args.args
    assert page_size == "LETTER"
    assert render.await_args.kwargs["margins"] == {
        "top": 12,
        "right": 14,
        "bottom": 16,
        "left": 18,
    }
    assert parse_qs(urlsplit(url).query)["listCertifications"] == ["comma"]
