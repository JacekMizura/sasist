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


def _missing_fields(errors: list[dict[str, Any]], loc_prefix: str) -> list[str]:
    out: list[str] = []
    for err in errors:
        if err.get("type") != "missing":
            continue
        loc = err.get("loc") or []
        if len(loc) >= 2 and str(loc[0]) == loc_prefix:
            out.append(str(loc[-1]))
    return out


def log_direct_sales_validation(request: Request, exc: RequestValidationError) -> None:
    path = str(request.url.path)
    if "/direct-sales/" not in path:
        return

    errors = exc.errors()
    body = getattr(exc, "body", None)
    endpoint = _endpoint_suffix(path) or path.rsplit("/", 1)[-1]
    schema = _ENDPOINT_SCHEMAS.get(endpoint or "", "n/a")

    logger.info(
        "[direct-sales.validation] endpoint=%s schema=%s method=%s path=%s query=%s body=%s errors=%s "
        "missing_body=%s missing_query=%s",
        endpoint,
        schema,
        request.method,
        path,
        dict(request.query_params),
        body,
        errors,
        _missing_fields(errors, "body"),
        _missing_fields(errors, "query"),
    )

    logger.info(
        "[direct-sales.raw-request] phase=validation_422 method=%s path=%s query=%s headers_content_type=%s "
        "raw_body_repr=%r parsed_json=%s validation_errors=%s",
        request.method,
        path,
        dict(request.query_params),
        request.headers.get("content-type"),
        body,
        body,
        errors,
    )
