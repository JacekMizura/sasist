"""Direct sale scan commands — add line + soft-hold."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, DirectSaleSessionLine
from ...models.product import Product
from ..location_stock_service import resolve_product_id, suggest_issue_locations_for_sales
from .errors import DirectSaleError
from .soft_hold_service import create_soft_hold_for_scan


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
    create_soft_hold_for_scan(db, sess=sess, line=line, performed_by_user_id=sess.operator_user_id)
    return line, suggestions
