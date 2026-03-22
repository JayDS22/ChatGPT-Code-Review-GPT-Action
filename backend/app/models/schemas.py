"""Pydantic schemas for CodeLens API request/response models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl


# ── Enums ────────────────────────────────────────────────────────────────

class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Category(str, Enum):
    SECURITY = "security"
    PERFORMANCE = "performance"
    BUG = "bug"
    STYLE = "style"
    REFACTORING = "refactoring"
    BEST_PRACTICE = "best_practice"
    DOCUMENTATION = "documentation"
    ERROR_HANDLING = "error_handling"
    TESTING = "testing"


# ── Request Models ───────────────────────────────────────────────────────

class ReviewPRRequest(BaseModel):
    """Request body for reviewing a GitHub Pull Request."""
    repo_url: str = Field(
        ...,
        description="Full GitHub PR URL, e.g. https://github.com/owner/repo/pull/123",
        examples=["https://github.com/facebook/react/pull/28000"],
    )
    pr_number: int | None = Field(
        default=None,
        description="PR number (auto-extracted from URL if not provided)",
    )

    model_config = {"json_schema_extra": {
        "examples": [{"repo_url": "https://github.com/owner/repo/pull/42"}]
    }}


class ReviewSnippetRequest(BaseModel):
    """Request body for reviewing a code snippet."""
    code_snippet: str = Field(
        ...,
        min_length=1,
        max_length=50000,
        description="The code to review",
    )
    language: str = Field(
        default="auto",
        description="Programming language (auto-detected if not specified)",
        examples=["python", "javascript", "typescript", "go", "rust"],
    )
    context: str | None = Field(
        default=None,
        description="Optional context about the code's purpose",
    )

    model_config = {"json_schema_extra": {
        "examples": [{
            "code_snippet": "def add(a, b):\n    return a + b",
            "language": "python",
        }]
    }}


# ── Response Models ──────────────────────────────────────────────────────

class ReviewItem(BaseModel):
    """A single review finding."""
    severity: Severity
    category: Category
    file_path: str | None = Field(default=None, description="File path in the PR")
    line_range: str | None = Field(default=None, description="Line range, e.g. '12-18'")
    title: str = Field(..., description="Short summary of the issue")
    suggestion: str = Field(..., description="Actionable suggestion to fix the issue")
    explanation: str = Field(..., description="Detailed explanation of why this matters")
    code_before: str | None = Field(default=None, description="Original problematic code")
    code_after: str | None = Field(default=None, description="Suggested improved code")


class SeverityCounts(BaseModel):
    """Count of findings by severity."""
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ReviewResult(BaseModel):
    """Complete review result for a PR or snippet."""
    review_id: str = Field(..., description="Unique review identifier")
    status: str = Field(default="completed", description="Review status")
    summary: str = Field(..., description="High-level summary of the review")
    overall_quality: str = Field(
        ...,
        description="Overall code quality rating: excellent/good/needs_improvement/poor",
    )
    severity_counts: SeverityCounts
    top_priority_fixes: list[str] = Field(
        ...,
        max_length=5,
        description="Top 3-5 most important fixes to make",
    )
    items: list[ReviewItem] = Field(..., description="Individual review findings")
    files_reviewed: int = Field(default=0, description="Number of files reviewed")
    cached: bool = Field(default=False, description="Whether this result was cached")
    review_time_ms: int = Field(default=0, description="Time taken for review in ms")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = {"json_schema_extra": {
        "examples": [{
            "review_id": "rev_abc123",
            "status": "completed",
            "summary": "Overall good code quality with 2 security concerns.",
            "overall_quality": "good",
            "severity_counts": {"critical": 0, "high": 1, "medium": 2, "low": 1, "info": 3},
            "top_priority_fixes": [
                "Add input validation to user-facing endpoint",
                "Replace string concatenation with parameterized query",
            ],
            "items": [],
            "files_reviewed": 5,
            "cached": False,
            "review_time_ms": 3200,
        }]
    }}


class PRInfo(BaseModel):
    """Metadata about the PR being reviewed."""
    owner: str
    repo: str
    pr_number: int
    title: str = ""
    head_sha: str = ""
    base_branch: str = ""
    head_branch: str = ""
    changed_files: int = 0
    additions: int = 0
    deletions: int = 0


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str
    database: str = "connected"
    redis: str = "connected"
    github_api: str = "available"
    uptime_seconds: float = 0.0


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: str
    trace_id: str | None = None
