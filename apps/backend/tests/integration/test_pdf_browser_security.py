"""The PDF renderer prefers sandboxed system Chrome and loads only its own origin.

Playwright's pinned Chromium can lag Chrome's security fixes and runs without the
sandbox by default (CVE-2026-118306), so the renderer launches the installed,
auto-updated Chrome with its sandbox on when it can. Whatever browser it gets, a
print page may only load resources from the origin being rendered.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import AsyncIterator, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import pytest
from playwright.async_api import Error as PlaywrightError

import app.pdf as pdf_module


class FakeChromium:
    """Records launch arguments; fails the launches named in ``failures``."""

    def __init__(self, failures: dict[str, BaseException] | None = None) -> None:
        self.failures = failures or {}
        self.calls: list[dict[str, Any]] = []

    async def launch(self, **kwargs: Any) -> str:
        self.calls.append(kwargs)
        kind = kwargs.get("channel") or (
            "executable" if "executable_path" in kwargs else "bundled"
        )
        if kind in self.failures:
            raise self.failures[kind]
        return f"browser:{kind}"


class FakePlaywright:
    def __init__(self, chromium: FakeChromium) -> None:
        self.chromium = chromium


async def test_launch_prefers_system_chrome_with_sandbox() -> None:
    chromium = FakeChromium()

    browser = await pdf_module._launch_browser(FakePlaywright(chromium))  # type: ignore[arg-type]

    assert browser == "browser:chrome"
    assert chromium.calls == [{"channel": "chrome", "chromium_sandbox": True}]


async def test_launch_falls_back_to_bundled_chromium_without_system_chrome() -> None:
    chromium = FakeChromium(
        {"chrome": PlaywrightError("Chromium distribution 'chrome' is not found")}
    )

    browser = await pdf_module._launch_browser(FakePlaywright(chromium))  # type: ignore[arg-type]

    assert browser == "browser:bundled"
    assert chromium.calls == [{"channel": "chrome", "chromium_sandbox": True}, {}]


async def test_launch_keeps_executable_fallback_when_bundled_build_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chromium = FakeChromium(
        {
            "chrome": PlaywrightError("Chromium distribution 'chrome' is not found"),
            "bundled": PlaywrightError("Executable doesn't exist at /ms-playwright"),
        }
    )
    monkeypatch.setattr(pdf_module, "_find_chromium_executable", lambda: "/opt/edge")

    browser = await pdf_module._launch_browser(FakePlaywright(chromium))  # type: ignore[arg-type]

    assert browser == "browser:executable"
    assert chromium.calls[-1] == {"executable_path": "/opt/edge"}


class _RecordingServer:
    """Local HTTP server that records every path requested from it."""

    def __init__(
        self,
        body: bytes,
        content_type: str = "text/html",
        redirect: str | None = None,
    ) -> None:
        self.paths: list[str] = []
        recorder = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - http.server API
                recorder.paths.append(self.path)
                if redirect and self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", redirect)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                payload = body if self.path.startswith("/print") else b""
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args: Any) -> None:
                del args

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> _RecordingServer:
        self.thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def servers() -> Iterator[tuple[_RecordingServer, _RecordingServer]]:
    with _RecordingServer(b"") as outside:
        page = (
            "<html><head>"
            f"<link rel='stylesheet' href='http://127.0.0.1:{outside.port}/style.css'>"
            f"<script src='http://127.0.0.1:{outside.port}/script.js'></script>"
            "</head><body><main class='resume-print'>Synthetic resume</main>"
            f"<img src='http://127.0.0.1:{outside.port}/tracker.png'>"
            "<img src='/same-origin.png'>"
            "</body></html>"
        ).encode()
        with _RecordingServer(page) as app_origin:
            yield app_origin, outside


@pytest.fixture
async def fresh_renderer() -> AsyncIterator[None]:
    await pdf_module.close_pdf_renderer()
    yield
    await pdf_module.close_pdf_renderer()


async def test_render_loads_only_the_print_page_origin(
    servers: tuple[_RecordingServer, _RecordingServer], fresh_renderer: None
) -> None:
    app_origin, outside = servers
    try:
        pdf = await pdf_module.render_resume_pdf(
            f"http://127.0.0.1:{app_origin.port}/print/resumes/1"
        )
    except pdf_module.PDFRenderError as error:
        if "executable" in str(error).lower() or "installation" in str(error).lower():
            pytest.skip(f"chromium unavailable: {error}")
        raise

    assert pdf.startswith(b"%PDF")
    assert "/print/resumes/1" in app_origin.paths
    assert "/same-origin.png" in app_origin.paths
    assert outside.paths == []


async def _render(url: str) -> bytes:
    try:
        return await pdf_module.render_resume_pdf(url)
    except pdf_module.PDFRenderError as error:
        if "executable" in str(error).lower() or "installation" in str(error).lower():
            pytest.skip(f"chromium unavailable: {error}")
        raise


# The page shows the resume only after its probe settles, so the render waits
# for the redirect or socket attempt instead of racing it.
_SHOW_RESUME = (
    "const done = () => document.body.insertAdjacentHTML("
    "'beforeend', \"<main class='resume-print'>Synthetic resume</main>\");"
)


async def test_redirect_to_another_origin_is_not_followed(
    fresh_renderer: None,
) -> None:
    """A same-origin URL that redirects elsewhere must not reach the other origin."""
    with _RecordingServer(b"") as outside:
        page = (
            "<html><body><img id='probe' src='/redirect'><script>"
            f"{_SHOW_RESUME}"
            "const probe = document.getElementById('probe');"
            "probe.onload = done; probe.onerror = done;"
            "</script></body></html>"
        ).encode()
        leak = f"http://127.0.0.1:{outside.port}/leak"
        with _RecordingServer(page, redirect=leak) as app_origin:
            pdf = await _render(f"http://127.0.0.1:{app_origin.port}/print/resumes/1")

    assert pdf.startswith(b"%PDF")
    assert "/redirect" in app_origin.paths
    assert outside.paths == []


async def test_websocket_to_another_origin_is_blocked(fresh_renderer: None) -> None:
    """page.route does not see WebSockets; an off-origin socket must not connect."""
    with _RecordingServer(b"") as outside:
        page = (
            "<html><body><script>"
            f"{_SHOW_RESUME}"
            f"const socket = new WebSocket('ws://127.0.0.1:{outside.port}/socket');"
            "socket.onopen = done; socket.onerror = done; socket.onclose = done;"
            "</script></body></html>"
        ).encode()
        with _RecordingServer(page) as app_origin:
            pdf = await _render(f"http://127.0.0.1:{app_origin.port}/print/resumes/1")

    assert pdf.startswith(b"%PDF")
    assert outside.paths == []


class _FakeRequest:
    url = "http://127.0.0.1:3000/_next/static/chunk.js"


class _FakeRoute:
    """Route double: its fetch fails or returns a response, and records calls."""

    def __init__(self, fetch_error: Exception | None = None) -> None:
        self.request = _FakeRequest()
        self.fetch_error = fetch_error
        self.fetch_kwargs: dict[str, Any] = {}
        self.aborted: list[str | None] = []

    async def fetch(self, **kwargs: Any) -> Any:
        self.fetch_kwargs = kwargs
        if self.fetch_error is not None:
            raise self.fetch_error
        return type("Response", (), {"status": 200, "headers": {}})()

    async def abort(self, error_code: str | None = None) -> None:
        self.aborted.append(error_code)

    async def fulfill(self, **kwargs: Any) -> None:
        raise PlaywrightError("fulfill failed")


class _FakePage:
    def __init__(self, closed: bool) -> None:
        self.closed = closed

    def is_closed(self) -> bool:
        return self.closed


async def test_request_fetch_is_bounded_by_the_render_deadline() -> None:
    deadline = asyncio.get_running_loop().time() + 2.0
    route = _FakeRoute(
        fetch_error=PlaywrightError("connect ECONNREFUSED 127.0.0.1:3000")
    )
    handle = pdf_module._same_origin_only(
        "http://127.0.0.1:3000/print/resumes/1", _FakePage(closed=False), deadline
    )

    await handle(route)  # type: ignore[arg-type]

    assert route.fetch_kwargs["max_redirects"] == 0
    assert 1 <= route.fetch_kwargs["timeout"] <= 2000
    assert route.aborted == ["connectionrefused"]


@pytest.mark.parametrize(
    ("closed", "level"), [(False, logging.WARNING), (True, logging.DEBUG)]
)
async def test_request_failure_is_logged_unless_the_page_closed(
    caplog: pytest.LogCaptureFixture, closed: bool, level: int
) -> None:
    deadline = asyncio.get_running_loop().time() + 2.0
    handle = pdf_module._same_origin_only(
        "http://127.0.0.1:3000/print/resumes/1", _FakePage(closed=closed), deadline
    )

    with caplog.at_level(logging.DEBUG, logger="app.pdf"):
        await handle(_FakeRoute())  # type: ignore[arg-type]

    records = [r for r in caplog.records if "chunk.js" in r.getMessage()]
    assert [r.levelno for r in records] == [level]
