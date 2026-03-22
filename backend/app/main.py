"""CodeLens — AI-Powered Code Review GPT Action.

FastAPI application with OpenAPI 3.1 schema for ChatGPT GPT Action discovery.
"""

import logging
import sys
import time

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from pythonjsonlogger import jsonlogger

from app.core.config import get_settings
from app.core.database import init_db, close_db
from app.core.redis import close_redis
from app.core.security import RequestTracingMiddleware, limiter
from app.routers import review, health

settings = get_settings()

# ── Structured JSON Logging ──────────────────────────────────────────────

def setup_logging():
    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        rename_fields={"asctime": "timestamp", "levelname": "level"},
    )
    handler.setFormatter(formatter)
    logging.root.handlers = [handler]
    logging.root.setLevel(logging.INFO if not settings.debug else logging.DEBUG)


setup_logging()
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CodeLens API", extra={"version": settings.app_version})
    await init_db()
    yield
    await close_db()
    await close_redis()
    logger.info("CodeLens API shutdown complete")


# ── App ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CodeLens — AI Code Review",
    description=(
        "AI-powered code review GPT Action. Submit a GitHub PR URL or code snippet "
        "and receive structured review findings with severity ratings, security flags, "
        "performance suggestions, and refactoring tips.\n\n"
        "**GPT Action Integration**: This API is designed to be used as a ChatGPT GPT Action. "
        "Import the OpenAPI schema at `/openapi.json` in the GPT Builder."
    ),
    version=settings.app_version,
    servers=[
        {"url": settings.api_base_url, "description": "Primary API server"},
    ],
    license_info={"name": "MIT", "url": "https://opensource.org/licenses/MIT"},
    contact={"name": "CodeLens Team", "url": "https://github.com/codelens"},
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestTracingMiddleware)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── Request timing middleware ────────────────────────────────────────────

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = round((time.time() - start) * 1000, 2)
    response.headers["X-Response-Time-Ms"] = str(elapsed)
    return response


# ── Routers ──────────────────────────────────────────────────────────────

app.include_router(review.router, prefix="")
app.include_router(health.router, prefix="")


# ── Root ─────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": "CodeLens",
        "version": settings.app_version,
        "docs": "/docs",
        "openapi": "/openapi.json",
    }
