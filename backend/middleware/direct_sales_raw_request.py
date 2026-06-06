"""Temporary raw request logging for direct-sales contract debugging."""

from __future__ import annotations

import json
import logging
from typing import Callable

from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

_WATCH = ("add-product", "set-customer", "debug/echo")


def _should_log(path: str, method: str) -> bool:
    if method != "POST" or "/direct-sales/" not in path:
        return False
    norm = path.rstrip("/")
    return any(norm.endswith(suffix) for suffix in _WATCH)


def _safe_headers(request: Request) -> dict[str, str]:
    keep = ("content-type", "content-length", "accept", "authorization")
    out: dict[str, str] = {}
    for key, value in request.headers.items():
        lk = key.lower()
        if lk in keep:
            out[key] = "***" if lk == "authorization" and value else value
    return out


async def direct_sales_raw_request_middleware(
    request: Request,
    call_next: Callable[[Request], Response],
) -> Response:
    path = request.url.path
    if not _should_log(path, request.method):
        return await call_next(request)

    raw_body = await request.body()
    parsed_json: object | None = None
    if raw_body:
        try:
            parsed_json = json.loads(raw_body)
        except json.JSONDecodeError:
            parsed_json = None

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": raw_body, "more_body": False}

    replay = Request(request.scope, receive)
    logger.info(
        "[direct-sales.raw-request] phase=incoming method=%s path=%s query=%s headers=%s raw_body=%r parsed_json=%s",
        request.method,
        path,
        dict(request.query_params),
        _safe_headers(request),
        raw_body.decode("utf-8", errors="replace") if raw_body else "",
        parsed_json,
    )

    response = await call_next(replay)
    logger.info(
        "[direct-sales.raw-request] phase=response method=%s path=%s status=%s query=%s",
        request.method,
        path,
        response.status_code,
        dict(request.query_params),
    )
    return response
