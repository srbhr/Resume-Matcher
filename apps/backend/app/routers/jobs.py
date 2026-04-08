"""Job description management endpoints."""

import asyncio
import atexit
import ipaddress
import logging
import re
import socket
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException

from app.database import db
from app.schemas import FetchJobUrlRequest, FetchJobUrlResponse, JobUploadRequest, JobUploadResponse

_LLM_FILTER_PROMPT = """\
Extract only the job description content from the raw text below.
Include: job title, company name, company description, responsibilities, requirements/qualifications, tech stack, and benefits/perks.
Exclude entirely: navigation menus, page headers, cookie banners, advertisements, \
"similar offers" / "recommended jobs" sections, apply buttons, salary widgets repeated at the bottom, \
share/save buttons, and any other UI chrome.
Preserve the original language of the text.
Return ONLY the cleaned job description — no preamble, no commentary.

RAW TEXT:
"""

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])

# ---------------------------------------------------------------------------
# Site-specific extraction map (for JS-rendered job portals)
# ---------------------------------------------------------------------------
# Maps domain → extraction config.
# "wait_for"  – CSS selector Playwright waits for before reading the page.
# "selectors" – ordered list of CSS selectors to try; first one that yields
#               >= 200 chars of text wins.  Falls back to SmartExtractor on
#               the rendered HTML if none match.

SITE_MAP: dict[str, dict] = {
    "theprotocol.it": {
        "strategy": "playwright",
        "wait_for": "[id='section-offerView'], main",
        "selectors": [
            "[id='section-offerView']",
            "[id='offerView']",
            "article",
            "main",
        ],
    },
    "nofluffjobs.com": {
        "strategy": "playwright",
        "wait_for": "[id='posting-description'], [class*='posting'], main",
        "selectors": [
            "[id='posting-description']",
            "[class*='posting-description']",
            "[class*='PostingDescription']",
            "[class*='job-description']",
            "[class*='JobDescription']",
            "article",
            "main",
        ],
    },
    "pracuj.pl": {
        "strategy": "playwright",
        "wait_for": "[data-test='section-benefit-expectations-text'], [class*='offer'], main",
        "selectors": [
            "[data-test='section-benefit-expectations-text']",
            "[data-test='offer-description']",
            "[class*='offer-description']",
            "[class*='offerDescription']",
            "main",
        ],
    },
    "justjoin.it": {
        "strategy": "playwright",
        "wait_for": "[class*='JobOffer'], [class*='job-offer'], main",
        "selectors": [
            "[class*='JobOfferContent']",
            "[class*='job-offer-content']",
            "[class*='JobDescription']",
            "[class*='job-description']",
            "[class*='OfferBody']",
            "[class*='offer-body']",
            "[class*='JobOffer']:not([class*='Header']):not([class*='Nav']):not([class*='Similar']):not([class*='Footer'])",
            "main",
        ],
        # Text markers used to trim noise after Playwright extraction
        "trim_after": [
            "Check similar offers",
            "Summary of the offer",
            "ADVERTISEMENT",
            "Check similar offers\n",
        ],
        "trim_before_last": [
            # Remove the duplicated bottom card (salary repeated after the description)
            # by keeping only content up to the second occurrence of the job title block
        ],
    },
    "linkedin.com": {
        "strategy": "playwright",
        "wait_for": ".description__text, .jobs-description",
        "selectors": [
            ".description__text",
            ".jobs-description",
            "main",
        ],
    },
    "indeed.com": {
        "strategy": "playwright",
        "wait_for": "[id='jobDescriptionText'], main",
        "selectors": [
            "[id='jobDescriptionText']",
            "[class*='jobsearch-JobComponent']",
            "main",
        ],
    },
}


def _get_site_config(url: str) -> dict | None:
    """Return site-specific config if the URL matches a known portal."""
    host = urlparse(url).hostname or ""
    host = host.removeprefix("www.")
    for domain, config in SITE_MAP.items():
        if host == domain or host.endswith("." + domain):
            return config
    return None


def _is_private_host(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback/reserved IP (SSRF guard).

    Uses getaddrinfo() to cover both IPv4 and IPv6 (including IPv4-mapped IPv6
    addresses like ::ffff:127.0.0.1).  Returns True (blocked) if *any* resolved
    address is private, or if the hostname cannot be resolved.
    """
    try:
        results = socket.getaddrinfo(hostname, None)
        for result in results:
            ip_str = result[4][0]
            # Strip IPv6 zone ID if present (e.g. "fe80::1%eth0")
            ip_str = ip_str.split("%")[0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
            ):
                return True
        return False
    except Exception:
        return True  # Reject unresolvable hosts


# ---------------------------------------------------------------------------
# Site-specific text cleanup (applied after extraction, no LLM needed)
# ---------------------------------------------------------------------------

# Heading-level noise lines at the very top of the page (navigation counters, etc.)
_TOP_NOISE_RE = re.compile(
    r"^(?:Show menu\s*|(?:\d+\s*){3,})",
    re.MULTILINE,
)

# Lines that are pure UI chrome (single action words / short labels)
_UI_LINE_RE = re.compile(
    r"^\s*(Save|Apply|Share|Follow|Report|Back|Close|Open|More|Less|"
    r"Hybrid|Remote|Full-time|Part-time|B2B|Permanent|Mid|Senior|Junior|"
    r"Contract|Freelance)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def _apply_site_cleanup(text: str, config: dict) -> str:
    """Apply rule-based noise removal using site-specific trim markers.

    1. Cut everything after the first ``trim_after`` marker found in the text.
    2. Strip leading nav/counter noise (e.g. the "0 0 0 0 … Show menu" header
       that justjoin.it renders before the actual offer).
    3. Remove isolated UI-chrome lines.
    4. Collapse excessive blank lines.
    """
    trim_after: list[str] = config.get("trim_after", [])
    for marker in trim_after:
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
            logger.debug("Site cleanup: trimmed at marker %r", marker)
            break

    # Strip leading counter/nav noise (lines of single digits or "Show menu")
    text = _TOP_NOISE_RE.sub("", text)

    # Remove isolated UI-chrome single-word lines
    text = _UI_LINE_RE.sub("", text)

    # Collapse 3+ blank lines → 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ---------------------------------------------------------------------------
# Playwright extractor (for JS-rendered portals)
# ---------------------------------------------------------------------------


_playwright_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="playwright")
atexit.register(_playwright_executor.shutdown, True)


def _run_playwright_sync(url: str, config: dict) -> str | None:
    """Synchronous Playwright extraction — runs in a thread pool (Windows-safe)."""
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeout
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("Playwright not installed – falling back to httpx")
        return None

    selectors: list[str] = config.get("selectors", [])
    wait_for: str = config.get("wait_for", "main")

    # Re-check hostname inside the thread — defense-in-depth against DNS rebinding
    # (the caller already validates, but the check-time to use-time window matters).
    parsed_host = urlparse(url).hostname or ""
    if _is_private_host(parsed_host):
        logger.warning("Playwright: SSRF guard blocked %s inside thread", url)
        return None

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    )
                )
                # Block heavy assets to speed up loading
                page.route(
                    "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}",
                    lambda route: route.abort(),
                )
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)

                # Wait for main content to appear
                try:
                    page.wait_for_selector(wait_for, timeout=12_000)
                except PlaywrightTimeout:
                    logger.warning("wait_for selector timed out for %s – continuing", url)

                # Try all site-specific selectors and keep the longest result
                best_text = ""
                best_sel = ""
                for sel in selectors:
                    try:
                        elements = page.query_selector_all(sel)
                        if not elements:
                            continue
                        parts: list[str] = []
                        for el in elements:
                            text = el.inner_text()
                            if text and text.strip():
                                parts.append(text.strip())
                        combined = "\n\n".join(parts)
                        if len(combined) > len(best_text):
                            best_text = combined
                            best_sel = sel
                    except Exception as sel_exc:
                        logger.debug("Selector '%s' failed: %s", sel, sel_exc)
                        continue

                if len(best_text) >= 200:
                    logger.info(
                        "Playwright: selector '%s' yielded %d chars", best_sel, len(best_text)
                    )
                    cleaned = _apply_site_cleanup(best_text, config)
                    logger.info(
                        "Playwright: after site cleanup %d → %d chars", len(best_text), len(cleaned)
                    )
                    return cleaned

                # Last resort: run SmartExtractor on fully-rendered HTML
                logger.info("Playwright: no selector matched – falling back to SmartExtractor")
                html = page.content()
                raw = _extract_text_from_html(html)
                return _apply_site_cleanup(raw, config)

            finally:
                browser.close()

    except Exception as exc:
        logger.error("Playwright extraction failed for %s: %s", url, exc)
        return None


async def _extract_with_playwright(url: str, config: dict) -> str | None:
    """Dispatch Playwright extraction to a thread pool (avoids Windows asyncio subprocess issue)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_playwright_executor, _run_playwright_sync, url, config)


# ---------------------------------------------------------------------------
# Rule-based HTML → job-description extractor (for static sites)
# ---------------------------------------------------------------------------

# Tags whose entire subtree is discarded
_SKIP_BY_TAG = frozenset(
    {
        "script", "style", "noscript", "template", "svg", "canvas",
        "nav", "footer", "header", "aside", "dialog", "head",
        "meta", "link", "iframe",
    }
)

# Void elements — never have end tags in HTML5
_VOID_TAGS = frozenset(
    {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }
)

# Block-level tags that trigger a newline when closed
_BLOCK_TAGS = frozenset(
    {
        "p", "div", "li", "ul", "ol", "br", "h1", "h2", "h3", "h4",
        "h5", "h6", "tr", "td", "th", "section", "article", "main",
        "blockquote", "pre", "details", "summary", "figcaption",
    }
)

# Class/id keyword patterns that identify boilerplate sections to skip
_SKIP_PATTERN = re.compile(
    r"\b(cookie|gdpr|consent|modal|overlay|navbar|nav[-_]|menu[-_]|"
    r"sidebar|filter|filter[-_]|banner|notification|alert|popup|toast|"
    r"breadcrumb|social|share|follow|related|advert|promo|"
    r"search[-_]bar|header[-_]|footer[-_]|site[-_]header|site[-_]footer|"
    r"top[-_]bar|bottom[-_]bar|widget|tag[-_]list|"
    r"similar[-_]offer|similar[-_]job|recommended[-_]job|check[-_]similar|"
    r"other[-_]offer|more[-_]offer|job[-_]suggest|suggest[-_]|"
    r"advertisement|sponsored|promoted)\b",
    re.IGNORECASE,
)

# Class/id/role keyword patterns that identify the main job content
_PREFER_PATTERN = re.compile(
    r"\b(job|offer|position|vacancy|description|details?|content|"
    r"requirements?|responsibilities|qualifications?|about[-_]role|"
    r"main[-_]content|article[-_]body|post[-_]body|text[-_]content|"
    r"job[-_]detail|offer[-_]detail|offer[-_]content|"
    r"listing[-_]detail|posting|specification)\b",
    re.IGNORECASE,
)

_PREFER_ROLES = frozenset({"main", "article"})
_PREFER_TAGS = frozenset({"main", "article"})

_WHITESPACE_RE = re.compile(r"[ \t]{2,}")
_BLANK_LINES_RE = re.compile(r"\n{3,}")


def _attr_dict(attrs: list) -> dict[str, str]:
    return {k: (v or "") for k, v in attrs}


def _is_skip_element(tag: str, attrs: dict[str, str]) -> bool:
    if tag in _SKIP_BY_TAG:
        return True
    role = attrs.get("role", "")
    if role in {"navigation", "banner", "complementary", "contentinfo", "dialog", "search"}:
        return True
    haystack = f"{attrs.get('class', '')} {attrs.get('id', '')}"
    return bool(_SKIP_PATTERN.search(haystack))


def _is_preferred_element(tag: str, attrs: dict[str, str]) -> bool:
    if tag in _PREFER_TAGS:
        return True
    role = attrs.get("role", "")
    if role in _PREFER_ROLES:
        return True
    haystack = f"{attrs.get('class', '')} {attrs.get('id', '')}"
    return bool(_PREFER_PATTERN.search(haystack))


class _SmartExtractor(HTMLParser):
    """
    Two-bucket HTML text extractor.

    Text inside 'preferred' elements (main, article, job-description divs)
    goes into self._preferred.  All other non-skip text goes into self._all.

    get_text() returns preferred content when it contains enough substance,
    otherwise falls back to the full-page text.
    """

    def __init__(self) -> None:
        super().__init__()
        # Stack entries: (tag, is_skip, is_preferred)
        self._stack: list[tuple[str, bool, bool]] = []
        self._preferred: list[str] = []
        self._all: list[str] = []

    # ------------------------------------------------------------------
    # Stack helpers
    # ------------------------------------------------------------------

    def _in_skip(self) -> bool:
        return any(s for _, s, _ in self._stack)

    def _in_preferred(self) -> bool:
        return any(p for _, _, p in self._stack)

    # ------------------------------------------------------------------
    # HTMLParser callbacks
    # ------------------------------------------------------------------

    def handle_starttag(self, tag: str, attrs: list) -> None:
        tag = tag.lower()
        attr = _attr_dict(attrs)
        skip = _is_skip_element(tag, attr)
        prefer = (not skip) and _is_preferred_element(tag, attr)
        if tag not in _VOID_TAGS:
            self._stack.append((tag, skip, prefer))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        # Pop the most recent matching open tag from the stack
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                self._stack.pop(i)
                break
        # Emit newline for block elements when not in a skip zone
        if tag in _BLOCK_TAGS and not self._in_skip():
            target = self._preferred if self._in_preferred() else self._all
            target.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_skip():
            return
        stripped = data.strip()
        if not stripped:
            return
        if self._in_preferred():
            self._preferred.append(stripped)
        else:
            self._all.append(stripped)

    # ------------------------------------------------------------------
    # Result
    # ------------------------------------------------------------------

    def _join(self, parts: list[str]) -> str:
        raw = " ".join(parts)
        raw = _WHITESPACE_RE.sub(" ", raw)
        raw = re.sub(r" ?\n ?", "\n", raw)
        raw = _BLANK_LINES_RE.sub("\n\n", raw)
        return raw.strip()

    def get_text(self) -> str:
        preferred_text = self._join(self._preferred)
        if len(preferred_text) >= 200:
            return preferred_text
        # Fall back to all collected text (minus skip zones)
        return self._join(self._all)


def _extract_text_from_html(html: str) -> str:
    extractor = _SmartExtractor()
    extractor.feed(html)
    return extractor.get_text()


# ---------------------------------------------------------------------------
# LLM-based content filter
# ---------------------------------------------------------------------------

# Heuristic: if extracted text has too high a ratio of short lines it is
# probably full of UI noise (counters, nav items, button labels).
_SHORT_LINE_RE = re.compile(r"^.{0,6}$")


def _looks_noisy(text: str) -> bool:
    """Return True when the text likely contains significant UI noise."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False
    short = sum(1 for ln in lines if _SHORT_LINE_RE.match(ln))
    return short / len(lines) > 0.25  # >25 % very-short lines → noisy


async def _filter_job_content_with_llm(raw_text: str) -> str:
    """Use the configured LLM to extract only the relevant job description.

    Falls back to the original text if LLM is unavailable or fails.
    """
    try:
        from app.llm import complete, get_llm_config  # local import to avoid circular deps

        config = get_llm_config()
        # Trim to ~8 000 chars so we stay within a small context window (e.g. Ollama 7B)
        truncated = raw_text[:8_000]
        cleaned = await complete(
            _LLM_FILTER_PROMPT + truncated,
            config=config,
            max_tokens=2_048,
            temperature=0.1,
        )
        if cleaned and len(cleaned) >= 200:
            logger.info("LLM filter reduced content from %d → %d chars", len(raw_text), len(cleaned))
            return cleaned.strip()
        logger.warning("LLM filter returned short/empty result, keeping raw extraction")
    except Exception as exc:
        logger.warning("LLM filtering failed, using raw extraction: %s", exc)
    return raw_text


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=JobUploadResponse)
async def upload_job_descriptions(request: JobUploadRequest) -> JobUploadResponse:
    """Upload one or more job descriptions.

    Stores the raw text for later use in resume tailoring.
    Returns an array of job_ids corresponding to the input array.
    """
    if not request.job_descriptions:
        raise HTTPException(status_code=400, detail="No job descriptions provided")

    job_ids = []
    for jd in request.job_descriptions:
        if not jd.strip():
            raise HTTPException(status_code=400, detail="Empty job description")

        job = db.create_job(
            content=jd.strip(),
            resume_id=request.resume_id,
        )
        job_ids.append(job["job_id"])

    return JobUploadResponse(
        message="data successfully processed",
        job_id=job_ids,
        request={
            "job_descriptions": request.job_descriptions,
            "resume_id": request.resume_id,
        },
    )


@router.post("/fetch-url", response_model=FetchJobUrlResponse)
async def fetch_job_from_url(request: FetchJobUrlRequest) -> FetchJobUrlResponse:
    """Fetch a job description from a public URL.

    For known JS-rendered portals (theprotocol.it, nofluffjobs.com, etc.)
    the page is rendered with a headless browser so dynamic content loads.
    For other sites a fast rule-based HTML parser is used.
    """
    url = request.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    parsed_host = urlparse(url).hostname or ""
    loop = asyncio.get_running_loop()
    if await loop.run_in_executor(None, _is_private_host, parsed_host):
        raise HTTPException(status_code=400, detail="URL must point to a public website")

    content: str | None = None

    # --- Try site-specific Playwright extraction first ---
    site_config = _get_site_config(url)
    if site_config and site_config.get("strategy") == "playwright":
        logger.info("Using Playwright strategy for %s", url)
        content = await _extract_with_playwright(url, site_config)

    # --- Fall back to httpx + SmartExtractor ---
    if not content or len(content) < 50:
        logger.info("Using httpx/SmartExtractor strategy for %s", url)

        async def _ssrf_redirect_guard(request: httpx.Request) -> None:
            host = request.url.host
            if await asyncio.get_running_loop().run_in_executor(None, _is_private_host, host):
                raise httpx.RequestError(f"Redirect to private host blocked: {host}", request=request)

        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=15.0,
                verify=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    )
                },
                event_hooks={"request": [_ssrf_redirect_guard]},
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Request timed out while fetching the URL.")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"The job listing page returned an error: {exc.response.status_code}",
            )
        except httpx.RequestError as exc:
            logger.warning("Failed to reach URL %s: %s", url, exc)
            raise HTTPException(status_code=502, detail="Failed to reach the URL. Please check the address and try again.")

        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            raise HTTPException(status_code=422, detail="URL does not point to an HTML page.")

        raw = _extract_text_from_html(response.text)
        # Apply site-specific text cleanup even on the httpx path
        if site_config:
            content = _apply_site_cleanup(raw, site_config)
        else:
            content = raw

    if not content or len(content) < 50:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not extract job description from this page. "
                "This usually happens with sites that require a login or block automated access. "
                "Please copy and paste the job description manually."
            ),
        )

    # --- Optional LLM cleanup (only when LLM is available and content still noisy) ---
    if _looks_noisy(content):
        logger.info("Content still noisy (%d chars) — attempting LLM filter", len(content))
        content = await _filter_job_content_with_llm(content)
    else:
        logger.debug("Content looks clean (%d chars) — skipping LLM filter", len(content))

    return FetchJobUrlResponse(content=content, url=url)


@router.get("/{job_id}")
async def get_job(job_id: str) -> dict:
    """Get job description by ID."""
    job = db.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return job
