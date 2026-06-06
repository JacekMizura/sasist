"""Resolve linked WZ document series from a SALE series configuration."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models.document_series import DocumentSeries
from .document_number_service import require_warehouse_series

logger = logging.getLogger(__name__)


def resolve_wz_series_for_sale_series(
    db: Session,
    sale_series: DocumentSeries | None,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DocumentSeries:
    """
    Read ``warehouse_document_series_id`` from the SALE series; fall back to default WZ series.
    """
    linked_id = str(getattr(sale_series, "warehouse_document_series_id", None) or "").strip()
    if linked_id:
        hit = (
            db.query(DocumentSeries)
            .filter(
                DocumentSeries.id == linked_id,
                DocumentSeries.tenant_id == int(tenant_id),
                DocumentSeries.warehouse_id == int(warehouse_id),
                DocumentSeries.is_active.is_(True),
            )
            .first()
        )
        if hit is not None:
            st = str(getattr(hit, "series_type", "") or "").strip().upper()
            sub = str(getattr(hit, "subtype", "") or "").strip().upper()
            if st == "WAREHOUSE" and sub == "WZ":
                return hit
            logger.warning(
                "[sale_warehouse_series] linked series %s is not WZ (type=%s subtype=%s)",
                linked_id,
                st,
                sub,
            )

    return require_warehouse_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        subtype="WZ",
    )
