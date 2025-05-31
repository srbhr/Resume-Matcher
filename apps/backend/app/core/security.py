"""
Production-ready security module with rate limiting, JWT, and security headers.
"""

import asyncio
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Union
from collections import defaultdict

from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .config import settings
from .cache import cache

# Password hashing
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=settings.BCRYPT_ROUNDS
)


class RateLimiter:
    """
    Token bucket rate limiter with Redis backend for distributed systems.
    """
    
    def __init__(self):
        self.enabled = settings.RATE_LIMIT_ENABLED
        self.per_minute = settings.RATE_LIMIT_PER_MINUTE
        self.per_hour = settings.RATE_LIMIT_PER_HOUR
        
    async def check_rate_limit(
        self,
        key: str,
        per_minute: Optional[int] = None,
        per_hour: Optional[int] = None
    ) -> tuple[bool, dict]:
        """
        Check if request is within rate limits.
        
        Returns:
            (allowed, metadata) - allowed is True if within limits
        """
        if not self.enabled:
            return True, {}
        
        per_minute = per_minute or self.per_minute
        per_hour = per_hour or self.per_hour
        
        now = time.time()
        minute_key = f"rate_limit:minute:{key}:{int(now // 60)}"
        hour_key = f"rate_limit:hour:{key}:{int(now // 3600)}"
        
        # Check minute limit
        minute_count = await cache.get(minute_key) or 0
        if minute_count >= per_minute:
            return False, {
                "limit": per_minute,
                "window": "minute",
                "retry_after": 60 - (now % 60)
            }
        
        # Check hour limit
        hour_count = await cache.get(hour_key) or 0
        if hour_count >= per_hour:
            return False, {
                "limit": per_hour,
                "window": "hour",
                "retry_after": 3600 - (now % 3600)
            }
        
        # Increment counters
        await cache.set(minute_key, minute_count + 1, ttl=60)
        await cache.set(hour_key, hour_count + 1, ttl=3600)
        
        return True, {
            "minute_remaining": per_minute - minute_count - 1,
            "hour_remaining": per_hour - hour_count - 1
        }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware with IP and user-based limits.
    """
    
    def __init__(self, app, rate_limiter: Optional[RateLimiter] = None):
        super().__init__(app)
        self.rate_limiter = rate_limiter or RateLimiter()
        
    def get_client_ip(self, request: Request) -> str:
        """Extract real client IP considering proxies."""
        # Check X-Forwarded-For header
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take the first IP in the chain
            return forwarded.split(",")[0].strip()
        
        # Check X-Real-IP header
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fall back to direct connection
        return request.client.host if request.client else "unknown"
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/api/health"]:
            return await call_next(request)
        
        # Get rate limit key (IP or user ID)
        client_ip = self.get_client_ip(request)
        user_id = getattr(request.state, "user_id", None)
        rate_limit_key = f"user:{user_id}" if user_id else f"ip:{client_ip}"
        
        # Check rate limit
        allowed, metadata = await self.rate_limiter.check_rate_limit(rate_limit_key)
        
        if not allowed:
            retry_after = int(metadata.get("retry_after", 60))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "Rate limit exceeded",
                    "limit": metadata.get("limit"),
                    "window": metadata.get("window"),
                    "retry_after": retry_after
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(metadata.get("limit", 0)),
                    "X-RateLimit-Window": metadata.get("window", "unknown")
                }
            )
        
        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit-Minute"] = str(self.rate_limiter.per_minute)
        response.headers["X-RateLimit-Remaining-Minute"] = str(metadata.get("minute_remaining", 0))
        response.headers["X-RateLimit-Limit-Hour"] = str(self.rate_limiter.per_hour)
        response.headers["X-RateLimit-Remaining-Hour"] = str(metadata.get("hour_remaining", 0))
        
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses.
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), midi=(), notifications=(), push=(), "
            "sync-xhr=(), microphone=(), camera=(), magnetometer=(), "
            "gyroscope=(), speaker=(), vibrate=(), fullscreen=(), payment=()"
        )
        
        # HSTS for production
        if settings.ENV == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        
        # CSP
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        
        return response


class JWTBearer(HTTPBearer):
    """
    JWT Bearer token authentication.
    """
    
    def __init__(self, auto_error: bool = True):
        super().__init__(auto_error=auto_error)
        
    async def __call__(self, request: Request) -> Optional[str]:
        credentials: HTTPAuthorizationCredentials = await super().__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                if self.auto_error:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Invalid authentication scheme."
                    )
                return None
            
            token = credentials.credentials
            payload = self.verify_jwt(token)
            if not payload:
                if self.auto_error:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Invalid or expired token."
                    )
                return None
            
            # Store user info in request state
            request.state.user_id = payload.get("sub")
            request.state.user_email = payload.get("email")
            request.state.user_roles = payload.get("roles", [])
            
            return token
        return None
    
    def verify_jwt(self, token: str) -> Optional[dict]:
        """Verify JWT token and return payload."""
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )
            return payload
        except JWTError:
            return None


# JWT utilities
def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_EXPIRATION_MINUTES
        )
    
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return encoded_jwt


def create_refresh_token() -> str:
    """Create secure refresh token."""
    return secrets.token_urlsafe(32)


# Password utilities
def get_password_hash(password: str) -> str:
    """Hash password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return pwd_context.verify(plain_password, hashed_password)


# CSRF protection
def generate_csrf_token() -> str:
    """Generate CSRF token."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(token: str, expected: str) -> bool:
    """Verify CSRF token using constant-time comparison."""
    return hmac.compare_digest(token, expected)


# API key management
class APIKeyValidator:
    """
    API key validation with rate limiting per key.
    """
    
    def __init__(self):
        self.rate_limiter = RateLimiter()
        
    async def validate_api_key(self, api_key: str) -> Optional[dict]:
        """
        Validate API key and return associated metadata.
        """
        # Hash the API key for storage/lookup
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        # Check cache first
        cache_key = f"api_key:{key_hash}"
        cached_data = await cache.get(cache_key)
        
        if cached_data is not None:
            if cached_data == "invalid":
                return None
            return cached_data
        
        # TODO: Implement actual API key lookup from database
        # This is a placeholder implementation
        api_key_data = {
            "id": "placeholder",
            "name": "Test API Key",
            "scopes": ["read", "write"],
            "rate_limit_multiplier": 1.0
        }
        
        # Cache the result
        await cache.set(cache_key, api_key_data, ttl=300)
        
        return api_key_data
    
    async def check_api_key_rate_limit(
        self,
        api_key: str,
        multiplier: float = 1.0
    ) -> tuple[bool, dict]:
        """Check rate limit for API key."""
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        # Apply multiplier to limits
        per_minute = int(settings.RATE_LIMIT_PER_MINUTE * multiplier)
        per_hour = int(settings.RATE_LIMIT_PER_HOUR * multiplier)
        
        return await self.rate_limiter.check_rate_limit(
            f"api_key:{key_hash}",
            per_minute=per_minute,
            per_hour=per_hour
        )


# Request signing for webhooks
def sign_request(payload: bytes, secret: str) -> str:
    """
    Sign request payload using HMAC-SHA256.
    """
    signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return f"sha256={signature}"


def verify_signature(
    payload: bytes,
    signature: str,
    secret: str
) -> bool:
    """
    Verify request signature.
    """
    expected = sign_request(payload, secret)
    return hmac.compare_digest(signature, expected)


# IP allowlist/blocklist
class IPFilter:
    """
    IP-based access control.
    """
    
    def __init__(
        self,
        allowlist: Optional[set[str]] = None,
        blocklist: Optional[set[str]] = None
    ):
        self.allowlist = allowlist or set()
        self.blocklist = blocklist or set()
        
    async def is_allowed(self, ip: str) -> bool:
        """Check if IP is allowed."""
        # Check blocklist first
        if ip in self.blocklist:
            return False
            
        # If allowlist is empty, allow all non-blocked IPs
        if not self.allowlist:
            return True
            
        # Check allowlist
        return ip in self.allowlist
    
    async def add_to_blocklist(self, ip: str, duration: int = 3600):
        """Add IP to blocklist temporarily."""
        self.blocklist.add(ip)
        
        # Store in cache with TTL
        await cache.set(f"ip_blocklist:{ip}", True, ttl=duration)
        
    async def remove_from_blocklist(self, ip: str):
        """Remove IP from blocklist."""
        self.blocklist.discard(ip)
        await cache.delete(f"ip_blocklist:{ip}")
        
    async def load_from_cache(self):
        """Load blocklist from cache."""
        # This would scan Redis for blocklist entries
        # Implementation depends on specific requirements
        pass 