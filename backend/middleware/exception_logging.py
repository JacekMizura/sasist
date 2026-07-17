"""Global unhandled-exception logging for HTTP 500 diagnostics."""

from __future__ import annotations

import logging
import sys
import traceback
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.responses import Response

_LOG = logging.getLogger("wms.exceptions")

# Never wrap or log these — Railway health checks must stay minimal.
_PASS_THROUGH_PATHS = frozenset({"/", "/healthz", "/health/schema", "/readyz"})

CallNext = Callable[[Request], Awaitable[Response]]

REQUEST_ID_HEADER = "X-Request-Id"
REQUEST_ID_STATE_ATTR = "request_id"


def _safe_exc_summary(exc: BaseException) -> str:
    try:
        from ..services.direct_sale.complete_debug_log import safe_exception_str

        return safe_exception_str(exc)
    except Exception:
        return type(exc).__name__


def format_exception_traceback(exc: BaseException) -> str:
    """
    Build a real stack from the exception object.

    Do **not** use ``traceback.format_exc()`` inside FastAPI exception handlers:
    ``sys.exc_info()`` is often already cleared there, so ``format_exc()`` returns
    the misleading ``NoneType: None`` and hides the real frames.
    """
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


def exception_origin(exc: BaseException) -> tuple[str | None, str | None, int | None]:
    """Return (filename, function_name, lineno) of the innermost traceback frame."""
    tb = exc.__traceback__
    if tb is None:
        return None, None, None
    while tb.tb_next is not None:
        tb = tb.tb_next
    frame = tb.tb_frame
    return frame.f_code.co_filename, frame.f_code.co_name, tb.tb_lineno


def get_or_create_request_id(request: Request) -> str:
    existing = getattr(request.state, REQUEST_ID_STATE_ATTR, None)
    if isinstance(existing, str) and existing.strip():
        return existing.strip()
    header = (request.headers.get(REQUEST_ID_HEADER) or request.headers.get("x-request-id") or "").strip()
    rid = header or uuid.uuid4().hex
    setattr(request.state, REQUEST_ID_STATE_ATTR, rid)
    return rid


def log_unhandled_exception(
    context: str,
    exc: BaseException,
    *,
    request_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
) -> str:
    tb = format_exception_traceback(exc)
    summary = _safe_exc_summary(exc)
    file_name, func_name, line_no = exception_origin(exc)
    meta_parts = [
        f"request_id={request_id or '-'}",
        f"method={method or '-'}",
        f"path={path or '-'}",
        f"file={file_name or '-'}",
        f"func={func_name or '-'}",
        f"line={line_no if line_no is not None else '-'}",
    ]
    message = (
        f"[EXCEPTION] {context}: {type(exc).__name__}: {summary}\n"
        f"  {' '.join(meta_parts)}\n"
        f"{tb}"
    )
    _LOG.error(message)
    print(message, file=sys.stderr, flush=True)
    return tb


def log_request_server_error(
    request: Request,
    exc: BaseException,
    *,
    context: str = "unhandled",
) -> str:
    rid = get_or_create_request_id(request)
    return log_unhandled_exception(
        context,
        exc,
        request_id=rid,
        method=request.method,
        path=request.url.path,
    )


async def outer_request_logger_middleware(request: Request, call_next: CallNext) -> Response:
    path = request.url.path
    request_id = get_or_create_request_id(request)

    if path == "/healthz":
        print("[healthz] request enter", flush=True)
        response = await call_next(request)
        print(f"[healthz] request exit status={response.status_code}", flush=True)
        response.headers.setdefault(REQUEST_ID_HEADER, request_id)
        return response
    if path in _PASS_THROUGH_PATHS:
        response = await call_next(request)
        response.headers.setdefault(REQUEST_ID_HEADER, request_id)
        return response

    print(f"[req] {request.method} {path} request_id={request_id}", flush=True)
    try:
        response = await call_next(request)
    except Exception as exc:
        try:
            from ..observability.platform_debug import log_db_session, log_request_features

            log_request_features(path=path)
            log_db_session(
                phase="middleware_unhandled",
                path=path,
                error=f"{type(exc).__name__}: {_safe_exc_summary(exc)}",
            )
        except Exception:
            pass
        raise
    if response.status_code >= 500:
        try:
            from ..observability.platform_debug import log_request_features

            log_request_features(path=path)
        except Exception:
            pass
        print(
            f"[req] HTTP {response.status_code} {request.method} {path} request_id={request_id}",
            flush=True,
        )
    print(f"[req] done {response.status_code} {request.url.path} request_id={request_id}", flush=True)
    response.headers.setdefault(REQUEST_ID_HEADER, request_id)
    return response
