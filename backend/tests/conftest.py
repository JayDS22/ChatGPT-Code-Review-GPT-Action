"""Pytest fixtures and configuration for CodeLens tests."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Patch settings before importing app
with patch.dict("os.environ", {
    "OPENAI_API_KEY": "sk-test-key",
    "GITHUB_TOKEN": "ghp-test-token",
    "DATABASE_URL": "sqlite+aiosqlite:///./test.db",
    "REDIS_URL": "redis://localhost:6379/1",
    "APP_ENV": "testing",
}):
    from app.main import app
    from app.core.database import Base, engine


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client():
    """Async test client for FastAPI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_pr_files_response():
    """Mock GitHub API response for PR files."""
    return [
        {
            "sha": "abc123",
            "filename": "src/auth.py",
            "status": "modified",
            "additions": 15,
            "deletions": 3,
            "changes": 18,
            "patch": (
                "@@ -10,6 +10,18 @@\n"
                " def authenticate(username, password):\n"
                "-    query = f\"SELECT * FROM users WHERE username='{username}'\"\n"
                "+    query = \"SELECT * FROM users WHERE username = %s\"\n"
                "+    cursor.execute(query, (username,))\n"
            ),
        },
        {
            "sha": "def456",
            "filename": "src/utils.py",
            "status": "added",
            "additions": 30,
            "deletions": 0,
            "changes": 30,
            "patch": (
                "@@ -0,0 +1,30 @@\n"
                "+import os\n"
                "+import subprocess\n"
                "+\n"
                "+def run_command(cmd):\n"
                "+    return subprocess.call(cmd, shell=True)\n"
            ),
        },
    ]


@pytest.fixture
def sample_pr_metadata_response():
    """Mock GitHub API response for PR metadata."""
    return {
        "number": 42,
        "title": "Fix SQL injection and add utils",
        "body": "This PR fixes a SQL injection vulnerability.",
        "state": "open",
        "head": {"sha": "abc123def456", "ref": "fix/sql-injection"},
        "base": {"ref": "main"},
        "user": {"login": "testuser"},
        "changed_files": 2,
        "additions": 45,
        "deletions": 3,
    }


@pytest.fixture
def sample_gpt_review_response():
    """Mock GPT-4 review response."""
    return json.dumps([
        {
            "severity": "critical",
            "category": "security",
            "file_path": "src/utils.py",
            "line_range": "4-5",
            "title": "Command injection vulnerability",
            "suggestion": "Use subprocess.run with a list of arguments instead of shell=True",
            "explanation": "Using shell=True with user input allows command injection attacks.",
            "code_before": "subprocess.call(cmd, shell=True)",
            "code_after": "subprocess.run(cmd.split(), shell=False, check=True)",
        },
        {
            "severity": "info",
            "category": "best_practice",
            "file_path": "src/auth.py",
            "line_range": "10-12",
            "title": "Good: Parameterized query",
            "suggestion": "The SQL injection fix looks correct.",
            "explanation": "Using parameterized queries prevents SQL injection.",
        },
    ])


@pytest.fixture
def sample_gpt_summary_response():
    """Mock GPT-4 summary response."""
    return json.dumps({
        "summary": "PR has 1 critical security issue in utils.py. Auth fix looks good.",
        "overall_quality": "needs_improvement",
        "top_priority_fixes": [
            "Fix command injection in run_command()",
            "Add input validation",
        ],
    })


@pytest.fixture
def mock_redis():
    """Mock Redis client."""
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.setex = AsyncMock()
    redis.delete = AsyncMock()
    redis.ping = AsyncMock()
    return redis
