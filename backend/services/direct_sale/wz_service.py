"""Direct sale WZ — warehouse-effect document; FIFO and stock movements execute here only."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from ...models.document_series import DocumentSeries
from ...models.fulfillment_event import FE_PICK, FulfillmentEvent
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.sale_document import SaleDocument
from ...models.sale_document_stock_link import SaleDocumentStockLink
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_movement import StockMovement
from ...models.stock_reservation import StockReservation
from ..document_number_service import assign_series_number_to_stock_document
from ..operational_sales_events import emit_operational_sales_event
from ..order_item_pick_allocation_service import SENTINEL_EXPIRY, consume_inventory_fifo_slices
from ..sale_warehouse_series_service import resolve_wz_series_for_sale_series
from ..stock_operation_issue_service import append_issue_operation
from ..warehouse_inventory_movement_service import (
    BUCKET_RESERVED,
    MOVEMENT_RESERVATION,
    record_inventory_movement,
)
from .constants import reservation_expires_at
from .errors import DirectSaleError
from .issue_plan_service import IssueAllocation

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DirectSaleWzResult:
    stock_document_id: int
    document_number: str
    link_id: int


def _create_wz_reservations(
    db: Session,
    *,
    wz: StockDocument,
    order: Order,
    sess: DirectSaleSession,
    allocations: list[IssueAllocation],
    performed_by_user_id: int | None,
) -> list[StockReservation]:
    expires = reservation_expires_at()
    kind = (getattr(sess, "reservation_scope", None) or "SESSION").strip().upper()
    created: list[StockReservation] = []
    for alloc in allocations:
        res = StockReservation(
            tenant_id=int(order.tenant_id),
            order_id=int(order.id),
            product_id=int(alloc.product_id),
            location_id=int(alloc.location_id),
            quantity=float(alloc.quantity),
            status="reserved",
            expires_at=expires,
            direct_sale_session_id=int(sess.id),
            reservation_kind=kind,
        )
        db.add(res)
        db.flush()
        mov = record_inventory_movement(
            db,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            product_id=int(alloc.product_id),
            movement_type=MOVEMENT_RESERVATION,
            quantity=float(alloc.quantity),
            inventory_bucket=BUCKET_RESERVED,
            operator_admin_id=performed_by_user_id,
            source_document_type="WZ",
            source_document_id=int(wz.id),
            source_line_id=int(alloc.session_line_id),
            from_location_id=int(alloc.location_id),
            metadata={
                "session_id": int(sess.id),
                "reservation_id": int(res.id),
                "reservation_kind": kind,
                "stock_document_id": int(wz.id),
            },
        )
        db.flush()
        movement_id = int(mov.id) if mov.id is not None else None
        emit_operational_sales_event(
            db,
            "reservation.created",
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            session_id=int(sess.id),
            location_id=int(alloc.location_id),
            product_id=int(alloc.product_id),
            qty=float(alloc.quantity),
            source="direct_sales",
            performed_by_user_id=performed_by_user_id,
            device_id=int(sess.workstation_id) if sess.workstation_id else None,
            extra={"reservation_id": int(res.id), "movement_id": movement_id, "wz_id": int(wz.id)},
        )
        created.append(res)
    return created


def _issue_wz_allocations(
    db: Session,
    *,
    wz: StockDocument,
    order: Order,
    sess: DirectSaleSession,
    order_items_by_line: dict[int, OrderItem],
    allocations: list[IssueAllocation],
    line_by_alloc: dict[tuple[int, int, int], StockDocumentItem],
    reservations: list[StockReservation],
    performed_by_user_id: int | None,
) -> None:
    res_by_key = {
        (int(r.product_id), int(r.location_id)): r
        for r in reservations
        if str(r.status or "") == "reserved"
    }
    issued_by_line: dict[int, int] = {}

    for alloc in allocations:
        key = (int(alloc.product_id), int(alloc.location_id))
        res = res_by_key.get(key)
        if res is None:
            raise DirectSaleError(
                f"Brak rezerwacji dla produktu #{alloc.product_id} w lokalizacji #{alloc.location_id}.",
                code="reservation_missing",
            )
        line_key = (int(alloc.session_line_id), int(alloc.product_id), int(alloc.location_id))
        wz_line = line_by_alloc.get(line_key)
        if wz_line is None:
            raise DirectSaleError("Brak linii WZ dla alokacji.", code="wz_line_missing")

        try:
            slices = consume_inventory_fifo_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(alloc.product_id),
                location_id=int(alloc.location_id),
                quantity=float(alloc.quantity),
            )
        except ValueError as exc:
            raise DirectSaleError(str(exc), code="insufficient_stock", http_status=409) from exc

        oi = order_items_by_line.get(int(alloc.session_line_id))
        if oi is None:
            raise DirectSaleError("Brak pozycji zamówienia dla linii sesji.", code="order_item_missing")

        for sl in slices:
            op = append_issue_operation(
                db,
                wz,
                wz_line,
                float(sl.quantity),
                from_location_id=int(alloc.location_id),
                batch_number=sl.batch_number or "",
                expiry_date=sl.expiry_date if sl.expiry_date < SENTINEL_EXPIRY else None,
                operator_admin_id=performed_by_user_id,
                metadata={
                    "session_id": int(sess.id),
                    "reservation_id": int(res.id),
                    "issue_strategy": str(sess.issue_strategy or ""),
                    "inventory_id": sl.inventory_id,
                },
            )
            db.flush()
            movement_id = None
            db.add(
                StockMovement(
                    tenant_id=int(order.tenant_id),
                    product_id=int(alloc.product_id),
                    from_location_id=int(alloc.location_id),
                    to_location_id=None,
                    quantity=float(sl.quantity),
                    type="issue",
                )
            )
            emit_operational_sales_event(
                db,
                "stock.issued",
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                order_id=int(order.id),
                session_id=int(sess.id),
                location_id=int(alloc.location_id),
                product_id=int(alloc.product_id),
                qty=float(sl.quantity),
                source="direct_sales",
                performed_by_user_id=performed_by_user_id,
                device_id=int(sess.workstation_id) if sess.workstation_id else None,
                extra={"stock_operation_id": int(op.id), "wz_id": int(wz.id)},
            )
            issued_by_line[int(alloc.session_line_id)] = int(op.id)

        res.status = "picked"
        oi.source_location_id = int(alloc.location_id)
        oi.issue_session_id = int(sess.id)
        if performed_by_user_id:
            oi.issued_by_user_id = int(performed_by_user_id)
        mid = issued_by_line.get(int(alloc.session_line_id))
        if mid:
            oi.source_movement_id = int(mid)
        db.add(
            FulfillmentEvent(
                order_item_id=int(oi.id),
                type=FE_PICK,
                quantity=float(alloc.quantity),
                metadata_json=None,
            )
        )

    emit_operational_sales_event(
        db,
        "stock.issued",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        extra={"allocations": len(allocations), "wz_id": int(wz.id)},
    )


def load_wz_for_sale_document(
    db: Session,
    *,
    sale_document_id: str,
) -> StockDocument | None:
    """Idempotent — WZ already linked to this sale document."""
    link = (
        db.query(SaleDocumentStockLink)
        .filter(SaleDocumentStockLink.sale_document_id == str(sale_document_id))
        .order_by(SaleDocumentStockLink.id.asc())
        .first()
    )
    if link is None:
        return None
    return db.query(StockDocument).filter(StockDocument.id == int(link.stock_document_id)).first()


def create_and_post_wz_for_direct_sale(
    db: Session,
    *,
    order: Order,
    sess: DirectSaleSession,
    sale_document: SaleDocument,
    allocations: list[IssueAllocation],
    order_items_by_line: dict[int, OrderItem],
    performed_by_user_id: int | None = None,
) -> DirectSaleWzResult:
    """
    Create linked WZ, reserve stock, FIFO issue — sole warehouse-effect path for direct sales.
    PA/FV (``sale_document``) must already exist; stock is never removed by commercial docs.
    """
    existing = load_wz_for_sale_document(db, sale_document_id=str(sale_document.id))
    if existing is not None:
        label = str(getattr(existing, "document_number", None) or "")
        link = (
            db.query(SaleDocumentStockLink)
            .filter(
                SaleDocumentStockLink.sale_document_id == str(sale_document.id),
                SaleDocumentStockLink.stock_document_id == int(existing.id),
            )
            .first()
        )
        return DirectSaleWzResult(
            stock_document_id=int(existing.id),
            document_number=label,
            link_id=int(link.id) if link is not None else 0,
        )

    sale_series = (
        db.query(DocumentSeries)
        .filter(DocumentSeries.id == str(sale_document.document_series_id))
        .first()
    )
    wz_series = resolve_wz_series_for_sale_series(
        db,
        sale_series,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
    )

    wz = StockDocument(
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        document_type="WZ",
        creation_source="DIRECT_SALE",
        order_id=int(order.id),
        source_sale_document_id=str(sale_document.id),
        direct_sale_session_id=int(sess.id),
        status="done",
        currency=str(order.currency or "PLN"),
        created_by_user_id=int(performed_by_user_id) if performed_by_user_id else None,
    )
    db.add(wz)
    db.flush()

    wh_code = str(getattr(wz_series, "code", None) or "").strip() or None
    doc_number = assign_series_number_to_stock_document(db, wz, wz_series, warehouse_code=wh_code)

    line_by_alloc: dict[tuple[int, int, int], StockDocumentItem] = {}
    for alloc in allocations:
        qty = float(alloc.quantity)
        line = StockDocumentItem(
            document_id=int(wz.id),
            product_id=int(alloc.product_id),
            ordered_quantity=qty,
            received_quantity=qty,
            quantity=qty,
            mm_line_from_location_id=int(alloc.location_id),
            batch_number="",
            expiry_date=date(9999, 12, 31),
        )
        db.add(line)
        db.flush()
        line_by_alloc[(int(alloc.session_line_id), int(alloc.product_id), int(alloc.location_id))] = line

    reservations = _create_wz_reservations(
        db,
        wz=wz,
        order=order,
        sess=sess,
        allocations=allocations,
        performed_by_user_id=performed_by_user_id,
    )
    _issue_wz_allocations(
        db,
        wz=wz,
        order=order,
        sess=sess,
        order_items_by_line=order_items_by_line,
        allocations=allocations,
        line_by_alloc=line_by_alloc,
        reservations=reservations,
        performed_by_user_id=performed_by_user_id,
    )

    link = SaleDocumentStockLink(
        sale_document_id=str(sale_document.id),
        stock_document_id=int(wz.id),
        link_type="WZ",
    )
    db.add(link)
    db.flush()

    emit_operational_sales_event(
        db,
        "wz.created",
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra={
            "wz_id": int(wz.id),
            "wz_number": doc_number,
            "sale_document_id": str(sale_document.id),
        },
    )
    logger.info(
        "[direct_sales.wz] created wz_id=%s number=%s sale_document_id=%s order_id=%s",
        wz.id,
        doc_number,
        sale_document.id,
        order.id,
    )
    return DirectSaleWzResult(
        stock_document_id=int(wz.id),
        document_number=doc_number,
        link_id=int(link.id),
    )
