"""
Operacyjny rollback sesji zbierania (MULTI / cart) przed zwolnieniem wózka.

HARD RULES:
- ``Inventory`` = stan LOKALIZACJI (product+warehouse+location[+lot]).
  Globalny stock produktu = suma Inventory — nie mutujemy go poza dokładnym
  odwróceniem wcześniejszego dekrementu lokalizacji (finalized picks).
- Draft Pick (``picked_at IS NULL``): NIE zwiększa Inventory przy cancel
  (picking nigdy nie odjął stanu lokalizacji).
- Finalized Pick (``picked_at`` set): przywraca dokładnie ``Pick.location_id``
  (+ batch z Pick) — bez dokumentu PZ/PW/WZ.
- Shortage: usuwa wyłącznie FE_MISSING z ``metadata.cart_id`` == anulowany cart
  (cartless: ``picking_session_id``).
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any, Sequence

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.cart_basket import CartBasket
from ...models.fulfillment_event import FE_MISSING, FulfillmentEvent
from ...models.inventory import Inventory
from ...models.location import Location
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.order_issue_task import OrderIssueTask
from ...models.order_issue_task_item import OrderIssueTaskItem
from ...models.pick import Pick
from ...models.product import Product
from ...models.wms_operation_session import WmsOperationSession
from ..fulfillment_event_service import delete_pick_events_for_pick_ids
from ..order_fulfillment_recompute import recompute_order_fulfillment
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION

logger = logging.getLogger(__name__)

SENTINEL_EXPIRY = date(9999, 12, 31)


def _meta(ev: FulfillmentEvent) -> dict[str, Any]:
    try:
        m = json.loads(ev.metadata_json or "{}")
    except json.JSONDecodeError:
        return {}
    return m if isinstance(m, dict) else {}


def _product_labels(db: Session, product_id: int) -> tuple[str, str | None]:
    try:
        nested = db.begin_nested()
        try:
            pr = db.query(Product).filter(Product.id == int(product_id)).first()
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        return f"#{product_id}", None
    if pr is None:
        return f"#{product_id}", None
    name = str(
        getattr(pr, "name", None)
        or getattr(pr, "sku", None)
        or getattr(pr, "symbol", None)
        or f"#{product_id}"
    ).strip()
    ean = str(getattr(pr, "ean", None) or "").strip() or None
    return name, ean


def _loc_label(db: Session, location_id: int | None) -> str | None:
    if location_id is None:
        return None
    try:
        nested = db.begin_nested()
        try:
            loc = db.query(Location).filter(Location.id == int(location_id)).first()
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        return f"#{location_id}"
    if loc is None:
        return None
    return str(getattr(loc, "name", None) or getattr(loc, "code", None) or f"#{location_id}")


def _basket_code_for_order(db: Session, order: Order, cart: Cart | None) -> str | None:
    bid = getattr(order, "basket_id", None)
    basket = None
    if bid is not None:
        basket = db.query(CartBasket).filter(CartBasket.id == int(bid)).first()
    elif cart is not None:
        for b in list(getattr(cart, "baskets", None) or []):
            if getattr(b, "order_id", None) is not None and int(b.order_id) == int(order.id):
                basket = b
                break
    if basket is None:
        return None
    name = str(getattr(basket, "name", None) or "").strip()
    if name:
        return name
    barcode = str(getattr(basket, "barcode", None) or "").strip()
    if barcode:
        return barcode
    row = getattr(basket, "row", None)
    col = getattr(basket, "column", None)
    if row is not None and col is not None:
        return f"S-{int(row)}-{int(col)}"
    return f"#{int(basket.id)}"


def _restore_location_qty_for_finalized_pick(db: Session, pick: Pick) -> dict[str, Any]:
    """
    Odwróć dekrement Inventory dla sfinalizowanego Pick.
    Provenance: Pick.location_id (+ batch_number / expiry z Pick).
    Bez StockDocument / PZ / PW / WZ.
    """
    from ..inventory_lot_keys import normalize_batch_number

    qty = float(pick.quantity or 0)
    if qty <= 1e-12:
        return {"restored_qty": 0.0, "inventory_id": None}
    tid = int(pick.tenant_id)
    wid = int(pick.warehouse_id or 0)
    pid = int(pick.product_id)
    lid = int(pick.location_id)
    batch = normalize_batch_number(getattr(pick, "batch_number", None) or "")
    exp = getattr(pick, "expiry_date", None) or SENTINEL_EXPIRY

    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == tid,
            Inventory.warehouse_id == wid,
            Inventory.product_id == pid,
            Inventory.location_id == lid,
            Inventory.stock_disposition == DEFAULT_STOCK_DISPOSITION,
        )
        .with_for_update()
        .all()
    )
    match = None
    for inv in rows:
        if normalize_batch_number(getattr(inv, "batch_number", None)) == batch:
            inv_exp = getattr(inv, "expiry_date", None) or SENTINEL_EXPIRY
            if inv_exp == exp:
                match = inv
                break
    if match is None and rows:
        # Fallback: same location+product — prefer empty batch row, else first
        for inv in rows:
            if normalize_batch_number(getattr(inv, "batch_number", None)) == batch:
                match = inv
                break
        if match is None:
            match = rows[0]
    if match is None:
        match = Inventory(
            tenant_id=tid,
            warehouse_id=wid,
            product_id=pid,
            location_id=lid,
            quantity=0.0,
            batch_number=batch or "",
            expiry_date=exp,
            stock_disposition=DEFAULT_STOCK_DISPOSITION,
        )
        db.add(match)
        db.flush()
    match.quantity = float(match.quantity or 0) + qty
    db.add(match)
    return {
        "restored_qty": round(qty, 6),
        "inventory_id": int(match.id) if getattr(match, "id", None) else None,
        "location_id": lid,
        "product_id": pid,
    }


def _delete_session_missing_events(
    db: Session,
    *,
    order_item_ids: Sequence[int],
    cart_id: int | None,
    picking_session_id: int | None,
) -> list[dict[str, Any]]:
    """Usuń FE_MISSING wyłącznie z provenance sesji (cart_id / picking_session_id)."""
    if not order_item_ids:
        return []
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id.in_([int(x) for x in order_item_ids]),
            FulfillmentEvent.type == FE_MISSING,
        )
        .all()
    )
    rolled: list[dict[str, Any]] = []
    to_delete: list[int] = []
    cid = int(cart_id) if cart_id is not None else None
    sid = int(picking_session_id) if picking_session_id is not None else None
    for ev in rows:
        m = _meta(ev)
        ev_cid = 0
        ev_sid = 0
        try:
            ev_cid = int(m.get("cart_id") or 0)
        except (TypeError, ValueError):
            ev_cid = 0
        try:
            ev_sid = int(m.get("picking_session_id") or 0)
        except (TypeError, ValueError):
            ev_sid = 0
        match = False
        if cid is not None and cid > 0 and ev_cid == cid:
            match = True
        if sid is not None and sid > 0 and ev_sid == sid:
            match = True
        if not match:
            continue
        to_delete.append(int(ev.id))
        rolled.append(
            {
                "fulfillment_event_id": int(ev.id),
                "order_item_id": int(ev.order_item_id),
                "quantity": float(ev.quantity or 0),
                "product_id": m.get("product_id"),
                "order_id": m.get("order_id"),
            }
        )
    if to_delete:
        db.query(FulfillmentEvent).filter(FulfillmentEvent.id.in_(to_delete)).delete(
            synchronize_session=False
        )
    return rolled


def _cancel_issue_items_for_cart(
    db: Session,
    *,
    order_ids: Sequence[int],
    cart_id: int,
    operator_user_id: int | None,
) -> list[int]:
    """Anuluj linie Braki z source_picking_cart_id == cart; sync/resolve tasków."""
    from ..order_issue_task_lifecycle import (
        maybe_auto_resolve_issue_task,
        recompute_task_aggregate_from_items,
        resolve_operational_shortage_task,
        sync_task_items_from_order,
    )

    cid = int(cart_id)
    cancelled_item_ids: list[int] = []
    items = (
        db.query(OrderIssueTaskItem)
        .filter(OrderIssueTaskItem.source_picking_cart_id == cid)
        .all()
    )
    now_touch = False
    for item in items:
        if item.status in ("CANCELLED", "SKIPPED", "REPLACED"):
            continue
        item.status = "CANCELLED"
        item.missing_qty = 0.0
        item.updated_at = datetime.utcnow()
        cancelled_item_ids.append(int(item.id))
        now_touch = True

    if not order_ids and not now_touch:
        return cancelled_item_ids

    tasks = (
        db.query(OrderIssueTask)
        .filter(
            OrderIssueTask.order_id.in_([int(x) for x in order_ids]),
            OrderIssueTask.status.in_(("OPEN", "IN_PROGRESS", "WAITING_RECOVERY")),
        )
        .all()
    )
    for task in tasks:
        order = db.query(Order).filter(Order.id == int(task.order_id)).first()
        if order is None:
            continue
        sync_task_items_from_order(db, task, order)
        recompute_task_aggregate_from_items(db, task)
        maybe_auto_resolve_issue_task(
            db, task, order, operator_user_id=operator_user_id
        )
        # Jeśli po sync nadal OPEN, ale wszystkie linie z tego cartu anulowane —
        # zamknij gdy order nie wymaga już braków.
        from ..order_fulfillment_recompute import order_requires_shortage_handling

        if not order_requires_shortage_handling(db, order):
            if task.status in ("OPEN", "IN_PROGRESS", "WAITING_RECOVERY"):
                resolve_operational_shortage_task(
                    db,
                    task,
                    status="RESOLVED",
                    reason="Anulowano zbieranie — braki sesji wycofane",
                    operator_user_id=operator_user_id,
                )
    return cancelled_item_ids


def rollback_wms_picking_session_mutations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    cart_id: int | None,
    picking_session_id: int | None,
    orders: Sequence[Order],
    operator_user_id: int | None = None,
    cart: Cart | None = None,
    sess: WmsOperationSession | None = None,
) -> dict[str, Any]:
    """
    Atomowy (w transakcji wywołującego) rollback mutacji sesji:
    draft picks, session shortages, issue tasks, basket-put pending.
    """
    cid = int(cart_id) if cart_id is not None else None
    sid = int(picking_session_id) if picking_session_id is not None else None
    order_ids = [int(o.id) for o in orders]
    order_by_id = {int(o.id): o for o in orders}

    # Idempotency marker on session meta
    if sess is not None:
        try:
            meta = json.loads(sess.metadata_json or "{}")
        except json.JSONDecodeError:
            meta = {}
        if not isinstance(meta, dict):
            meta = {}
        if meta.get("cancel_rollback_done") is True:
            return {
                "idempotent": True,
                "draft_picks_deleted": 0,
                "finalized_picks_restored": 0,
                "location_qty_restored": 0.0,
                "shortages_rolled_back": [],
                "put_back_required": [],
                "global_stock_mutated": False,
                "location_stock_restored": False,
            }

    # --- Collect picks for this session ---
    # NEVER use inspect(db.get_bind()).has_table() — on SQLite it closes/rollbacks
    # the session connection and undoes in-flight mutations.
    # Optional/missing tables: always use SAVEPOINT so OperationalError cannot
    # leave the Session in PendingRollbackError.
    picks: list[Pick] = []
    try:
        nested = db.begin_nested()
        try:
            pick_q = db.query(Pick).filter(
                Pick.tenant_id == int(tenant_id),
                Pick.warehouse_id == int(warehouse_id),
            )
            if cid is not None and cid > 0:
                pick_q = pick_q.filter(Pick.cart_id == cid)
            else:
                pick_q = pick_q.filter(Pick.cart_id.is_(None))
                if order_ids:
                    pick_q = pick_q.filter(Pick.order_id.in_(order_ids))
                else:
                    pick_q = pick_q.filter(False)
            picks = pick_q.order_by(Pick.id.asc()).all()
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception("cancel_rollback: pick query failed — treating as no picks")
        picks = []

    draft_picks = [p for p in picks if getattr(p, "picked_at", None) is None]
    finalized_picks = [p for p in picks if getattr(p, "picked_at", None) is not None]

    put_back: list[dict[str, Any]] = []
    undone_picks_audit: list[dict[str, Any]] = []
    location_restored_total = 0.0
    location_restore_rows: list[dict[str, Any]] = []

    for p in draft_picks:
        pname, ean = _product_labels(db, int(p.product_id))
        loc = _loc_label(db, int(p.location_id))
        qty = float(p.quantity or 0)
        entry = {
            "pick_id": int(p.id),
            "product_id": int(p.product_id),
            "product_name": pname,
            "ean": ean,
            "quantity": qty,
            "location_id": int(p.location_id),
            "source_location": loc,
            "order_id": int(p.order_id),
            "order_item_id": int(p.order_item_id) if p.order_item_id else None,
            "kind": "draft_pick_record_cleared",
            "location_stock_restored": False,
        }
        undone_picks_audit.append(entry)
        if qty > 1e-9:
            put_back.append(
                {
                    "product_id": int(p.product_id),
                    "product_name": pname,
                    "ean": ean,
                    "quantity": qty,
                    "location_id": int(p.location_id),
                    "source_location": loc,
                    "order_id": int(p.order_id),
                    "note": "Produkt mógł zostać fizycznie zdjęty — odłóż na lokalizację źródłową. "
                    "Stan lokalizacji w systemie nie był zmniejszony (draft).",
                }
            )

    for p in finalized_picks:
        pname, ean = _product_labels(db, int(p.product_id))
        loc = _loc_label(db, int(p.location_id))
        restore = _restore_location_qty_for_finalized_pick(db, p)
        location_restored_total += float(restore.get("restored_qty") or 0)
        location_restore_rows.append(restore)
        qty = float(p.quantity or 0)
        undone_picks_audit.append(
            {
                "pick_id": int(p.id),
                "product_id": int(p.product_id),
                "product_name": pname,
                "ean": ean,
                "quantity": qty,
                "location_id": int(p.location_id),
                "source_location": loc,
                "order_id": int(p.order_id),
                "order_item_id": int(p.order_item_id) if p.order_item_id else None,
                "kind": "location_stock_restored",
                "location_stock_restored": True,
            }
        )
        if qty > 1e-9:
            put_back.append(
                {
                    "product_id": int(p.product_id),
                    "product_name": pname,
                    "ean": ean,
                    "quantity": qty,
                    "location_id": int(p.location_id),
                    "source_location": loc,
                    "order_id": int(p.order_id),
                    "note": "Stan lokalizacji przywrócony w systemie — potwierdź fizyczne odłożenie.",
                }
            )

    deleted_pick_ids = [int(p.id) for p in picks]
    if deleted_pick_ids:
        # Persist location restores (finalized path) before session expire.
        db.flush()
        # Delete allocations first (FK), then pick events, then picks
        # Optional tables: use SAVEPOINT so a missing-table error cannot
        # invalidate the outer SQLite transaction (and undo Pick DELETE).
        try:
            nested = db.begin_nested()
            try:
                from ...models.order_item_pick_allocation import OrderItemPickAllocation

                db.query(OrderItemPickAllocation).filter(
                    OrderItemPickAllocation.pick_id.in_(deleted_pick_ids)
                ).delete(synchronize_session=False)
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            logger.exception("cancel_rollback: pick allocation cleanup skipped")
        try:
            nested = db.begin_nested()
            try:
                delete_pick_events_for_pick_ids(db, deleted_pick_ids)
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            logger.exception("cancel_rollback: pick event cleanup skipped")
        for o in orders:
            try:
                db.expire(o, ["picks"])
            except Exception:
                pass
        for p in list(picks):
            try:
                if p in db:
                    db.expunge(p)
            except Exception:
                pass
        from sqlalchemy import delete as sa_delete
        from sqlalchemy.orm.attributes import set_committed_value

        db.execute(sa_delete(Pick).where(Pick.id.in_(deleted_pick_ids)))
        for obj in list(db.identity_map.values()):
            try:
                if isinstance(obj, (Order, Product)):
                    set_committed_value(obj, "picks", [])
                if isinstance(obj, Cart):
                    set_committed_value(obj, "wms_picks", [])
            except Exception:
                pass
        for p in list(picks):
            try:
                if p in db:
                    db.expunge(p)
            except Exception:
                pass
        db.flush()

    # --- Shortage rollback (session provenance only) ---
    oi_ids: list[int] = []
    shortage_events: list[dict[str, Any]] = []
    try:
        nested = db.begin_nested()
        try:
            if order_ids:
                oi_rows = (
                    db.query(OrderItem.id)
                    .filter(OrderItem.order_id.in_(order_ids))
                    .all()
                )
                oi_ids = [int(r[0]) for r in oi_rows]
            if oi_ids:
                shortage_events = _delete_session_missing_events(
                    db,
                    order_item_ids=oi_ids,
                    cart_id=cid,
                    picking_session_id=sid,
                )
                from ..fulfillment_event_service import sync_declared_shortage_column_from_missing_events

                for se in shortage_events:
                    oiid = int(se["order_item_id"])
                    sync_declared_shortage_column_from_missing_events(db, oiid)
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception("cancel_rollback: shortage rollback skipped")
        shortage_events = []
        oi_ids = []

    shortage_audit: list[dict[str, Any]] = []
    for se in shortage_events:
        oiid = int(se["order_item_id"])
        oi = None
        try:
            nested = db.begin_nested()
            try:
                oi = db.query(OrderItem).filter(OrderItem.id == oiid).first()
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            oi = None
        oid = int(oi.order_id) if oi is not None else int(se.get("order_id") or 0)
        o = order_by_id.get(oid)
        if o is None and oid:
            try:
                o = db.query(Order).filter(Order.id == oid).first()
            except Exception:
                o = None
        pname, ean = ("?", None)
        if oi is not None:
            try:
                pname, ean = _product_labels(db, int(oi.product_id))
            except Exception:
                pname = f"#{oi.product_id}"
        basket = None
        if o is not None:
            try:
                basket = _basket_code_for_order(db, o, cart)
            except Exception:
                basket = None
        shortage_audit.append(
            {
                "order_id": oid,
                "order_number": str(getattr(o, "number", None) or f"#{oid}") if o else f"#{oid}",
                "basket": basket,
                "order_item_id": oiid,
                "product_id": int(oi.product_id) if oi else se.get("product_id"),
                "product_name": pname,
                "ean": ean,
                "quantity": float(se["quantity"]),
            }
        )

    for oid in order_ids:
        try:
            nested = db.begin_nested()
            try:
                recompute_order_fulfillment(
                    db,
                    int(oid),
                    commit=False,
                    session_cart_id=cid if cid else None,
                )
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            logger.exception("cancel_rollback: recompute failed order_id=%s", oid)

    issue_cancelled: list[int] = []
    if cid is not None and cid > 0:
        try:
            nested = db.begin_nested()
            try:
                issue_cancelled = _cancel_issue_items_for_cart(
                    db,
                    order_ids=order_ids,
                    cart_id=cid,
                    operator_user_id=operator_user_id,
                )
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            logger.exception("cancel_rollback: issue task cleanup skipped cart_id=%s", cid)

    # Clear pending basket put / active series on open session
    if sess is not None and cart is not None:
        try:
            nested = db.begin_nested()
            try:
                from ..wms_basket_put import clear_basket_put_state

                clear_basket_put_state(db, cart=cart, reason="cancel_picking")
                nested.commit()
            except Exception:
                nested.rollback()
                raise
        except Exception:
            logger.exception("clear_basket_put_state on cancel failed cart_id=%s", cid)

    if sess is not None:
        try:
            meta = json.loads(sess.metadata_json or "{}")
        except json.JSONDecodeError:
            meta = {}
        if not isinstance(meta, dict):
            meta = {}
        meta["cancel_rollback_done"] = True
        meta["cancel_rollback"] = {
            "draft_picks_deleted": len(draft_picks),
            "finalized_restored": len(finalized_picks),
            "shortages": len(shortage_audit),
            "put_back_lines": len(put_back),
        }
        sess.metadata_json = json.dumps(meta, ensure_ascii=False)
        db.add(sess)

    # Aggregate put_back by location+product for audit readability
    put_agg: dict[tuple[int, int], dict[str, Any]] = {}
    for row in put_back:
        key = (int(row["location_id"]), int(row["product_id"]))
        if key not in put_agg:
            put_agg[key] = dict(row)
        else:
            put_agg[key]["quantity"] = float(put_agg[key]["quantity"]) + float(row["quantity"])

    result = {
        "idempotent": False,
        "draft_picks_deleted": len(draft_picks),
        "finalized_picks_restored": len(finalized_picks),
        "deleted_pick_ids": deleted_pick_ids,
        "location_qty_restored": round(location_restored_total, 6),
        "location_restore_rows": location_restore_rows,
        "location_stock_restored": location_restored_total > 1e-9,
        "global_stock_mutated": False,  # no StockDocument; sum(Inventory) only if we restored locations
        "shortages_rolled_back": shortage_audit,
        "undone_picks": undone_picks_audit,
        "put_back_required": list(put_agg.values()),
        "issue_task_items_cancelled": issue_cancelled,
        "physical_return_task_created": False,
        "physical_return_model": (
            "informational_put_back_list"
            if put_back and not finalized_picks
            else ("location_restored_plus_put_back" if finalized_picks else "none")
        ),
    }
    logger.info(
        "[wms.cancel_rollback] cart_id=%s session_id=%s drafts=%s finalized=%s "
        "shortage_events=%s loc_restored=%s put_back=%s",
        cid,
        sid,
        len(draft_picks),
        len(finalized_picks),
        len(shortage_audit),
        location_restored_total,
        len(put_back),
    )
    return result
