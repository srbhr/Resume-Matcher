"""A fake auth.openai.com for Sign in with ChatGPT tests (respx, no sockets)."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx
import jwt
import respx
from cryptography.hazmat.primitives.asymmetric import rsa

from app import chatgpt_auth

ISSUED_CLIENT_ID = "oaiapp_test_client"
SUBJECT = "user-subject-123"
EMAIL = "user@example.com"
KID = "test-key-1"
JWKS_URI = "https://auth.openai.com/.well-known/jwks.json"
REVOCATION_URI = "https://auth.openai.com/oauth/revoke"
ALL_SCOPES = " ".join(chatgpt_auth.SCOPES)

_SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _public_jwk() -> dict[str, Any]:
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_SIGNING_KEY.public_key()))
    jwk.update({"kid": KID, "use": "sig", "alg": "RS256"})
    return jwk


def id_token(
    *,
    nonce: str,
    aud: str = ISSUED_CLIENT_ID,
    iss: str = chatgpt_auth.ISSUER,
    sub: str = SUBJECT,
    email: str = EMAIL,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    claims = {
        "iss": iss,
        "aud": aud,
        "sub": sub,
        "email": email,
        "nonce": nonce,
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(claims, _SIGNING_KEY, algorithm="RS256", headers={"kid": KID})


def mount_discovery(router: respx.MockRouter) -> None:
    router.get(chatgpt_auth.DISCOVERY_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "issuer": chatgpt_auth.ISSUER,
                "jwks_uri": JWKS_URI,
                "revocation_endpoint": REVOCATION_URI,
            },
        )
    )
    router.get(JWKS_URI).mock(
        return_value=httpx.Response(200, json={"keys": [_public_jwk()]})
    )


def token_response(
    *,
    nonce: str | None = None,
    access_token: str = "access-1",
    refresh_token: str = "refresh-1",
    scope: str = ALL_SCOPES,
    aud: str = ISSUED_CLIENT_ID,
    **id_token_kwargs: Any,
) -> httpx.Response:
    body: dict[str, Any] = {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": scope,
    }
    if nonce is not None:
        body["id_token"] = id_token(nonce=nonce, aud=aud, **id_token_kwargs)
    return httpx.Response(200, json=body)


def form(request: httpx.Request) -> dict[str, str]:
    """Decode a form-encoded request body into a flat dict."""
    from urllib.parse import parse_qs

    parsed = parse_qs(request.content.decode(), strict_parsing=True)
    return {k: v[0] for k, v in parsed.items()}


def save_connected_record(
    *,
    access_token: str = "access-1",
    refresh_token: str = "refresh-1",
    expires_in: int = 3600,
    saved_at: float | None = None,
) -> None:
    """Store credentials as a completed sign-in would."""
    chatgpt_auth.save_record(
        {
            "ext_agent_host_id": "urn:uuid:11111111-1111-4111-8111-111111111111",
            "issuer": chatgpt_auth.ISSUER,
            "subject": SUBJECT,
            "email": EMAIL,
            "client_id": ISSUED_CLIENT_ID,
            "id_token": "id-token",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "Bearer",
            "expires_in": expires_in,
            "scopes": sorted(chatgpt_auth.SCOPES),
            "saved_at": time.time() if saved_at is None else saved_at,
        }
    )
