"""ChatGPT device login and hosted Responses transport, without a local CLI.

Implements device-code authorization and the hosted Codex compatibility protocol.
This is distinct from OpenAI's registered Sign in with ChatGPT API flow.
The connection belongs to this single-user Resume Matcher installation.
"""

import asyncio
import json
import os
import tempfile
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
import jwt

from app.ai_budget import remaining_timeout
from app.config import settings
from app.crypto import decrypt, encrypt

# Fixed endpoints prevent a caller-supplied URL from receiving OAuth secrets.
ISSUER = "https://auth.openai.com"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
API_BASE = "https://chatgpt.com/backend-api/codex"
AUTH_CLAIM = "https://api.openai.com/auth"
_lock = asyncio.Lock()
_jwks_cache: tuple[list[dict], float] = ([], 0)


class ChatGPTError(RuntimeError):
    """Safe error text; never includes provider bodies or bearer credentials."""


def _path() -> Path:
    """Keep OAuth tokens separate from API-key configuration and browser state.

    Preserve this file together with the data directory's .secret_key across
    restarts. Encryption does not protect against access to both files, so the
    entire directory must remain private to the installation's owner.
    """
    return settings.data_dir / "chatgpt-session.enc"


def _load() -> dict[str, Any]:
    """Read only authenticated ciphertext; reject corrupt or lost-key records."""
    try:
        plain = decrypt(_path().read_text(encoding="utf-8"))
        if not plain:
            raise ChatGPTError(
                "ChatGPT credentials could not be decrypted. Sign in again."
            )
        value = json.loads(plain)
        if not isinstance(value, dict):
            raise TypeError("Invalid session")
        return value
    except FileNotFoundError:
        return {}
    except (ValueError, TypeError, OSError) as error:
        raise ChatGPTError(
            "Could not read the ChatGPT connection. Sign in again."
        ) from error


def _save(session: dict[str, Any]) -> None:
    """Encrypt before writing, then atomically replace the credential record."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    ciphertext = encrypt(json.dumps(session))
    descriptor, name = tempfile.mkstemp(dir=settings.data_dir, prefix=".chatgpt-")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(ciphertext)
        os.replace(name, _path())
    finally:
        if os.path.exists(name):
            os.unlink(name)


@asynccontextmanager
async def _session_lock():
    """Serialize rotating tokens across requests and backend worker processes."""
    async with _lock:
        # The OS lock extends the in-process guard to multiple backend workers.
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(
            settings.data_dir / "chatgpt-session.lock", os.O_RDWR | os.O_CREAT, 0o600
        )
        acquired = False
        try:
            if os.fstat(descriptor).st_size == 0:
                os.write(descriptor, b"0")
            deadline = time.monotonic() + remaining_timeout(35)
            while not acquired:
                try:
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    if os.name == "nt":
                        import msvcrt

                        msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl

                        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    acquired = True
                except OSError:
                    # Yield while another worker refreshes; never block the loop.
                    if time.monotonic() >= deadline:
                        raise ChatGPTError(
                            "ChatGPT is reconnecting. Please try again shortly."
                        )
                    await asyncio.sleep(0.05)
            yield
        finally:
            # Cancellation and failed provider requests must release both locks.
            if acquired:
                os.lseek(descriptor, 0, os.SEEK_SET)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)


async def _verify_identity(identity: str) -> dict[str, Any]:
    """Verify OpenAI's ID token with its fixed JWKS endpoint and RS256 only."""
    global _jwks_cache
    try:
        # Read the key identifier only; this header is not trusted identity data.
        header = jwt.get_unverified_header(identity)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ChatGPTError("ChatGPT returned an unsupported identity token.")
        keys, expires = _jwks_cache
        for attempt in range(2):
            # A missing key permits one refetch for OpenAI's signing-key rotation.
            if time.monotonic() >= expires or attempt:
                async with httpx.AsyncClient(timeout=remaining_timeout(15)) as client:
                    response = await client.get(ISSUER + "/.well-known/jwks.json")
                response.raise_for_status()
                keys = response.json()["keys"]
                expires = time.monotonic() + 300
                _jwks_cache = (keys, expires)
            for key in keys:
                if key.get("kid") == header["kid"] and key.get("kty") == "RSA":
                    return jwt.decode(
                        identity,
                        jwt.PyJWK.from_dict(key, algorithm="RS256").key,
                        algorithms=["RS256"],
                        audience=CLIENT_ID,
                        issuer=ISSUER,
                        leeway=30,
                        options={"require": ["iss", "aud", "sub", "exp", "iat"]},
                    )
        raise ChatGPTError(
            "Could not verify the ChatGPT identity token. Sign in again."
        )
    except (
        jwt.PyJWTError,
        httpx.HTTPError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
    ) as error:
        raise ChatGPTError(
            "Could not verify the ChatGPT identity token. Sign in again."
        ) from error


def _tokens(
    raw: dict, previous: dict | None = None, *, claims: dict | None = None
) -> dict:
    """Normalize token fields using verified claims or a verified prior session."""
    previous = previous or {}
    access = raw.get("access_token")
    if not isinstance(access, str) or not access:
        raise ChatGPTError("ChatGPT did not return an access token. Sign in again.")
    identity = raw.get("id_token") or previous.get("id_token", "")
    claims = claims or {}
    auth = claims.get(AUTH_CLAIM) or {}
    account_id = auth.get("chatgpt_account_id") or previous.get("account_id")
    if not isinstance(account_id, str) or not account_id:
        raise ChatGPTError("ChatGPT did not return an account ID. Sign in again.")
    return {
        "access_token": access,
        "refresh_token": raw.get("refresh_token") or previous.get("refresh_token"),
        "id_token": identity,
        "account_id": account_id,
        "email": claims.get("email") or previous.get("email"),
        "plan": auth.get("chatgpt_plan_type") or previous.get("plan"),
        "subject": claims.get("sub") or previous.get("subject"),
        "expires_at": time.time() + float(raw.get("expires_in", 3600)),
    }


async def _verified_tokens(raw: dict, previous: dict | None = None) -> dict:
    """Reject account changes during refresh and unverified initial connections."""
    identity = raw.get("id_token")
    if not identity:
        # Refresh responses may omit the ID token; retain verified account data.
        if not previous or not previous.get("subject"):
            raise ChatGPTError(
                "ChatGPT did not return a verifiable identity token. Sign in again."
            )
        return _tokens(raw, previous)
    claims = await _verify_identity(identity)
    result = _tokens(raw, previous, claims=claims)
    if previous and (
        previous.get("account_id") != result["account_id"]
        or (previous.get("subject") and previous["subject"] != result["subject"])
    ):
        raise ChatGPTError(
            "ChatGPT account changed during token refresh. Sign in again."
        )
    return result


async def _post(path: str, **kwargs) -> httpx.Response:
    """Bound authentication calls and expose no upstream body in error messages."""
    try:
        async with httpx.AsyncClient(timeout=remaining_timeout(30)) as client:
            return await client.post(ISSUER + path, **kwargs)
    except httpx.HTTPError as error:
        raise ChatGPTError("Could not reach ChatGPT. Please try again.") from error


def connected() -> bool:
    """Report saved credential availability without sending tokens to the UI."""
    return bool(_load().get("tokens"))


async def start_login() -> dict:
    """Reuse a live code or begin a new browser authorization attempt."""
    async with _session_lock():
        try:
            session = _load()
        except ChatGPTError:
            session = {}  # Explicit sign-in can replace a corrupt connection.
        device = session.get("device")
        if device and device["expires_at"] > time.time():
            return _public_device(device)
        response = await _post(
            "/api/accounts/deviceauth/usercode", json={"client_id": CLIENT_ID}
        )
        if not response.is_success:
            raise ChatGPTError(
                "Could not start ChatGPT sign-in. Enable device-code login in your ChatGPT security settings and try again."
            )
        raw = response.json()
        code = raw.get("user_code") or raw.get("usercode")
        if not raw.get("device_auth_id") or not code:
            raise ChatGPTError(
                "ChatGPT returned an invalid sign-in code. Please try again."
            )
        try:
            # Clamp polling intervals to prevent malformed or abusive responses.
            interval = max(5, min(60, int(raw.get("interval", 5))))
        except (ValueError, TypeError):
            interval = 5
        device = {
            "device_auth_id": raw["device_auth_id"],
            "user_code": code,
            "interval": interval,
            "expires_at": time.time() + 900,
            "last_polled_at": 0,
        }
        # Preserve an existing connection until replacement sign-in succeeds.
        session["device"] = device
        _save(session)
        return _public_device(device)


def _public_device(device: dict) -> dict:
    """Expose the short-lived user code, never the secret device authorization ID."""
    return {
        "user_code": device["user_code"],
        "verification_url": ISSUER + "/codex/device",
        "interval": device["interval"],
        "expires_at": device["expires_at"],
    }


async def status(*, advance: bool = False) -> dict:
    """Advance at most one device poll and return only safe connection metadata."""
    async with _session_lock():
        session = _load()
        device = session.get("device")
        expired = False
        if device and device["expires_at"] <= time.time():
            # Expiry ends the pending attempt without destroying a prior login.
            session.pop("device", None)
            _save(session)
            device = None
            expired = True
        if (
            advance
            and device
            and time.time() - device["last_polled_at"] >= device["interval"]
        ):
            # Persist the cadence before HTTP so rapid requests cannot over-poll.
            device["last_polled_at"] = time.time()
            _save(session)
            response = await _post(
                "/api/accounts/deviceauth/token",
                json={
                    "device_auth_id": device["device_auth_id"],
                    "user_code": device["user_code"],
                },
            )
            if response.status_code not in (403, 404, 429):
                if not response.is_success:
                    raise ChatGPTError(
                        "ChatGPT sign-in failed. Please start a new sign-in."
                    )
                raw = response.json()
                if raw.get("authorization_code") and raw.get("code_verifier"):
                    # Exchange the server-issued PKCE verifier; never return it.
                    exchanged = await _post(
                        "/oauth/token",
                        data={
                            "grant_type": "authorization_code",
                            "client_id": CLIENT_ID,
                            "code": raw["authorization_code"],
                            "code_verifier": raw["code_verifier"],
                            "redirect_uri": ISSUER + "/deviceauth/callback",
                        },
                    )
                    if not exchanged.is_success:
                        session.pop("device", None)
                        _save(session)
                        raise ChatGPTError(
                            "ChatGPT sign-in expired. Please sign in again."
                        )
                    try:
                        verified = await _verified_tokens(exchanged.json())
                    except ChatGPTError:
                        # A consumed authorization code cannot be retried safely.
                        session.pop("device", None)
                        _save(session)
                        raise
                    session["tokens"] = verified
                    session.pop("device", None)
                    _save(session)
                    device = None
        tokens = session.get("tokens", {})
        return {
            "connected": bool(tokens),
            "pending": bool(device),
            "expired": expired,
            "email": tokens.get("email"),
            "plan": tokens.get("plan"),
            "device": _public_device(device) if device else None,
        }


async def fresh_tokens(*, rejected_token: str | None = None) -> dict:
    """Serialize refresh-token rotation and reuse another worker's fresh result."""
    async with _session_lock():
        session = _load()
        tokens = session.get("tokens")
        if not tokens:
            raise ChatGPTError(
                "Sign in with ChatGPT in Settings before using this provider."
            )
        if not tokens.get("subject"):
            # Validate credentials written by the earlier prototype before use.
            claims = await _verify_identity(tokens.get("id_token", ""))
            if (claims.get(AUTH_CLAIM) or {}).get("chatgpt_account_id") != tokens[
                "account_id"
            ]:
                raise ChatGPTError("ChatGPT account validation failed. Sign in again.")
            tokens["subject"] = claims["sub"]
            session["tokens"] = tokens
            _save(session)
        force = rejected_token is not None and tokens["access_token"] == rejected_token
        if not force and tokens["expires_at"] > time.time() + 60:
            return tokens
        if not tokens.get("refresh_token"):
            raise ChatGPTError("ChatGPT login expired. Sign in again in Settings.")
        response = await _post(
            "/oauth/token",
            json={
                "grant_type": "refresh_token",
                "client_id": CLIENT_ID,
                "refresh_token": tokens["refresh_token"],
                "scope": "openid profile email offline_access",
            },
        )
        if not response.is_success:
            # Invalid grants end the connection; transient failures preserve it.
            if response.status_code in (400, 401, 403):
                session.pop("tokens", None)
                _save(session)
                raise ChatGPTError(
                    "ChatGPT login expired or was revoked. Sign in again in Settings."
                )
            raise ChatGPTError("Could not refresh ChatGPT login. Please try again.")
        tokens = await _verified_tokens(response.json(), tokens)
        session["tokens"] = tokens
        _save(session)
        return tokens


def _headers(tokens: dict) -> dict[str, str]:
    """Construct provider headers only on the backend, for the fixed API origin."""
    return {
        "Authorization": "Bearer " + tokens["access_token"],
        "chatgpt-account-id": tokens["account_id"],
        "originator": "codex_cli_rs",
        "OpenAI-Beta": "responses=experimental",
    }


def _upstream_error(status_code: int) -> ChatGPTError:
    """Translate provider failures without exposing tokens, bodies, or prompts."""
    if status_code == 429:
        return ChatGPTError(
            "ChatGPT usage limit reached. Wait for your plan limit to reset or choose another provider."
        )
    if status_code in (401, 403):
        return ChatGPTError(
            "ChatGPT access was denied. Reconnect your account in Settings."
        )
    return ChatGPTError(
        f"ChatGPT request failed (HTTP {status_code}). Please try again or choose another model."
    )


async def models() -> list[dict[str, str]]:
    """Return account-discovered model IDs; never invent entitlement or defaults."""
    tokens = await fresh_tokens()
    try:
        for attempt in range(2):
            async with httpx.AsyncClient(timeout=remaining_timeout(30)) as client:
                response = await client.get(
                    API_BASE + "/models",
                    headers=_headers(tokens),
                    params={"client_version": settings.chatgpt_client_version},
                )
            if response.status_code == 401 and attempt == 0:
                # Retry authentication once; further failures require reconnecting.
                tokens = await fresh_tokens(rejected_token=tokens["access_token"])
                continue
            if not response.is_success:
                raise _upstream_error(response.status_code)
            raw = response.json()
            entries = (
                raw if isinstance(raw, list) else raw.get("models", raw.get("data", []))
            )
            result = {}
            for entry in entries:
                if isinstance(entry, dict) and entry.get("visibility") in (
                    "hide",
                    "hidden",
                ):
                    continue
                slug = (
                    entry
                    if isinstance(entry, str)
                    else entry.get("slug", entry.get("id"))
                )
                if isinstance(slug, str) and slug.strip():
                    result[slug] = (
                        {"id": slug, "name": entry.get("display_name") or slug}
                        if isinstance(entry, dict)
                        else {"id": slug, "name": slug}
                    )
            return list(result.values())
    except (httpx.HTTPError, ValueError, AttributeError, TypeError) as error:
        raise ChatGPTError(
            "Could not load ChatGPT models. Reconnect and try again."
        ) from error
    return []


async def complete(
    prompt: str,
    system_prompt: str | None,
    model: str,
    reasoning_effort: str | None = None,
    *,
    timeout: float = 120,
) -> str:
    """Return visible text only after a successful terminal Responses event."""
    tokens = await fresh_tokens()
    payload = {
        "model": model,
        "instructions": system_prompt
        or "Answer the user's request directly and helpfully.",
        "input": [{"role": "user", "content": prompt}],
        "store": False,
        "stream": True,
        "reasoning": {
            "effort": (
                "low" if reasoning_effort == "minimal" else reasoning_effort or "medium"
            ),
            "summary": "auto",
        },
        "include": ["reasoning.encrypted_content"],
    }
    # The hosted endpoint rejects max_output_tokens and temperature.
    try:
        async with asyncio.timeout(remaining_timeout(timeout)):
            for attempt in range(2):
                async with (
                    httpx.AsyncClient(timeout=remaining_timeout(timeout)) as client,
                    client.stream(
                        "POST",
                        API_BASE + "/responses",
                        headers=_headers(tokens),
                        json=payload,
                    ) as response,
                ):
                    if response.status_code == 401 and attempt == 0:
                        tokens = await fresh_tokens(
                            rejected_token=tokens["access_token"]
                        )
                        continue
                    if not response.is_success:
                        raise _upstream_error(response.status_code)
                    chunks = []
                    size = 0
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        event = json.loads(data)
                        kind = event.get("type")
                        if kind == "response.output_text.delta":
                            # Bound memory use while collecting visible output.
                            delta = event.get("delta", "")
                            size += len(delta)
                            if size > 1024 * 1024:
                                raise ChatGPTError(
                                    "ChatGPT response was too large. Please use a shorter request."
                                )
                            chunks.append(delta)
                        elif kind == "response.completed":
                            # Partial text is not evidence of a successful turn.
                            if (
                                event.get("response", {}).get("status", "completed")
                                != "completed"
                            ):
                                raise ChatGPTError(
                                    "ChatGPT returned an incomplete response. Please try again."
                                )
                            content = "".join(chunks).strip()
                            if not content:
                                raise ValueError("ChatGPT returned no visible output.")
                            return content
                        elif kind in (
                            "error",
                            "response.failed",
                            "response.incomplete",
                        ):
                            code = (
                                event.get("response", {}).get("error")
                                or event.get("error")
                                or {}
                            ).get("code", "")
                            if "limit" in code or "quota" in code:
                                raise _upstream_error(429)
                            raise ChatGPTError(
                                "ChatGPT could not complete this request. Try another model or reconnect in Settings."
                            )
                    raise ChatGPTError(
                        "ChatGPT stream ended before completion. Please try again."
                    )
    except httpx.TimeoutException as error:
        raise TimeoutError("ChatGPT request timed out.") from error
    except httpx.HTTPError as error:
        raise ChatGPTError("Could not reach ChatGPT. Please try again.") from error
    raise ChatGPTError("ChatGPT access was denied. Reconnect in Settings.")


async def disconnect() -> dict:
    """Attempt remote revocation, then always clear local credentials and codes."""
    async with _session_lock():
        try:
            tokens = _load().get("tokens", {})
        except ChatGPTError:
            tokens = {}
        confirmed = not bool(tokens.get("refresh_token"))
        if tokens.get("refresh_token"):
            # Use OpenAI's published revocation endpoint; no token appears in URLs.
            try:
                response = await _post(
                    "/api/accounts/oauth/revoke",
                    data={
                        "token": tokens["refresh_token"],
                        "token_type_hint": "refresh_token",
                        "client_id": CLIENT_ID,
                    },
                )
                confirmed = response.status_code == 200
            except ChatGPTError:
                confirmed = False
        _path().unlink(missing_ok=True)
        return {
            "connected": False,
            "revocation_confirmed": confirmed,
            "warning": (
                None
                if confirmed
                else "Disconnected locally, but remote revocation was not confirmed. Revoke access in ChatGPT Settings."
            ),
        }
