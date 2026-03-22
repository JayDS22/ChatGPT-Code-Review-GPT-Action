"""GitHub REST API v3 integration for fetching PR data."""

import logging
from dataclasses import dataclass, field

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class PRFile:
    """Represents a single file in a PR diff."""
    filename: str
    status: str  # added, removed, modified, renamed
    additions: int
    deletions: int
    changes: int
    patch: str = ""
    contents_url: str = ""
    raw_url: str = ""


@dataclass
class PRMetadata:
    """Full PR metadata and diff information."""
    owner: str
    repo: str
    pr_number: int
    title: str = ""
    body: str = ""
    head_sha: str = ""
    base_branch: str = ""
    head_branch: str = ""
    state: str = ""
    user: str = ""
    changed_files_count: int = 0
    additions: int = 0
    deletions: int = 0
    files: list[PRFile] = field(default_factory=list)


class GitHubAPIError(Exception):
    """Custom exception for GitHub API errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class GitHubService:
    """Async GitHub API client with pagination and rate limit handling."""

    def __init__(self, token: str | None = None):
        self.token = token or settings.github_token
        self.base_url = settings.github_api_base
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=30.0,
        )

    async def get_pr_metadata(self, owner: str, repo: str, pr_number: int) -> PRMetadata:
        """Fetch PR metadata (title, branches, stats)."""
        async with self._client() as client:
            url = f"/repos/{owner}/{repo}/pulls/{pr_number}"
            response = await client.get(url)

            if response.status_code == 404:
                raise GitHubAPIError(
                    f"PR #{pr_number} not found in {owner}/{repo}. "
                    "It may be private or doesn't exist.",
                    status_code=404,
                )
            if response.status_code == 403:
                remaining = response.headers.get("X-RateLimit-Remaining", "?")
                raise GitHubAPIError(
                    f"GitHub API rate limit reached (remaining: {remaining}). "
                    "Try again later or provide a GitHub token.",
                    status_code=429,
                )
            if response.status_code != 200:
                raise GitHubAPIError(
                    f"GitHub API error: {response.status_code} - {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            return PRMetadata(
                owner=owner,
                repo=repo,
                pr_number=pr_number,
                title=data.get("title", ""),
                body=data.get("body", "") or "",
                head_sha=data.get("head", {}).get("sha", ""),
                base_branch=data.get("base", {}).get("ref", ""),
                head_branch=data.get("head", {}).get("ref", ""),
                state=data.get("state", ""),
                user=data.get("user", {}).get("login", ""),
                changed_files_count=data.get("changed_files", 0),
                additions=data.get("additions", 0),
                deletions=data.get("deletions", 0),
            )

    async def get_pr_files(
        self, owner: str, repo: str, pr_number: int, max_files: int = 100
    ) -> list[PRFile]:
        """Fetch PR files with pagination support for large PRs (50+ files)."""
        files: list[PRFile] = []
        page = 1
        per_page = 100

        async with self._client() as client:
            while True:
                url = f"/repos/{owner}/{repo}/pulls/{pr_number}/files"
                params = {"page": page, "per_page": per_page}
                response = await client.get(url, params=params)

                if response.status_code == 404:
                    raise GitHubAPIError(
                        f"PR #{pr_number} not found in {owner}/{repo}.",
                        status_code=404,
                    )
                if response.status_code == 403:
                    raise GitHubAPIError(
                        "GitHub API rate limit exceeded.",
                        status_code=429,
                    )
                if response.status_code != 200:
                    raise GitHubAPIError(
                        f"GitHub API error: {response.status_code}",
                        status_code=response.status_code,
                    )

                data = response.json()
                if not data:
                    break

                for f in data:
                    files.append(PRFile(
                        filename=f.get("filename", ""),
                        status=f.get("status", ""),
                        additions=f.get("additions", 0),
                        deletions=f.get("deletions", 0),
                        changes=f.get("changes", 0),
                        patch=f.get("patch", ""),
                        contents_url=f.get("contents_url", ""),
                        raw_url=f.get("raw_url", ""),
                    ))

                # Check for pagination
                if len(data) < per_page or len(files) >= max_files:
                    break

                page += 1
                logger.info(
                    f"Fetching page {page} of PR files for {owner}/{repo}#{pr_number}"
                )

        logger.info(f"Fetched {len(files)} files for {owner}/{repo}#{pr_number}")
        return files[:max_files]

    async def fetch_full_pr(self, owner: str, repo: str, pr_number: int) -> PRMetadata:
        """Fetch complete PR data (metadata + files) in one call."""
        metadata = await self.get_pr_metadata(owner, repo, pr_number)
        files = await self.get_pr_files(owner, repo, pr_number)
        metadata.files = files
        return metadata

    async def check_rate_limit(self) -> dict:
        """Check current GitHub API rate limit status."""
        async with self._client() as client:
            response = await client.get("/rate_limit")
            if response.status_code == 200:
                data = response.json()
                core = data.get("resources", {}).get("core", {})
                return {
                    "limit": core.get("limit", 0),
                    "remaining": core.get("remaining", 0),
                    "reset_at": core.get("reset", 0),
                }
            return {"limit": 0, "remaining": 0, "reset_at": 0}
