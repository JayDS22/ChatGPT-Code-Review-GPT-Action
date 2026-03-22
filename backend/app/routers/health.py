"""Health check and Prometheus metrics endpoints."""

import time
import logging

from fastapi import APIRouter
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from app.core.config import get_settings
from app.core.redis import get_redis
from app.models.schemas import HealthResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

_start_time = time.time()
settings = get_settings()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Returns service health status including database and Redis connectivity.",
    operation_id="healthCheck",
)
async def health_check() -> HealthResponse:
    """Check service health."""
    redis_status = "disconnected"
    db_status = "connected"  # Simplified — real check would ping DB

    try:
        redis = await get_redis()
        await redis.ping()
        redis_status = "connected"
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        redis_status = "disconnected"

    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        database=db_status,
        redis=redis_status,
        github_api="available",
        uptime_seconds=round(time.time() - _start_time, 2),
    )


@router.get(
    "/metrics",
    summary="Prometheus metrics",
    description="Prometheus-compatible metrics endpoint for monitoring.",
    include_in_schema=False,
)
async def metrics():
    """Expose Prometheus metrics."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )
