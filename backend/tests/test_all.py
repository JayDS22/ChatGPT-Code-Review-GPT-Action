"""Comprehensive test suite for CodeLens backend — 30+ tests."""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from app.core.security import parse_github_pr_url, sanitize_code_snippet
from app.models.schemas import (
    Category,
    ReviewItem,
    ReviewResult,
    ReviewSnippetRequest,
    Severity,
    SeverityCounts,
)
from app.services.github import GitHubAPIError, GitHubService, PRFile, PRMetadata
from app.services.reviewer import ReviewEngine
from app.services.cache import CacheService


# ═══════════════════════════════════════════════════════════════════════════
# 1. INPUT VALIDATION TESTS (Security)
# ═══════════════════════════════════════════════════════════════════════════

class TestInputValidation:
    """Test URL parsing and input sanitization."""

    def test_valid_github_pr_url(self):
        result = parse_github_pr_url("https://github.com/facebook/react/pull/28000")
        assert result["owner"] == "facebook"
        assert result["repo"] == "react"
        assert result["pr_number"] == 28000

    def test_valid_url_with_trailing_slash(self):
        result = parse_github_pr_url("https://github.com/owner/repo/pull/1/")
        assert result["pr_number"] == 1

    def test_invalid_url_not_github(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            parse_github_pr_url("https://gitlab.com/owner/repo/pull/1")
        assert exc.value.status_code == 400

    def test_invalid_url_missing_pr_number(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            parse_github_pr_url("https://github.com/owner/repo/pull/")

    def test_invalid_url_not_a_pr(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            parse_github_pr_url("https://github.com/owner/repo/issues/42")

    def test_invalid_url_malicious_input(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            parse_github_pr_url("https://github.com/../../../etc/passwd")

    def test_sanitize_valid_snippet(self):
        result = sanitize_code_snippet("def hello(): pass")
        assert result == "def hello(): pass"

    def test_sanitize_empty_snippet(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            sanitize_code_snippet("")
        assert exc.value.status_code == 400

    def test_sanitize_whitespace_only(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            sanitize_code_snippet("   \n\t  ")

    def test_sanitize_oversized_snippet(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            sanitize_code_snippet("x" * 60000)
        assert "maximum length" in exc.value.detail

    def test_sanitize_strips_whitespace(self):
        result = sanitize_code_snippet("  code  \n")
        assert result == "code"


# ═══════════════════════════════════════════════════════════════════════════
# 2. GITHUB API TESTS (Mocked)
# ═══════════════════════════════════════════════════════════════════════════

class TestGitHubService:
    """Test GitHub API integration with mocked HTTP responses."""

    @pytest.mark.asyncio
    async def test_fetch_pr_metadata_success(self, sample_pr_metadata_response):
        service = GitHubService(token="test-token")
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = sample_pr_metadata_response

        with patch("httpx.AsyncClient.get", return_value=mock_response):
            result = await service.get_pr_metadata("owner", "repo", 42)
            assert result.pr_number == 42
            assert result.title == "Fix SQL injection and add utils"
            assert result.head_sha == "abc123def456"

    @pytest.mark.asyncio
    async def test_fetch_pr_404(self):
        service = GitHubService(token="test-token")
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(GitHubAPIError) as exc:
                await service.get_pr_metadata("owner", "repo", 999)
            assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_fetch_pr_rate_limited(self):
        service = GitHubService(token="test-token")
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.headers = {"X-RateLimit-Remaining": "0"}

        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(GitHubAPIError) as exc:
                await service.get_pr_metadata("owner", "repo", 42)
            assert exc.value.status_code == 429

    @pytest.mark.asyncio
    async def test_fetch_pr_files_pagination(self, sample_pr_files_response):
        service = GitHubService(token="test-token")

        # First page returns files, second page returns empty (end of pagination)
        mock_resp_page1 = MagicMock()
        mock_resp_page1.status_code = 200
        mock_resp_page1.json.return_value = sample_pr_files_response

        mock_resp_page2 = MagicMock()
        mock_resp_page2.status_code = 200
        mock_resp_page2.json.return_value = []

        with patch("httpx.AsyncClient.get", side_effect=[mock_resp_page1, mock_resp_page2]):
            files = await service.get_pr_files("owner", "repo", 42)
            assert len(files) == 2
            assert files[0].filename == "src/auth.py"
            assert files[1].filename == "src/utils.py"

    @pytest.mark.asyncio
    async def test_fetch_pr_files_404(self):
        service = GitHubService(token="test-token")
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient.get", return_value=mock_response):
            with pytest.raises(GitHubAPIError):
                await service.get_pr_files("owner", "repo", 999)


# ═══════════════════════════════════════════════════════════════════════════
# 3. GPT-4 REVIEW ENGINE TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestReviewEngine:
    """Test GPT-4 review engine: chunking, parsing, aggregation."""

    def test_chunk_small_pr(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        engine.encoder = MagicMock()
        engine.encoder.encode.return_value = [1] * 100  # 100 tokens per file
        engine.max_chunk_tokens = 7000

        files = [
            PRFile(filename="a.py", status="modified", additions=10, deletions=2, changes=12, patch="+ code"),
            PRFile(filename="b.py", status="added", additions=5, deletions=0, changes=5, patch="+ more"),
        ]
        chunks = engine._chunk_pr_files(files)
        assert len(chunks) == 1  # Both fit in one chunk

    def test_chunk_large_pr_splits(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        engine.encoder = MagicMock()
        engine.encoder.encode.return_value = [1] * 4000  # 4000 tokens each
        engine.max_chunk_tokens = 7000

        files = [
            PRFile(filename=f"file{i}.py", status="modified", additions=100, deletions=10, changes=110, patch="+" * 1000)
            for i in range(5)
        ]
        chunks = engine._chunk_pr_files(files)
        assert len(chunks) >= 2  # Must split across chunks

    def test_chunk_empty_patches_skipped(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        engine.encoder = MagicMock()
        engine.encoder.encode.return_value = [1] * 100
        engine.max_chunk_tokens = 7000

        files = [
            PRFile(filename="a.py", status="modified", additions=0, deletions=0, changes=0, patch=""),
            PRFile(filename="b.py", status="added", additions=5, deletions=0, changes=5, patch="+ code"),
        ]
        chunks = engine._chunk_pr_files(files)
        assert len(chunks) == 1
        assert "b.py" in chunks[0]
        assert "a.py" not in chunks[0]

    def test_parse_valid_json_array(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        raw = json.dumps([{
            "severity": "high",
            "category": "security",
            "title": "SQL Injection",
            "suggestion": "Use parameterized queries",
            "explanation": "Prevents SQL injection attacks",
        }])
        items = engine._parse_findings(raw)
        assert len(items) == 1
        assert items[0].severity == Severity.HIGH
        assert items[0].category == Category.SECURITY

    def test_parse_json_object_with_findings_key(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        raw = json.dumps({"findings": [{
            "severity": "low",
            "category": "style",
            "title": "Naming convention",
            "suggestion": "Use snake_case",
            "explanation": "PEP 8 standard",
        }]})
        items = engine._parse_findings(raw)
        assert len(items) == 1

    def test_parse_malformed_json_fallback(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        items = engine._parse_findings("This is not JSON at all")
        assert len(items) == 1
        assert items[0].severity == Severity.INFO
        assert "parsing error" in items[0].title.lower()

    def test_parse_invalid_severity_skipped(self):
        engine = ReviewEngine.__new__(ReviewEngine)
        raw = json.dumps([
            {
                "severity": "INVALID_LEVEL",
                "category": "security",
                "title": "Bad severity",
                "suggestion": "Fix",
                "explanation": "Test",
            },
            {
                "severity": "high",
                "category": "bug",
                "title": "Valid finding",
                "suggestion": "Fix this",
                "explanation": "Important",
            },
        ])
        items = engine._parse_findings(raw)
        assert len(items) == 1  # Invalid one skipped
        assert items[0].title == "Valid finding"

    @pytest.mark.asyncio
    async def test_review_snippet_success(self, sample_gpt_review_response):
        engine = ReviewEngine()

        with patch.object(engine, "_call_gpt", return_value=sample_gpt_review_response):
            result = await engine.review_snippet("def bad(): pass", "python")
            assert result.status == "completed"
            assert len(result.items) == 2
            assert result.severity_counts.critical == 1

    @pytest.mark.asyncio
    async def test_review_pr_success(
        self, sample_gpt_review_response, sample_gpt_summary_response
    ):
        engine = ReviewEngine()

        pr = PRMetadata(
            owner="test", repo="repo", pr_number=1, title="Test PR",
            head_sha="abc", base_branch="main", head_branch="feature",
            files=[
                PRFile(filename="test.py", status="modified", additions=5,
                       deletions=1, changes=6, patch="+code here"),
            ],
        )

        with patch.object(engine, "_call_gpt", side_effect=[
            sample_gpt_review_response,  # chunk review
            sample_gpt_summary_response,  # summary
        ]):
            result = await engine.review_pr(pr)
            assert result.status == "completed"
            assert result.overall_quality == "needs_improvement"
            assert len(result.top_priority_fixes) > 0


# ═══════════════════════════════════════════════════════════════════════════
# 4. CACHE TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestCacheService:
    """Test Redis cache hit/miss/expiration logic."""

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(self, mock_redis):
        with patch("app.services.cache.get_redis", return_value=mock_redis):
            cache = CacheService()
            result = await cache.get_pr_review("owner", "repo", 42, "sha123")
            assert result is None

    @pytest.mark.asyncio
    async def test_cache_hit_returns_result(self, mock_redis):
        cached_data = ReviewResult(
            review_id="rev_cached",
            summary="Cached review",
            overall_quality="good",
            severity_counts=SeverityCounts(),
            top_priority_fixes=[],
            items=[],
        )
        mock_redis.get = AsyncMock(return_value=cached_data.model_dump_json())

        with patch("app.services.cache.get_redis", return_value=mock_redis):
            cache = CacheService()
            result = await cache.get_pr_review("owner", "repo", 42, "sha123")
            assert result is not None
            assert result.review_id == "rev_cached"
            assert result.cached is True

    @pytest.mark.asyncio
    async def test_cache_set_calls_redis(self, mock_redis):
        with patch("app.services.cache.get_redis", return_value=mock_redis):
            cache = CacheService()
            result = ReviewResult(
                review_id="rev_new",
                summary="New review",
                overall_quality="good",
                severity_counts=SeverityCounts(),
                top_priority_fixes=[],
                items=[],
            )
            await cache.set_pr_review("owner", "repo", 42, "sha123", result)
            mock_redis.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_invalidation(self, mock_redis):
        with patch("app.services.cache.get_redis", return_value=mock_redis):
            cache = CacheService()
            await cache.invalidate_pr("owner", "repo", 42, "sha123")
            mock_redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_snippet_cache_miss(self, mock_redis):
        with patch("app.services.cache.get_redis", return_value=mock_redis):
            cache = CacheService()
            result = await cache.get_snippet_review("code", "python")
            assert result is None

    @pytest.mark.asyncio
    async def test_cache_error_returns_none(self):
        """Cache errors should be graceful, not crash the service."""
        broken_redis = AsyncMock()
        broken_redis.get = AsyncMock(side_effect=Exception("Connection refused"))

        with patch("app.services.cache.get_redis", return_value=broken_redis):
            cache = CacheService()
            result = await cache.get_pr_review("owner", "repo", 42, "sha123")
            assert result is None  # Graceful fallback


# ═══════════════════════════════════════════════════════════════════════════
# 5. SCHEMA VALIDATION TESTS
# ═══════════════════════════════════════════════════════════════════════════

class TestSchemas:
    """Test Pydantic model validation."""

    def test_review_pr_request_valid(self):
        from app.models.schemas import ReviewPRRequest
        req = ReviewPRRequest(repo_url="https://github.com/owner/repo/pull/1")
        assert req.repo_url == "https://github.com/owner/repo/pull/1"

    def test_review_snippet_request_valid(self):
        req = ReviewSnippetRequest(code_snippet="print('hello')", language="python")
        assert req.language == "python"

    def test_review_snippet_request_auto_language(self):
        req = ReviewSnippetRequest(code_snippet="code")
        assert req.language == "auto"

    def test_review_item_all_severities(self):
        for sev in Severity:
            item = ReviewItem(
                severity=sev,
                category=Category.BUG,
                title="Test",
                suggestion="Fix it",
                explanation="Because",
            )
            assert item.severity == sev

    def test_review_result_serialization(self):
        result = ReviewResult(
            review_id="rev_test",
            summary="Test",
            overall_quality="good",
            severity_counts=SeverityCounts(critical=1, high=2),
            top_priority_fixes=["fix1"],
            items=[],
        )
        data = result.model_dump()
        assert data["severity_counts"]["critical"] == 1
        assert data["severity_counts"]["high"] == 2


# ═══════════════════════════════════════════════════════════════════════════
# 6. API ENDPOINT INTEGRATION TESTS (Mocked deps)
# ═══════════════════════════════════════════════════════════════════════════

class TestAPIEndpoints:
    """Integration tests for API endpoints with mocked services."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client):
        with patch("app.routers.health.get_redis") as mock_get_redis:
            mock_redis = AsyncMock()
            mock_redis.ping = AsyncMock()
            mock_get_redis.return_value = mock_redis

            response = await client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"
            assert "version" in data

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client):
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "CodeLens"

    @pytest.mark.asyncio
    async def test_review_pr_invalid_url(self, client):
        response = await client.post(
            "/review-pr",
            json={"repo_url": "not-a-valid-url"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_review_snippet_empty_body(self, client):
        response = await client.post(
            "/review-snippet",
            json={"code_snippet": ""},
        )
        assert response.status_code == 422  # Pydantic validation (min_length=1)
