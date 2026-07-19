"""
Cofnięcie draft Picków sesji (picked_at IS NULL) — bez zmiany Inventory.

Stock spada dopiero przy finalize wózka; undo to usunięcie Pick + PICK fulfillment events.
"""

from __future__ import annotations

import logging
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.order import Order
from ...models.pick import Pick
from ...models.product import Product
from ..fulfillment_event_service import delete_pick_events_for_pick_ids
from ..order_fulfillment_recompute import recompute_order_fulfillment

logger = logging.getLogger(__name__)


class UndoPickError(ValueError):
    def __init__(self, message: str, *, code: str = "UNDO_PICK_FAILED") -> None:
        super().__init__(message)
        self.code = code


def _sync_pick_event_qty(db: Session, pick: Pick) -> None:
    import json

    from ...models.fulfillment_event import FE_PICK, FulfillmentEvent
    from ..fulfillment_event_service import sync_pick_fulfillment_traceability

    if pick.order_item_id is None:
        return
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(pick.order_item_id),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    for ev in rows:
        try:
            m = json.loads(ev.metadata_json or "{}")
        except json.JSONDecodeError:
            m = {}
        if not isinstance(m, dict):
            m = {}
        if int(m.get("pick_id") or 0) != int(pick.id):
            continue
        ev.quantity = float(pick.quantity or 0)
        sync_pick_fulfillment_traceability(db, pick)
        break


def _draft_picks_q(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    product_id: int,
    location_id: int | None,
    order_ids: Sequence[int] | None,
    order_item_id: int | None = None,
):
    q = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.cart_id == int(cart_id),
            Pick.product_id == int(product_id),
            Pick.picked_at.is_(None),
        )
        .order_by(Pick.id.desc())
    )
    if location_id is not None:
        q = q.filter(Pick.location_id == int(location_id))
    if order_ids:
        q = q.filter(Pick.order_id.in_([int(x) for x in order_ids]))
    if order_item_id is not None:
        q = q.filter(Pick.order_item_id == int(order_item_id))
    return q


def undo_wms_session_picks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int,
    product_id: int,
    quantity: float,
    location_id: int | None = None,
    order_ids: Sequence[int] | None = None,
    order_item_id: int | None = None,
    operator_user_id: int | None = None,
    undo_all: bool = False,
) -> dict:
    """
    Cofa do ``quantity`` szt. draft picków (LIFO po ``Pick.id``).

    ``undo_all=True`` — cofa wszystkie dopasowane drafty (``quantity`` ignorowane gdy > 0).
    Nie zmienia ``Inventory.quantity``.
    """
    qty = float(quantity or 0)
    if not undo_all and qty <= 1e-9:
        raise UndoPickError("Ilość cofnięcia musi być > 0.", code="UNDO_QTY_INVALID")

    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise UndoPickError("Nie znaleziono wózka sesji.", code="CART_NOT_FOUND")

    picks = _draft_picks_q(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        cart_id=cart_id,
        product_id=product_id,
        location_id=location_id,
        order_ids=order_ids,
        order_item_id=order_item_id,
    ).all()
    available = sum(float(p.quantity or 0) for p in picks)
    if available <= 1e-9:
        return {
            "ok": True,
            "undone_qty": 0.0,
            "deleted_pick_ids": [],
            "order_ids": [],
            "location_id": int(location_id) if location_id is not None else None,
            "inventory_unchanged": True,
        }
    if undo_all:
        qty = available
    elif available + 1e-9 < qty:
        raise UndoPickError(
            f"Nie można cofnąć {qty:g} szt. — w sesji jest tylko {available:g} szt. draft picków.",
            code="UNDO_INSUFFICIENT_PICKS",
        )

    remaining = qty
    deleted_ids: list[int] = []
    undone_by_order: dict[int, float] = {}
    location_used: int | None = None
    sample_order_id: int | None = None
    sample_order_item_id: int | None = None

    for p in picks:
        if remaining <= 1e-9:
            break
        pq = float(p.quantity or 0)
        if pq <= 1e-9:
            continue
        take = min(pq, remaining)
        oid = int(p.order_id)
        sample_order_id = oid
        if p.order_item_id is not None:
            sample_order_item_id = int(p.order_item_id)
        location_used = int(p.location_id)
        if take + 1e-9 >= pq:
            deleted_ids.append(int(p.id))
            db.delete(p)
            undone_by_order[oid] = undone_by_order.get(oid, 0.0) + pq
            remaining = max(0.0, remaining - pq)
        else:
            # Częściowe cofnięcie jednego rekordu Pick — zmniejsz quantity + event qty
            p.quantity = round(pq - take, 6)
            _sync_pick_event_qty(db, p)
            undone_by_order[oid] = undone_by_order.get(oid, 0.0) + take
            remaining = 0.0

    if deleted_ids:
        delete_pick_events_for_pick_ids(db, deleted_ids)

    for oid in undone_by_order:
        recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=int(cart_id))

    undone_total = round(sum(undone_by_order.values()), 6)
    from ..wms_audit_service import emit_wms_pick_undone

    if sample_order_id is not None and undone_total > 1e-9:
        emit_wms_pick_undone(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(sample_order_id),
            order_item_id=sample_order_item_id,
            product_id=int(product_id),
            location_id=location_used,
            cart_id=int(cart_id),
            quantity=float(undone_total),
            operator_user_id=operator_user_id,
        )

    logger.info(
        "[wms.undo_pick] cart_id=%s product_id=%s qty=%s deleted_picks=%s orders=%s",
        cart_id,
        product_id,
        undone_total,
        deleted_ids,
        list(undone_by_order.keys()),
    )
    return {
        "ok": True,
        "undone_qty": undone_total,
        "deleted_pick_ids": deleted_ids,
        "order_ids": list(undone_by_order.keys()),
        "location_id": location_used,
        "inventory_unchanged": True,
    }


def undo_wms_pick_by_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    pick_id: int,
    cart_id: int | None = None,
    operator_user_id: int | None = None,
    audit_reason: str = "LEGACY_LOCATION_CORRECTION",
) -> dict:
    """
    Undo exactly one draft Pick by id (MULTI recovery).

    - Inventory unchanged (stock only deducted at finalize).
    - Shortage untouched.
    - Other picks / order_items untouched.
    """
    pick = (
        db.query(Pick)
        .filter(Pick.id == int(pick_id))
        .with_for_update()
        .first()
    )
    if pick is None:
        raise UndoPickError("Nie znaleziono pobrania.", code="PICK_NOT_FOUND")
    if int(pick.tenant_id) != int(tenant_id) or int(pick.warehouse_id or 0) != int(warehouse_id):
        raise UndoPickError("Pobranie nie należy do tego magazynu.", code="PICK_WRONG_SCOPE")
    if cart_id is not None and int(pick.cart_id or 0) != int(cart_id):
        raise UndoPickError("Pobranie nie należy do aktywnego wózka.", code="PICK_WRONG_CART")
    if pick.picked_at is not None:
        raise UndoPickError(
            "Nie można cofnąć sfinalizowanego pobrania — stock został już zdjęty.",
            code="PICK_ALREADY_FINALIZED",
        )

    cart = (
        db.query(Cart)
        .filter(
            Cart.id == int(pick.cart_id),
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if cart is None:
        raise UndoPickError("Nie znaleziono wózka sesji.", code="CART_NOT_FOUND")

    undone_qty = float(pick.quantity or 0)
    oid = int(pick.order_id)
    oiid = int(pick.order_item_id) if pick.order_item_id is not None else None
    lid = int(pick.location_id)
    pid = int(pick.product_id)
    cid = int(pick.cart_id)
    deleted_id = int(pick.id)

    # Bulk delete avoids ORM cascade lazy-load of pick_wave_items (optional table).
    db.query(Pick).filter(Pick.id == deleted_id).delete(synchronize_session="fetch")
    delete_pick_events_for_pick_ids(db, [deleted_id])
    recompute_order_fulfillment(db, oid, commit=False, session_cart_id=cid)

    from ..wms_audit_service import emit_wms_pick_undone

    if undone_qty > 1e-9:
        emit_wms_pick_undone(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=oid,
            order_item_id=oiid,
            product_id=pid,
            location_id=lid,
            cart_id=cid,
            quantity=float(undone_qty),
            operator_user_id=operator_user_id,
        )

    logger.info(
        "[wms.undo_pick_by_id] pick_id=%s cart_id=%s product_id=%s qty=%s reason=%s",
        deleted_id,
        cid,
        pid,
        undone_qty,
        audit_reason,
    )
    return {
        "ok": True,
        "undone_qty": round(undone_qty, 6),
        "deleted_pick_ids": [deleted_id],
        "pick_id": deleted_id,
        "order_id": oid,
        "order_item_id": oiid,
        "order_ids": [oid],
        "product_id": pid,
        "location_id": lid,
        "cart_id": cid,
        "inventory_unchanged": True,
        "shortage_unchanged": True,
        "reason": audit_reason,
    }
