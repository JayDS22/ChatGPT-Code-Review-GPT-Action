"""Redis connection management for caching and rate limiting.

Supports:
  - Real Redis (production / docker)
  - In-memory dict fallback (local development, zero-config)
"""

import logging
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

redis_pool = None


class MemoryCache:
    """In-memory Redis-like interface for local development without Redis."""

    def __init__(self):
        self._store: dict[str, str] = {}
        self._ttls: dict[str, float] = {}

    async def get(self, key: str) -> str | None:
        import time
        if key in self._ttls and time.time() > self._ttls[key]:
            del self._store[key]
            del self._ttls[key]
            return None
        return self._store.get(key)

    async def setex(self, key: str, ttl: int, value: str):
        import time
        self._store[key] = value
        self._ttls[key] = time.time() + ttl

    async def set(self, key: str, value: str, ex: int | None = None):
        import time
        self._store[key] = value
        if ex:
            self._ttls[key] = time.time() + ex

    async def delete(self, key: str):
        self._store.pop(key, None)
        self._ttls.pop(key, None)

    async def ping(self):
        return True

    async def close(self):
        self._store.clear()


async def get_redis():
    """Get Redis client or in-memory fallback."""
    global redis_pool

    if redis_pool is not None:
        return redis_pool

    if settings.use_memory_cache:
        logger.info("Using in-memory cache (no Redis)")
        redis_pool = MemoryCache()
        return redis_pool

    try:
        import redis.asyncio as redis_lib
        redis_pool = redis_lib.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
        )
        await redis_pool.ping()
        logger.info("Connected to Redis")
        return redis_pool
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}), falling back to in-memory cache")
        redis_pool = MemoryCache()
        return redis_pool


async def close_redis():
    """Close Redis connection pool."""
    global redis_pool
    if redis_pool:
        await redis_pool.close()
        redis_pool = None
