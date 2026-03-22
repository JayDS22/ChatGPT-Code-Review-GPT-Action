"""Security utilities: rate limiting, input sanitization, request tracing."""

import re
import uuid
from typing import Callable

from fastapi import HTTPException, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings

settings = get_settings()

# Rate limiter — uses Redis if available, otherwise in-memory
_storage_uri = settings.redis_url if not settings.use_memory_cache else "memory://"
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage_uri,
    default_limits=[f"{settings.rate_limit_per_hour}/hour"],
)

# GitHub PR URL pattern
GITHUB_PR_PATTERN = re.compile(
    r"^https?://github\.com/(?P<owner>[\w.\-]+)/(?P<repo>[\w.\-]+)/pull/(?P<pr_number>\d+)/?$"
)


def parse_github_pr_url(url: str) -> dict[str, str]:
    """Parse and validate a GitHub PR URL. Returns owner, repo, pr_number."""
    match = GITHUB_PR_PATTERN.match(url.strip())
    if not match:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid GitHub PR URL. Expected format: "
                "https://github.com/{owner}/{repo}/pull/{number}"
            ),
        )
    return {
        "owner": match.group("owner"),
        "repo": match.group("repo"),
        "pr_number": int(match.group("pr_number")),
    }


def sanitize_code_snippet(code: str, max_length: int = 50_000) -> str:
    """Sanitize a code snippet input."""
    if not code or not code.strip():
        raise HTTPException(status_code=400, detail="Code snippet cannot be empty.")
    if len(code) > max_length:
        raise HTTPException(
            status_code=400,
            detail=f"Code snippet exceeds maximum length of {max_length} characters.",
        )
    return code.strip()


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Add unique trace ID to every request for observability."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        trace_id = str(uuid.uuid4())
        request.state.trace_id = trace_id
        response = await call_next(request)
        response.headers["X-Trace-ID"] = trace_id
        return response
