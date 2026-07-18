"""Fulfillment events ledger: sums and helpers (single source vs. Pick rows for inventory)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.fulfillment_event import FE_MISSING, FE_PICK, FE_REMOVED, FE_REPLACED, FE_WAITING, FulfillmentEvent
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.pick import Pick


def _meta(ev: FulfillmentEvent) -> dict[str, Any]:
    raw = getattr(ev, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        m = json.loads(raw)
        return m if isinstance(m, dict) else {}
    except json.JSONDecodeError:
        return {}


def _coerce_event_qty(v: Any) -> float:
    """Normalize SQL aggregate scalar to float (None / int / float / Decimal)."""
    if v is None or isinstance(v, bool):
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    from decimal import Decimal

    if isinstance(v, Decimal):
        return float(v)
    raise TypeError(f"unexpected event quantity type: {type(v).__name__}")


def append_event(
    db: Session,
    *,
    order_item_id: int,
    event_type: str,
    quantity: float,
    metadata: Optional[dict[str, Any]] = None,
) -> FulfillmentEvent:
    """Kanoniczny zapis zdarzenia fulfillment (bez flush — widoczność write→read w sum_*)."""
    q = float(quantity or 0.0)
    row = FulfillmentEvent(
        order_item_id=int(order_item_id),
        type=str(event_type).strip().upper()[:32],
        quantity=q,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
    )
    db.add(row)
    return row


def sum_line_events(db: Session, order_item_id: int, event_type: str) -> float:
    """
    Suma ilości zdarzeń danego typu na linii.

    SSOT widoczności przy ``SessionLocal(autoflush=False)``: flush przed agregacją,
    żeby pending ``db.add`` (np. FE_MISSING) było widoczne w SUM w tej samej transakcji.
    """
    db.flush()
    v = (
        db.query(func.coalesce(func.sum(FulfillmentEvent.quantity), 0.0))
        .filter(
            FulfillmentEvent.order_item_id == int(order_item_id),
            FulfillmentEvent.type == str(event_type).strip().upper()[:32],
        )
        .scalar()
    )
    return _coerce_event_qty(v)


def sum_missing_events_for_line_cart(db: Session, order_item_id: int, cart_id: int) -> float:
    """Suma zdarzeń MISSING dla linii w sesji wózka (``metadata.cart_id``; legacy bez cart_id też liczy)."""
    db.flush()
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(order_item_id),
            FulfillmentEvent.type == FE_MISSING,
        )
        .all()
    )
    cid = int(cart_id)
    s = 0.0
    for ev in rows:
        m = _meta(ev)
        ev_cid = 0
        try:
            ev_cid = int(m.get("cart_id") or 0)
        except (TypeError, ValueError):
            ev_cid = 0
        if ev_cid == 0 or ev_cid == cid:
            s += float(ev.quantity or 0.0)
    return float(s)


def delete_line_events_of_type(db: Session, order_item_id: int, event_type: str) -> None:
    db.query(FulfillmentEvent).filter(
        FulfillmentEvent.order_item_id == int(order_item_id),
        FulfillmentEvent.type == str(event_type).strip().upper()[:32],
    ).delete(synchronize_session=False)


def _pick_row_for_event(db: Session, ev: FulfillmentEvent) -> Pick | None:
    pid = int(_meta(ev).get("pick_id") or 0)
    if pid <= 0:
        return None
    return db.query(Pick).filter(Pick.id == pid).first()


def _effective_cart_id_for_pick_event(db: Session, ev: FulfillmentEvent) -> int | None:
    """``metadata.cart_id`` → ``Pick.cart_id`` → ``Order.cart_id`` (race przy flush)."""
    m = _meta(ev)
    raw = m.get("cart_id")
    if raw is not None:
        try:
            if int(raw) > 0:
                return int(raw)
        except (TypeError, ValueError):
            pass
    pk = _pick_row_for_event(db, ev)
    if pk is not None and pk.cart_id is not None:
        return int(pk.cart_id)
    if pk is not None and pk.order_id:
        ord_row = db.query(Order).filter(Order.id == int(pk.order_id)).first()
        if ord_row is not None and getattr(ord_row, "cart_id", None) is not None:
            return int(ord_row.cart_id)
    return None


def _pick_event_is_finalized(db: Session, ev: FulfillmentEvent, pick: Pick | None) -> bool:
    if bool(_meta(ev).get("finalized")):
        return True
    if pick is not None and getattr(pick, "picked_at", None) is not None:
        return True
    return False


def _pick_event_includes_for_issue(db: Session, ev: FulfillmentEvent, order: Order) -> bool:
    """
    Jedna semantyka z walidacją ``finalize-cart`` / ``sum_pick_events_for_line_cart``:
    dopasowanie do ``order.cart_id`` przez meta **albo** rekord Pick (naprawia puste ``cart_id`` w JSON).
    Gdy zamówienie nie ma już ``cart_id``: widoczne są picki zrekonsyliowane przez Pick dla tego zamówienia
    lub zdarzenia domknięte (``finalized`` / ``picked_at``).
    """
    if (ev.type or "").strip().upper() != FE_PICK:
        return False
    meta = _meta(ev)
    pick = _pick_row_for_event(db, ev)
    oc = getattr(order, "cart_id", None)
    eff_cart = _effective_cart_id_for_pick_event(db, ev)

    if oc is not None and int(oc) > 0:
        if eff_cart is not None and int(eff_cart) == int(oc):
            return True
        try:
            if int(meta.get("cart_id") or 0) == int(oc):
                return True
        except (TypeError, ValueError):
            pass
        return False

    if _pick_event_is_finalized(db, ev, pick):
        return True
    if pick is not None and int(pick.order_id) == int(order.id):
        return True
    return False


def line_picked_sum_for_order(db: Session, order_item_id: int, order: Order) -> float:
    """Suma PICK dla linii — zgodna z rekordami Pick / sesją (nie wyłącznie JSON meta)."""
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(order_item_id),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    s = 0.0
    for ev in rows:
        if _pick_event_includes_for_issue(db, ev, order):
            s += float(ev.quantity or 0.0)
    return float(s)


def picked_location_breakdown_for_order_line(
    db: Session, order: Order, order_item_id: int
) -> list[tuple[str, float, str, str | None]]:
    """
    Suma PICK per lokalizacja z partią i datą ważności.
    Returns: (location_label, quantity, batch_number, expiry_iso_or_none).
    Preferuje ``order_item_pick_allocations``; fallback: Pick + FulfillmentEvent.
    """
    from datetime import date

    from .order_item_pick_allocation_service import allocation_breakdown_for_order_line

    alloc_rows = allocation_breakdown_for_order_line(db, int(order_item_id))
    if alloc_rows:
        out: list[tuple[str, float, str, str | None]] = []
        for lbl, qty, batch, exp in alloc_rows:
            exp_s = exp.isoformat() if exp is not None else None
            out.append((lbl, float(qty), batch, exp_s))
        return sorted(out, key=lambda x: (-x[1], x[0], x[2]))

    from ..models.location import Location

    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(order_item_id),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    keyed: dict[tuple[str, str, str | None], float] = {}
    for ev in rows:
        if not _pick_event_includes_for_issue(db, ev, order):
            continue
        meta = _meta(ev)
        pid = int(meta.get("pick_id") or 0)
        label = ""
        batch = (meta.get("batch_number") or "").strip()
        exp_raw = meta.get("expiry_date")
        exp_s: str | None = str(exp_raw).strip() if exp_raw else None
        if pid > 0:
            pick = db.query(Pick).filter(Pick.id == pid).first()
            if pick is not None:
                loc = db.query(Location).filter(Location.id == int(pick.location_id)).first()
                if loc is not None and (loc.name or "").strip():
                    label = str(loc.name).strip()
                if not batch:
                    batch = (pick.batch_number or "").strip()
                if not exp_s and pick.expiry_date is not None and pick.expiry_date < date(9999, 1, 1):
                    exp_s = pick.expiry_date.isoformat()
        if not label:
            continue
        key = (label, batch, exp_s)
        keyed[key] = keyed.get(key, 0.0) + float(ev.quantity or 0.0)
    return sorted(
        [(lbl, qty, batch, exp) for (lbl, batch, exp), qty in keyed.items()],
        key=lambda x: (-x[1], x[0], x[2]),
    )


def sum_pick_events_for_line_cart(db: Session, order_item_id: int, cart_id: int) -> float:
    db.flush()
    rows = (
        db.query(FulfillmentEvent)
        .filter(FulfillmentEvent.order_item_id == int(order_item_id), FulfillmentEvent.type == FE_PICK)
        .all()
    )
    cid = int(cart_id)
    pick_ids = list({int(_meta(ev).get("pick_id") or 0) for ev in rows if int(_meta(ev).get("pick_id") or 0) > 0})
    pick_map: dict[int, Pick] = {}
    if pick_ids:
        prs = db.query(Pick).filter(Pick.id.in_(list(dict.fromkeys(pick_ids)))).all()
        pick_map = {int(p.id): p for p in prs}
    order_cart_cache: dict[int, int | None] = {}

    def _order_cart_for_pick(oid: int) -> int | None:
        if oid not in order_cart_cache:
            ow = db.query(Order).filter(Order.id == int(oid)).first()
            order_cart_cache[oid] = int(ow.cart_id) if ow is not None and ow.cart_id else None
        return order_cart_cache[oid]

    s = 0.0
    for ev in rows:
        m = _meta(ev)
        if int(m.get("cart_id") or 0) == cid:
            s += float(ev.quantity or 0.0)
            continue
        pid = int(m.get("pick_id") or 0)
        pk = pick_map.get(pid)
        if pk is not None and pk.cart_id is not None and int(pk.cart_id) == cid:
            s += float(ev.quantity or 0.0)
            continue
        if pk is not None and pk.order_id:
            oc = _order_cart_for_pick(int(pk.order_id))
            if oc is not None and int(oc) == cid:
                s += float(ev.quantity or 0.0)
    return float(s)


def picked_by_product_from_events(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_ids: list[int],
    cart_id: int | None,
) -> dict[int, float]:
    """Product_id -> sum of PICK quantities (mirrors ``_picked_by_product``)."""
    if not order_ids:
        return {}
    oid_set = set(int(x) for x in order_ids)
    oi_rows = (
        db.query(OrderItem.id, OrderItem.product_id)
        .filter(OrderItem.order_id.in_(list(order_ids)))
        .all()
    )
    oi_to_pid = {int(oid): int(pid) for oid, pid in oi_rows}
    if not oi_to_pid:
        return {}
    evs = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id.in_(list(oi_to_pid.keys())),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    pick_ids = [int(_meta(ev).get("pick_id") or 0) for ev in evs if int(_meta(ev).get("pick_id") or 0) > 0]
    pick_map: dict[int, Pick] = {}
    if pick_ids:
        prs = (
            db.query(Pick)
            .filter(
                Pick.id.in_(list(dict.fromkeys(pick_ids))),
                Pick.tenant_id == int(tenant_id),
                Pick.warehouse_id == int(warehouse_id),
                Pick.order_id.in_(list(order_ids)),
            )
            .all()
        )
        pick_map = {int(p.id): p for p in prs}

    out: dict[int, float] = {}
    cid = int(cart_id) if cart_id is not None else None
    for ev in evs:
        oi_id = int(ev.order_item_id)
        prd = oi_to_pid.get(oi_id)
        if prd is None:
            continue
        m = _meta(ev)
        pk_id = int(m.get("pick_id") or 0)
        p_row: Pick | None = None
        if pk_id:
            p_row = pick_map.get(pk_id)
            if p_row is None:
                continue
            if int(p_row.order_id) not in oid_set:
                continue
        if cid is None:
            if not m.get("finalized"):
                continue
        else:
            meta_c = int(m.get("cart_id") or 0)
            pcart = int(p_row.cart_id) if p_row is not None and p_row.cart_id is not None else None
            if meta_c != cid and (pcart is None or pcart != cid):
                continue
        out[prd] = out.get(prd, 0.0) + float(ev.quantity or 0.0)
    return out


def _pick_traceability_metadata(pick: Pick, cart_meta: int | None) -> dict[str, Any]:
    from datetime import date

    exp = getattr(pick, "expiry_date", None)
    exp_out: str | None = None
    if exp is not None and isinstance(exp, date) and exp < date(9999, 1, 1):
        exp_out = exp.isoformat()
    batch = (getattr(pick, "batch_number", None) or "").strip() or None
    return {
        "pick_id": int(pick.id),
        "cart_id": int(cart_meta) if cart_meta is not None else None,
        "finalized": pick.picked_at is not None,
        "location_id": int(pick.location_id) if getattr(pick, "location_id", None) is not None else None,
        "batch_number": batch,
        "expiry_date": exp_out,
        "product_id": int(pick.product_id),
    }


def sync_pick_fulfillment_traceability(db: Session, pick: Pick) -> None:
    """Uzupełnij metadata_json zdarzeń PICK o partię / datę ważności po finalizacji."""
    if pick.order_item_id is None:
        return
    cart_meta = pick.cart_id
    if cart_meta is None and pick.order_id is not None:
        ord_row = db.query(Order).filter(Order.id == int(pick.order_id)).first()
        if ord_row is not None and getattr(ord_row, "cart_id", None) is not None:
            cart_meta = int(ord_row.cart_id)
    meta_patch = _pick_traceability_metadata(pick, cart_meta)
    rows = (
        db.query(FulfillmentEvent)
        .filter(
            FulfillmentEvent.order_item_id == int(pick.order_item_id),
            FulfillmentEvent.type == FE_PICK,
        )
        .all()
    )
    for ev in rows:
        m = _meta(ev)
        if int(m.get("pick_id") or 0) != int(pick.id):
            continue
        m.update(meta_patch)
        ev.metadata_json = json.dumps(m, ensure_ascii=False)
        ev.quantity = float(pick.quantity or 0.0)
        break


def record_pick_event_for_wms_pick(db: Session, pick: Pick) -> None:
    if pick.order_item_id is None:
        return
    cart_meta = pick.cart_id
    if cart_meta is None and pick.order_id is not None:
        ord_row = db.query(Order).filter(Order.id == int(pick.order_id)).first()
        if ord_row is not None and getattr(ord_row, "cart_id", None) is not None:
            cart_meta = int(ord_row.cart_id)
    meta = _pick_traceability_metadata(pick, cart_meta)
    append_event(
        db,
        order_item_id=int(pick.order_item_id),
        event_type=FE_PICK,
        quantity=float(pick.quantity or 0.0),
        metadata=meta,
    )


def delete_pick_events_for_pick_ids(db: Session, pick_ids: list[int]) -> None:
    """Remove PICK ledger rows when the underlying ``Pick`` row is deleted (e.g. shortage report)."""
    if not pick_ids:
        return
    want = set(int(x) for x in pick_ids if int(x) > 0)
    if not want:
        return
    rows = db.query(FulfillmentEvent).filter(FulfillmentEvent.type == FE_PICK).all()
    for ev in rows:
        pid = int(_meta(ev).get("pick_id") or 0)
        if pid in want:
            db.delete(ev)


def mark_pick_events_finalized_for_pick_ids(db: Session, pick_ids: list[int]) -> None:
    if not pick_ids:
        return
    want = set(int(x) for x in pick_ids if int(x) > 0)
    if not want:
        return
    rows = db.query(FulfillmentEvent).filter(FulfillmentEvent.type == FE_PICK).all()
    for ev in rows:
        m = _meta(ev)
        pid = int(m.get("pick_id") or 0)
        if pid in want:
            m["finalized"] = True
            ev.metadata_json = json.dumps(m, ensure_ascii=False)


def backfill_all_fulfillment_events(db: Session) -> dict[str, int]:
    """Idempotent migration: picks → PICK; declared/oms columns → MISSING/REMOVED/REPLACED when empty."""
    n_pick = backfill_pick_events_from_picks(db)
    n_miss = 0
    for oi in db.query(OrderItem).filter(OrderItem.wms_shortage_declared_qty > 1e-9).all():
        if sum_line_events(db, int(oi.id), FE_MISSING) > 1e-9:
            continue
        append_event(
            db,
            order_item_id=int(oi.id),
            event_type=FE_MISSING,
            quantity=float(oi.wms_shortage_declared_qty or 0),
            metadata={"source": "backfill_declared"},
        )
        n_miss += 1
    n_rm = 0
    for oi in db.query(OrderItem).filter(OrderItem.oms_removed_qty > 1e-9).all():
        if sum_line_events(db, int(oi.id), FE_REMOVED) > 1e-9:
            continue
        append_event(
            db,
            order_item_id=int(oi.id),
            event_type=FE_REMOVED,
            quantity=float(oi.oms_removed_qty or 0),
            metadata={"source": "backfill_column"},
        )
        n_rm += 1
    n_rp = 0
    for oi in db.query(OrderItem).filter(OrderItem.oms_replaced_qty > 1e-9).all():
        if sum_line_events(db, int(oi.id), FE_REPLACED) > 1e-9:
            continue
        append_event(
            db,
            order_item_id=int(oi.id),
            event_type=FE_REPLACED,
            quantity=float(oi.oms_replaced_qty or 0),
            metadata={"source": "backfill_column"},
        )
        n_rp += 1
    return {"pick": n_pick, "missing": n_miss, "removed": n_rm, "replaced": n_rp}


def backfill_pick_events_from_picks(db: Session) -> int:
    """One-time / migration: create PICK events from existing Pick rows (idempotent skip if pick_id already present)."""
    picks = db.query(Pick).filter(Pick.order_item_id.isnot(None)).all()
    n = 0
    existing_pick_ids: set[int] = set()
    for ev in db.query(FulfillmentEvent).filter(FulfillmentEvent.type == FE_PICK).all():
        pid = int(_meta(ev).get("pick_id") or 0)
        if pid:
            existing_pick_ids.add(pid)
    for p in picks:
        if int(p.id) in existing_pick_ids:
            continue
        record_pick_event_for_wms_pick(db, p)
        n += 1
    return n


def sync_declared_shortage_column_from_missing_events(db: Session, order_item_id: int) -> None:
    """Keep ``wms_shortage_declared_qty`` aligned with sum(MISSING) for legacy readers."""
    # SessionLocal uses autoflush=False — pending FE_MISSING must be visible before SUM.
    db.flush()
    oi = db.query(OrderItem).filter(OrderItem.id == int(order_item_id)).first()
    if oi is None:
        return
    sm = sum_line_events(db, int(order_item_id), FE_MISSING)
    oi.wms_shortage_declared_qty = round(float(sm), 6)
