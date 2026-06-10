"""Safe direct-sale line removal — reservations, activity, reload."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.stock_reservation import StockReservation
from ..operational_sales_events import emit_operational_sales_event
from ..reservations.lifecycle_service import (
    release_reservation,
    reservation_lifecycle_state,
)
from ..direct_sale.constants import RESERVATION_STATUS_ACTIVE
from ..warehouse_inventory_movement_service import (
    BUCKET_SELLABLE,
    MOVEMENT_UNRESERVATION,
    record_inventory_movement,
)
from .errors import DirectSaleError

logger = logging.getLogger(__name__)


def _require_mutable_session(sess: DirectSaleSession) -> None:
    if sess.status not in ("ACTIVE", "SUSPENDED", "CHECKOUT"):
        raise DirectSaleError("Sesja zamknięta.", code="session_closed")


def get_session_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
) -> DirectSaleSessionLine:
    line = (
        db.query(DirectSaleSessionLine)
        .filter(
            DirectSaleSessionLine.id == int(line_id),
            DirectSaleSessionLine.session_id == int(sess.id),
        )
        .first()
    )
    if line is None:
        raise DirectSaleError("Nie znaleziono pozycji.", code="line_not_found", http_status=404)
    return line


def _release_line_reservation_safe(
    db: Session,
    sess: DirectSaleSession,
    line: DirectSaleSessionLine,
    *,
    performed_by_user_id: int | None = None,
) -> None:
    rid = getattr(line, "stock_reservation_id", None)
    if not rid:
        return
    res = (
        db.query(StockReservation)
        .filter(StockReservation.id == int(rid))
        .first()
    )
    if res is None:
        line.stock_reservation_id = None
        return
    if reservation_lifecycle_state(res) != RESERVATION_STATUS_ACTIVE:
        line.stock_reservation_id = None
        return
    warehouse_id = int(sess.warehouse_id) if getattr(sess, "warehouse_id", None) else None
    try:
        release_reservation(
            db,
            res,
            reason="line_removed",
            performed_by_user_id=performed_by_user_id,
        )
    except Exception:
        logger.warning(
            "direct_sale line delete: release_reservation failed session_id=%s line_id=%s reservation_id=%s",
            sess.id,
            line.id,
            rid,
            exc_info=True,
        )
        try:
            if warehouse_id and float(res.quantity or 0) > 0:
                record_inventory_movement(
                    db,
                    tenant_id=int(res.tenant_id),
                    warehouse_id=warehouse_id,
                    product_id=int(res.product_id),
                    movement_type=MOVEMENT_UNRESERVATION,
                    quantity=float(res.quantity or 0),
                    inventory_bucket=BUCKET_SELLABLE,
                    operator_admin_id=performed_by_user_id,
                    from_location_id=int(res.location_id) if res.location_id else None,
                    metadata={"reservation_id": int(res.id), "reason": "line_removed_fallback"},
                )
            res.status = "released"
            db.flush()
        except Exception:
            logger.warning(
                "direct_sale line delete: reservation fallback release failed reservation_id=%s",
                rid,
                exc_info=True,
            )
            try:
                res.status = "released"
                db.flush()
            except Exception:
                pass
    line.stock_reservation_id = None


def _emit_line_removed_safe(
    db: Session,
    sess: DirectSaleSession,
    line: DirectSaleSessionLine,
    *,
    performed_by_user_id: int | None = None,
) -> None:
    try:
        emit_operational_sales_event(
            db,
            "direct_sale.line_removed",
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            session_id=int(sess.id),
            product_id=int(line.product_id) if line.product_id else None,
            qty=float(line.quantity or 0),
            source="direct_sales",
            performed_by_user_id=performed_by_user_id,
            extra={"line_id": int(line.id)},
        )
    except Exception:
        logger.warning(
            "direct_sale line delete: activity emit failed session_id=%s line_id=%s",
            sess.id,
            line.id,
            exc_info=True,
        )


def remove_session_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    performed_by_user_id: int | None = None,
) -> None:
    """Delete cart line and release warehouse holds when present."""
    _require_mutable_session(sess)
    line = get_session_line(db, sess, line_id=line_id)
    product_id = int(line.product_id) if line.product_id else None
    qty = float(line.quantity or 0)

    _release_line_reservation_safe(
        db,
        sess,
        line,
        performed_by_user_id=performed_by_user_id,
    )
    _emit_line_removed_safe(db, sess, line, performed_by_user_id=performed_by_user_id)

    db.delete(line)
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    db.expire(sess, ["lines"])
    logger.info(
        "direct_sale line removed session_id=%s line_id=%s product_id=%s qty=%s",
        sess.id,
        line_id,
        product_id,
        qty,
    )
