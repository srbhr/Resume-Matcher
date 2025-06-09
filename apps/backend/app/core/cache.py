"""
Redis cache implementation with production-ready features.

Features:
- Async/sync support
- Automatic serialization/deserialization
- TTL management
- Memory-efficient storage
- Cache warming
- Circuit breaker pattern
"""

import asyncio
import json
import logging
import pickle
from functools import wraps
from typing import Any, Callable, Optional, Union, TypeVar, cast
from datetime import timedelta

import redis.asyncio as aioredis
import redis
from redis.exceptions import RedisError

from .config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Serialization strategies
class CacheSerializer:
    """Efficient serialization for cache storage."""
    
    @staticmethod
    def serialize(value: Any) -> bytes:
        """Serialize value to bytes with fallback strategies."""
        try:
            # Try JSON first (most memory efficient for simple types)
            if isinstance(value, (dict, list, str, int, float, bool, type(None))):
                return json.dumps(value).encode("utf-8")
        except (TypeError, ValueError):
            pass
        
        # Fall back to pickle for complex objects
        return pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)
    
    @staticmethod
    def deserialize(data: bytes) -> Any:
        """Deserialize bytes to original value."""
        try:
            # Try JSON first
            return json.loads(data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Fall back to pickle
            return pickle.loads(data)


class RedisCache:
    """Production-ready Redis cache with circuit breaker and monitoring."""
    
    def __init__(
        self,
        redis_url: str = None,
        key_prefix: str = None,
        default_ttl: int = None,
        max_connections: int = 50,
    ):
        self.redis_url = redis_url or settings.REDIS_URL
        self.key_prefix = key_prefix or settings.CACHE_KEY_PREFIX
        self.default_ttl = default_ttl or settings.CACHE_TTL
        
        # Connection pools
        self._sync_pool: Optional[redis.ConnectionPool] = None
        self._async_pool: Optional[aioredis.ConnectionPool] = None
        
        # Circuit breaker state
        self._circuit_open = False
        self._failure_count = 0
        self._failure_threshold = 5
        self._circuit_timeout = 60  # seconds
        
        # Pool configuration
        self.pool_config = {
            "max_connections": max_connections,
            "socket_keepalive": True,
            # Removed socket_keepalive_options - they cause "Invalid argument" error on some systems
            # "socket_keepalive_options": {
            #     1: 1,  # TCP_KEEPIDLE
            #     2: 1,  # TCP_KEEPINTVL
            #     3: 3,  # TCP_KEEPCNT
            # },
            "health_check_interval": 30,
            "retry_on_timeout": True,
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
        }
    
    @property
    def sync_pool(self) -> redis.ConnectionPool:
        """Lazy initialization of sync connection pool."""
        if self._sync_pool is None:
            self._sync_pool = redis.ConnectionPool.from_url(
                self.redis_url,
                **self.pool_config
            )
        return self._sync_pool
    
    @property
    def async_pool(self) -> aioredis.ConnectionPool:
        """Lazy initialization of async connection pool."""
        if self._async_pool is None:
            self._async_pool = aioredis.ConnectionPool.from_url(
                self.redis_url,
                **self.pool_config
            )
        return self._async_pool
    
    def _make_key(self, key: str) -> str:
        """Create namespaced cache key."""
        return f"{self.key_prefix}{key}"
    
    def _check_circuit(self) -> bool:
        """Check if circuit breaker is open."""
        if self._circuit_open:
            logger.warning("Cache circuit breaker is open")
            return False
        return True
    
    def _record_failure(self):
        """Record cache operation failure."""
        self._failure_count += 1
        if self._failure_count >= self._failure_threshold:
            self._circuit_open = True
            logger.error(f"Cache circuit breaker opened after {self._failure_count} failures")
            # Schedule circuit reset
            asyncio.create_task(self._reset_circuit())
    
    async def _reset_circuit(self):
        """Reset circuit breaker after timeout."""
        await asyncio.sleep(self._circuit_timeout)
        self._circuit_open = False
        self._failure_count = 0
        logger.info("Cache circuit breaker reset")
    
    # Async methods
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache (async)."""
        if not self._check_circuit():
            return None
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                data = await client.get(self._make_key(key))
                if data:
                    return CacheSerializer.deserialize(data)
        except RedisError as e:
            logger.error(f"Cache get error: {e}")
            self._record_failure()
        return None
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        """Set value in cache (async)."""
        if not self._check_circuit():
            return False
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                data = CacheSerializer.serialize(value)
                return await client.set(
                    self._make_key(key),
                    data,
                    ex=ttl or self.default_ttl,
                    nx=nx,
                    xx=xx,
                )
        except RedisError as e:
            logger.error(f"Cache set error: {e}")
            self._record_failure()
            return False
    
    async def delete(self, *keys: str) -> int:
        """Delete keys from cache (async)."""
        if not self._check_circuit():
            return 0
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                namespaced_keys = [self._make_key(k) for k in keys]
                return await client.delete(*namespaced_keys)
        except RedisError as e:
            logger.error(f"Cache delete error: {e}")
            self._record_failure()
            return 0
    
    async def exists(self, *keys: str) -> int:
        """Check if keys exist (async)."""
        if not self._check_circuit():
            return 0
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                namespaced_keys = [self._make_key(k) for k in keys]
                return await client.exists(*namespaced_keys)
        except RedisError as e:
            logger.error(f"Cache exists error: {e}")
            self._record_failure()
            return 0
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Set TTL for a key (async)."""
        if not self._check_circuit():
            return False
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                return await client.expire(self._make_key(key), ttl)
        except RedisError as e:
            logger.error(f"Cache expire error: {e}")
            self._record_failure()
            return False
    
    async def mget(self, *keys: str) -> list[Optional[Any]]:
        """Get multiple values (async)."""
        if not self._check_circuit():
            return [None] * len(keys)
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                namespaced_keys = [self._make_key(k) for k in keys]
                values = await client.mget(namespaced_keys)
                return [
                    CacheSerializer.deserialize(v) if v else None
                    for v in values
                ]
        except RedisError as e:
            logger.error(f"Cache mget error: {e}")
            self._record_failure()
            return [None] * len(keys)
    
    async def mset(self, mapping: dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Set multiple values (async)."""
        if not self._check_circuit():
            return False
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                # Serialize and namespace keys
                namespaced_mapping = {
                    self._make_key(k): CacheSerializer.serialize(v)
                    for k, v in mapping.items()
                }
                
                # Use pipeline for atomic operation with TTL
                async with client.pipeline() as pipe:
                    pipe.mset(namespaced_mapping)
                    if ttl:
                        for key in namespaced_mapping:
                            pipe.expire(key, ttl or self.default_ttl)
                    await pipe.execute()
                return True
        except RedisError as e:
            logger.error(f"Cache mset error: {e}")
            self._record_failure()
            return False
    
    # Sync methods
    def get_sync(self, key: str) -> Optional[Any]:
        """Get value from cache (sync)."""
        if not self._check_circuit():
            return None
        
        try:
            with redis.Redis(connection_pool=self.sync_pool) as client:
                data = client.get(self._make_key(key))
                if data:
                    return CacheSerializer.deserialize(data)
        except RedisError as e:
            logger.error(f"Cache get error: {e}")
            self._record_failure()
        return None
    
    def set_sync(
        self,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        """Set value in cache (sync)."""
        if not self._check_circuit():
            return False
        
        try:
            with redis.Redis(connection_pool=self.sync_pool) as client:
                data = CacheSerializer.serialize(value)
                return client.set(
                    self._make_key(key),
                    data,
                    ex=ttl or self.default_ttl,
                    nx=nx,
                    xx=xx,
                )
        except RedisError as e:
            logger.error(f"Cache set error: {e}")
            self._record_failure()
            return False
    
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern."""
        if not self._check_circuit():
            return 0
        
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                cursor = 0
                deleted = 0
                pattern_with_prefix = f"{self.key_prefix}{pattern}"
                
                while True:
                    cursor, keys = await client.scan(
                        cursor,
                        match=pattern_with_prefix,
                        count=100
                    )
                    if keys:
                        deleted += await client.delete(*keys)
                    if cursor == 0:
                        break
                
                return deleted
        except RedisError as e:
            logger.error(f"Cache clear pattern error: {e}")
            self._record_failure()
            return 0
    
    async def health_check(self) -> dict[str, Any]:
        """Check cache health and stats."""
        try:
            async with aioredis.Redis(connection_pool=self.async_pool) as client:
                # Ping
                await client.ping()
                
                # Get info
                info = await client.info()
                memory_info = await client.info("memory")
                
                return {
                    "status": "healthy",
                    "circuit_open": self._circuit_open,
                    "failure_count": self._failure_count,
                    "used_memory": memory_info.get("used_memory_human", "unknown"),
                    "connected_clients": info.get("connected_clients", 0),
                    "total_commands_processed": info.get("total_commands_processed", 0),
                    "keyspace_hits": info.get("keyspace_hits", 0),
                    "keyspace_misses": info.get("keyspace_misses", 0),
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "circuit_open": self._circuit_open,
                "failure_count": self._failure_count,
                "error": str(e),
            }
    
    async def close(self):
        """Close all connections."""
        if self._async_pool:
            await self._async_pool.disconnect()
        if self._sync_pool:
            self._sync_pool.disconnect()


# Global cache instance
cache = RedisCache()


# Decorators
def cached(
    key_func: Optional[Callable] = None,
    ttl: Optional[int] = None,
    namespace: Optional[str] = None,
):
    """
    Async cache decorator with automatic key generation.
    
    Args:
        key_func: Function to generate cache key from arguments
        ttl: Time to live in seconds
        namespace: Additional namespace for keys
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Auto-generate key from function name and arguments
                key_parts = [func.__name__]
                if namespace:
                    key_parts.insert(0, namespace)
                if args:
                    key_parts.extend(str(arg) for arg in args)
                if kwargs:
                    key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)
            
            # Try to get from cache
            result = await cache.get(cache_key)
            if result is not None:
                logger.debug(f"Cache hit for key: {cache_key}")
                return result
            
            # Call function and cache result
            result = await func(*args, **kwargs)
            await cache.set(cache_key, result, ttl=ttl)
            logger.debug(f"Cache miss for key: {cache_key}")
            
            return result
        
        return wrapper
    return decorator


def cached_sync(
    key_func: Optional[Callable] = None,
    ttl: Optional[int] = None,
    namespace: Optional[str] = None,
):
    """Sync version of cache decorator."""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                key_parts = [func.__name__]
                if namespace:
                    key_parts.insert(0, namespace)
                if args:
                    key_parts.extend(str(arg) for arg in args)
                if kwargs:
                    key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)
            
            # Try to get from cache
            result = cache.get_sync(cache_key)
            if result is not None:
                return result
            
            # Call function and cache result
            result = func(*args, **kwargs)
            cache.set_sync(cache_key, result, ttl=ttl)
            
            return result
        
        return wrapper
    return decorator 