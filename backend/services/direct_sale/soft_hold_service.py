"""Scan-time soft-hold reservations — prevent overselling at busy counters."""

from __future__ import annotations

import json
import os

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.stock_reservation import StockReservation
from .constants import (
    RESERVATION_KIND_SOFT_HOLD,
    soft_hold_expires_at,
)
from ..operational_sales_events import emit_operational_sales_event
from ..warehouse_inventory_movement_service import (
    BUCKET_RESERVED,
    MOVEMENT_RESERVATION,
    record_inventory_movement,
)


def soft_hold_enabled() -> bool:
    raw = os.getenv("FEATURE_SESSION_SOFT_HOLD", "")
    if raw.strip() == "":
        return False
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def create_soft_hold_for_scan(
    db: Session,
    *,
    sess: DirectSaleSession,
    line: DirectSaleSessionLine,
    performed_by_user_id: int | None = None,
) -> StockReservation | None:
    if not soft_hold_enabled():
        return None
    if not line.source_location_id:
        return None
    qty = float(line.quantity or 0)
    if qty <= 0:
        return None

    expires = soft_hold_expires_at()
    res: StockReservation | None = None
    if sess.order_id:
        res = StockReservation(
            tenant_id=int(sess.tenant_id),
            order_id=int(sess.order_id),
            product_id=int(line.product_id),
            location_id=int(line.source_location_id),
            quantity=qty,
            status="reserved",
            expires_at=expires,
            direct_sale_session_id=int(sess.id),
            reservation_kind=RESERVATION_KIND_SOFT_HOLD,
        )
        db.add(res)
        db.flush()
        line.stock_reservation_id = int(res.id)
        record_inventory_movement(
            db,
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            product_id=int(line.product_id),
            movement_type=MOVEMENT_RESERVATION,
            quantity=qty,
            inventory_bucket=BUCKET_RESERVED,
            operator_admin_id=performed_by_user_id,
            source_document_type="DIRECT_SALE_SOFT_HOLD",
            source_document_id=int(sess.id),
            source_line_id=int(line.id),
            from_location_id=int(line.source_location_id),
            metadata={
                "session_id": int(sess.id),
                "reservation_id": int(res.id),
                "reservation_kind": RESERVATION_KIND_SOFT_HOLD,
            },
        )
    else:
        line.metadata_json = json.dumps(
            {
                "soft_hold": {
                    "location_id": int(line.source_location_id),
                    "qty": qty,
                    "expires_at": expires.isoformat(),
                    "kind": RESERVATION_KIND_SOFT_HOLD,
                }
            },
            ensure_ascii=False,
        )

    emit_operational_sales_event(
        db,
        "reservation.created",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        session_id=int(sess.id),
        location_id=int(line.source_location_id),
        product_id=int(line.product_id),
        qty=qty,
        source="direct_sales_soft_hold",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra={
            "reservation_id": int(res.id) if res else None,
            "kind": RESERVATION_KIND_SOFT_HOLD,
            "ephemeral": res is None,
        },
    )
    return res
