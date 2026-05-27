"""Request/startup exception logging for production (Railway) diagnostics."""

from __future__ import annotations

import logging
import sys
import traceback
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

_LOG = logging.getLogger("wms.exceptions")

CallNext = Callable[[Request], Awaitable[Response]]


def log_unhandled_exception(context: str, exc: BaseException) -> str:
    """Log full traceback to logger + stdout (Railway). Returns formatted traceback."""
    tb = traceback.format_exc()
    if not tb.strip():
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    message = f"[EXCEPTION] {context}: {type(exc).__name__}: {exc}\n{tb}"
    _LOG.error(message)
    print(message, file=sys.stderr, flush=True)
    print(traceback.format_exc(), file=sys.stderr, flush=True)
    return tb


async def _call_next_traced(
    *,
    layer: str,
    request: Request,
    call_next: CallNext,
) -> Response:
    path = request.url.path
    try:
        response = await call_next(request)
    except Exception as exc:
        print(
            f"[middleware:{layer}] call_next FAILED {request.method} {path}",
            file=sys.stderr,
            flush=True,
        )
        log_unhandled_exception(f"{request.method} {path} ({layer})", exc)
        raise
    return response


async def early_debug_middleware(request: Request, call_next: CallNext) -> Response:
    """Outermost layer — log before/after entire middleware + route stack."""
    print(f"[early] {request.method} {request.url.path}", flush=True)
    try:
        response = await _call_next_traced(
            layer="early_debug",
            request=request,
            call_next=call_next,
        )
    except Exception:
        print(f"[early] FAILED {request.method} {request.url.path}", flush=True)
        raise
    print(f"[early] done {response.status_code} {request.url.path}", flush=True)
    return response


async def catch_unhandled_exceptions_middleware(
    request: Request,
    call_next: CallNext,
) -> Response:
    """Safety net — return 500 JSON if anything escapes inner handlers."""
    print(f"[middleware:catch_unhandled] enter {request.method} {request.url.path}", flush=True)
    try:
        response = await _call_next_traced(
            layer="catch_unhandled",
            request=request,
            call_next=call_next,
        )
    except Exception as exc:
        tb = log_unhandled_exception(
            f"{request.method} {request.url.path} (catch_unhandled)",
            exc,
        )
        response = JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "path": request.url.path,
                "error": str(exc),
                "traceback": tb,
            },
        )
        if request.headers.get("origin"):
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
        print(
            f"[middleware:catch_unhandled] recovered 500 {request.url.path}",
            flush=True,
        )
        return response
    print(
        f"[middleware:catch_unhandled] exit {response.status_code} {request.url.path}",
        flush=True,
    )
    return response
