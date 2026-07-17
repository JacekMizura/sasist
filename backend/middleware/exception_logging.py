"""Global request / HTTP 500 exception logging."""

from __future__ import annotations

import logging
import sys
import time
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
HTTP_500_EXC_ATTR = "http_500_exc"
HTTP_500_LOGGED_ATTR = "http_500_logged"


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


def attach_http_500_exception(request: Request, exc: BaseException) -> None:
    """Store exception for middleware logging after FastAPI converts it to HTTP 500."""
    setattr(request.state, HTTP_500_EXC_ATTR, exc)


def _scope_from_request(request: Request) -> dict[str, str]:
    qp = request.query_params
    tenant = (
        qp.get("tenant_id")
        or request.headers.get("X-Tenant-Id")
        or getattr(request.state, "tenant_id", None)
    )
    warehouse = (
        qp.get("warehouse_id")
        or request.headers.get("X-Warehouse-Id")
        or getattr(request.state, "warehouse_id", None)
    )
    user = (
        qp.get("user_id")
        or request.headers.get("X-User-Id")
        or getattr(request.state, "user_id", None)
        or getattr(request.state, "current_user_id", None)
    )
    return {
        "tenant": str(tenant) if tenant is not None else "-",
        "warehouse": str(warehouse) if warehouse is not None else "-",
        "user": str(user) if user is not None else "-",
    }


def log_http_500_error(
    request: Request,
    exc: BaseException | None,
    *,
    duration_ms: float,
    context: str = "http_500",
) -> None:
    """Canonical ERROR log for every HTTP 500 — once per request."""
    if getattr(request.state, HTTP_500_LOGGED_ATTR, False):
        return
    setattr(request.state, HTTP_500_LOGGED_ATTR, True)

    rid = get_or_create_request_id(request)
    scope = _scope_from_request(request)
    if exc is None:
        message = (
            f"ERROR [HTTP 500] {context}\n"
            f"  request_id={rid} method={request.method} path={request.url.path}\n"
            f"  user={scope['user']} tenant={scope['tenant']} warehouse={scope['warehouse']}\n"
            f"  duration_ms={duration_ms:.2f}\n"
            f"  exception=<not attached — status 500 without exception object>"
        )
        _LOG.error(message)
        print(message, file=sys.stderr, flush=True)
        return

    tb = format_exception_traceback(exc)
    file_name, func_name, line_no = exception_origin(exc)
    summary = _safe_exc_summary(exc)
    message = (
        f"ERROR [HTTP 500] {context}\n"
        f"  request_id={rid}\n"
        f"  method={request.method}\n"
        f"  path={request.url.path}\n"
        f"  user={scope['user']}\n"
        f"  tenant={scope['tenant']}\n"
        f"  warehouse={scope['warehouse']}\n"
        f"  exception_type={type(exc).__name__}\n"
        f"  exception={summary}\n"
        f"  file={file_name or '-'}\n"
        f"  func={func_name or '-'}\n"
        f"  line={line_no if line_no is not None else '-'}\n"
        f"  duration_ms={duration_ms:.2f}\n"
        f"{tb}"
    )
    _LOG.error(message)
    print(message, file=sys.stderr, flush=True)


def log_unhandled_exception(
    context: str,
    exc: BaseException,
    *,
    request_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
) -> str:
    """Legacy helper — prefer ``log_http_500_error`` for request-scoped 500s."""
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
    duration_ms: float | None = None,
) -> str:
    attach_http_500_exception(request, exc)
    if duration_ms is None:
        duration_ms = 0.0
    log_http_500_error(request, exc, duration_ms=duration_ms, context=context)
    return format_exception_traceback(exc)


async def outer_request_logger_middleware(request: Request, call_next: CallNext) -> Response:
    """
    Global middleware: quiet on success; full ERROR + traceback on every HTTP 500.

    FastAPI exception handlers convert exceptions to JSONResponse(500) without
    re-raising — handlers must ``attach_http_500_exception`` so this middleware
    can log the real stack after ``call_next`` returns.
    """
    path = request.url.path
    request_id = get_or_create_request_id(request)
    t0 = time.perf_counter()

    if path in _PASS_THROUGH_PATHS:
        response = await call_next(request)
        response.headers.setdefault(REQUEST_ID_HEADER, request_id)
        return response

    try:
        response = await call_next(request)
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000.0
        log_http_500_error(
            request,
            exc,
            duration_ms=duration_ms,
            context="middleware_unhandled",
        )
        raise

    duration_ms = (time.perf_counter() - t0) * 1000.0
    if response.status_code >= 500:
        exc = getattr(request.state, HTTP_500_EXC_ATTR, None)
        log_http_500_error(
            request,
            exc if isinstance(exc, BaseException) else None,
            duration_ms=duration_ms,
            context="middleware_http_500",
        )
    response.headers.setdefault(REQUEST_ID_HEADER, request_id)
    return response
