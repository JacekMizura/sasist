"""TTL worker — expire reservations, release stock, close suspended sessions."""

from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from backend.models.commerce_operational import DirectSaleSession
from backend.models.stock_reservation import StockReservation
from backend.services.direct_sale.constants import RESERVATION_STATUS_ACTIVE, legacy_status_to_lifecycle
from backend.services.operational_observability import log_reservation_lifecycle
from backend.services.reservations.lifecycle_service import expire_reservation, release_session_reservations_lifecycle

logger = logging.getLogger(__name__)


def expire_due_reservations(db: Session, *, limit: int = 200) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(StockReservation)
        .filter(
            StockReservation.status == "reserved",
            StockReservation.expires_at.isnot(None),
            StockReservation.expires_at <= now,
        )
        .order_by(StockReservation.expires_at.asc())
        .limit(int(limit))
        .all()
    )
    count = 0
    for res in rows:
        if legacy_status_to_lifecycle(str(res.status or "")) != RESERVATION_STATUS_ACTIVE:
            continue
        expire_reservation(db, res)
        count += 1
    if count:
        log_reservation_lifecycle(action="worker_batch_expired", tenant_id=None, qty=float(count))
    return count


def close_expired_sessions(db: Session, *, limit: int = 50) -> int:
    now = datetime.utcnow()
    rows = (
        db.query(DirectSaleSession)
        .filter(
            DirectSaleSession.status.in_(("SUSPENDED", "CHECKOUT")),
            DirectSaleSession.expires_at.isnot(None),
            DirectSaleSession.expires_at <= now,
        )
        .order_by(DirectSaleSession.expires_at.asc())
        .limit(int(limit))
        .all()
    )
    closed = 0
    for sess in rows:
        release_session_reservations_lifecycle(db, sess=sess, reason="session_expired")
        sess.status = "CANCELLED"
        sess.completed_at = now
        closed += 1
    return closed


def run_reservation_lifecycle_worker(db: Session) -> dict[str, int]:
    expired = expire_due_reservations(db)
    sessions = close_expired_sessions(db)
    return {"expired_reservations": expired, "closed_sessions": sessions}
