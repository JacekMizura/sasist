"""Structured validation logging for direct-sales API contract drift."""

from __future__ import annotations

import logging
from typing import Any

from fastapi.exceptions import RequestValidationError
from starlette.requests import Request

from ...api.contracts.direct_sales import AddDirectSalesProductRequest, SetDirectSalesCustomerRequest

logger = logging.getLogger(__name__)

_ENDPOINT_SCHEMAS: dict[str, str] = {
    "add-product": AddDirectSalesProductRequest.__name__,
    "set-customer": SetDirectSalesCustomerRequest.__name__,
}


def _endpoint_suffix(path: str) -> str | None:
    for suffix in _ENDPOINT_SCHEMAS:
        if path.rstrip("/").endswith(suffix):
            return suffix
    return None


def _missing_fields(errors: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for err in errors:
        if err.get("type") != "missing":
            continue
        loc = err.get("loc") or []
        if loc:
            out.append(str(loc[-1]))
    return out


def log_direct_sales_validation(request: Request, exc: RequestValidationError) -> None:
    path = str(request.url.path)
    if "/direct-sales/" not in path:
        return

    endpoint = _endpoint_suffix(path)
    if endpoint is None:
        return

    errors = exc.errors()
    body = getattr(exc, "body", None)
    logger.info(
        "[direct-sales.validation] endpoint=%s schema=%s method=%s path=%s body=%s errors=%s missing=%s",
        endpoint,
        _ENDPOINT_SCHEMAS.get(endpoint, "unknown"),
        request.method,
        path,
        body,
        errors,
        _missing_fields(errors),
    )
