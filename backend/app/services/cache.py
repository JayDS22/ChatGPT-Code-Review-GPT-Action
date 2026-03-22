"""Review cache layer using Redis with TTL-based expiration."""

import hashlib
import json
import logging
from datetime import datetime

from app.core.config import get_settings
from app.core.redis import get_redis
from app.models.schemas import ReviewResult

logger = logging.getLogger(__name__)
settings = get_settings()


class CacheService:
    """Cache reviews keyed on (repo, pr_number, head_sha) for PR reviews
    or code_hash for snippet reviews."""

    @staticmethod
    def _pr_cache_key(owner: str, repo: str, pr_number: int, head_sha: str) -> str:
        return f"review:pr:{owner}/{repo}#{pr_number}@{head_sha}"

    @staticmethod
    def _snippet_cache_key(code: str, language: str) -> str:
        code_hash = hashlib.sha256(code.encode()).hexdigest()[:16]
        return f"review:snippet:{language}:{code_hash}"

    async def get_pr_review(
        self, owner: str, repo: str, pr_number: int, head_sha: str
    ) -> ReviewResult | None:
        """Get cached PR review if exists and not expired."""
        try:
            redis = await get_redis()
            key = self._pr_cache_key(owner, repo, pr_number, head_sha)
            cached = await redis.get(key)

            if cached:
                logger.info(f"Cache HIT for {key}")
                data = json.loads(cached)
                result = ReviewResult(**data)
                result.cached = True
                return result

            logger.info(f"Cache MISS for {key}")
            return None
        except Exception as e:
            logger.warning(f"Cache get failed: {e}")
            return None

    async def set_pr_review(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        head_sha: str,
        result: ReviewResult,
    ) -> None:
        """Cache a PR review result with TTL."""
        try:
            redis = await get_redis()
            key = self._pr_cache_key(owner, repo, pr_number, head_sha)
            data = result.model_dump_json()
            await redis.setex(key, settings.cache_ttl_seconds, data)
            logger.info(f"Cached review for {key} (TTL: {settings.cache_ttl_seconds}s)")
        except Exception as e:
            logger.warning(f"Cache set failed: {e}")

    async def get_snippet_review(
        self, code: str, language: str
    ) -> ReviewResult | None:
        """Get cached snippet review."""
        try:
            redis = await get_redis()
            key = self._snippet_cache_key(code, language)
            cached = await redis.get(key)

            if cached:
                logger.info(f"Cache HIT for snippet")
                data = json.loads(cached)
                result = ReviewResult(**data)
                result.cached = True
                return result
            return None
        except Exception as e:
            logger.warning(f"Snippet cache get failed: {e}")
            return None

    async def set_snippet_review(
        self, code: str, language: str, result: ReviewResult
    ) -> None:
        """Cache a snippet review result."""
        try:
            redis = await get_redis()
            key = self._snippet_cache_key(code, language)
            data = result.model_dump_json()
            await redis.setex(key, settings.cache_ttl_seconds, data)
        except Exception as e:
            logger.warning(f"Snippet cache set failed: {e}")

    async def invalidate_pr(
        self, owner: str, repo: str, pr_number: int, head_sha: str
    ) -> None:
        """Invalidate a cached PR review."""
        try:
            redis = await get_redis()
            key = self._pr_cache_key(owner, repo, pr_number, head_sha)
            await redis.delete(key)
        except Exception as e:
            logger.warning(f"Cache invalidation failed: {e}")
