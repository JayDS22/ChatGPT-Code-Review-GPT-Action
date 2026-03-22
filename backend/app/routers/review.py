"""Review endpoints: /review-pr, /review-snippet, /review-pr/stream."""

import logging
import time

from fastapi import APIRouter, HTTPException, Request
from prometheus_client import Counter, Histogram

from app.core.security import limiter, parse_github_pr_url, sanitize_code_snippet
from app.models.schemas import ReviewPRRequest, ReviewResult, ReviewSnippetRequest
from app.services.cache import CacheService
from app.services.github import GitHubAPIError, GitHubService
from app.services.reviewer import ReviewEngine
from app.services.streaming import create_sse_response

logger = logging.getLogger(__name__)

router = APIRouter(tags=["reviews"])

# Prometheus metrics
REVIEW_COUNT = Counter(
    "codelens_review_count_total",
    "Total number of reviews",
    ["type", "status"],
)
REVIEW_LATENCY = Histogram(
    "codelens_review_latency_seconds",
    "Review latency in seconds",
    ["type"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)
CACHE_HIT = Counter(
    "codelens_cache_hit_total",
    "Cache hit count",
    ["type"],
)
CACHE_MISS = Counter(
    "codelens_cache_miss_total",
    "Cache miss count",
    ["type"],
)

# Service instances
github_service = GitHubService()
review_engine = ReviewEngine()
cache_service = CacheService()


@router.post(
    "/review-pr",
    response_model=ReviewResult,
    summary="Review a GitHub Pull Request",
    description=(
        "Submit a GitHub PR URL for AI-powered code review. "
        "Returns structured findings with severity, category, and suggestions."
    ),
    operation_id="reviewPullRequest",
    responses={
        200: {"description": "Successful review with findings"},
        400: {"description": "Invalid PR URL format"},
        404: {"description": "PR not found or repository is private"},
        429: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit("10/hour")
async def review_pr(request: Request, body: ReviewPRRequest) -> ReviewResult:
    """Review a GitHub Pull Request."""
    start = time.time()

    try:
        # Parse and validate URL
        pr_info = parse_github_pr_url(body.repo_url)
        owner = pr_info["owner"]
        repo = pr_info["repo"]
        pr_number = pr_info["pr_number"]

        # Fetch PR metadata to get head_sha
        pr_data = await github_service.fetch_full_pr(owner, repo, pr_number)

        # Check cache
        cached_result = await cache_service.get_pr_review(
            owner, repo, pr_number, pr_data.head_sha
        )
        if cached_result:
            CACHE_HIT.labels(type="pr").inc()
            REVIEW_COUNT.labels(type="pr", status="cached").inc()
            cached_result.review_time_ms = int((time.time() - start) * 1000)
            return cached_result

        CACHE_MISS.labels(type="pr").inc()

        # Run review
        result = await review_engine.review_pr(pr_data)

        # Cache the result
        await cache_service.set_pr_review(owner, repo, pr_number, pr_data.head_sha, result)

        REVIEW_COUNT.labels(type="pr", status="completed").inc()
        REVIEW_LATENCY.labels(type="pr").observe(time.time() - start)

        return result

    except GitHubAPIError as e:
        REVIEW_COUNT.labels(type="pr", status="error").inc()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"PR review failed: {e}")
        REVIEW_COUNT.labels(type="pr", status="error").inc()
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


@router.post(
    "/review-snippet",
    response_model=ReviewResult,
    summary="Review a code snippet",
    description=(
        "Submit a code snippet for AI-powered review. "
        "Optionally specify the programming language."
    ),
    operation_id="reviewCodeSnippet",
    responses={
        200: {"description": "Successful review with findings"},
        400: {"description": "Invalid or empty code snippet"},
        429: {"description": "Rate limit exceeded"},
    },
)
@limiter.limit("10/hour")
async def review_snippet(request: Request, body: ReviewSnippetRequest) -> ReviewResult:
    """Review a code snippet."""
    start = time.time()

    try:
        code = sanitize_code_snippet(body.code_snippet)

        # Check cache
        cached_result = await cache_service.get_snippet_review(code, body.language)
        if cached_result:
            CACHE_HIT.labels(type="snippet").inc()
            REVIEW_COUNT.labels(type="snippet", status="cached").inc()
            return cached_result

        CACHE_MISS.labels(type="snippet").inc()

        result = await review_engine.review_snippet(code, body.language, body.context)

        # Cache
        await cache_service.set_snippet_review(code, body.language, result)

        REVIEW_COUNT.labels(type="snippet", status="completed").inc()
        REVIEW_LATENCY.labels(type="snippet").observe(time.time() - start)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Snippet review failed: {e}")
        REVIEW_COUNT.labels(type="snippet", status="error").inc()
        raise HTTPException(status_code=500, detail=f"Review failed: {str(e)}")


@router.get(
    "/review-pr/stream",
    summary="Stream a PR review via SSE",
    description="Real-time streaming of PR review results using Server-Sent Events.",
    operation_id="streamPRReview",
)
@limiter.limit("10/hour")
async def stream_pr_review(request: Request, pr_url: str):
    """Stream PR review results via Server-Sent Events."""
    try:
        pr_info = parse_github_pr_url(pr_url)
        pr_data = await github_service.fetch_full_pr(
            pr_info["owner"], pr_info["repo"], pr_info["pr_number"]
        )
        generator = review_engine.review_pr_stream(pr_data)
        return create_sse_response(generator, request)
    except GitHubAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Stream review failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
