"""
Segmentacja ABC/XYZ dla decyzji zakupowych — sprzedaż z zamówień (jak forecast) + stany magazynowe.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from . import purchasing_replenish_core as core
from .product_inventory_snapshot_service import inventory_snapshots_for_products
from .purchasing_forecast_service import (
    _active_line_filter,
    _line_revenue_expr,
    _order_ts_expr,
    forecast_candidate_product_ids,
    _unit_cost,
)


# Mapowanie segmentu → tekst strategii (PL) — używane w UI i raportach.
_STRATEGY_BY_SEGMENT: Dict[str, str] = {
    "AX": "Zawsze utrzymuj wysoki stan",
    "AY": "Monitoruj trend",
    "AZ": "Ostrożne zakupy",
    "BX": "Regularne uzupełnianie",
    "BY": "Uzupełniaj wg harmonogramu",
    "BZ": "Zakup wg potrzeb",
    "CX": "Niski priorytet",
    "CY": "Ograniczaj zapasy",
    "CZ": "Rozważ wycofanie",
}


def _iso_weeks_in_range(start_d: date, end_d: date) -> List[Tuple[int, int]]:
    """Zwraca posortowaną listę par (rok ISO, tydzień ISO) dla każdego dnia w [start_d, end_d]."""
    seen: Set[Tuple[int, int]] = set()
    d = start_d
    while d <= end_d:
        y, w, _ = d.isocalendar()
        seen.add((y, w))
        d += timedelta(days=1)
    return sorted(seen)


def _weekly_qty_vectors(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    since: datetime,
    until: datetime,
    product_ids: Set[int],
    week_keys: List[Tuple[int, int]],
) -> Dict[int, List[float]]:
    """Dla każdego produktu: lista tygodniowych ilości sprzedaży (szt.), zero jeśli brak ruchu w tygodniu."""
    if not product_ids or not week_keys:
        return {pid: [0.0] * len(week_keys) for pid in product_ids}

    day_col = func.date(_order_ts_expr())
    q = (
        db.query(OrderItem.product_id, day_col, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(_active_line_filter())
        .filter(_order_ts_expr() >= since)
        .filter(_order_ts_expr() <= until)
        .filter(OrderItem.product_id.in_(product_ids))
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    q = q.group_by(OrderItem.product_id, day_col)

    # product_id -> (iso_year, iso_week) -> sum qty
    acc: Dict[int, Dict[Tuple[int, int], float]] = defaultdict(lambda: defaultdict(float))
    for pid, d, qty in q.all():
        if pid is None or d is None:
            continue
        if isinstance(d, datetime):
            dd = d.date()
        elif isinstance(d, date):
            dd = d
        else:
            try:
                dd = datetime.fromisoformat(str(d)[:10]).date()
            except ValueError:
                continue
        y, w, _ = dd.isocalendar()
        acc[int(pid)][(y, w)] += float(qty or 0)

    idx = {wk: i for i, wk in enumerate(week_keys)}
    out: Dict[int, List[float]] = {}
    n = len(week_keys)
    for pid in product_ids:
        vec = [0.0] * n
        for wk, qv in acc.get(pid, {}).items():
            i = idx.get(wk)
            if i is not None:
                vec[i] += qv
        out[pid] = vec
    return out


def _sales_qty_value_in_range(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    since: datetime,
    until: datetime,
    product_ids: Optional[Set[int]] = None,
) -> Dict[int, Tuple[float, float]]:
    """product_id -> (suma sztuk, suma przychodu PLN) w przedziale czasowym."""
    q = (
        db.query(
            OrderItem.product_id,
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(_line_revenue_expr()), 0.0),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(_active_line_filter())
        .filter(_order_ts_expr() >= since)
        .filter(_order_ts_expr() <= until)
    )
    if product_ids is not None:
        q = q.filter(OrderItem.product_id.in_(product_ids))
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.group_by(OrderItem.product_id).all()
    out: Dict[int, Tuple[float, float]] = {}
    for pid, qty, rev in rows:
        if pid is None:
            continue
        out[int(pid)] = (float(qty or 0), float(rev or 0.0))
    return out


def _xyz_from_weekly_vector(week_qty: List[float]) -> Tuple[str, Optional[float], Optional[float]]:
    """
    Klasa XYZ + odchylenie standardowe tygodni + CV.
    Brak sprzedaży (średnia ~0) → Z.
    """
    if not week_qty:
        return "Z", None, None
    avg = statistics.mean(week_qty)
    if avg <= 1e-9:
        return "Z", 0.0, None
    if len(week_qty) < 2:
        std = 0.0
    else:
        std = statistics.pstdev(week_qty)
    cv = float(std) / float(avg) if avg > 1e-9 else None
    if cv is None:
        return "Z", float(std), None
    if cv <= 0.5:
        return "X", float(std), cv
    if cv <= 1.0:
        return "Y", float(std), cv
    return "Z", float(std), cv


def _abc_from_sorted_values(values_desc: List[Tuple[int, float]]) -> Dict[int, str]:
    """values_desc: (product_id, sales_value) posortowane malejąco po sales_value."""
    total = sum(v for _, v in values_desc)
    out: Dict[int, str] = {}
    if total <= 1e-9:
        for pid, _ in values_desc:
            out[pid] = "C"
        return out
    cum = 0.0
    for pid, val in values_desc:
        cum += val
        pct = 100.0 * cum / total
        if pct <= 80.0:
            out[pid] = "A"
        elif pct <= 95.0:
            out[pid] = "B"
        else:
            out[pid] = "C"
    return out


def _reorder_priority(abc: str, xyz: str) -> int:
    """Priorytet uzupełnienia 1–100 (heurystyka: A wysoko, Z obniża)."""
    base = {"A": 80, "B": 52, "C": 28}.get(abc, 30)
    adj = {"X": 12, "Y": 0, "Z": -14}.get(xyz, 0)
    return max(1, min(100, base + adj))


def build_purchasing_segments(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    range_days: int,
    segment_filter: Optional[str] = None,
    supplier_id: Optional[int] = None,
    dead_stock_only: bool = False,
    high_priority_only: bool = False,
) -> Dict[str, Any]:
    if range_days not in (30, 90, 365):
        range_days = 90
    now = datetime.utcnow()
    until = now
    since = now - timedelta(days=int(range_days))
    start_d = since.date()
    end_d = until.date()

    cand = forecast_candidate_product_ids(db, tenant_id, warehouse_id, supplier_id)
    if not cand:
        return {
            "range_days": range_days,
            "summary": {
                "total_products": 0,
                "products_a_count": 0,
                "ax_count": 0,
                "high_risk_count": 0,
                "dead_stock_count": 0,
                "segment_counts": {},
            },
            "rows": [],
        }

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None), Product.id.in_(cand))
        .all()
    )
    seg_pids = [int(p.id) for p in products]
    seg_snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, seg_pids) if seg_pids else {}
    available_map = {pid: float(s["available"]) for pid, s in seg_snaps.items()}
    price_map = core.supplier_price_map(db, tenant_id)
    cat_first = core.catalog_supplier_first(db, tenant_id)
    sup_names = core.supplier_names(db, tenant_id)

    sales_map = _sales_qty_value_in_range(db, tenant_id, warehouse_id, since, until, cand)
    week_keys = _iso_weeks_in_range(start_d, end_d)
    weekly_vectors = _weekly_qty_vectors(db, tenant_id, warehouse_id, since, until, cand, week_keys)

    # Wartość sprzedaży do ABC — z fakturyzacji linii zamówienia
    value_pairs: List[Tuple[int, float]] = [(pid, sales_map.get(pid, (0.0, 0.0))[1]) for pid in cand]
    value_pairs.sort(key=lambda x: x[1], reverse=True)
    abc_map = _abc_from_sorted_values(value_pairs)

    rows_raw: List[Dict[str, Any]] = []
    for p in products:
        pid = int(p.id)
        qty, sval = sales_map.get(pid, (0.0, 0.0))
        week_vec = weekly_vectors.get(pid, [0.0] * len(week_keys))
        xyz, dstd, cv = _xyz_from_weekly_vector(week_vec)
        abc = abc_map.get(pid, "C")
        seg = f"{abc}{xyz}"
        strategy = _STRATEGY_BY_SEGMENT.get(seg, "Dostosuj politykę zapasu")

        st = float(available_map.get(pid, 0.0))
        cost = _unit_cost(p, price_map, cat_first)
        stock_value = round(st * cost, 2)
        avg_daily = float(qty) / float(range_days) if range_days > 0 else 0.0

        rsid = int(p.default_supplier_id) if p.default_supplier_id is not None else cat_first.get(pid)
        sup_name = sup_names.get(int(rsid), "") if rsid is not None else ""

        sku = (str(p.symbol).strip() if getattr(p, "symbol", None) else None) or (
            str(p.sku).strip() if getattr(p, "sku", None) else None
        )
        ean = str(p.ean).strip() if getattr(p, "ean", None) and str(p.ean).strip() else None

        rows_raw.append(
            {
                "product_id": pid,
                "name": (p.name or "").strip() or f"Product #{pid}",
                "sku": sku,
                "ean": ean,
                "supplier_name": sup_name,
                "stock": round(st, 3),
                "stock_value": stock_value,
                "sales_qty": round(qty, 3),
                "sales_value": round(sval, 2),
                "avg_daily_sales": round(avg_daily, 6),
                "demand_stddev": None if dstd is None else round(dstd, 4),
                "coefficient_variation": None if cv is None else round(cv, 4),
                "abc_class": abc,
                "xyz_class": xyz,
                "segment": seg,
                "suggested_strategy": strategy,
                "reorder_priority": _reorder_priority(abc, xyz),
                "_dead_stock": st > 1e-6 and qty <= 1e-9,
            }
        )

    # KPI na całym katalogu kandydatów (nie zależą od filtra segmentu / martwego)
    products_a_count = sum(1 for r in rows_raw if r["abc_class"] == "A")
    ax_count = sum(1 for r in rows_raw if r["segment"] == "AX")
    high_risk_count = sum(1 for r in rows_raw if r["segment"] in ("AZ", "CZ"))
    dead_stock_count = sum(1 for r in rows_raw if r["_dead_stock"])
    segment_counts: Dict[str, int] = defaultdict(int)
    for r in rows_raw:
        segment_counts[str(r["segment"])] += 1

    filtered = list(rows_raw)
    sf = (segment_filter or "").strip().upper()
    if len(sf) == 2 and sf[0] in "ABC" and sf[1] in "XYZ":
        filtered = [r for r in filtered if r["segment"] == sf]
    if dead_stock_only:
        filtered = [r for r in filtered if r["_dead_stock"]]
    if high_priority_only:
        filtered = [r for r in filtered if int(r["reorder_priority"]) >= 70]

    for r in filtered:
        del r["_dead_stock"]

    filtered.sort(key=lambda r: (-int(r["reorder_priority"]), -float(r["sales_value"]), r["product_id"]))

    summary = {
        "total_products": len(filtered),
        "products_a_count": products_a_count,
        "ax_count": ax_count,
        "high_risk_count": high_risk_count,
        "dead_stock_count": dead_stock_count,
        "segment_counts": dict(segment_counts),
    }

    return {"range_days": range_days, "summary": summary, "rows": filtered}
