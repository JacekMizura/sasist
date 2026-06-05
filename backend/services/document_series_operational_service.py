"""Operational document catalog — series are the document engine (UI + WMS gates)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from .document_series_catalog import (
    REQUIRED_BOOTSTRAP_COUNT,
    list_path_for_series,
    operational_code_for_subtype,
    route_segment_for_series,
    stock_document_type_for_subtype,
)
from .document_series_seed_service import ensure_default_document_series, missing_operational_subtypes

logger = logging.getLogger(__name__)


def _series_label(row: DocumentSeries, spec_code: str) -> str:
    name = str(getattr(row, "name", None) or "").strip()
    if name:
        return name
    return spec_code


def build_operational_catalog(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    ensure_defaults: bool = True,
) -> dict[str, Any]:
    """
    Active default series for tenant/warehouse — drives UI tabs, filters, and WMS gates.
    """
    tid, wid = int(tenant_id), int(warehouse_id)
    if ensure_defaults:
        try:
            ensure_default_document_series(db, tid, wid)
        except Exception:
            logger.exception(
                "[document_series.catalog] ensure failed tenant_id=%s warehouse_id=%s",
                tid,
                wid,
            )

    rows = (
        db.query(DocumentSeries)
        .filter(
            DocumentSeries.tenant_id == tid,
            DocumentSeries.warehouse_id == wid,
            DocumentSeries.is_active.isnot(False),
        )
        .order_by(DocumentSeries.series_type.asc(), DocumentSeries.name.asc())
        .all()
    )

    defaults = [r for r in rows if bool(getattr(r, "is_default", False))]
    visible = defaults if defaults else rows

    catalog: list[dict[str, Any]] = []
    for row in visible:
        st = str(getattr(row, "series_type", None) or "WAREHOUSE").strip().upper()
        sub = str(getattr(row, "subtype", None) or "").strip().upper()
        prefix = str(getattr(row, "prefix", None) or sub).strip().upper()
        code = operational_code_for_subtype(st, sub, prefix=prefix)
        seg = route_segment_for_series(st, sub, code)
        path = list_path_for_series(st, sub, code)
        stock_type = stock_document_type_for_subtype(sub if st == "WAREHOUSE" else "")
        catalog.append(
            {
                "series_id": str(row.id),
                "series_type": st,
                "subtype": sub,
                "operational_code": code,
                "prefix": prefix,
                "label": _series_label(row, code),
                "warehouse_effect": bool(getattr(row, "warehouse_effect", st == "WAREHOUSE")),
                "route_segment": seg,
                "list_path": path,
                "stock_document_type": stock_type,
                "is_default": bool(getattr(row, "is_default", False)),
                "is_active": bool(getattr(row, "is_active", True)),
                "numbering_format": str(getattr(row, "numbering_format", None) or ""),
            }
        )

    missing = missing_operational_subtypes(db, tid, wid)
    return {
        "tenant_id": tid,
        "warehouse_id": wid,
        "required_count": REQUIRED_BOOTSTRAP_COUNT,
        "configured_count": len(catalog),
        "missing_required_subtypes": missing,
        "bootstrap_complete": len(missing) == 0,
        "items": catalog,
    }


def operational_series_for_stock_type(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_type: str,
) -> DocumentSeries | None:
    """Resolve active default warehouse series for a stock document type (PZ/MM/…)."""
    from .document_number_service import resolve_default_document_series

    sub = str(document_type or "").strip().upper()
    if not sub:
        return None
    return resolve_default_document_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_type="WAREHOUSE",
        subtype=sub,
    )

