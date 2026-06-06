"""Structured validation logging for direct-sales add-product."""

from __future__ import annotations

import logging
from typing import Any

from fastapi.exceptions import RequestValidationError
from starlette.requests import Request

logger = logging.getLogger(__name__)


def _missing_fields(errors: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for err in errors:
        if err.get("type") != "missing":
            continue
        loc = err.get("loc") or []
        if loc:
            out.append(str(loc[-1]))
    return out


def log_add_product_validation(request: Request, exc: RequestValidationError) -> None:
    path = str(request.url.path)
    if "add-product" not in path:
        return
    errors = exc.errors()
    body = getattr(exc, "body", None)
    logger.info(
        "[direct-sales.add-product.validation] method=%s path=%s body=%s errors=%s missing=%s",
        request.method,
        path,
        body,
        errors,
        _missing_fields(errors),
    )
