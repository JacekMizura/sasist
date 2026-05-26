"""Structured traceback logging for /purchasing/* routes (debug production 500s)."""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Any, Iterator, Mapping

_log = logging.getLogger("purchasing.api")


@contextmanager
def purchasing_api_span(endpoint: str, **ctx: Any) -> Iterator[None]:
    """Log full exception + optional context on failure; re-raise."""
    try:
        yield
    except Exception:
        parts = " ".join(f"{k}={v!r}" for k, v in sorted(ctx.items()) if v is not None)
        _log.exception("%s failed %s", endpoint, parts)
        raise


def purchasing_log_ctx(**kwargs: Any) -> Mapping[str, Any]:
    """Small helper for consistent kwargs (optional)."""
    return kwargs
