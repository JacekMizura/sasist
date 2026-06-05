"""Operational direct sales session commands (API-first)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ..models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ..models.product import Product
from .location_stock_service import resolve_product_id, suggest_issue_locations_for_sales


class DirectSaleError(Exception):
    def __init__(self, message: str, *, code: str = "direct_sale_error", http_status: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.http_status = http_status


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


def suspend_session(db: Session, sess: DirectSaleSession) -> DirectSaleSession:
    if sess.status not in ("ACTIVE", "CHECKOUT"):
        raise DirectSaleError("Sesja nie może być zawieszona w tym stanie.", code="invalid_status")
    now = datetime.utcnow()
    sess.status = "SUSPENDED"
    sess.suspended_at = now
    sess.last_activity_at = now
    return sess


def _resolve_product_from_scan(
    db: Session,
    *,
    tenant_id: int,
    code: str,
) -> int:
    raw = (code or "").strip()
    if not raw:
        raise DirectSaleError("Pusty kod skanu.", code="empty_scan")
    pid = resolve_product_id(db, tenant_id=tenant_id, ean=raw)
    if pid is None:
        pid = resolve_product_id(db, tenant_id=tenant_id, sku=raw)
    if pid is None and raw.isdigit():
        pid = resolve_product_id(db, tenant_id=tenant_id, product_id=int(raw))
    if pid is None:
        raise DirectSaleError(f"Nie rozpoznano produktu: {raw}", code="product_not_found", http_status=404)
    return int(pid)


def session_scan_add_line(
    db: Session,
    sess: DirectSaleSession,
    *,
    code: str,
    quantity: float,
    source_location_id: int | None = None,
) -> tuple[DirectSaleSessionLine, list[dict]]:
    if sess.status not in ("ACTIVE", "SUSPENDED"):
        raise DirectSaleError("Sesja nie przyjmuje skanów.", code="session_closed")
    if sess.status == "SUSPENDED":
        sess.status = "ACTIVE"
        sess.suspended_at = None
    pid = _resolve_product_from_scan(db, tenant_id=int(sess.tenant_id), code=code)
    qty = float(quantity)
    if qty <= 0:
        raise DirectSaleError("Ilość musi być > 0.", code="invalid_qty")
    suggestions = suggest_issue_locations_for_sales(
        db,
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        product_id=pid,
        quantity=qty,
    )
    suggested_lid = int(suggestions[0]["location_id"]) if suggestions else None
    src_lid = int(source_location_id) if source_location_id else suggested_lid
    sort_order = len(sess.lines or [])
    pr = db.query(Product).filter(Product.id == pid).first()
    line = DirectSaleSessionLine(
        session_id=int(sess.id),
        product_id=pid,
        quantity=qty,
        unit_price=float(pr.base_price) if pr and getattr(pr, "base_price", None) else None,
        source_location_id=src_lid,
        suggested_location_id=suggested_lid,
        sort_order=sort_order,
    )
    db.add(line)
    sess.last_activity_at = datetime.utcnow()
    db.flush()
    return line, suggestions
