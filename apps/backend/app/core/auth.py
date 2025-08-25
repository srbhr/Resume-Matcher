from __future__ import annotations

import time
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError

from .config import settings


@dataclass
class Principal:
    user_id: str
    email: Optional[str] = None
    claims: Dict[str, Any] | None = None


class JWKSCache:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[dict[str, Any], float]] = {}
        self.ttl_seconds = 900  # 15 minutes

    async def get_keyset(self, issuer: str) -> dict[str, Any]:
        now = time.time()
        entry = self._cache.get(issuer)
        if entry and (now - entry[1]) < self.ttl_seconds:
            return entry[0]
        url = issuer.rstrip('/') + '/.well-known/jwks.json'
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            jwks = resp.json()
        self._cache[issuer] = (jwks, now)
        return jwks


_jwks_cache = JWKSCache()


async def verify_clerk_token(token: str) -> Principal:
    try:
        # Decode header to get kid without verifying
        unverified = jwt.get_unverified_header(token)
        unverified_claims = jwt.get_unverified_claims(token)
        iss = settings.CLERK_JWT_ISSUER or str(unverified_claims.get('iss', ''))
        if not iss:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing issuer")
        jwks = await _jwks_cache.get_keyset(iss)
        keys = jwks.get('keys', [])
        kid = unverified.get('kid')
        key = next((k for k in keys if k.get('kid') == kid), None)
        if not key:
            # refresh once in case of rotation
            _jwks_cache._cache.pop(iss, None)
            jwks = await _jwks_cache.get_keyset(iss)
            keys = jwks.get('keys', [])
            key = next((k for k in keys if k.get('kid') == kid), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")
        audience = settings.CLERK_AUDIENCE
        options = {"verify_aud": bool(audience)}
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=iss, audience=audience, options=options)
        sub = str(claims.get('sub', ''))
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
        email = None
        # Clerk may place email in several claim keys depending on template
        for k in ("email", "primary_email", "email_address"):
            v = claims.get(k)
            if isinstance(v, str):
                email = v
                break
        return Principal(user_id=sub, email=email, claims=claims)
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except HTTPException:
        raise
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication failed")


async def require_auth(request: Request) -> Principal:
    # Testing hook: allow disabling auth via explicit environment variable only
    if os.getenv("DISABLE_AUTH_FOR_TESTS") == "1":
        return Principal(user_id="test-user")
    authz = request.headers.get("authorization") or request.headers.get("Authorization")
    if not authz or not authz.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authz.split(" ", 1)[1].strip()
    return await verify_clerk_token(token)
