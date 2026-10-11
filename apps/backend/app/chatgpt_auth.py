"""Sign in with ChatGPT: OpenAI's official flow for open-source, locally hosted apps.

Implements the "ChatGPT plan usage" contract documented at
https://developers.openai.com/siwc/token-sharing-open-source (preview):

* First sign-in registers a client dynamically (``client_id=dynamic_agent_client``
  plus ``agent_name_hint``); the callback returns the issued ``client_id``, which
  is saved and reused for every later sign-in.
* Authorization Code + PKCE (S256), fresh ``state``/``nonce`` per attempt, an HTTP
  loopback redirect on ``127.0.0.1`` (only the port may vary) and a persistent,
  opaque ``ext_agent_host_id`` for this installation.
* No client secret. Tokens rotate on refresh and are stored Fernet-encrypted in
  the data directory, never logged and never sent to the browser.

This is not the Codex CLI's login and never talks to ``chatgpt.com/backend-api``.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import secrets
import tempfile
import time
import uuid
import weakref
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import httpx
import jwt

from app.config import settings
from app.crypto import decrypt, encrypt

logger = logging.getLogger(__name__)

ISSUER = "https://auth.openai.com"
AUTHORIZE_URL = f"{ISSUER}/api/accounts/authorize"
TOKEN_URL = f"{ISSUER}/api/accounts/oauth/token"
DISCOVERY_URL = f"{ISSUER}/.well-known/openid-configuration"
#: The Responses API audience the plan-usage grant is issued for.
RESOURCE = "https://api.openai.com/v1"
#: First-time registration entrypoint. Never saved, never used for token exchange.
DYNAMIC_CLIENT_ID = "dynamic_agent_client"
#: Our app's name, sent unchanged on every first-time registration.
AGENT_NAME = "Resume Matcher"
PLAN_SCOPE = "chatgpt.tokens.use.direct"
SCOPES: tuple[str, ...] = (
    "openid",
    "profile",
    "email",
    "offline_access",
    "resource.invoke",
    PLAN_SCOPE,
)
#: Fixed callback path. Only the port of the loopback redirect may change
#: between sign-ins, so this must never change once users have registered.
CALLBACK_PATH = "/auth/callback"
#: How long a started sign-in may take before its state is discarded.
LOGIN_TTL_SECONDS = 600
_MAX_PENDING_LOGINS = 10

#: OpenAI signs ID tokens with RS256; never accept a symmetric or "none" alg.
ID_TOKEN_ALGORITHMS = ["RS256"]
HTTP_TIMEOUT_SECONDS = 30.0
#: How long to wait for another process that is refreshing the same tokens.
LOCK_TIMEOUT_SECONDS = 60.0

_CREDENTIALS_FILE = "chatgpt_credentials.enc"
_LOCK_FILE = "chatgpt_credentials.lock"
#: Fields that make up a token set; cleared on sign-out or a dead refresh token.
_TOKEN_FIELDS = (
    "id_token",
    "access_token",
    "refresh_token",
    "token_type",
    "expires_in",
    "scopes",
    "saved_at",
)


class ChatGPTAuthError(Exception):
    """A Sign in with ChatGPT operation failed. Messages are safe to log."""


class ChatGPTLoginError(ChatGPTAuthError):
    """A sign-in attempt did not complete.

    ``outcome`` is the short code the settings page shows: ``cancelled`` when
    the user declined in the browser, ``error`` for anything else.
    """

    def __init__(self, outcome: str, message: str) -> None:
        super().__init__(message)
        self.outcome = outcome


class TokenEndpointError(ChatGPTAuthError):
    """The token endpoint answered with an OAuth error."""

    def __init__(self, status_code: int, error: str | None) -> None:
        super().__init__(f"token endpoint returned HTTP {status_code} ({error})")
        self.status_code = status_code
        self.error = error


# ---------------------------------------------------------------------------
# Encrypted credential record
# ---------------------------------------------------------------------------


def _credentials_path() -> Path:
    return settings.data_dir / _CREDENTIALS_FILE


def load_record() -> dict[str, Any]:
    """Return the decrypted credential record, or ``{}`` when there is none.

    A record that cannot be decrypted (the Fernet secret was lost or rotated)
    reads as empty, so the user is simply asked to sign in again.
    """
    try:
        ciphertext = _credentials_path().read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return {}
    plaintext = decrypt(ciphertext)
    if not plaintext:
        return {}
    try:
        record = json.loads(plaintext)
    except json.JSONDecodeError:
        logger.warning("ChatGPT credential record is unreadable; ignoring it")
        return {}
    return record if isinstance(record, dict) else {}


def save_record(record: dict[str, Any]) -> None:
    """Encrypt and atomically replace the credential record (owner-only, 0600)."""
    path = _credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = encrypt(json.dumps(record)).encode("utf-8")
    # mkstemp creates the file with mode 0600, so plaintext-equivalent bytes
    # are never world-readable, even for an instant.
    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{_CREDENTIALS_FILE}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        Path(tmp_name).unlink(missing_ok=True)


def _has_plan_scope(record: dict[str, Any]) -> bool:
    scopes = record.get("scopes")
    return isinstance(scopes, list) and PLAN_SCOPE in scopes


# ---------------------------------------------------------------------------
# Starting a sign-in
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PendingLogin:
    """Everything one authorization attempt needs to finish, keyed by its state."""

    code_verifier: str
    nonce: str
    redirect_uri: str
    #: ``dynamic_agent_client`` for a new registration, else the saved issued ID.
    client_id: str
    expires_at: float


_pending_logins: dict[str, PendingLogin] = {}


def _prune_pending_logins() -> None:
    now = time.time()
    for state, pending in list(_pending_logins.items()):
        if pending.expires_at <= now:
            del _pending_logins[state]
    # Bound memory if the button is clicked repeatedly: keep the newest few.
    while len(_pending_logins) > _MAX_PENDING_LOGINS:
        del _pending_logins[next(iter(_pending_logins))]


def code_challenge(code_verifier: str) -> str:
    """PKCE S256: base64url(SHA-256(verifier)) without padding."""
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def redirect_uri_for_port(port: int) -> str:
    """The loopback redirect. ``127.0.0.1``, never ``localhost``; only the port varies."""
    return f"http://127.0.0.1:{port}{CALLBACK_PATH}"


def start_login(port: int) -> str:
    """Begin an authorization attempt and return the URL to open in the browser.

    Persists this installation's ``ext_agent_host_id`` before the first sign-in,
    as the docs require. A saved issued ``client_id`` is reused (reauthorization,
    no ``agent_name_hint``); otherwise the attempt registers a new client.
    """
    record = load_record()
    host_id = record.get("ext_agent_host_id")
    if not isinstance(host_id, str) or not host_id:
        host_id = f"urn:uuid:{uuid.uuid4()}"
        record["ext_agent_host_id"] = host_id
        save_record(record)

    issued_client_id = record.get("client_id")
    code_verifier = secrets.token_urlsafe(64)
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    redirect_uri = redirect_uri_for_port(port)

    params: dict[str, str] = {
        "response_type": "code",
        "client_id": issued_client_id or DYNAMIC_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": " ".join(SCOPES),
        "resource": RESOURCE,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge(code_verifier),
        "code_challenge_method": "S256",
        "ext_agent_host_id": host_id,
    }
    if issued_client_id:
        email = record.get("email")
        if isinstance(email, str) and email:
            params["login_hint"] = email
        if record.get("plan_declined"):
            # The user declined plan usage last time. Ask again explicitly; the
            # docs keep OAuth ``prompt=consent`` supported for exactly this.
            params["prompt"] = "consent"
    else:
        params["agent_name_hint"] = AGENT_NAME

    _prune_pending_logins()
    _pending_logins[state] = PendingLogin(
        code_verifier=code_verifier,
        nonce=nonce,
        redirect_uri=redirect_uri,
        client_id=params["client_id"],
        expires_at=time.time() + LOGIN_TTL_SECONDS,
    )
    return f"{AUTHORIZE_URL}?{urlencode(params, quote_via=quote)}"


# ---------------------------------------------------------------------------
# Serializing writers (refresh rotates the refresh token)
# ---------------------------------------------------------------------------

try:  # POSIX
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None  # type: ignore[assignment]
try:  # Windows
    import msvcrt
except ImportError:
    msvcrt = None  # type: ignore[assignment]

_loop_locks: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = (
    weakref.WeakKeyDictionary()
)


def _try_lock_file(fd: int) -> bool:
    try:
        if fcntl is not None:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif msvcrt is not None:  # pragma: no cover - Windows
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
    except OSError:
        return False
    return True


@asynccontextmanager
async def credentials_lock() -> AsyncIterator[None]:
    """Hold exclusive access to the credential record.

    Refresh tokens rotate, so two refreshes racing on the same token can get
    the session revoked (``refresh_token_reused``). The docs require refreshes
    for one session to be serialized across processes: the backend and the
    MCP server can both call the model. An asyncio lock orders callers inside
    this process; a non-blocking advisory file lock, polled without blocking
    the event loop, orders processes. Closing the descriptor releases it.
    """
    loop = asyncio.get_running_loop()
    lock = _loop_locks.get(loop)
    if lock is None:
        lock = _loop_locks[loop] = asyncio.Lock()
    async with lock:
        path = settings.data_dir / _LOCK_FILE
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
            while not _try_lock_file(fd):
                if time.monotonic() >= deadline:
                    raise ChatGPTAuthError("timed out waiting for the credential lock")
                await asyncio.sleep(0.05)
            yield
        finally:
            os.close(fd)


# ---------------------------------------------------------------------------
# OpenAI endpoints
# ---------------------------------------------------------------------------

_discovery_cache: dict[str, Any] = {}
_jwks_cache: dict[str, Any] = {}


async def _discovery() -> dict[str, Any]:
    """OpenAI's OpenID configuration (cached for the process lifetime)."""
    if not _discovery_cache:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(DISCOVERY_URL)
        response.raise_for_status()
        document = response.json()
        if not isinstance(document, dict):
            raise ChatGPTAuthError("OpenID discovery document is not an object")
        _discovery_cache.update(document)
    return _discovery_cache


async def _endpoint(name: str) -> str:
    url = (await _discovery()).get(name)
    if not isinstance(url, str) or not url.startswith("https://"):
        raise ChatGPTAuthError(f"OpenID discovery has no https {name}")
    return url


async def _signing_key(kid: str | None) -> Any:
    """The JWKS key for ``kid``, refetching the key set once on a miss."""
    for refetch in (False, True):
        if refetch or not _jwks_cache:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
                response = await client.get(await _endpoint("jwks_uri"))
            response.raise_for_status()
            _jwks_cache.clear()
            _jwks_cache.update(response.json())
        keys = [k for k in _jwks_cache.get("keys", []) if isinstance(k, dict)]
        for jwk in keys:
            if jwk.get("kid") == kid or (kid is None and len(keys) == 1):
                return jwt.PyJWK(jwk).key
    raise ChatGPTAuthError("no OpenAI signing key matches the ID token")


async def _post_token(data: dict[str, str]) -> dict[str, Any]:
    """POST a form-encoded grant to the token endpoint. No client secret."""
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.post(
            TOKEN_URL, data=data, headers={"Accept": "application/json"}
        )
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code != 200:
        error = body.get("error") if isinstance(body, dict) else None
        raise TokenEndpointError(
            response.status_code, error if isinstance(error, str) else None
        )
    if not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
        raise TokenEndpointError(response.status_code, "invalid_token_response")
    return body


async def validate_id_token(
    id_token: str, client_id: str, nonce: str
) -> dict[str, Any]:
    """Verify the ID token's signature, issuer, audience, expiry and nonce."""
    try:
        header = jwt.get_unverified_header(id_token)
        key = await _signing_key(header.get("kid"))
        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=ID_TOKEN_ALGORITHMS,
            audience=client_id,
            issuer=ISSUER,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=60,
        )
    except jwt.PyJWTError as error:
        raise ChatGPTAuthError(f"ID token rejected: {type(error).__name__}") from error
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise ChatGPTAuthError("ID token nonce does not match this sign-in")
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise ChatGPTAuthError("ID token has no subject")
    return claims


def _granted_scopes(token_response: Mapping[str, Any]) -> list[str]:
    scope = token_response.get("scope")
    return sorted(set(scope.split())) if isinstance(scope, str) else []


def _expires_in(token_response: Mapping[str, Any]) -> int:
    value = token_response.get("expires_in")
    return value if isinstance(value, int) and value > 0 else 3600


# ---------------------------------------------------------------------------
# Finishing a sign-in (the loopback callback)
# ---------------------------------------------------------------------------


async def complete_login(query: Mapping[str, str]) -> str:
    """Finish an attempt from its callback query and store the credentials.

    Returns ``connected``, or ``plan_declined`` when the user signed in but did
    not allow ChatGPT plan usage. Raises :class:`ChatGPTLoginError` otherwise.
    """
    state = query.get("state") or ""
    _prune_pending_logins()
    pending = _pending_logins.pop(state, None)
    if pending is None:
        raise ChatGPTLoginError("error", "callback state is unknown or expired")
    # Only after the state matched: an OAuth error ends the attempt and no
    # code is ever exchanged.
    if query.get("error"):
        outcome = "cancelled" if query.get("error") == "access_denied" else "error"
        raise ChatGPTLoginError(outcome, "authorization returned an OAuth error")
    code = query.get("code")
    if not code:
        raise ChatGPTLoginError("error", "callback has no authorization code")

    callback_client_id = query.get("client_id")
    if pending.client_id == DYNAMIC_CLIENT_ID:
        if not callback_client_id or callback_client_id == DYNAMIC_CLIENT_ID:
            raise ChatGPTLoginError(
                "error", "registration returned no issued client_id"
            )
        client_id = callback_client_id
    else:
        if callback_client_id and callback_client_id != pending.client_id:
            raise ChatGPTLoginError("error", "callback client_id does not match")
        client_id = pending.client_id

    try:
        tokens = await _post_token(
            {
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": code,
                "code_verifier": pending.code_verifier,
                "redirect_uri": pending.redirect_uri,
                "resource": RESOURCE,
            }
        )
        id_token = tokens.get("id_token")
        if not isinstance(id_token, str):
            raise ChatGPTAuthError("token response has no ID token")
        claims = await validate_id_token(id_token, client_id, pending.nonce)
    except ChatGPTLoginError:
        raise
    except (ChatGPTAuthError, httpx.HTTPError) as error:
        # invalid_grant lands here too: the code is discarded with the attempt.
        raise ChatGPTLoginError("error", str(error)) from error

    granted = _granted_scopes(tokens)
    async with credentials_lock():
        record = load_record()
        if (
            record.get("client_id") == client_id
            and record.get("subject")
            and record["subject"] != claims["sub"]
        ):
            raise ChatGPTLoginError("error", "signed in as a different ChatGPT account")
        for field in _TOKEN_FIELDS:
            record.pop(field, None)
        record.update(
            {
                "issuer": ISSUER,
                "subject": claims["sub"],
                "email": claims.get("email")
                if isinstance(claims.get("email"), str)
                else None,
                "client_id": client_id,
            }
        )
        if PLAN_SCOPE not in granted:
            # A valid ID token alone does not authorize plan usage. Keep the
            # registration so the next attempt reuses it and asks for consent.
            record["plan_declined"] = True
            save_record(record)
            return "plan_declined"
        record.pop("plan_declined", None)
        record.update(
            {
                "id_token": id_token,
                "access_token": tokens["access_token"],
                "refresh_token": tokens.get("refresh_token"),
                "token_type": tokens.get("token_type", "Bearer"),
                "expires_in": _expires_in(tokens),
                "scopes": granted,
                "saved_at": time.time(),
            }
        )
        save_record(record)
    return "connected"


def reset_state() -> None:
    """Forget in-memory sign-in attempts and caches (tests)."""
    _pending_logins.clear()
    _discovery_cache.clear()
    _jwks_cache.clear()
