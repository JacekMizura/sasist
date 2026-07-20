"""Pick-face replenishment: BUFFER → PICK inventory moves and task queue."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List, Literal, Sequence, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.pick import Pick
from ..models.product import Product
from ..models.replenishment_task import ReplenishmentTask
from ..schemas.wms_mm_transfer import WmsMmCreateTransferBody
from ..schemas.wms_replenishment import (
    WmsReplenishmentBufferSource,
    WmsReplenishmentExecuteBody,
    WmsReplenishmentExecuteResult,
    WmsReplenishmentLineRead,
    WmsReplenishmentSourceAllocation,
    WmsReplenishmentTaskExecuteBody,
    WmsReplenishmentTaskGenerateResult,
    WmsReplenishmentTaskRead,
    WmsReplenishmentTaskSourceSegment,
)
from .location_badge import wms_location_badge_kind
from .tenant_default_warehouse import list_tenant_warehouse_ids
from .wms_mm_transfer_service import create_wms_mm_transfer

_EPS = 1e-9


def _serialize_task_sources(segments: List[dict]) -> str:
    return json.dumps(segments, separators=(",", ":"))


def _parse_task_sources(
    raw: object,
    *,
    legacy_source_id: int,
    legacy_qty: float,
) -> List[dict]:
    if isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
            if isinstance(data, list) and len(data) > 0:
                out: List[dict] = []
                for it in data:
                    if not isinstance(it, dict):
                        continue
                    lid = int(it.get("location_id", 0))
                    if lid <= 0:
                        continue
                    qp = float(it.get("quantity_planned", it.get("quantity", 0)) or 0)
                    qd = float(it.get("quantity_done", 0) or 0)
                    out.append({"location_id": lid, "quantity_planned": qp, "quantity_done": qd})
                if out:
                    return out
        except Exception:
            pass
    return [
        {
            "location_id": int(legacy_source_id),
            "quantity_planned": float(legacy_qty),
            "quantity_done": 0.0,
        }
    ]


def _next_pending_segment(segments: Sequence[dict]) -> dict | None:
    for s in segments:
        rem = float(s["quantity_planned"]) - float(s.get("quantity_done", 0) or 0)
        if rem > _EPS:
            return s
    return None


def _sources_fully_done(segments: Sequence[dict]) -> bool:
    return _next_pending_segment(segments) is None


def _build_source_chain(
    required_qty: float,
    eff_rows: Sequence[Tuple[int, float, float]],
) -> List[dict]:
    """Rozdziel ``required_qty`` na kolejne lokalizacje BUFFER wg dostępnego ruchu (po min. rezerwie produktu)."""
    need = float(required_qty)
    chain: List[dict] = []
    if need <= _EPS:
        return chain
    for lid, _gq, mv in eff_rows:
        if need <= _EPS:
            break
        take = min(float(mv), need)
        if take > _EPS:
            chain.append({"location_id": int(lid), "quantity_planned": float(take), "quantity_done": 0.0})
            need -= take
    return chain


def _gross_for_buffer_loc(eff_rows: Sequence[Tuple[int, float, float]], lid: int) -> float:
    for lid2, gq, _mv in eff_rows:
        if int(lid2) == int(lid):
            return float(gq)
    return 0.0


def _merge_source_chains(old_segs: List[dict], new_chain: List[dict]) -> List[dict]:
    """Zachowaj quantity_done tam, gdzie segment (lokacja + plan) się zgadza."""
    old_by: dict[Tuple[int, float], float] = {}
    for s in old_segs:
        lid = int(s["location_id"])
        qp = float(s["quantity_planned"])
        key = (lid, round(qp, 4))
        old_by[key] = float(s.get("quantity_done", 0) or 0)
    merged: List[dict] = []
    for ns in new_chain:
        lid = int(ns["location_id"])
        qp = float(ns["quantity_planned"])
        key = (lid, round(qp, 4))
        done = old_by.get(key, 0.0)
        merged.append({"location_id": lid, "quantity_planned": qp, "quantity_done": done})
    return merged


def _apply_segment_done(segments: List[dict], from_location_id: int, moved_qty: float) -> None:
    """Zwiększa ``quantity_done`` pierwszego oczekującego segmentu dla danej lokacji."""
    need = float(moved_qty)
    if need <= _EPS:
        return
    lid_req = int(from_location_id)
    for s in segments:
        if int(s["location_id"]) != lid_req:
            continue
        qp = float(s["quantity_planned"])
        qd = float(s.get("quantity_done", 0) or 0)
        rem = qp - qd
        if rem <= _EPS:
            continue
        add = min(rem, need)
        s["quantity_done"] = qd + add
        return
    raise ValueError("Nie znaleziono segmentu źródła do aktualizacji postępu")


_TERMINAL_FULFILLMENT = frozenset(
    {
        "DELIVERED",
        "SHIPPED",
        "CANCELLED",
        "COMPLETED",
        "RETURNED",
        "ARCHIVED",
    }
)


def _assert_warehouse_for_tenant(db: Session, tenant_id: int, warehouse_id: int) -> None:
    allowed = set(list_tenant_warehouse_ids(db, tenant_id))
    if int(warehouse_id) not in allowed:
        raise ValueError("Magazyn nie jest przypisany do tenanta")


def _agg_pick_buffer(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> Tuple[
    Dict[Tuple[int, int], float],
    Dict[int, List[Tuple[int, float]]],
    Dict[int, Location],
]:
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
        )
        .all()
    )
    if not rows:
        return {}, {}, {}

    loc_ids = {int(r.location_id) for r in rows}
    locs = db.query(Location).filter(Location.id.in_(loc_ids)).all()
    loc_by_id: Dict[int, Location] = {int(l.id): l for l in locs}

    kind_by_lid: Dict[int, str] = {}
    for lid, loc in loc_by_id.items():
        kind_by_lid[lid] = (wms_location_badge_kind(loc) or "").strip().upper()

    pick_qty: Dict[Tuple[int, int], float] = defaultdict(float)
    buffer_locs: Dict[int, List[Tuple[int, float]]] = defaultdict(list)
    buffer_acc: Dict[Tuple[int, int], float] = defaultdict(float)

    for inv in rows:
        lid = int(inv.location_id)
        pid = int(inv.product_id)
        q = float(inv.quantity or 0)
        k = kind_by_lid.get(lid, "")
        if k == "PICK":
            pick_qty[(pid, lid)] += q
        elif k == "BUFFER":
            buffer_acc[(pid, lid)] += q

    for (pid, lid), q in buffer_acc.items():
        if q > _EPS:
            buffer_locs[pid].append((lid, q))

    for pid in buffer_locs:
        buffer_locs[pid].sort(key=lambda x: (-x[1], x[0]))

    return dict(pick_qty), buffer_locs, loc_by_id


def _loc_name(loc: Location | None) -> str:
    if not loc:
        return ""
    return (loc.name or "").strip() or f"#{loc.id}"


def _effective_moveable_reserve(product: Product, gross_qty: float) -> float:
    mn_res = getattr(product, "min_reserve_quantity", None)
    floor = float(mn_res) if mn_res is not None and float(mn_res) > _EPS else 0.0
    return max(0.0, float(gross_qty) - floor)


def _buffers_effective(product: Product, gross_list: Sequence[Tuple[int, float]]) -> List[Tuple[int, float, float]]:
    """Return [(location_id, gross, moveable), ...] sorted by moveable desc."""
    rows: List[Tuple[int, float, float]] = []
    for lid, gq in gross_list:
        mv = _effective_moveable_reserve(product, gq)
        if mv > _EPS:
            rows.append((lid, float(gq), mv))
    rows.sort(key=lambda x: (-x[2], x[0]))
    return rows


def _open_order_demand_units(db: Session, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    q = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.product_id == int(product_id),
            or_(Order.fulfillment_state.is_(None), ~Order.fulfillment_state.in_(_TERMINAL_FULFILLMENT)),
        )
    )
    return float(q.scalar() or 0.0)


def _today_pick_velocity_units(db: Session, tenant_id: int, warehouse_id: int, product_id: int) -> float:
    d0 = date.today()
    start = datetime.combine(d0, datetime.min.time())
    end = start + timedelta(days=1)
    q = (
        db.query(func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.product_id == int(product_id),
            Pick.picked_at.isnot(None),
            Pick.picked_at >= start,
            Pick.picked_at < end,
        )
    )
    return float(q.scalar() or 0.0)


def _priority_band(score: float) -> str:
    if score >= 120.0:
        return "HIGH"
    if score >= 55.0:
        return "MEDIUM"
    return "LOW"


def _priority_score(product: Product, pick_stock: float, min_level: float, open_orders: float, velocity: float) -> float:
    mx = getattr(product, "max_pick_quantity", None)
    target_pick = float(mx) if mx is not None and float(mx) > _EPS else min_level
    gap = max(0.0, target_pick - float(pick_stock))
    return float(open_orders) * 2.0 + float(velocity) + gap


def _iter_replenishment_line_tuples(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    *,
    product_id_filter: int | None = None,
) -> List[Tuple[WmsReplenishmentLineRead, float, float, str]]:
    """Wiersze kandydatów: pick < min_pick, ruch z rezerwy (BUFFER) > 0."""
    pick_qty, buffer_locs, loc_by_id = _agg_pick_buffer(db, tenant_id, warehouse_id)
    if not pick_qty:
        return []

    pids = {int(pid) for pid, _ in pick_qty.keys()}
    if product_id_filter is not None:
        if int(product_id_filter) not in pids:
            return []
        pids = {int(product_id_filter)}

    products = {
        int(p.id): p
        for p in db.query(Product).filter(Product.id.in_(pids), Product.tenant_id == int(tenant_id)).all()
    }

    cand: List[Tuple[WmsReplenishmentLineRead, float, float, str]] = []
    wh_id = int(warehouse_id)
    tid = int(tenant_id)

    for (pid, pick_lid), p_stock in pick_qty.items():
        if int(pid) not in pids:
            continue
        p = products.get(int(pid))
        if p is None:
            continue
        mn = getattr(p, "min_pick_quantity", None)
        if mn is None or float(mn) <= _EPS:
            continue
        min_level = float(mn)
        if p_stock + _EPS >= min_level:
            continue

        gross_blist = buffer_locs.get(pid) or []
        eff_rows = _buffers_effective(p, gross_blist)
        if not eff_rows:
            continue

        required_qty = max(0.0, min_level - float(p_stock))
        pick_loc = loc_by_id.get(pick_lid)
        # Cap by pick-face geometric/weight capacity (fit_engine SSOT)
        if pick_loc is not None:
            try:
                from .slotting.location_capacity_solver import solve_location_capacity

                cap = solve_location_capacity(db, location=pick_loc, product=p)
                capacity_cap = float(cap.additional_capacity)
                if capacity_cap + _EPS < required_qty:
                    required_qty = max(0.0, capacity_cap)
            except Exception:
                pass

        if required_qty <= _EPS:
            continue

        source_chain = _build_source_chain(required_qty, eff_rows)
        if not source_chain:
            continue

        buf_lid = int(source_chain[0]["location_id"])
        buf_gross = _gross_for_buffer_loc(eff_rows, buf_lid)

        buf_loc = loc_by_id.get(buf_lid)

        buffer_sources = [
            WmsReplenishmentBufferSource(
                location_id=int(lid),
                location_name=_loc_name(loc_by_id.get(lid)),
                quantity=float(gross),
                moveable_quantity=float(mv),
            )
            for lid, gross, mv in eff_rows
        ]

        source_allocations = [
            WmsReplenishmentSourceAllocation(location_id=int(s["location_id"]), quantity=float(s["quantity_planned"]))
            for s in source_chain
        ]

        open_o = _open_order_demand_units(db, tid, wh_id, pid)
        vel = _today_pick_velocity_units(db, tid, wh_id, pid)
        score = _priority_score(p, p_stock, min_level, open_o, vel)
        band = _priority_band(score)

        line = WmsReplenishmentLineRead(
            product_id=pid,
            product_name=(p.name or "").strip(),
            product_sku=(p.sku or "").strip() or None,
            product_ean=(p.ean or "").strip() or None,
            product_image_url=(p.image_url or "").strip() or None,
            pick_location_id=pick_lid,
            pick_location_name=_loc_name(pick_loc),
            pick_stock=p_stock,
            min_level=min_level,
            missing_qty=float(required_qty),
            buffer_location_id=buf_lid,
            buffer_location_name=_loc_name(buf_loc),
            buffer_stock_at_source=buf_gross,
            suggested_qty=float(required_qty),
            buffer_sources=buffer_sources,
            source_allocations=source_allocations,
            priority_score=score,
            priority_band=band,
            open_orders_qty=open_o,
            today_sales_velocity=vel,
        )
        cand.append((line, score, float(required_qty), band))

    cand.sort(key=lambda x: (-x[1], x[0].product_name.lower(), x[0].pick_location_id))
    return cand


def _iter_candidates(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> List[Tuple[WmsReplenishmentLineRead, float, float, str]]:
    return _iter_replenishment_line_tuples(db, tenant_id, warehouse_id, product_id_filter=None)


_TASK_PAIR_KEY = Tuple[int, int]  # product_id, pick_location_id (target)


def _desired_task_map(
    line_tuples: Sequence[Tuple[WmsReplenishmentLineRead, float, float, str]],
) -> Dict[_TASK_PAIR_KEY, Tuple[float, List[dict], float, str]]:
    """Jedno zadanie na parę (produkt, lokacja PICK): ``quantity`` = wymagane min_pick − stan pick."""
    m: Dict[_TASK_PAIR_KEY, Tuple[float, List[dict], float, str]] = {}
    for line, score, required_qty, band in line_tuples:
        rq = float(required_qty)
        if rq <= _EPS or not line.source_allocations:
            continue
        chain = [
            {"location_id": int(a.location_id), "quantity_planned": float(a.quantity), "quantity_done": 0.0}
            for a in line.source_allocations
        ]
        k = (int(line.product_id), int(line.pick_location_id))
        m[k] = (float(round(rq, 4)), chain, float(score), str(band))
    return m


def _sync_replenishment_tasks(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    desired: Dict[_TASK_PAIR_KEY, Tuple[float, List[dict], float, str]],
    *,
    product_scope: int | None = None,
) -> Tuple[int, int, int, int]:
    """
    Zwraca: (created, updated, removed, unchanged).
    """
    tid, wid = int(tenant_id), int(warehouse_id)

    q_exist = db.query(ReplenishmentTask).filter(
        ReplenishmentTask.tenant_id == tid,
        ReplenishmentTask.warehouse_id == wid,
        ReplenishmentTask.status.in_(("OPEN", "IN_PROGRESS")),
    )
    if product_scope is not None:
        q_exist = q_exist.filter(ReplenishmentTask.product_id == int(product_scope))

    removed = 0
    existing_rows = list(q_exist.all())
    by_pair: Dict[_TASK_PAIR_KEY, List[ReplenishmentTask]] = defaultdict(list)
    for t in existing_rows:
        by_pair[(int(t.product_id), int(t.target_location_id))].append(t)
    for _pair, lst in by_pair.items():
        open_rows = [x for x in lst if str(x.status or "").upper() == "OPEN"]
        if len(open_rows) > 1:
            keeper = min(open_rows, key=lambda x: int(x.id))
            for t in open_rows:
                if int(t.id) != int(keeper.id):
                    db.delete(t)
                    removed += 1

    q_rem = db.query(ReplenishmentTask).filter(
        ReplenishmentTask.tenant_id == tid,
        ReplenishmentTask.warehouse_id == wid,
        ReplenishmentTask.status.in_(("OPEN", "IN_PROGRESS")),
    )
    if product_scope is not None:
        q_rem = q_rem.filter(ReplenishmentTask.product_id == int(product_scope))
    for t in q_rem.all():
        pair = (int(t.product_id), int(t.target_location_id))
        if pair not in desired:
            if str(t.status or "").upper() == "IN_PROGRESS":
                continue
            db.delete(t)
            removed += 1

    created = 0
    updated = 0
    unchanged = 0

    for k, (qty_f, new_chain, score, band) in desired.items():
        if product_scope is not None and k[0] != int(product_scope):
            continue

        ex = (
            db.query(ReplenishmentTask)
            .filter(
                ReplenishmentTask.tenant_id == tid,
                ReplenishmentTask.warehouse_id == wid,
                ReplenishmentTask.product_id == k[0],
                ReplenishmentTask.target_location_id == k[1],
                ReplenishmentTask.status.in_(("OPEN", "IN_PROGRESS")),
            )
            .order_by(ReplenishmentTask.id.asc())
            .first()
        )
        merged_chain = _merge_source_chains(
            _parse_task_sources(
                getattr(ex, "sources_json", None) if ex else None,
                legacy_source_id=int(ex.source_location_id) if ex else 0,
                legacy_qty=float(ex.quantity) if ex else float(qty_f),
            ),
            new_chain,
        ) if ex else list(new_chain)
        next_src = _next_pending_segment(merged_chain)
        primary_src = int(next_src["location_id"]) if next_src is not None else int(new_chain[0]["location_id"])

        if ex:
            chg = False
            if abs(float(ex.quantity) - qty_f) > 1e-4:
                ex.quantity = qty_f
                chg = True
            if abs(float(ex.priority_score or 0.0) - float(score)) > 1e-4:
                ex.priority_score = float(score)
                chg = True
            if str(ex.priority_band or "LOW") != str(band):
                ex.priority_band = str(band)
                chg = True
            new_json = _serialize_task_sources(merged_chain)
            if (ex.sources_json or "") != new_json:
                ex.sources_json = new_json
                chg = True
            if int(ex.source_location_id) != int(primary_src):
                ex.source_location_id = primary_src
                chg = True
            if chg:
                db.add(ex)
                updated += 1
            else:
                unchanged += 1
        else:
            db.add(
                ReplenishmentTask(
                    tenant_id=tid,
                    warehouse_id=wid,
                    product_id=k[0],
                    source_location_id=int(primary_src),
                    target_location_id=k[1],
                    quantity=float(qty_f),
                    sources_json=_serialize_task_sources(list(new_chain)),
                    priority_score=float(score),
                    priority_band=str(band),
                    status="OPEN",
                    created_at=datetime.utcnow(),
                )
            )
            created += 1

    return created, updated, removed, unchanged


def evaluate_replenishment_for_product(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> None:
    """
    Przelicza kolejkę replenishment dla jednego produktu (np. po zmianie ``Inventory``).
    Nie wykonuje ``commit`` — caller commituje.
    """
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    pid = int(product_id)
    tuples = _iter_replenishment_line_tuples(db, tenant_id, warehouse_id, product_id_filter=pid)
    desired = _desired_task_map(tuples)
    _sync_replenishment_tasks(db, tenant_id, warehouse_id, desired, product_scope=pid)


def list_wms_replenishment_lines(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
) -> List[WmsReplenishmentLineRead]:
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    return [t[0] for t in _iter_candidates(db, tenant_id, warehouse_id)]


def execute_wms_replenishment(
    db: Session,
    tenant_id: int,
    body: WmsReplenishmentExecuteBody,
    *,
    performed_by: AppUser,
    replenishment_task_id: int | None = None,
) -> WmsReplenishmentExecuteResult:
    wh_id = int(body.warehouse_id)
    _assert_warehouse_for_tenant(db, tenant_id, wh_id)

    pid = int(body.product_id)
    from_id = int(body.from_location_id)
    to_id = int(body.to_location_id)
    qty = float(body.quantity)

    p = db.query(Product).filter(Product.id == pid, Product.tenant_id == int(tenant_id)).first()
    if not p:
        raise ValueError("Produkt nie znaleziony")

    loc_from = db.query(Location).filter(Location.id == from_id, Location.warehouse_id == wh_id).first()
    loc_to = db.query(Location).filter(Location.id == to_id, Location.warehouse_id == wh_id).first()
    if not loc_from or not loc_to:
        raise ValueError("Lokalizacja nie należy do magazynu")

    k_from = (wms_location_badge_kind(loc_from) or "").strip().upper()
    k_to = (wms_location_badge_kind(loc_to) or "").strip().upper()
    if k_from != "BUFFER":
        raise ValueError("Lokalizacja źródłowa musi być typu BUFFER (rezerwa)")
    if k_to != "PICK":
        raise ValueError("Lokalizacja docelowa musi być typu PICK")

    buf_available = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == wh_id,
            Inventory.product_id == pid,
            Inventory.location_id == from_id,
        )
        .all()
    )
    buf_sum = sum(float(x.quantity or 0) for x in buf_available)

    mn_res = getattr(p, "min_reserve_quantity", None)
    floor = float(mn_res) if mn_res is not None and float(mn_res) > _EPS else 0.0
    movable_cap = max(0.0, buf_sum - floor)
    if qty > movable_cap + _EPS:
        raise ValueError("Ilość przekracza dostępny ruch ze stanu środkowego")

    mm_body = WmsMmCreateTransferBody(
        warehouse_id=wh_id,
        from_location_id=from_id,
        to_location_id=to_id,
        product_id=pid,
        quantity=qty,
        packaging_type=body.packaging_type,
        packaging_quantity=body.packaging_quantity,
        wms_mode=body.wms_mode,
    )
    doc_read = create_wms_mm_transfer(
        db,
        tenant_id,
        mm_body,
        performed_by=performed_by,
        movement_type="REPLENISHMENT",
        replenishment_task_id=replenishment_task_id,
    )
    return WmsReplenishmentExecuteResult(document=doc_read, task_completed=False)


def _location_sort_tuple(loc: Location | None) -> Tuple[str, str, str, str]:
    if not loc:
        return ("", "", "", "")
    zone = ((getattr(loc, "rack_name", None) or "") or "")[:8]
    aisle = (getattr(loc, "bin", None) or "") or ""
    rack = (getattr(loc, "rack_name", None) or "") or ""
    code = _loc_name(loc)
    return (zone, aisle, rack, code)


def _task_row_to_read(
    db: Session,
    task: ReplenishmentTask,
) -> WmsReplenishmentTaskRead:
    p = task.product
    tgt = task.target_location

    pic = getattr(p, "min_pick_quantity", None) if p else None
    mpc = getattr(p, "max_pick_quantity", None) if p else None

    segments = _parse_task_sources(
        getattr(task, "sources_json", None),
        legacy_source_id=int(task.source_location_id),
        legacy_qty=float(task.quantity),
    )
    src_loc_ids = {int(s["location_id"]) for s in segments}
    src_locs = (
        db.query(Location).filter(Location.id.in_(src_loc_ids)).all() if src_loc_ids else []
    )
    src_loc_by_id: Dict[int, Location] = {int(l.id): l for l in src_locs}

    sources_read: List[WmsReplenishmentTaskSourceSegment] = []
    reserve_remain = 0.0
    for s in segments:
        lid = int(s["location_id"])
        sloc = src_loc_by_id.get(lid)
        qp = float(s["quantity_planned"])
        qd = float(s.get("quantity_done", 0) or 0)
        rem = max(0.0, qp - qd)
        reserve_remain += rem
        sources_read.append(
            WmsReplenishmentTaskSourceSegment(
                location_id=lid,
                location_code=_loc_name(sloc),
                quantity_planned=qp,
                quantity_done=qd,
            )
        )

    pending = _next_pending_segment(segments)
    pend_id = int(pending["location_id"]) if pending else int(task.source_location_id)
    pend_loc = src_loc_by_id.get(pend_id) or task.source_location

    pk_inv = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(task.tenant_id),
            Inventory.warehouse_id == int(task.warehouse_id),
            Inventory.product_id == int(task.product_id),
            Inventory.location_id == int(task.target_location_id),
        )
        .scalar()
        or 0.0
    )

    return WmsReplenishmentTaskRead(
        id=int(task.id),
        tenant_id=int(task.tenant_id),
        warehouse_id=int(task.warehouse_id),
        product_id=int(task.product_id),
        source_location_id=int(task.source_location_id),
        target_location_id=int(task.target_location_id),
        quantity=float(task.quantity),
        priority_score=float(task.priority_score or 0.0),
        priority_band=str(task.priority_band or "LOW"),
        status=str(task.status or "OPEN"),
        created_at=task.created_at,
        completed_at=task.completed_at,
        assigned_admin_id=int(task.assigned_admin_id) if task.assigned_admin_id is not None else None,
        product_name=(p.name or "").strip() if p else "",
        product_sku=(p.sku or "").strip() if p and p.sku else None,
        product_ean=(p.ean or "").strip() if p and p.ean else None,
        product_image_url=(p.image_url or "").strip() if p and getattr(p, "image_url", None) else None,
        source_location_code=_loc_name(pend_loc),
        target_location_code=_loc_name(tgt),
        pick_stock=float(pk_inv),
        reserve_stock=float(reserve_remain),
        min_pick_level=float(pic) if pic is not None else None,
        max_pick_level=float(mpc) if mpc is not None else None,
        days_of_cover=None,
        warehouse_zone="",
        location_sort=_location_sort_tuple(tgt),
        sources=sources_read,
    )


def list_replenishment_tasks(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    view: Literal["priority", "location"] = "location",
    status_filter: str | None = "OPEN",
) -> List[WmsReplenishmentTaskRead]:
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    q = db.query(ReplenishmentTask).filter(
        ReplenishmentTask.tenant_id == int(tenant_id),
        ReplenishmentTask.warehouse_id == int(warehouse_id),
    )
    if status_filter == "OPEN":
        q = q.filter(ReplenishmentTask.status.in_(("OPEN", "IN_PROGRESS")))
    rows = q.order_by(ReplenishmentTask.id.desc()).all()
    out = [_task_row_to_read(db, r) for r in rows]

    if view == "priority":
        out.sort(key=lambda x: (-x.priority_score, x.target_location_code, x.id))
    else:
        out.sort(key=lambda x: (x.location_sort, x.target_location_code, x.id))
    return out


def get_replenishment_task(db: Session, tenant_id: int, task_id: int) -> WmsReplenishmentTaskRead:
    task = (
        db.query(ReplenishmentTask)
        .filter(ReplenishmentTask.id == int(task_id), ReplenishmentTask.tenant_id == int(tenant_id))
        .first()
    )
    if not task:
        raise ValueError("Nie znaleziono zadania")
    return _task_row_to_read(db, task)


def generate_replenishment_tasks(db: Session, tenant_id: int, warehouse_id: int) -> WmsReplenishmentTaskGenerateResult:
    """
    Pełne przeliczenie kolejki (narzędzie admin / debug). Nie wykonuje ``commit``.
    """
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    tuples = _iter_replenishment_line_tuples(db, tenant_id, warehouse_id, product_id_filter=None)
    desired = _desired_task_map(tuples)
    created, updated, removed, unchanged = _sync_replenishment_tasks(
        db,
        tenant_id,
        warehouse_id,
        desired,
        product_scope=None,
    )
    return WmsReplenishmentTaskGenerateResult(
        created=created,
        skipped_existing=unchanged,
        updated=updated,
        removed=removed,
    )

def execute_replenishment_task(
    db: Session,
    tenant_id: int,
    task_id: int,
    body: WmsReplenishmentTaskExecuteBody,
    performed_by: AppUser,
) -> WmsReplenishmentExecuteResult:
    task = (
        db.query(ReplenishmentTask)
        .filter(ReplenishmentTask.id == int(task_id), ReplenishmentTask.tenant_id == int(tenant_id))
        .first()
    )
    if not task:
        raise ValueError("Nie znaleziono zadania")
    if str(task.status) not in ("OPEN", "IN_PROGRESS"):
        raise ValueError("Zadanie nie może być wykonane w tym stanie")

    segments = _parse_task_sources(
        getattr(task, "sources_json", None),
        legacy_source_id=int(task.source_location_id),
        legacy_qty=float(task.quantity),
    )
    pending = _next_pending_segment(segments)
    if pending is None:
        raise ValueError("Brak oczekującego segmentu źródła — zadanie jest już domknięte")

    from_body = int(body.from_location_id)
    if from_body != int(pending["location_id"]):
        raise ValueError("Zeskanuj aktualną lokalizację źródłową (właściwy segment łańcucha)")

    from ..services.inventory_count.inventory_movement_guard_service import (
        MOVEMENT_REPLENISH,
        assert_location_movement_allowed,
    )

    assert_location_movement_allowed(
        db,
        location_id=from_body,
        movement_kind=MOVEMENT_REPLENISH,
        tenant_id=tenant_id,
    )
    assert_location_movement_allowed(
        db,
        location_id=int(task.target_location_id),
        movement_kind=MOVEMENT_REPLENISH,
        tenant_id=tenant_id,
    )

    rem_seg = float(pending["quantity_planned"]) - float(pending.get("quantity_done", 0) or 0)
    qty_req = float(body.quantity)
    if qty_req <= _EPS:
        raise ValueError("Ilość musi być dodatnia")
    if qty_req > rem_seg + _EPS:
        raise ValueError("Ilość przekracza pozostały plan dla bieżącego źródła")

    if str(task.status) == "OPEN":
        task.status = "IN_PROGRESS"
        task.assigned_admin_id = int(performed_by.id)
        db.add(task)
        db.flush()

    exec_body = WmsReplenishmentExecuteBody(
        warehouse_id=int(task.warehouse_id),
        product_id=int(task.product_id),
        from_location_id=from_body,
        to_location_id=int(task.target_location_id),
        quantity=qty_req,
        packaging_type=body.packaging_type,
        packaging_quantity=body.packaging_quantity,
        wms_mode=body.wms_mode,
    )
    res = execute_wms_replenishment(
        db,
        tenant_id,
        exec_body,
        performed_by=performed_by,
        replenishment_task_id=int(task_id),
    )

    task2 = (
        db.query(ReplenishmentTask)
        .filter(ReplenishmentTask.id == int(task_id), ReplenishmentTask.tenant_id == int(tenant_id))
        .first()
    )
    if not task2:
        raise ValueError("Nie znaleziono zadania po wykonaniu MM")

    segs2 = _parse_task_sources(
        getattr(task2, "sources_json", None),
        legacy_source_id=int(task2.source_location_id),
        legacy_qty=float(task2.quantity),
    )
    _apply_segment_done(segs2, from_body, qty_req)
    task2.sources_json = _serialize_task_sources(segs2)
    next_p = _next_pending_segment(segs2)
    task2.source_location_id = int(next_p["location_id"]) if next_p is not None else int(task2.source_location_id)

    done_all = _sources_fully_done(segs2)
    if done_all:
        task2.status = "DONE"
        task2.completed_at = datetime.utcnow()
    task2.assigned_admin_id = int(performed_by.id)
    db.add(task2)
    db.commit()
    db.refresh(task2)

    return WmsReplenishmentExecuteResult(document=res.document, task_completed=done_all)


def start_replenishment_task(db: Session, tenant_id: int, task_id: int, performed_by: AppUser | None = None) -> WmsReplenishmentTaskRead:
    task = (
        db.query(ReplenishmentTask)
        .filter(ReplenishmentTask.id == int(task_id), ReplenishmentTask.tenant_id == int(tenant_id))
        .first()
    )
    if not task:
        raise ValueError("Nie znaleziono zadania")
    if str(task.status) == "OPEN":
        task.status = "IN_PROGRESS"
        if performed_by is not None:
            task.assigned_admin_id = int(performed_by.id)
        db.add(task)
        db.commit()
    return get_replenishment_task(db, tenant_id, task_id)
