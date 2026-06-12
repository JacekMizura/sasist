"""
Legacy direct-sale stock helpers.

Direct sales completion now routes reserve → FIFO issue through linked WZ
(``wz_service.create_and_post_wz_for_direct_sale``). These functions remain for
session reservation release and backward-compatible imports only.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from ...models.fulfillment_event import FE_PICK, FulfillmentEvent
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.stock_reservation import StockReservation
from ...models.stock_movement import StockMovement
from .constants import SESSION_RESERVATION_TTL_MINUTES, reservation_expires_at
from .issue_plan_service import IssueAllocation
from .errors import DirectSaleError
from ..order_item_pick_allocation_service import SENTINEL_EXPIRY, consume_inventory_fifo_slices
from ..operational_sales_events import emit_operational_sales_event
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION
from ..warehouse_inventory_movement_service import (
    BUCKET_RESERVED,
    BUCKET_SELLABLE,
    MOVEMENT_ISSUE,
    MOVEMENT_RESERVATION,
    record_inventory_movement,
)

def create_reservations_for_order(
    db: Session,
    *,
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
            stock_disposition=DEFAULT_STOCK_DISPOSITION,
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
            source_document_type="DIRECT_SALE",
            source_document_id=int(order.id),
            source_line_id=int(alloc.session_line_id),
            from_location_id=int(alloc.location_id),
            metadata={
                "session_id": int(sess.id),
                "reservation_id": int(res.id),
                "reservation_kind": kind,
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
            extra={"reservation_id": int(res.id), "movement_id": movement_id},
        )
        emit_operational_sales_event(
            db,
            "stock.reserved",
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            session_id=int(sess.id),
            location_id=int(alloc.location_id),
            product_id=int(alloc.product_id),
            qty=float(alloc.quantity),
            source="direct_sales",
            performed_by_user_id=performed_by_user_id,
        )
        created.append(res)
    return created


def issue_stock_for_allocations(
    db: Session,
    *,
    order: Order,
    sess: DirectSaleSession,
    order_items_by_line: dict[int, OrderItem],
    allocations: list[IssueAllocation],
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
        try:
            slices = consume_inventory_fifo_slices(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(alloc.product_id),
                location_id=int(alloc.location_id),
                quantity=float(alloc.quantity),
                stock_disposition=DEFAULT_STOCK_DISPOSITION,
            )
        except ValueError as exc:
            raise DirectSaleError(str(exc), code="insufficient_stock", http_status=409) from exc
        oi = order_items_by_line.get(int(alloc.session_line_id))
        if oi is None:
            raise DirectSaleError("Brak pozycji zamówienia dla linii sesji.", code="order_item_missing")

        for sl in slices:
            mov = record_inventory_movement(
                db,
                tenant_id=int(order.tenant_id),
                warehouse_id=int(order.warehouse_id),
                product_id=int(alloc.product_id),
                movement_type=MOVEMENT_ISSUE,
                quantity=float(sl.quantity),
                inventory_bucket=BUCKET_SELLABLE,
                operator_admin_id=performed_by_user_id,
                source_document_type="DIRECT_SALE",
                source_document_id=int(order.id),
                source_line_id=int(oi.id),
                from_location_id=int(alloc.location_id),
                lot_number=sl.batch_number or None,
                expiry_date=sl.expiry_date if sl.expiry_date < SENTINEL_EXPIRY else None,
                metadata={
                    "session_id": int(sess.id),
                    "reservation_id": int(res.id),
                    "issue_strategy": str(sess.issue_strategy or ""),
                },
            )
            db.flush()
            movement_id = int(mov.id) if mov.id is not None else None
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
                extra={"movement_id": movement_id},
            )
            if movement_id is not None:
                issued_by_line[int(alloc.session_line_id)] = movement_id

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
        extra={"allocations": len(allocations)},
    )


def release_session_reservations(
    db: Session,
    *,
    sess: DirectSaleSession,
    performed_by_user_id: int | None = None,
) -> int:
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.direct_sale_session_id == int(sess.id),
            StockReservation.status == "reserved",
        )
        .all()
    )
    for r in rows:
        r.status = "released"
        emit_operational_sales_event(
            db,
            "reservation.released",
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            order_id=int(r.order_id) if r.order_id else None,
            session_id=int(sess.id),
            location_id=int(r.location_id),
            product_id=int(r.product_id),
            qty=float(r.quantity or 0),
            source="direct_sales",
            performed_by_user_id=performed_by_user_id,
            extra={"reservation_id": int(r.id)},
        )
    return len(rows)
