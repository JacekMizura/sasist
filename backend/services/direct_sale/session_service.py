"""Direct sale session lifecycle — create, suspend, customer (no scan/complete)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ...models.commerce_operational import DirectSaleSession
from ..operational_sales_events import emit_operational_sales_event
from ..reservations.lifecycle_service import release_session_reservations_lifecycle
from .constants import SUSPEND_TTL_MINUTES, reservation_expires_at
from .errors import DirectSaleError


def create_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None,
    workstation_id: int | None = None,
    operational_zone_id: int | None = None,
    issue_strategy: str = "STRICT_LOCATION",
    reservation_scope: str = "SESSION",
) -> DirectSaleSession:
    now = datetime.utcnow()
    sess = DirectSaleSession(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        operator_user_id=int(operator_user_id) if operator_user_id else None,
        workstation_id=int(workstation_id) if workstation_id else None,
        operational_zone_id=int(operational_zone_id) if operational_zone_id else None,
        status="ACTIVE",
        issue_strategy=str(issue_strategy or "STRICT_LOCATION"),
        reservation_scope=str(reservation_scope or "SESSION"),
        started_at=now,
        last_activity_at=now,
        created_by_user_id=int(operator_user_id) if operator_user_id else None,
    )
    db.add(sess)
    db.flush()
    emit_operational_sales_event(
        db,
        "direct_sale.started",
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=int(operator_user_id) if operator_user_id else None,
        device_id=int(workstation_id) if workstation_id else None,
    )
    return sess


def get_session(db: Session, session_id: int, *, tenant_id: int) -> DirectSaleSession | None:
    return (
        db.query(DirectSaleSession)
        .options(joinedload(DirectSaleSession.lines))
        .filter(
            DirectSaleSession.id == int(session_id),
            DirectSaleSession.tenant_id == int(tenant_id),
        )
        .first()
    )


def get_session_for_complete(
    db: Session,
    session_id: int,
    *,
    tenant_id: int,
) -> DirectSaleSession | None:
    """Row lock for complete — serializes duplicate complete requests."""
    sess = (
        db.query(DirectSaleSession)
        .filter(
            DirectSaleSession.id == int(session_id),
            DirectSaleSession.tenant_id == int(tenant_id),
        )
        .with_for_update()
        .first()
    )
    if sess is not None:
        # Load lines in a separate query — PostgreSQL rejects FOR UPDATE on the
        # nullable side of LEFT OUTER JOIN (joinedload + with_for_update).
        _ = sess.lines
    return sess


def suspend_session(db: Session, sess: DirectSaleSession) -> DirectSaleSession:
    if sess.status not in ("ACTIVE", "CHECKOUT"):
        raise DirectSaleError("Sesja nie może być zawieszona w tym stanie.", code="invalid_status")
    now = datetime.utcnow()
    sess.status = "SUSPENDED"
    sess.suspended_at = now
    sess.last_activity_at = now
    sess.expires_at = reservation_expires_at(minutes=SUSPEND_TTL_MINUTES)
    release_session_reservations_lifecycle(db, sess=sess, reason="session_suspended")
    emit_operational_sales_event(
        db,
        "direct_sale.suspended",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        session_id=int(sess.id),
        source="direct_sales",
        extra={"expires_at": sess.expires_at.isoformat() if sess.expires_at else None},
    )
    return sess


def set_session_customer(
    db: Session,
    sess: DirectSaleSession,
    *,
    customer_id: int | None,
) -> DirectSaleSession:
    if sess.status in ("COMPLETED", "CANCELLED"):
        raise DirectSaleError("Sesja zamknięta.", code="session_closed")
    sess.customer_id = int(customer_id) if customer_id else None
    sess.last_activity_at = datetime.utcnow()
    return sess


def list_suspended_sessions(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    limit: int = 20,
) -> list[DirectSaleSession]:
    lim = max(1, min(int(limit), 50))
    return (
        db.query(DirectSaleSession)
        .options(joinedload(DirectSaleSession.lines))
        .filter(
            DirectSaleSession.tenant_id == int(tenant_id),
            DirectSaleSession.warehouse_id == int(warehouse_id),
            DirectSaleSession.status == "SUSPENDED",
        )
        .order_by(DirectSaleSession.suspended_at.desc(), DirectSaleSession.id.desc())
        .limit(lim)
        .all()
    )


def resume_session(db: Session, sess: DirectSaleSession) -> DirectSaleSession:
    if sess.status != "SUSPENDED":
        raise DirectSaleError("Można wznowić tylko zawieszoną sesję.", code="invalid_status")
    now = datetime.utcnow()
    sess.status = "ACTIVE"
    sess.suspended_at = None
    sess.expires_at = None
    sess.last_activity_at = now
    emit_operational_sales_event(
        db,
        "direct_sale.resumed",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        session_id=int(sess.id),
        source="direct_sales",
    )
    return sess


def cancel_session(db: Session, sess: DirectSaleSession) -> DirectSaleSession:
    if sess.status in ("COMPLETED", "CANCELLED"):
        raise DirectSaleError("Sesja jest już zamknięta.", code="session_closed")
    now = datetime.utcnow()
    release_session_reservations_lifecycle(db, sess=sess, reason="session_cancelled")
    sess.status = "CANCELLED"
    sess.completed_at = now
    sess.last_activity_at = now
    emit_operational_sales_event(
        db,
        "direct_sale.cancelled",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        session_id=int(sess.id),
        source="direct_sales",
    )
    return sess
