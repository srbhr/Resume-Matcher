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

import base64
import hashlib
import json
import logging
import os
import secrets
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

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

_CREDENTIALS_FILE = "chatgpt_credentials.enc"
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


def reset_state() -> None:
    """Forget in-memory sign-in attempts and caches (tests)."""
    _pending_logins.clear()
