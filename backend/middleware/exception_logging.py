"""Minimal outer request logger (health paths bypass logging overhead)."""

from __future__ import annotations

import logging
import sys
import traceback
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.responses import Response

_LOG = logging.getLogger("wms.exceptions")


def log_unhandled_exception(context: str, exc: BaseException) -> str:
    tb = traceback.format_exc() or "".join(
        traceback.format_exception(type(exc), exc, exc.__traceback__)
    )
    message = f"[EXCEPTION] {context}: {type(exc).__name__}: {exc}\n{tb}"
    _LOG.error(message)
    print(message, file=sys.stderr, flush=True)
    return tb

# Never wrap or log these — Railway health checks must stay minimal.
_PASS_THROUGH_PATHS = frozenset({"/", "/healthz"})

CallNext = Callable[[Request], Awaitable[Response]]


async def outer_request_logger_middleware(request: Request, call_next: CallNext) -> Response:
    path = request.url.path
    if path == "/healthz":
        print("[healthz] request enter", flush=True)
        response = await call_next(request)
        print(f"[healthz] request exit status={response.status_code}", flush=True)
        return response
    if path in _PASS_THROUGH_PATHS:
        return await call_next(request)

    print(f"[req] {request.method} {path}", flush=True)
    try:
        response = await call_next(request)
    except Exception as exc:
        try:
            from ..observability.platform_debug import log_db_session, log_request_features

            log_request_features(path=path)
            log_db_session(phase="middleware_unhandled", path=path, error=f"{type(exc).__name__}: {exc}")
        except Exception:
            pass
        raise
    if response.status_code >= 500:
        try:
            from ..observability.platform_debug import log_request_features

            log_request_features(path=path)
        except Exception:
            pass
    print(f"[req] done {response.status_code} {request.url.path}", flush=True)
    return response
