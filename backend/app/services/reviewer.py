"""GPT-4o-mini powered review engine with chunking and structured output."""

import json
import logging
import time
import uuid
from datetime import datetime
from typing import AsyncGenerator

import tiktoken
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.models.schemas import (
    Category,
    ReviewItem,
    ReviewResult,
    Severity,
    SeverityCounts,
)
from app.services.github import PRFile, PRMetadata

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """You are CodeLens, an expert code reviewer. Analyze the provided code diff and return a JSON array of findings.

Each finding MUST follow this exact JSON schema:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "category": "security" | "performance" | "bug" | "style" | "refactoring" | "best_practice" | "documentation" | "error_handling" | "testing",
  "file_path": "path/to/file.ext",
  "line_range": "12-18",
  "title": "Short descriptive title of the issue",
  "suggestion": "Specific, actionable suggestion to fix the issue",
  "explanation": "Detailed explanation of WHY this matters and the impact",
  "code_before": "problematic code snippet (optional)",
  "code_after": "suggested improved code (optional)"
}

Rules:
1. Return ONLY a valid JSON array. No markdown, no explanation outside JSON.
2. Focus on: security vulnerabilities, performance bottlenecks, bugs, error handling gaps, style issues.
3. Be specific - reference actual variable names, function names, line numbers from the diff.
4. Prioritize security and bug findings over style issues.
5. For each finding, provide a concrete code suggestion when possible.
6. If the code looks good, return a single "info" finding praising the quality.
7. Limit to 15 most important findings per chunk.
"""

SUMMARY_PROMPT = """You are CodeLens. Given these individual code review findings from a PR, create a unified summary.

Return a JSON object with:
{
  "summary": "2-3 sentence high-level summary of the PR quality and main concerns",
  "overall_quality": "excellent" | "good" | "needs_improvement" | "poor",
  "top_priority_fixes": ["fix 1", "fix 2", "fix 3"]
}

Only return valid JSON. No markdown.
"""

SNIPPET_SYSTEM_PROMPT = """You are CodeLens, an expert code reviewer. Analyze the provided code snippet and return a JSON array of findings.

The code is written in: {language}
{context}

Each finding MUST follow this exact JSON schema:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "category": "security" | "performance" | "bug" | "style" | "refactoring" | "best_practice" | "documentation" | "error_handling" | "testing",
  "line_range": "12-18",
  "title": "Short descriptive title",
  "suggestion": "Specific actionable suggestion",
  "explanation": "Why this matters",
  "code_before": "problematic code",
  "code_after": "improved code"
}

Return ONLY a valid JSON array.
"""


class ReviewEngine:
    """Orchestrates code reviews using GPT-4o-mini with chunking."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.encoder = tiktoken.encoding_for_model("gpt-4o-mini")
        self.max_chunk_tokens = 7000  # Leave room for system prompt + response

    def _count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def _chunk_pr_files(self, files: list[PRFile]) -> list[str]:
        """Split PR files into chunks that fit within context window."""
        chunks: list[str] = []
        current_chunk = ""
        current_tokens = 0

        for f in files:
            if not f.patch:
                continue

            file_text = f"--- File: {f.filename} ({f.status}) ---\n{f.patch}\n\n"
            file_tokens = self._count_tokens(file_text)

            # If single file exceeds limit, truncate it
            if file_tokens > self.max_chunk_tokens:
                if current_chunk:
                    chunks.append(current_chunk)
                    current_chunk = ""
                    current_tokens = 0
                # Truncate large file diff
                truncated = f.patch[: self.max_chunk_tokens * 3]  # ~3 chars/token
                chunks.append(
                    f"--- File: {f.filename} ({f.status}) [TRUNCATED] ---\n{truncated}\n"
                )
                continue

            if current_tokens + file_tokens > self.max_chunk_tokens:
                chunks.append(current_chunk)
                current_chunk = file_text
                current_tokens = file_tokens
            else:
                current_chunk += file_text
                current_tokens += file_tokens

        if current_chunk:
            chunks.append(current_chunk)

        return chunks if chunks else ["No reviewable changes found in this PR."]

    async def _call_gpt(self, system: str, user_content: str) -> str:
        """Make a single GPT-4 API call."""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_content},
                ],
                temperature=settings.openai_temperature,
                max_tokens=settings.openai_max_tokens,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or "[]"
        except Exception as e:
            logger.error(f"GPT API call failed: {e}")
            raise

    def _parse_findings(self, raw: str) -> list[ReviewItem]:
        """Parse GPT response into structured ReviewItems with fallback."""
        try:
            data = json.loads(raw)
            # Handle both direct arrays and {"findings": [...]} format
            if isinstance(data, dict):
                data = data.get("findings", data.get("items", data.get("results", [])))
            if not isinstance(data, list):
                data = [data]

            items = []
            for item in data:
                try:
                    items.append(ReviewItem(
                        severity=Severity(item.get("severity", "info")),
                        category=Category(item.get("category", "best_practice")),
                        file_path=item.get("file_path"),
                        line_range=item.get("line_range"),
                        title=item.get("title", "Untitled finding"),
                        suggestion=item.get("suggestion", "No suggestion provided"),
                        explanation=item.get("explanation", "No explanation provided"),
                        code_before=item.get("code_before"),
                        code_after=item.get("code_after"),
                    ))
                except (ValueError, KeyError) as e:
                    logger.warning(f"Skipping malformed finding: {e}")
                    continue
            return items
        except json.JSONDecodeError:
            logger.error(f"Failed to parse GPT response as JSON: {raw[:200]}...")
            return [ReviewItem(
                severity=Severity.INFO,
                category=Category.BEST_PRACTICE,
                title="Review parsing error",
                suggestion="The review response could not be parsed. Please try again.",
                explanation=raw[:500] if raw else "Empty response from GPT.",
            )]

    async def review_pr(self, pr: PRMetadata) -> ReviewResult:
        """Review a full PR by chunking diffs and aggregating results."""
        start_time = time.time()
        review_id = f"rev_{uuid.uuid4().hex[:12]}"

        # Chunk the PR files
        chunks = self._chunk_pr_files(pr.files)
        all_items: list[ReviewItem] = []

        # Review each chunk
        for i, chunk in enumerate(chunks):
            logger.info(f"Reviewing chunk {i+1}/{len(chunks)} for {pr.owner}/{pr.repo}#{pr.pr_number}")
            user_msg = (
                f"PR: {pr.owner}/{pr.repo}#{pr.pr_number} - {pr.title}\n"
                f"Branch: {pr.head_branch} → {pr.base_branch}\n"
                f"Chunk {i+1}/{len(chunks)}:\n\n{chunk}"
            )
            raw_response = await self._call_gpt(SYSTEM_PROMPT, user_msg)
            items = self._parse_findings(raw_response)
            all_items.extend(items)

        # Generate summary
        summary_data = await self._generate_summary(all_items, pr)

        # Count severities
        severity_counts = SeverityCounts()
        for item in all_items:
            match item.severity:
                case Severity.CRITICAL:
                    severity_counts.critical += 1
                case Severity.HIGH:
                    severity_counts.high += 1
                case Severity.MEDIUM:
                    severity_counts.medium += 1
                case Severity.LOW:
                    severity_counts.low += 1
                case Severity.INFO:
                    severity_counts.info += 1

        elapsed_ms = int((time.time() - start_time) * 1000)

        return ReviewResult(
            review_id=review_id,
            status="completed",
            summary=summary_data.get("summary", "Review completed."),
            overall_quality=summary_data.get("overall_quality", "good"),
            severity_counts=severity_counts,
            top_priority_fixes=summary_data.get("top_priority_fixes", []),
            items=all_items,
            files_reviewed=len(pr.files),
            cached=False,
            review_time_ms=elapsed_ms,
            created_at=datetime.utcnow(),
        )

    async def review_snippet(
        self, code: str, language: str = "auto", context: str | None = None
    ) -> ReviewResult:
        """Review a code snippet."""
        start_time = time.time()
        review_id = f"rev_{uuid.uuid4().hex[:12]}"

        ctx_line = f"\nContext: {context}" if context else ""
        system = SNIPPET_SYSTEM_PROMPT.format(language=language, context=ctx_line)

        raw_response = await self._call_gpt(system, code)
        items = self._parse_findings(raw_response)

        # Count severities
        severity_counts = SeverityCounts()
        for item in items:
            match item.severity:
                case Severity.CRITICAL:
                    severity_counts.critical += 1
                case Severity.HIGH:
                    severity_counts.high += 1
                case Severity.MEDIUM:
                    severity_counts.medium += 1
                case Severity.LOW:
                    severity_counts.low += 1
                case Severity.INFO:
                    severity_counts.info += 1

        # Determine quality
        if severity_counts.critical > 0:
            quality = "poor"
        elif severity_counts.high > 1:
            quality = "needs_improvement"
        elif severity_counts.high == 1 or severity_counts.medium > 2:
            quality = "good"
        else:
            quality = "excellent"

        top_fixes = [
            item.title
            for item in sorted(
                items,
                key=lambda x: ["critical", "high", "medium", "low", "info"].index(x.severity.value),
            )[:3]
        ]

        elapsed_ms = int((time.time() - start_time) * 1000)

        return ReviewResult(
            review_id=review_id,
            status="completed",
            summary=f"Reviewed {language} snippet: found {len(items)} issues.",
            overall_quality=quality,
            severity_counts=severity_counts,
            top_priority_fixes=top_fixes,
            items=items,
            files_reviewed=1,
            cached=False,
            review_time_ms=elapsed_ms,
            created_at=datetime.utcnow(),
        )

    async def review_pr_stream(self, pr: PRMetadata) -> AsyncGenerator[str, None]:
        """Stream PR review results via SSE."""
        start_time = time.time()
        review_id = f"rev_{uuid.uuid4().hex[:12]}"

        yield json.dumps({"event": "start", "review_id": review_id, "files": len(pr.files)})

        chunks = self._chunk_pr_files(pr.files)
        all_items: list[ReviewItem] = []

        for i, chunk in enumerate(chunks):
            yield json.dumps({"event": "chunk_start", "chunk": i + 1, "total": len(chunks)})

            user_msg = (
                f"PR: {pr.owner}/{pr.repo}#{pr.pr_number} - {pr.title}\n"
                f"Branch: {pr.head_branch} → {pr.base_branch}\n"
                f"Chunk {i+1}/{len(chunks)}:\n\n{chunk}"
            )

            # Stream from GPT
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                temperature=settings.openai_temperature,
                max_tokens=settings.openai_max_tokens,
                stream=True,
            )

            accumulated = ""
            async for chunk_resp in stream:
                delta = chunk_resp.choices[0].delta.content or ""
                accumulated += delta
                if delta:
                    yield json.dumps({"event": "token", "data": delta})

            items = self._parse_findings(accumulated)
            all_items.extend(items)

            # Emit parsed items
            for item in items:
                yield json.dumps({
                    "event": "finding",
                    "data": item.model_dump(),
                })

        # Final summary
        summary_data = await self._generate_summary(all_items, pr)
        elapsed_ms = int((time.time() - start_time) * 1000)

        yield json.dumps({
            "event": "complete",
            "summary": summary_data.get("summary", ""),
            "overall_quality": summary_data.get("overall_quality", "good"),
            "top_priority_fixes": summary_data.get("top_priority_fixes", []),
            "total_findings": len(all_items),
            "review_time_ms": elapsed_ms,
        })

    async def _generate_summary(
        self, items: list[ReviewItem], pr: PRMetadata
    ) -> dict:
        """Generate a unified summary from all findings."""
        if not items:
            return {
                "summary": "No issues found. The code looks clean!",
                "overall_quality": "excellent",
                "top_priority_fixes": [],
            }

        findings_text = "\n".join(
            f"- [{item.severity.value.upper()}][{item.category.value}] {item.title}: {item.suggestion}"
            for item in items[:20]
        )

        user_msg = (
            f"PR: {pr.owner}/{pr.repo}#{pr.pr_number} - {pr.title}\n"
            f"Total findings: {len(items)}\n\n{findings_text}"
        )

        try:
            raw = await self._call_gpt(SUMMARY_PROMPT, user_msg)
            data = json.loads(raw)
            return {
                "summary": data.get("summary", "Review completed."),
                "overall_quality": data.get("overall_quality", "good"),
                "top_priority_fixes": data.get("top_priority_fixes", [])[:5],
            }
        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            return {
                "summary": f"Found {len(items)} issues across the PR.",
                "overall_quality": "needs_improvement" if len(items) > 5 else "good",
                "top_priority_fixes": [item.title for item in items[:3]],
            }
