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
    """
    Return (filename, function_name, lineno) for diagnostics.

    Prefer the innermost frame that lives under the application tree (``backend/``),
    so Pydantic/SQLAlchemy frames inside site-packages do not hide the call site
    (e.g. ``build_wms_picking_product_detail`` line that constructed an invalid model).
    Fall back to the absolute innermost frame when no app frame exists.
    """
    tb = exc.__traceback__
    if tb is None:
        return None, None, None
    frames: list[tuple[str, str, int]] = []
    while tb is not None:
        frame = tb.tb_frame
        frames.append((frame.f_code.co_filename, frame.f_code.co_name, tb.tb_lineno))
        tb = tb.tb_next
    if not frames:
        return None, None, None

    def _is_app_frame(path: str) -> bool:
        norm = path.replace("\\", "/").lower()
        if "/site-packages/" in norm or "/dist-packages/" in norm:
            return False
        return "/backend/" in norm or norm.rstrip("/").endswith("/backend")

    for file_name, func_name, line_no in reversed(frames):
        if _is_app_frame(file_name):
            return file_name, func_name, line_no
    file_name, func_name, line_no = frames[-1]
    return file_name, func_name, line_no


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


# Framework noise that often appears as ``__context__`` when BaseHTTPMiddleware
# re-raises app exceptions — never treat these as the diagnostic root cause.
_FRAMEWORK_NOISE_TYPES = frozenset(
    {
        "WouldBlock",
        "CancelledError",
        "BrokenResourceError",
        "EndOfStream",
        "ClosedResourceError",
    }
)


def _root_cause(exc: BaseException) -> BaseException:
    """
    Prefer explicit ``__cause__`` (``raise ... from e``).

    Do **not** blindly walk all ``__context__`` — Starlette BaseHTTPMiddleware
    often attaches anyio ``WouldBlock`` there and that must not replace the real
    application exception in logs.

    Special case: ``raise HTTPException(...) from None`` clears ``__cause__`` but
    leaves the original in ``__context__``; for HTTPException we still surface
    that context so WMS opaque 500s stay diagnosable under ``request_id``.
    """
    cur: BaseException = exc
    seen: set[int] = set()
    while id(cur) not in seen:
        seen.add(id(cur))
        nxt: BaseException | None = cur.__cause__
        if nxt is None and type(cur).__name__ == "HTTPException" and cur.__context__ is not None:
            nxt = cur.__context__
        if nxt is None or nxt is cur:
            break
        if type(nxt).__name__ in _FRAMEWORK_NOISE_TYPES:
            break
        cur = nxt
    return cur


def http_500_diagnostic_fields(exc: BaseException) -> dict[str, object]:
    """Structured fields for logs / optional debug JSON body."""
    origin_exc = _root_cause(exc)
    file_name, func_name, line_no = exception_origin(origin_exc)
    # Prefer origin for type/message when HTTPException(500) wrapped a real cause.
    report = origin_exc if origin_exc is not exc else exc
    fields: dict[str, object] = {
        "exception_type": type(report).__name__,
        "exception_message": _safe_exc_summary(report),
        "file": file_name or "-",
        "function": func_name or "-",
        "line": line_no if line_no is not None else "-",
    }
    if origin_exc is not exc:
        fields["wrapper_type"] = type(exc).__name__
        fields["wrapper_message"] = _safe_exc_summary(exc)
    # FastAPI response_model failures carry structured errors.
    errs = getattr(exc, "errors", None)
    if callable(errs):
        try:
            fields["validation_errors"] = errs()
        except Exception:
            pass
    return fields


def log_http_500_error(
    request: Request,
    exc: BaseException | None,
    *,
    duration_ms: float = 0.0,
    context: str = "http_500",
) -> None:
    """
    Canonical ERROR log for every HTTP 500 — call from the exception handler.

    Must not rely on middleware reading ``request.state``: Starlette
    ``@app.middleware("http")`` (BaseHTTPMiddleware) isolates state, so
    ``attach_http_500_exception`` is invisible to the outer middleware.
    """
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

    diag = http_500_diagnostic_fields(exc)
    # Log stack of the root cause when wrapped; otherwise the raised exc.
    stack_exc = _root_cause(exc)
    tb = format_exception_traceback(stack_exc)
    # Also append wrapper traceback when different (shows raise HTTPException site).
    if stack_exc is not exc and exc.__traceback__ is not None:
        tb = (
            tb
            + "\n--- wrapper ---\n"
            + format_exception_traceback(exc)
        )
    message = (
        f"ERROR [HTTP 500] {context}\n"
        f"  request_id={rid}\n"
        f"  method={request.method}\n"
        f"  path={request.url.path}\n"
        f"  user={scope['user']}\n"
        f"  tenant={scope['tenant']}\n"
        f"  warehouse={scope['warehouse']}\n"
        f"  exception_type={diag['exception_type']}\n"
        f"  exception_message={diag['exception_message']}\n"
        f"  file={diag['file']}\n"
        f"  function={diag['function']}\n"
        f"  line={diag['line']}\n"
        f"  duration_ms={duration_ms:.2f}\n"
        f"{tb}"
    )
    # exc_info=stack_exc: real stack even when sys.exc_info() is cleared in handlers.
    _LOG.error(message, exc_info=stack_exc)
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
    _LOG.error(message, exc_info=exc)
    print(message, file=sys.stderr, flush=True)
    return tb


def log_request_server_error(
    request: Request,
    exc: BaseException,
    *,
    context: str = "unhandled",
    duration_ms: float | None = None,
) -> str:
    """Log HTTP 500 immediately (exception-handler safe)."""
    attach_http_500_exception(request, exc)
    log_http_500_error(
        request,
        exc,
        duration_ms=0.0 if duration_ms is None else duration_ms,
        context=context,
    )
    return format_exception_traceback(exc)


def raise_logged_http_500(
    request: Request | None,
    exc: BaseException,
    *,
    detail: object = "Internal server error",
    context: str = "wms_http_500",
) -> None:
    """
    Log the real exception, then raise HTTPException(500) **keeping** ``__cause__``.

    Prefer this over ``raise HTTPException(...) from None`` which hides the stack
    from the global HTTP 500 logger.
    """
    from fastapi import HTTPException

    if request is not None:
        log_request_server_error(request, exc, context=context)
    else:
        tb = format_exception_traceback(exc)
        file_name, func_name, line_no = exception_origin(exc)
        message = (
            f"ERROR [HTTP 500] {context}\n"
            f"  exception_type={type(exc).__name__}\n"
            f"  exception_message={_safe_exc_summary(exc)}\n"
            f"  file={file_name or '-'}\n"
            f"  function={func_name or '-'}\n"
            f"  line={line_no if line_no is not None else '-'}\n"
            f"{tb}"
        )
        _LOG.error(message, exc_info=exc)
        print(message, file=sys.stderr, flush=True)
    raise HTTPException(status_code=500, detail=detail) from exc


async def outer_request_logger_middleware(request: Request, call_next: CallNext) -> Response:
    """
    Backup logger for exceptions that bubble past FastAPI handlers.

    Primary logging is in ``global_exception_handler`` — BaseHTTPMiddleware
    does not reliably share ``request.state`` with the inner app, so do not
    expect attached exceptions here.
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

    # Handled 500s are logged in the exception handler. Only log here when the
    # exception object is visible on this request (same Request instance).
    if response.status_code >= 500:
        exc = getattr(request.state, HTTP_500_EXC_ATTR, None)
        if isinstance(exc, BaseException) and not getattr(request.state, HTTP_500_LOGGED_ATTR, False):
            duration_ms = (time.perf_counter() - t0) * 1000.0
            log_http_500_error(
                request,
                exc,
                duration_ms=duration_ms,
                context="middleware_http_500",
            )
    response.headers.setdefault(REQUEST_ID_HEADER, request_id)
    return response
