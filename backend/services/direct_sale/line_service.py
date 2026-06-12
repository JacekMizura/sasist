"""Direct sale session line mutations — qty, location, remove."""

from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from .errors import DirectSaleError
from .line_delete_service import get_session_line, remove_session_line as _remove_session_line
from .scan_service import session_add_product_line


def _require_mutable_session(sess: DirectSaleSession) -> None:
    if sess.status not in ("ACTIVE", "SUSPENDED", "CHECKOUT"):
        raise DirectSaleError("Sesja zamknięta.", code="session_closed")


def _touch_soft_hold_qty(line: DirectSaleSessionLine, qty: float) -> None:
    if not line.metadata_json:
        return
    try:
        meta = json.loads(line.metadata_json)
        hold = meta.get("soft_hold")
        if isinstance(hold, dict):
            hold["qty"] = float(qty)
            meta["soft_hold"] = hold
            line.metadata_json = json.dumps(meta, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass


def update_session_line_quantity(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    quantity: float,
    performed_by_user_id: int | None = None,
) -> DirectSaleSessionLine | None:
    _require_mutable_session(sess)
    qty = float(quantity)
    if qty <= 0:
        return _remove_session_line(
            db,
            sess,
            line_id=line_id,
            performed_by_user_id=performed_by_user_id,
        )
    line = get_session_line(db, sess, line_id=line_id)
    line.quantity = qty
    _touch_soft_hold_qty(line, qty)
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    return line


def update_session_line_location(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    source_location_id: int | None,
) -> DirectSaleSessionLine:
    _require_mutable_session(sess)
    line = get_session_line(db, sess, line_id=line_id)
    line.source_location_id = int(source_location_id) if source_location_id else None
    if line.metadata_json:
        try:
            meta = json.loads(line.metadata_json)
            hold = meta.get("soft_hold")
            if isinstance(hold, dict) and source_location_id:
                hold["location_id"] = int(source_location_id)
                meta["soft_hold"] = hold
                line.metadata_json = json.dumps(meta, ensure_ascii=False)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    return line


def update_session_line_discount(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    discount_type: str | None,
    discount_value: float,
) -> DirectSaleSessionLine:
    from .discount_validation_service import validate_line_discount
    from .session_financials_service import compute_line_financials

    _require_mutable_session(sess)
    line = get_session_line(db, sess, line_id=line_id)
    dt = str(discount_type or "").strip().lower()
    if dt not in ("percent", "amount", ""):
        raise DirectSaleError("Nieprawidłowy typ rabatu.", code="invalid_discount")
    validate_line_discount(
        db,
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        discount_type=dt or None,
        discount_value=float(discount_value or 0),
    )
    line.line_discount_type = dt or None
    line.line_discount_value = max(0.0, float(discount_value or 0))
    fin = compute_line_financials(db, line)
    line.discount_amount = float(fin["line_discount_gross"])
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    return line


def remove_session_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    line_id: int,
    performed_by_user_id: int | None = None,
) -> None:
    _remove_session_line(
        db,
        sess,
        line_id=line_id,
        performed_by_user_id=performed_by_user_id,
    )


def add_product_to_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    product_id: int,
    quantity: float = 1.0,
    source_location_id: int | None = None,
    offer_id: int | None = None,
) -> tuple[DirectSaleSessionLine, list[dict]]:
    return session_add_product_line(
        db,
        sess,
        product_id=int(product_id),
        quantity=float(quantity),
        source_location_id=source_location_id,
        offer_id=offer_id,
    )
