"""Collective Z-PZ: one open document per warehouse until operator closes it."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models.document_series import DocumentSeries
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.wms_order_return import WmsOrderReturn
from ..stock_document_service import (
    ensure_default_pz_receiving_location_if_missing,
    ensure_pz_document_warehouse_resolved,
)
from ..document_number_service import assign_series_number_to_stock_document
from .collective_z_pz_lock import acquire_collective_z_pz_lock, dialect_supports_for_update
from .z_pz_constants import Z_PZ, Z_PZ_STATUS_CLOSED, Z_PZ_STATUS_OPEN

logger = logging.getLogger(__name__)


def _assign_z_pz_number(db: Session, doc: StockDocument, *, series: DocumentSeries) -> None:
    if str(getattr(doc, "document_number", None) or "").strip():
        return
    from ...models.warehouse import Warehouse

    wh = db.query(Warehouse).filter(Warehouse.id == int(doc.warehouse_id)).first()
    wh_code = str(getattr(wh, "code", None) or "").strip() or None
    assign_series_number_to_stock_document(db, doc, series, warehouse_code=wh_code)


def find_active_collective_z_pz(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series_id: str,
    for_update: bool = False,
) -> Optional[StockDocument]:
    """Last open collective Z-PZ for warehouse (accepting returns)."""
    q = db.query(StockDocument).filter(
        StockDocument.tenant_id == int(tenant_id),
        StockDocument.warehouse_id == int(warehouse_id),
        StockDocument.document_type == Z_PZ,
        StockDocument.document_series_id == str(series_id),
        StockDocument.is_collective_return_receipt.is_(True),
        StockDocument.status == Z_PZ_STATUS_OPEN,
    )
    if for_update and dialect_supports_for_update(db):
        q = q.with_for_update()
    return q.order_by(StockDocument.id.desc()).first()


def summarize_collective_z_pz(db: Session, doc: StockDocument) -> dict[str, Any]:
    """Counts for WMS panel / label print."""
    rows = (
        db.query(
            func.count(StockDocumentItem.id),
            func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0),
        )
        .filter(StockDocumentItem.document_id == int(doc.id))
        .one()
    )
    line_count = int(rows[0] or 0)
    unit_sum = float(rows[1] or 0.0)
    rmz_count = int(
        db.query(func.count(func.distinct(StockDocumentItem.source_rmz_id)))
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.source_rmz_id.isnot(None),
        )
        .scalar()
        or 0
    )
    num = str(getattr(doc, "document_number", None) or "").strip() or f"Z-PZ #{int(doc.id)}"
    created = getattr(doc, "created_at", None)
    return {
        "stock_document_id": int(doc.id),
        "document_number": num,
        "document_type": Z_PZ,
        "status": str(getattr(doc, "status", None) or Z_PZ_STATUS_OPEN),
        "line_count": line_count,
        "unit_sum": round(unit_sum, 4),
        "rmz_count": rmz_count,
        "created_at": created.isoformat() if isinstance(created, datetime) else None,
        "warehouse_id": int(doc.warehouse_id) if getattr(doc, "warehouse_id", None) else None,
        "barcode_value": f"ZPZ-{int(doc.id)}",
        "detail_path": f"/documents/warehouse/z-pz?id={int(doc.id)}",
    }


def get_active_collective_z_pz_summary(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series: DocumentSeries,
) -> Optional[dict[str, Any]]:
    from ...db.schema_upgrade import ensure_stock_document_putaway_flag_schema

    ensure_stock_document_putaway_flag_schema(db)
    doc = find_active_collective_z_pz(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_id=str(series.id),
    )
    if doc is None:
        return None
    return summarize_collective_z_pz(db, doc)


def create_collective_z_pz_shell_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series: DocumentSeries,
) -> StockDocument:
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type=Z_PZ,
        document_series_id=str(series.id),
        supplier_id=None,
        delivery_id=None,
        rmz_id=None,
        warehouse_id=int(warehouse_id),
        location_id=None,
        status=Z_PZ_STATUS_OPEN,
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        is_collective_return_receipt=True,
        collective_business_date=now.date(),
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)
    _assign_z_pz_number(db, doc, series=series)
    logger.info(
        "[Z-PZ] created open collective shell doc_id=%s wh=%s number=%s",
        doc.id,
        doc.warehouse_id,
        getattr(doc, "document_number", None),
    )
    return doc


def create_collective_z_pz_shell(
    db: Session,
    rmz: WmsOrderReturn,
    *,
    series: DocumentSeries,
) -> StockDocument:
    return create_collective_z_pz_shell_for_warehouse(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id),
        series=series,
    )


def find_or_create_collective_z_pz_for_warehouse(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series: DocumentSeries,
) -> StockDocument:
    series_id = str(series.id)
    acquire_collective_z_pz_lock(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    existing = find_active_collective_z_pz(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_id=series_id,
        for_update=True,
    )
    if existing is not None:
        return existing

    try:
        with db.begin_nested():
            return create_collective_z_pz_shell_for_warehouse(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                series=series,
            )
    except IntegrityError:
        hit = find_active_collective_z_pz(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            series_id=series_id,
            for_update=True,
        )
        if hit is not None:
            return hit
        raise


def find_or_create_collective_z_pz(
    db: Session,
    rmz: WmsOrderReturn,
    *,
    series: DocumentSeries,
) -> StockDocument:
    return find_or_create_collective_z_pz_for_warehouse(
        db,
        tenant_id=int(rmz.tenant_id),
        warehouse_id=int(rmz.warehouse_id),
        series=series,
    )


def close_active_collective_z_pz(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    series: DocumentSeries,
) -> StockDocument:
    """Close open collective Z-PZ — document enters putaway / relocation queue."""
    doc = find_active_collective_z_pz(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        series_id=str(series.id),
        for_update=True,
    )
    if doc is None:
        raise ValueError("Brak aktywnego dokumentu Z-PZ do zamknięcia.")

    line_count = (
        db.query(func.count(StockDocumentItem.id))
        .filter(StockDocumentItem.document_id == int(doc.id))
        .scalar()
        or 0
    )
    if int(line_count) < 1:
        raise ValueError("Dokument Z-PZ nie ma pozycji — dodaj zwroty przed zamknięciem.")

    doc.status = Z_PZ_STATUS_CLOSED
    doc.receiving_status = "DONE"
    if str(getattr(doc, "putaway_status", None) or "").strip().upper() not in (
        "NOT_STARTED",
        "IN_PROGRESS",
        "DONE",
    ):
        doc.putaway_status = "NOT_STARTED"
    doc.relocation_status = "OPEN"
    doc.updated_at = datetime.utcnow()
    db.flush()
    logger.info(
        "[Z-PZ] closed collective doc_id=%s number=%s wh=%s lines=%s",
        doc.id,
        getattr(doc, "document_number", None),
        warehouse_id,
        line_count,
    )
    return doc
