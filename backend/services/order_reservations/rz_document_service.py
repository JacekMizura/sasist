"""RZ StockDocument ensure/sync for warehouse-level business reservations."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.warehouse import Warehouse
from ..document_number_service import (
    DocumentSeriesOperationalError,
    assign_series_number_to_stock_document,
    require_warehouse_series,
)
from ..stock_document_factory import create_stock_document
from .constants import (
    OWR_ACTIVE_STATUSES,
    OWR_STATUS_CANCELLED,
    OWR_STATUS_CONSUMED,
    OWR_STATUS_PARTIALLY_CONSUMED,
    OWR_STATUS_RELEASED,
    OWR_STATUS_RESERVED,
    STOCK_DOC_TYPE_RESERVATION,
)

logger = logging.getLogger(__name__)


def _warehouse_code(db: Session, warehouse_id: int) -> str | None:
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    if wh is None:
        return None
    return (getattr(wh, "code", None) or getattr(wh, "name", None) or "").strip() or None


def _doc_status_for_reservations(rows: list[OrderWarehouseReservation]) -> str:
    if not rows:
        return "cancelled"
    statuses = {str(r.status or "") for r in rows}
    if statuses <= {OWR_STATUS_CANCELLED, OWR_STATUS_RELEASED, OWR_STATUS_CONSUMED}:
        if statuses == {OWR_STATUS_CONSUMED} or OWR_STATUS_CONSUMED in statuses and not (
            statuses & {OWR_STATUS_RESERVED, OWR_STATUS_PARTIALLY_CONSUMED}
        ):
            return "completed"
        return "cancelled"
    if OWR_STATUS_PARTIALLY_CONSUMED in statuses or (
        OWR_STATUS_CONSUMED in statuses and (statuses & {OWR_STATUS_RESERVED, OWR_STATUS_PARTIALLY_CONSUMED})
    ):
        return "partial"
    return "open"


def find_active_rz_document(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> StockDocument | None:
    return (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.order_id == int(order_id),
            StockDocument.document_type == STOCK_DOC_TYPE_RESERVATION,
            StockDocument.status.in_(("open", "partial", "draft")),
        )
        .order_by(StockDocument.id.desc())
        .first()
    )


def ensure_rz_document_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    created_by_user_id: int | None = None,
    document_series=None,
    creation_source: str = "PANEL",
    raise_on_error: bool = False,
) -> StockDocument | None:
    """
    One open RZ per tenant+warehouse+order. Lines mirror active business reservations.
    ATP must NOT read line qty — lines are documentary snapshots.

    Optional ``document_series``: explicit WAREHOUSE/RESERVATION series (automation).
    """
    try:
        with db.begin_nested():
            return _ensure_rz_document_for_order_impl(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                order_id=order_id,
                created_by_user_id=created_by_user_id,
                document_series=document_series,
                creation_source=creation_source,
            )
    except Exception:
        if raise_on_error:
            raise
        logger.warning(
            "RZ document ensure skipped tenant=%s warehouse=%s order=%s",
            tenant_id,
            warehouse_id,
            order_id,
            exc_info=True,
        )
        return None


def _ensure_rz_document_for_order_impl(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    created_by_user_id: int | None = None,
    document_series=None,
    creation_source: str = "PANEL",
) -> StockDocument | None:
    from ..document_number_service import resolve_default_document_series

    rows = (
        db.query(OrderWarehouseReservation)
        .filter(
            OrderWarehouseReservation.tenant_id == int(tenant_id),
            OrderWarehouseReservation.warehouse_id == int(warehouse_id),
            OrderWarehouseReservation.order_id == int(order_id),
        )
        .order_by(OrderWarehouseReservation.product_id.asc())
        .all()
    )
    active = [r for r in rows if str(r.status) in OWR_ACTIVE_STATUSES and float(r.quantity or 0) > 1e-9]
    doc = find_active_rz_document(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_id=order_id
    )
    if not active and doc is None:
        return None

    series = document_series
    if series is None:
        # Prefer existing series — avoid ensure_default_document_series() which may commit mid-flow.
        series = resolve_default_document_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            series_type="WAREHOUSE",
            subtype=STOCK_DOC_TYPE_RESERVATION,
        )
        if series is None:
            try:
                series = require_warehouse_series(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id),
                    subtype=STOCK_DOC_TYPE_RESERVATION,
                )
            except DocumentSeriesOperationalError:
                logger.warning(
                    "RZ series missing tenant=%s warehouse=%s — reservations kept without document",
                    tenant_id,
                    warehouse_id,
                )
                return doc

    src = str(creation_source or "PANEL").strip().upper() or "PANEL"
    if doc is None:
        doc = create_stock_document(
            db,
            context="order_rz",
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            document_type=STOCK_DOC_TYPE_RESERVATION,
            status="open",
            order_id=int(order_id),
            creation_source=src,
            created_by_user_id=created_by_user_id,
            receiving_status="DONE",
            putaway_status="DONE",
            relocation_status="DONE",
            warehouse_workflow_status="CLOSED",
        )
        assign_series_number_to_stock_document(
            db, doc, series, warehouse_code=_warehouse_code(db, warehouse_id)
        )

    # Rebuild lines from active rows (snapshot of remaining + originals for display).
    db.query(StockDocumentItem).filter(StockDocumentItem.document_id == int(doc.id)).delete(
        synchronize_session=False
    )
    db.flush()
    for r in active:
        qty = float(r.quantity_original or r.quantity or 0)
        rem = float(r.quantity or 0)
        line = StockDocumentItem(
            document_id=int(doc.id),
            product_id=int(r.product_id),
            ordered_quantity=round(qty, 6),
            received_quantity=round(max(0.0, qty - rem), 6),
            quantity=round(qty, 6),
            stock_disposition=str(r.stock_disposition or "SALEABLE"),
            requires_putaway=False,
        )
        db.add(line)
        r.stock_document_id = int(doc.id)

    doc.status = _doc_status_for_reservations(rows)
    db.flush()
    return doc


def sync_rz_document_status(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> None:
    try:
        _sync_rz_document_status_impl(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_id=order_id
        )
    except Exception:
        logger.debug(
            "RZ status sync skipped tenant=%s warehouse=%s order=%s",
            tenant_id,
            warehouse_id,
            order_id,
            exc_info=True,
        )


def _sync_rz_document_status_impl(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> None:
    rows = (
        db.query(OrderWarehouseReservation)
        .filter(
            OrderWarehouseReservation.tenant_id == int(tenant_id),
            OrderWarehouseReservation.warehouse_id == int(warehouse_id),
            OrderWarehouseReservation.order_id == int(order_id),
        )
        .all()
    )
    doc_ids = {int(r.stock_document_id) for r in rows if r.stock_document_id}
    doc = find_active_rz_document(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, order_id=order_id
    )
    if doc is not None:
        doc_ids.add(int(doc.id))
    for did in doc_ids:
        d = db.query(StockDocument).filter(StockDocument.id == did).first()
        if d is None:
            continue
        linked = [r for r in rows if r.stock_document_id == did] or rows
        d.status = _doc_status_for_reservations(linked)
