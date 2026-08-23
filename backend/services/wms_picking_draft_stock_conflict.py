"""
Detect draft Pick rows that cannot be finalized against current Inventory.

Legacy / race: draft Pick exists (UI „Zebrano”) but location stock no longer covers
``Pick.quantity``. Detection is read-side projection — never auto-deletes picks.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.pick import Pick
from ..models.product import Product
from .stock_disposition import DEFAULT_STOCK_DISPOSITION
from .wms_basket_put.location_stock import on_hand_qty_at_location
from .wms_picking_atp import reserved_qty_at_location


@dataclass(frozen=True)
class DraftStockConflict:
    pick_id: int
    order_id: int
    order_item_id: int | None
    product_id: int
    product_name: str
    sku: str | None
    ean: str | None
    location_id: int
    location_code: str
    picked_qty: float
    available_qty: float
    cart_id: int | None
    picking_session_id: int | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "pick_id": int(self.pick_id),
            "order_id": int(self.order_id),
            "order_item_id": int(self.order_item_id) if self.order_item_id is not None else None,
            "product_id": int(self.product_id),
            "product_name": self.product_name,
            "sku": self.sku,
            "ean": self.ean,
            "location_id": int(self.location_id),
            "location_code": self.location_code,
            "picked_qty": float(self.picked_qty),
            "available_qty": float(self.available_qty),
            "cart_id": int(self.cart_id) if self.cart_id is not None else None,
            "picking_session_id": (
                int(self.picking_session_id) if self.picking_session_id is not None else None
            ),
        }


def _draft_picks_for_scope(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: Sequence[int],
    cart_id: int | None,
    picking_session_id: int | None,
    only_product_id: int | None = None,
) -> list[Pick]:
    if not order_ids:
        return []
    q = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.order_id.in_([int(x) for x in order_ids]),
            Pick.picked_at.is_(None),
            Pick.status.in_(("picking", "waiting", "done")),
        )
        .order_by(Pick.id.asc())
    )
    if only_product_id is not None and int(only_product_id) > 0:
        q = q.filter(Pick.product_id == int(only_product_id))
    if cart_id is not None and int(cart_id) > 0:
        q = q.filter(Pick.cart_id == int(cart_id))
    elif picking_session_id is not None and int(picking_session_id) > 0:
        q = q.filter(Pick.cart_id.is_(None))
    else:
        return []
    return list(q.all())


def detect_draft_stock_conflicts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: Sequence[int],
    cart_id: int | None = None,
    picking_session_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    only_product_id: int | None = None,
) -> list[DraftStockConflict]:
    """
    Simulate finalize consume order (Pick.id ASC) with a virtual on-hand per location.

    A pick conflicts when its quantity exceeds remaining finalize-aligned stock at
    ``Pick.location_id`` after earlier drafts in the same scope have claimed units.
    """
    picks = _draft_picks_for_scope(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_ids=order_ids,
        cart_id=cart_id,
        picking_session_id=picking_session_id,
        only_product_id=only_product_id,
    )
    if not picks:
        return []

    # Physical on-hand snapshot + cumulative draft claims @ (product, location).
    # Prefetch unique (product, location) keys — avoid per-pick inventory N+1.
    keys = {(int(p.product_id), int(p.location_id)) for p in picks}
    on_hand_base: dict[tuple[int, int], float] = {}
    for pid, lid in keys:
        on_hand_base[(pid, lid)] = on_hand_qty_at_location(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=pid,
            location_id=lid,
            stock_disposition=stock_disposition,
            for_update=False,
        )

    # Prefetch foreign reservations per (product, location, exclude_order).
    # Still one query per unique triple — bounded by distinct picks, not worse than before.
    reserved_cache: dict[tuple[int, int, int | None], float] = {}

    def _foreign(pid: int, lid: int, oid: int | None) -> float:
        key = (pid, lid, oid)
        if key not in reserved_cache:
            reserved_cache[key] = reserved_qty_at_location(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=pid,
                location_id=lid,
                exclude_order_id=oid,
                stock_disposition=stock_disposition,
            )
        return float(reserved_cache[key])

    claimed: dict[tuple[int, int], float] = {k: 0.0 for k in keys}
    conflicts: list[DraftStockConflict] = []

    product_ids = {int(p.product_id) for p in picks}
    location_ids = {int(p.location_id) for p in picks}
    product_cache: dict[int, Product | None] = {
        int(r.id): r
        for r in db.query(Product).filter(Product.id.in_(list(product_ids))).all()
    }
    location_cache: dict[int, Location | None] = {
        int(r.id): r
        for r in db.query(Location).filter(Location.id.in_(list(location_ids))).all()
    }

    for pick in picks:
        pid = int(pick.product_id)
        lid = int(pick.location_id)
        key = (pid, lid)
        oid = int(pick.order_id) if getattr(pick, "order_id", None) is not None else None
        foreign = _foreign(pid, lid, oid)
        need = float(pick.quantity or 0)
        avail = max(0.0, float(on_hand_base[key]) - float(foreign) - float(claimed.get(key, 0.0)))
        if need > avail + 1e-9:
            prow = product_cache.get(pid)
            loc = location_cache.get(lid)
            name = (getattr(prow, "name", None) or "").strip() if prow is not None else ""
            if not name:
                name = f"produkt #{pid}"
            sku = None
            ean = None
            if prow is not None:
                raw_sku = getattr(prow, "sku", None) or getattr(prow, "symbol", None)
                sku = str(raw_sku).strip() if raw_sku else None
                ean = (getattr(prow, "ean", None) or "").strip() or None
            loc_code = ""
            if loc is not None:
                loc_code = (getattr(loc, "name", None) or getattr(loc, "code", None) or "").strip()
            if not loc_code:
                loc_code = f"#{lid}"
            conflicts.append(
                DraftStockConflict(
                    pick_id=int(pick.id),
                    order_id=int(pick.order_id),
                    order_item_id=(
                        int(pick.order_item_id) if getattr(pick, "order_item_id", None) is not None else None
                    ),
                    product_id=pid,
                    product_name=name,
                    sku=sku,
                    ean=ean,
                    location_id=lid,
                    location_code=loc_code,
                    picked_qty=float(need),
                    available_qty=float(avail),
                    cart_id=int(pick.cart_id) if getattr(pick, "cart_id", None) is not None else None,
                    picking_session_id=(
                        int(picking_session_id) if picking_session_id is not None else None
                    ),
                )
            )
            continue
        claimed[key] = float(claimed.get(key, 0.0)) + need

    return conflicts


def correlation_for_draft_stock_conflict(*, pick_id: int) -> str:
    return f"wms-draft-stock-conflict:{int(pick_id)}"[:64]


def emit_draft_stock_conflicts_once(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    conflicts: Sequence[DraftStockConflict],
    operator_user_id: Optional[int] = None,
) -> int:
    """
    Emit WMS_PICKING_DRAFT_STOCK_CONFLICT once per pick_id (Activity + wms_order_events).
    Returns number of newly written events.
    """
    if not conflicts:
        return 0
    from .activity_log.domain_activity import find_activity_by_correlation
    from .wms_audit_service import emit_wms_picking_draft_stock_conflict

    written = 0
    for c in conflicts:
        corr = correlation_for_draft_stock_conflict(pick_id=int(c.pick_id))
        if find_activity_by_correlation(db, correlation_id=corr, tenant_id=int(tenant_id)):
            continue
        emit_wms_picking_draft_stock_conflict(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            conflict=c,
            operator_user_id=operator_user_id,
            correlation_id=corr,
        )
        written += 1
    return written
