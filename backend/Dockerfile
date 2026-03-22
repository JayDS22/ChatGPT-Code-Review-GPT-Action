# ═══════════════════════════════════════════════════════════════════
# CodeLens Backend — Multi-stage Dockerfile
# ═══════════════════════════════════════════════════════════════════

# Stage 1: Dependencies
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim AS runtime

LABEL maintainer="CodeLens Team"
LABEL description="CodeLens AI Code Review API"

# Security: non-root user
RUN groupadd -r codelens && useradd -r -g codelens -d /app codelens

WORKDIR /app

# Copy installed dependencies
COPY --from=builder /install /usr/local

# Copy application code
COPY app/ ./app/
COPY alembic.ini ./

# Set ownership
RUN chown -R codelens:codelens /app

USER codelens

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
