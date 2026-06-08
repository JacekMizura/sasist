"""Block API traffic until Tier 0 schema is validated."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.responses import JSONResponse, Response

from ..platform_state import is_platform_ready

CallNext = Callable[[Request], Awaitable[Response]]

_READY_PATHS = frozenset({"/", "/healthz", "/health/schema", "/readyz", "/docs", "/openapi.json", "/redoc"})


async def platform_readiness_gate_middleware(request: Request, call_next: CallNext) -> Response:
    path = request.url.path.rstrip("/") or "/"
    if path in _READY_PATHS or not path.startswith("/api"):
        return await call_next(request)
    if is_platform_ready():
        return await call_next(request)
    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "message": "Platform starting — Tier 0 schema validation in progress.",
                "code": "PLATFORM_NOT_READY",
            }
        },
    )
