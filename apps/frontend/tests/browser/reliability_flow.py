"""Real Next navigation/download/multi-tab controls using synthetic API responses.

Run against an owned frontend with BACKEND_ORIGIN pointing at a closed port.
All browser API requests are intercepted; external origins are blocked.
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from playwright.async_api import Error as PlaywrightError, Route, async_playwright


def resume(identity: str) -> dict[str, Any]:
    """Return one small, isolated resume representation."""
    return {
        "processed_resume": {
            "personalInfo": {
                "name": "Alice Synthetic" if identity == "a" else "Bob Synthetic",
                "email": "fixture@example.invalid",
            },
            "summary": "Synthetic navigation fixture",
            "workExperience": [],
            "education": [],
            "personalProjects": [],
            "additional": {
                "technicalSkills": [],
                "languages": [],
                "certificationsTraining": [],
                "awards": [],
            },
        },
        "raw_resume": {"processing_status": "ready"},
        "title": f"{identity.upper()} fixture",
        "parent_id": "master",
        "cover_letter": "ALICE COVER" if identity == "a" else None,
    }


async def check_flow(base_url: str, output: Path) -> None:
    """Exercise real routing and browser storage without a backend connection."""
    output.mkdir(parents=True, exist_ok=True)
    parsed_base = urlparse(base_url)
    if parsed_base.hostname not in {"127.0.0.1", "localhost"}:
        raise ValueError("Use an owned loopback frontend")
    pending_a = asyncio.Event()
    release_a = asyncio.Event()
    completed_a = asyncio.Event()
    requests: list[str] = []
    abandoned_responses: list[str] = []
    errors: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        context = await browser.new_context(accept_downloads=True)
        document = await context.new_page()
        await document.set_content("<h1>Synthetic PDF download</h1>")
        pdf = await document.pdf()
        await document.close()

        async def route_request(route: Route) -> None:
            url = urlparse(route.request.url)
            if url.hostname != parsed_base.hostname or url.port != parsed_base.port:
                await route.abort()
                return
            if not url.path.startswith("/api/"):
                await route.continue_()
                return
            requests.append(f"{route.request.method} {url.path}?{url.query}")
            query = parse_qs(url.query)
            if url.path.endswith("/pdf"):
                await route.fulfill(
                    status=200, content_type="application/pdf", body=pdf
                )
                return
            if (
                url.path.endswith("/generate-cover-letter")
                and route.request.method == "POST"
            ):
                await route.fulfill(
                    json={
                        "content": "BOB GENERATED COVER",
                        "message": "Synthetic generated content",
                    }
                )
                return
            if route.request.method not in {"GET", "HEAD"}:
                await route.fulfill(
                    status=503, json={"detail": "Synthetic offline save"}
                )
                return
            if url.path.endswith("/resumes"):
                identity = query.get("resume_id", ["b"])[0]
                if identity == "a" and not release_a.is_set():
                    pending_a.set()
                    await asyncio.wait_for(release_a.wait(), 45)
                try:
                    await route.fulfill(json={"data": resume(identity)})
                except PlaywrightError:
                    if identity != "a" or not release_a.is_set():
                        raise
                    # Going Back may cancel this abandoned navigation request.
                    abandoned_responses.append(route.request.url)
                finally:
                    if identity == "a":
                        completed_a.set()
                return
            if url.path.endswith("/resumes/list"):
                data: Any = {
                    "data": [
                        {
                            "resume_id": key,
                            "title": f"{key.upper()} route card",
                            "is_master": False,
                            "parent_id": None,
                            "processing_status": "ready",
                            "created_at": "2026-01-01",
                            "updated_at": "2026-01-01",
                        }
                        for key in ("a", "b")
                    ]
                }
            elif "/job-description" in url.path:
                data = {"content": "Synthetic job description"}
            elif "/config" in url.path:
                data = {
                    "llm_configured": True,
                    "ui_language": "en",
                    "content_language": "en",
                    "provider": "openai",
                    "model": "synthetic",
                }
            else:
                data = {
                    "llm_configured": True,
                    "has_master_resume": False,
                    "total_resumes": 2,
                    "resumes": 2,
                    "jobs": 0,
                    "improvements": 0,
                    "status": "ok",
                }
            await route.fulfill(json=data)

        await context.route("**/*", route_request)
        page = await context.new_page()
        page.set_default_timeout(20000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            await page.goto(f"{base_url}/dashboard", wait_until="domcontentloaded")
            await page.get_by_text("A route card", exact=True).click()
            await page.wait_for_url("**/resumes/a")
            await asyncio.wait_for(pending_a.wait(), 20)
            await page.go_back(wait_until="domcontentloaded")
            await page.get_by_text("B route card", exact=True).click()
            await page.wait_for_url("**/resumes/b")
            await page.get_by_text("Bob Synthetic", exact=True).wait_for()
            release_a.set()
            await asyncio.wait_for(completed_a.wait(), 20)
            assert next(i for i, request in enumerate(requests) if "resume_id=a" in request) < next(i for i, request in enumerate(requests) if "resume_id=b" in request)
            # This is a browser navigation/order check; commit-boundary stale
            # result ownership is covered separately by operation-owner tests.
            body = await page.locator("body").inner_text()
            assert (
                "bob synthetic" in body.lower()
                and "alice synthetic" not in body.lower()
            )

            async with page.expect_download() as downloading:
                await page.get_by_role(
                    "button", name="Download Resume", exact=True
                ).click()
            download = await downloading.value
            downloaded = output / "synthetic-download.pdf"
            await download.save_as(downloaded)
            assert downloaded.read_bytes() == pdf
            assert any("/resumes/b/pdf" in request for request in requests)

            await page.get_by_role("button", name="OK", exact=True).click()
            await page.get_by_role("button", name="Edit Resume", exact=True).click()
            await page.wait_for_url("**/builder?id=b")
            await page.goto(
                f"{base_url}/builder?id=a&tab=cover-letter", wait_until="domcontentloaded"
            )
            textbox = page.get_by_role("textbox")
            await page.wait_for_function("document.querySelector('textarea')?.value === 'ALICE COVER'")
            assert await textbox.input_value() == "ALICE COVER"
            await page.evaluate(
                "window.history.pushState(null, '', '/builder?id=b&tab=cover-letter')"
            )
            await page.wait_for_selector("textarea", state="detached")
            assert "ALICE COVER" not in await page.locator("body").inner_text()
            await page.get_by_role(
                "button", name="Generate Cover Letter", exact=True
            ).first.click()
            await page.wait_for_function(
                "document.querySelector('textarea')?.value === 'BOB GENERATED COVER'"
            )

            # Same-origin tabs share storage, but drafts remain keyed by resume.
            await textbox.fill("BOB LOCAL DRAFT")
            await page.wait_for_function(
                "Object.keys(localStorage).some(key => key.includes('attachment') && key.includes('b'))"
            )
            second = await context.new_page()
            second.set_default_timeout(20000)
            second.on("pageerror", lambda error: errors.append(str(error)))
            await second.goto(
                f"{base_url}/builder?id=a&tab=cover-letter", wait_until="domcontentloaded"
            )
            await second.wait_for_function("document.querySelector('textarea')?.value === 'ALICE COVER'")
            assert await second.get_by_role("textbox").input_value() == "ALICE COVER"
            assert await textbox.input_value() == "BOB LOCAL DRAFT"
            await page.screenshot(path=str(output / "builder-b.png"))
            await second.close()
            assert errors == [], errors
            (output / "result.json").write_text(
                json.dumps(
                    {
                        "passed": [
                            "viewer A→Back→B request ordering",
                            "actual PDF download for B",
                            "viewer edit navigation",
                            "builder query identity resets absent attachment",
                            "two-tab draft isolation",
                        ],
                        "requests": requests,
                        "abandoned_navigation_responses": abandoned_responses,
                        "page_errors": errors,
                    },
                    indent=2,
                )
            )
        finally:
            release_a.set()
            await context.close()
            await browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(check_flow(args.base_url.rstrip("/"), args.output))


if __name__ == "__main__":
    main()
