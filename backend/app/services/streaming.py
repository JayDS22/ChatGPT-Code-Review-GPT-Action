"""Server-Sent Events (SSE) streaming utilities."""

import json
from typing import AsyncGenerator

from sse_starlette.sse import EventSourceResponse
from starlette.requests import Request


def create_sse_response(
    generator: AsyncGenerator[str, None],
    request: Request | None = None,
) -> EventSourceResponse:
    """Wrap an async generator as an SSE EventSourceResponse."""

    async def event_stream():
        try:
            async for data in generator:
                yield {"event": "message", "data": data}
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }
        finally:
            yield {"event": "done", "data": ""}

    return EventSourceResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
