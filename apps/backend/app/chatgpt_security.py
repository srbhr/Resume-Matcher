"""Local-only access boundary for the installation's subscription credentials."""

import ipaddress
from urllib.parse import urlsplit

from fastapi import HTTPException, Request

from app.config import settings


def loopback_host(host: str) -> bool:
    """Accept localhost and loopback IPs, including mapped IPv4 addresses."""
    if host.lower() == "localhost":
        return True
    try:
        address = ipaddress.ip_address(host)
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            return address.ipv4_mapped.is_loopback
        return address.is_loopback
    except ValueError:
        return False


def _local_authority(value: str) -> bool:
    """Reject malformed Host headers instead of trusting partial URL parsing."""
    try:
        parsed = urlsplit("http://" + value)
        # Accessing port also rejects invalid numbers and malformed authorities.
        _ = parsed.port
        return bool(
            parsed.hostname
            and loopback_host(parsed.hostname)
            and not (
                parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "," in value
            )
        )
    except ValueError:
        return False


def require_local_request(request: Request) -> None:
    """Reject LAN clients, cross-site browser calls, and DNS rebinding hosts.

    Proxy headers can narrow access, never grant it. Run the frontend on a
    loopback listener too; this is not authentication for a public proxy.
    """
    # A forged proxy header must never turn a remote TCP client into a local one.
    if not request.client or not loopback_host(request.client.host):
        raise HTTPException(
            403, "ChatGPT subscription access is restricted to this machine."
        )
    # Restrict the requested hostname to prevent DNS rebinding onto loopback.
    if not _local_authority(request.headers.get("host", "")):
        raise HTTPException(403, "ChatGPT requires a localhost URL.")
    # Proxy metadata can deny remote forwarding but cannot establish identity.
    for value in request.headers.get("x-forwarded-for", "").split(","):
        if value.strip() and not loopback_host(value.strip()):
            raise HTTPException(403, "Remote proxy access to ChatGPT is disabled.")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_host and not _local_authority(forwarded_host):
        raise HTTPException(403, "Remote proxy access to ChatGPT is disabled.")
    # Browser-origin checks complement the listener restriction against CSRF.
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Cross-site ChatGPT requests are not allowed.")
    origin = request.headers.get("origin")
    if origin:
        parsed = urlsplit(origin)
        allowed = set(settings.effective_cors_origins)
        allowed.add(str(request.base_url).rstrip("/"))
        if (
            parsed.scheme not in ("http", "https")
            or not loopback_host(parsed.hostname or "")
            or origin not in allowed
        ):
            raise HTTPException(403, "Request origin is not allowed.")
