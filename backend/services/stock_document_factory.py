"""Validated StockDocument construction — guards against invalid ORM kwargs."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..models.stock_document import StockDocument
from ..services.wms_warehouse_ownership_service import validate_new_stock_document_warehouse_id

logger = logging.getLogger(__name__)

_STOCK_DOCUMENT_COLUMNS: frozenset[str] | None = None


def stock_document_column_names() -> frozenset[str]:
    global _STOCK_DOCUMENT_COLUMNS
    if _STOCK_DOCUMENT_COLUMNS is None:
        _STOCK_DOCUMENT_COLUMNS = frozenset(StockDocument.__table__.columns.keys())
    return _STOCK_DOCUMENT_COLUMNS


def filter_stock_document_kwargs(**kwargs: Any) -> tuple[dict[str, Any], list[str]]:
    allowed = stock_document_column_names()
    valid: dict[str, Any] = {}
    invalid: list[str] = []
    for key, value in kwargs.items():
        if key in allowed:
            valid[key] = value
        else:
            invalid.append(key)
    return valid, invalid


def create_stock_document(
    db: Session,
    *,
    context: str = "stock_document",
    flush: bool = True,
    **kwargs: Any,
) -> StockDocument:
    """
    Create ``StockDocument`` using only mapped column names.

    Raises ``TypeError`` when callers pass stale/unknown fields (e.g. ``notes``).
    """
    valid, invalid = filter_stock_document_kwargs(**kwargs)
    if invalid:
        logger.error(
            "STOCK_DOCUMENT_INVALID_KWARGS context=%s invalid=%s passed=%s allowed=%s",
            context,
            invalid,
            sorted(kwargs.keys()),
            sorted(stock_document_column_names()),
        )
        raise TypeError(
            f"Invalid StockDocument keyword argument(s) for {context}: {', '.join(invalid)}"
        )
    wh = valid.get("warehouse_id")
    if wh is not None:
        validate_new_stock_document_warehouse_id(int(wh), context=context)
    elif context not in ("stock_document_legacy_optional_wh",):
        validate_new_stock_document_warehouse_id(None, context=context)
    doc = StockDocument(**valid)
    db.add(doc)
    if flush:
        db.flush()
    return doc
