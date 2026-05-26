"""Purchasing forecast / decision support — transparent heuristics over orders + inventory."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, or_

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from . import purchasing_replenish_core as core
from . import currency_rate_service as fx_rates
from .delivery_line_pricing import pick_unit_net_from_steps, tier_steps_for_catalog_product
from .product_inventory_snapshot_service import inventory_snapshots_for_products
from .product_cost_service import get_product_current_cost, get_products_current_costs


def _unit_cost(p: Product, price_map: Dict[Tuple[int, int], float], cat_first: Dict[int, int]) -> float:
    """Backward-compatible helper kept for modules importing this symbol."""
    rsid = int(p.default_supplier_id) if p.default_supplier_id is not None else cat_first.get(int(p.id))
    if rsid is not None:
        key = (int(rsid), int(p.id))
        if key in price_map:
            return float(price_map[key])
    if p.purchase_price is not None:
        return float(p.purchase_price)
    return 0.0


def _order_ts_expr():
    return func.coalesce(Order.created_at, Order.order_date)


def _line_revenue_expr():
    return func.coalesce(
        OrderItem.total_price,
        OrderItem.quantity * func.coalesce(OrderItem.unit_price, 0.0),
        0.0,
    )


def _active_line_filter():
    cleaned = func.upper(func.trim(func.coalesce(OrderItem.oms_line_status, "")))
    return cleaned != "REPLACED"


def sales_qty_by_days(db: Session, tenant_id: int, warehouse_id: Optional[int], days: int) -> Dict[int, float]:
    since = datetime.utcnow() - timedelta(days=int(days))
    q = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(_order_ts_expr() >= since)
        .filter(_active_line_filter())
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.group_by(OrderItem.product_id).all()
    return {int(pid): float(qty or 0) for pid, qty in rows}


def sales_daily_series(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    range_days: int,
    product_ids: Optional[Set[int]] = None,
) -> List[Dict[str, Any]]:
    """One row per calendar day in [now-range_days, now) with qty and revenue."""
    start = datetime.utcnow().date() - timedelta(days=int(range_days) - 1)
    end = datetime.utcnow().date()
    day_col = func.date(_order_ts_expr())
    q = (
        db.query(day_col, func.coalesce(func.sum(OrderItem.quantity), 0), func.coalesce(func.sum(_line_revenue_expr()), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(_active_line_filter())
        .filter(day_col >= start)
    )
    if product_ids:
        q = q.filter(OrderItem.product_id.in_(product_ids))
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    q = q.group_by(day_col)
    by_day: Dict[str, Tuple[float, float]] = {}
    for d, qty, rev in q.all():
        if d is None:
            continue
        ds = str(d) if not isinstance(d, str) else d
        by_day[ds] = (float(qty or 0), float(rev or 0.0))
    out: List[Dict[str, Any]] = []
    cur = start
    while cur <= end:
        key = cur.isoformat()
        qv, rv = by_day.get(key, (0.0, 0.0))
        out.append({"date": key, "qty": round(qv, 3), "revenue": round(rv, 2)})
        cur += timedelta(days=1)
    return out


def last_sale_date_by_product(
    db: Session, tenant_id: int, warehouse_id: Optional[int]
) -> Dict[int, datetime]:
    q = (
        db.query(OrderItem.product_id, func.max(_order_ts_expr()))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(_active_line_filter())
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.group_by(OrderItem.product_id).all()
    out: Dict[int, datetime] = {}
    for pid, ts in rows:
        if pid is None or ts is None:
            continue
        if isinstance(ts, datetime):
            dt = ts
        elif isinstance(ts, date):
            dt = datetime.combine(ts, datetime.min.time())
        else:
            try:
                dt = datetime.fromisoformat(str(ts)[:10])
            except ValueError:
                continue
        out[int(pid)] = dt
    return out


def _supplier_product_id_set(db: Session, tenant_id: int, supplier_id: int) -> Set[int]:
    rows = (
        db.query(SupplierProduct.product_id)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id, SupplierProduct.supplier_id == int(supplier_id))
        .all()
    )
    ids = {int(r[0]) for r in rows}
    rows2 = (
        db.query(Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.default_supplier_id == int(supplier_id),
        )
        .all()
    )
    ids |= {int(r[0]) for r in rows2}
    return ids


def forecast_candidate_product_ids(
    db: Session, tenant_id: int, warehouse_id: Optional[int], supplier_id: Optional[int]
) -> Set[int]:
    base = core.gather_dashboard_candidate_ids(db, tenant_id, warehouse_id)
    if supplier_id is not None:
        allowed = _supplier_product_id_set(db, tenant_id, int(supplier_id))
        base &= allowed
    return base


def _product_brief(p: Product) -> Dict[str, Any]:
    sku = (str(p.symbol).strip() if getattr(p, "symbol", None) else None) or (
        str(p.sku).strip() if getattr(p, "sku", None) else None
    )
    ean = str(p.ean).strip() if getattr(p, "ean", None) and str(p.ean).strip() else None
    img = str(p.image_url).strip() if getattr(p, "image_url", None) and str(p.image_url).strip() else None
    return {
        "id": int(p.id),
        "name": (p.name or "").strip() or f"Product #{p.id}",
        "sku": sku,
        "ean": ean,
        "image_url": img,
    }


def build_purchasing_forecast(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_id: Optional[int],
    supplier_id: Optional[int],
    range_days: int,
) -> Dict[str, Any]:
    if range_days not in (30, 90, 365):
        range_days = 30

    cand = forecast_candidate_product_ids(db, tenant_id, warehouse_id, supplier_id)
    if not cand:
        empty_summary = {
            "products_analyzed": 0,
            "total_monthly_sales": 0.0,
            "total_stock_value": 0.0,
            "avg_stock_cover_days": None,
            "risk_products_count": 0,
            "dead_stock_count": 0,
        }
        out: Dict[str, Any] = {
            "summary": empty_summary,
            "charts": {
                "sales_trend": sales_daily_series(db, tenant_id, warehouse_id, range_days, None),
                "top_fast_moving": [],
                "top_risk_products": [],
                "dead_stock": [],
            },
            "product_detail": None,
        }
        if product_id is not None:
            pone = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == tenant_id).first()
            if pone:
                out["product_detail"] = _build_product_detail(db, tenant_id, warehouse_id, pone)
        return out

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None), Product.id.in_(cand))
        .all()
    )
    sales_7 = sales_qty_by_days(db, tenant_id, warehouse_id, 7)
    sales_30 = sales_qty_by_days(db, tenant_id, warehouse_id, 30)
    sales_60 = sales_qty_by_days(db, tenant_id, warehouse_id, 60)
    sales_range_map = sales_qty_by_days(db, tenant_id, warehouse_id, range_days)
    prev_30_start = datetime.utcnow() - timedelta(days=60)
    prev_30_end = datetime.utcnow() - timedelta(days=30)
    sales_prev_30_map: Dict[int, float] = defaultdict(float)
    q_prev = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(_active_line_filter())
        .filter(_order_ts_expr() >= prev_30_start)
        .filter(_order_ts_expr() < prev_30_end)
    )
    if warehouse_id is not None:
        q_prev = q_prev.filter(Order.warehouse_id == int(warehouse_id))
    for pid, qty in q_prev.group_by(OrderItem.product_id).all():
        if pid is None:
            continue
        sales_prev_30_map[int(pid)] = float(qty or 0)

    fc_pid_list = [int(p.id) for p in products]
    fc_snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, fc_pid_list) if fc_pid_list else {}
    fc_available = {pid: float(s["available"]) for pid, s in fc_snaps.items()}
    fc_inbound = {pid: float(s["inbound_total"]) for pid, s in fc_snaps.items()}

    cat_first = core.catalog_supplier_first(db, tenant_id)
    cost_map = get_products_current_costs(db, tenant_id, [int(p.id) for p in products])
    last_sale = last_sale_date_by_product(db, tenant_id, warehouse_id)
    now = datetime.utcnow()

    total_stock_value = 0.0
    cover_samples: List[float] = []
    risk_count = 0
    per_product_rows: List[Tuple[Product, core.ProductReplenishMetrics, float, float, float, float]] = []

    for p in products:
        m = core.metrics_from_product(p, fc_available, sales_30, fc_inbound, cat_first)
        avg_daily_30 = float(m.sales_30d) / 30.0 if m.sales_30d else 0.0
        dc = core.days_cover(m.stock, avg_daily_30)
        c = cost_map.get(int(p.id), {})
        cost = float(c.get("landed_cost_net") or 0.0)
        total_stock_value += float(m.stock) * float(cost)
        if dc is not None and avg_daily_30 > 0:
            cover_samples.append(float(dc))
        if dc is not None and dc < 7 and float(m.stock) >= 0:
            risk_count += 1
        per_product_rows.append((p, m, avg_daily_30, float(sales_30.get(int(p.id), 0)), float(sales_prev_30_map.get(int(p.id), 0)), cost))

    products_analyzed = len(products)
    range_qty = sum(float(sales_range_map.get(int(p.id), 0)) for p in products)
    total_monthly_sales = round((range_qty / float(range_days)) * 30.0, 2) if range_days else 0.0
    avg_stock_cover_days = round(sum(cover_samples) / len(cover_samples), 1) if cover_samples else None

    top_fast = sorted(per_product_rows, key=lambda t: t[3], reverse=True)[:15]
    top_fast_out = [
        {"product_id": int(p.id), "name": _product_brief(p)["name"], "qty_30d": round(t3, 3)}
        for p, _m, _a, t3, _pv, _c in top_fast
    ]

    risk_sorted = sorted(
        [t for t in per_product_rows if core.days_cover(t[1].stock, t[2]) is not None and core.days_cover(t[1].stock, t[2]) < 7],
        key=lambda t: (core.days_cover(t[1].stock, t[2]) or 999),
    )[:20]
    top_risk_out = []
    for p, m, avg_d, _s30, _pv, _c in risk_sorted:
        dc = core.days_cover(m.stock, avg_d)
        top_risk_out.append(
            {
                "product_id": int(p.id),
                "name": _product_brief(p)["name"],
                "stock": round(m.stock, 3),
                "avg_daily_sales": round(avg_d, 6),
                "cover_days": dc,
            }
        )

    dead_out: List[Dict[str, Any]] = []
    for p, m, _avg_d, _s30, _pv, cost in per_product_rows:
        st = float(m.stock)
        if st <= 0:
            continue
        ls = last_sale.get(int(p.id))
        if ls is not None:
            no_sales_days = int((now - ls).total_seconds() // 86400)
            if no_sales_days < 60:
                continue
        else:
            if float(sales_60.get(int(p.id), 0)) > 1e-9:
                continue
            no_sales_days = 999
        dead_out.append(
            {
                "product_id": int(p.id),
                "name": _product_brief(p)["name"],
                "stock": round(st, 3),
                "no_sales_days": no_sales_days,
                "stock_value": round(st * cost, 2),
            }
        )
    dead_out.sort(key=lambda r: r["stock_value"], reverse=True)
    dead_out = dead_out[:25]

    charts = {
        "sales_trend": sales_daily_series(db, tenant_id, warehouse_id, range_days, cand),
        "top_fast_moving": top_fast_out,
        "top_risk_products": top_risk_out,
        "dead_stock": dead_out,
    }

    summary = {
        "products_analyzed": int(products_analyzed),
        "total_monthly_sales": float(total_monthly_sales),
        "total_stock_value": round(float(total_stock_value), 2),
        "avg_stock_cover_days": avg_stock_cover_days,
        "risk_products_count": int(risk_count),
        "dead_stock_count": int(len(dead_out)),
    }

    detail = None
    if product_id is not None:
        pone = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == tenant_id).first()
        if pone:
            detail = _build_product_detail(db, tenant_id, warehouse_id, pone)

    return {"summary": summary, "charts": charts, "product_detail": detail}


def _inventory_locations_for_product(
    db: Session, tenant_id: int, warehouse_id: Optional[int], product_id: int
) -> List[Dict[str, Any]]:
    """Lokalizacje z dodatnim stanem (dla inspektora w generatorze / prognozie)."""
    from ..models.inventory import Inventory
    from ..models.location import Location
    from ..models.warehouse import Warehouse

    q = (
        db.query(Warehouse.name, Location.name, func.sum(Inventory.quantity))
        .select_from(Inventory)
        .join(Location, Location.id == Inventory.location_id)
        .join(Warehouse, Warehouse.id == Inventory.warehouse_id)
        .filter(Inventory.tenant_id == tenant_id, Inventory.product_id == int(product_id))
        .filter(func.coalesce(Inventory.quantity, 0) > 0)
    )
    if warehouse_id is not None:
        q = q.filter(Inventory.warehouse_id == int(warehouse_id))
    rows = q.group_by(Warehouse.id, Warehouse.name, Location.id, Location.name).all()
    out: List[Dict[str, Any]] = []
    for wn, ln, qty in rows:
        out.append(
            {
                "warehouse_name": (wn or "").strip() or "—",
                "location_name": (ln or "").strip() or "—",
                "qty": round(float(qty or 0), 3),
            }
        )
    out.sort(key=lambda r: (-float(r["qty"]), r["warehouse_name"], r["location_name"]))
    return out


def _last_delivery_meta_for_product(db: Session, tenant_id: int, product_id: int) -> Tuple[Optional[datetime], Optional[float]]:
    """Ostatnia przyjęta dostawa + cena zakupu z tej samej linii (jeśli zapisana)."""
    from ..models.inbound_delivery import DeliveryItem, InboundDelivery

    row = (
        db.query(InboundDelivery.received_at, DeliveryItem.purchase_price)
        .select_from(DeliveryItem)
        .join(InboundDelivery, InboundDelivery.id == DeliveryItem.delivery_id)
        .filter(InboundDelivery.tenant_id == tenant_id, DeliveryItem.product_id == int(product_id))
        .filter(InboundDelivery.received_at.isnot(None))
        .order_by(InboundDelivery.received_at.desc())
        .first()
    )
    if not row:
        return None, None
    dt, price = row[0], row[1]
    pval = float(price) if price is not None else None
    return dt, pval


def _build_product_detail(db: Session, tenant_id: int, warehouse_id: Optional[int], p: Product) -> Dict[str, Any]:
    det_snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, [int(p.id)])
    s0 = det_snaps.get(int(p.id), {})
    available_map = {int(p.id): float(s0.get("available", 0.0))}
    inbound_map = {int(p.id): float(s0.get("inbound_total", 0.0))}
    cat_first = core.catalog_supplier_first(db, tenant_id)
    sales_7 = sales_qty_by_days(db, tenant_id, warehouse_id, 7)
    sales_30m = sales_qty_by_days(db, tenant_id, warehouse_id, 30)
    sales_90m = sales_qty_by_days(db, tenant_id, warehouse_id, 90)
    prev_30_start = datetime.utcnow() - timedelta(days=60)
    prev_30_end = datetime.utcnow() - timedelta(days=30)
    s_last30 = float(sales_30m.get(int(p.id), 0))
    s_prev30 = (
        db.query(func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id, Order.deleted_at.is_(None), OrderItem.product_id == int(p.id))
        .filter(_active_line_filter())
        .filter(_order_ts_expr() >= prev_30_start)
        .filter(_order_ts_expr() < prev_30_end)
    )
    if warehouse_id is not None:
        s_prev30 = s_prev30.filter(Order.warehouse_id == int(warehouse_id))
    s_prev30_v = float(s_prev30.scalar() or 0)

    m = core.metrics_from_product(p, available_map, sales_30m, inbound_map, cat_first)
    sid = m.resolved_supplier_id
    names = core.supplier_names(db, tenant_id)
    lead_days: Optional[int] = None
    offer: Optional[core.SupplierOfferConstraints] = None
    supplier_default_lead: Optional[int] = None
    sup = None
    sp: Optional[SupplierProduct] = None
    if sid is not None:
        sp = (
            db.query(SupplierProduct)
            .filter(SupplierProduct.product_id == int(p.id), SupplierProduct.supplier_id == int(sid))
            .first()
        )
        sup = db.query(Supplier).filter(Supplier.id == int(sid)).first()
        if sup and sup.default_lead_time_days is not None:
            supplier_default_lead = int(sup.default_lead_time_days)
        if sp:
            pk = getattr(sp, "pack_qty", None)
            ck = getattr(sp, "carton_qty", None)
            offer = core.SupplierOfferConstraints(
                lead_time_days=int(sp.lead_time_days) if sp.lead_time_days is not None else None,
                min_order_qty=float(sp.min_order_qty) if sp.min_order_qty is not None else None,
                pack_qty=float(pk) if pk is not None and float(pk) > 0 else None,
                carton_qty=float(ck) if ck is not None and float(ck) > 0 else None,
            )
            if sp.lead_time_days is not None:
                lead_days = int(sp.lead_time_days)
        if lead_days is None and supplier_default_lead is not None:
            lead_days = supplier_default_lead
    upc = (
        float(p.units_per_carton)
        if getattr(p, "units_per_carton", None) is not None and float(p.units_per_carton or 0) > 0
        else None
    )
    apply_offer_moq = bool(getattr(sup, "requires_moq", True)) if sid is not None and sup else True
    sq = core.compute_replenishment_suggested_qty(
        m,
        product_unit=getattr(p, "unit", None),
        offer=offer,
        supplier_default_lead=supplier_default_lead,
        units_per_carton_fallback=upc,
        apply_offer_moq=apply_offer_moq,
    )

    s7 = float(sales_7.get(int(p.id), 0))
    s30 = float(sales_30m.get(int(p.id), 0))
    s90 = float(sales_90m.get(int(p.id), 0))
    forecast_30d = (s_last30 * 0.6) + (s_prev30_v * 0.3) + (s7 * 0.1 * 4.0)
    trend_percent: Optional[float] = None
    if s_prev30_v > 1e-9:
        trend_percent = round((s_last30 - s_prev30_v) / s_prev30_v * 100.0, 2)
    elif s_last30 > 0:
        trend_percent = 100.0

    locs = _inventory_locations_for_product(db, tenant_id, warehouse_id, int(p.id))
    last_at, last_pp = _last_delivery_meta_for_product(db, tenant_id, int(p.id))
    unit_raw = getattr(p, "unit", None)
    unit = str(unit_raw).strip() if unit_raw and str(unit_raw).strip() else None

    cst = get_product_current_cost(db, tenant_id, int(p.id))
    bp = cst.get("purchase_net")
    sup_ccy = ((getattr(sup, "default_currency", None) or "PLN").strip().upper()) if sup else "PLN"
    purchase_unit_net_eur: Optional[float] = None
    purchase_unit_net_pln: Optional[float] = None
    if sup_ccy == "EUR" and sp is not None:
        steps = tier_steps_for_catalog_product(sp)
        list_at_one, _ = pick_unit_net_from_steps(steps, 1.0)
        if list_at_one is not None:
            purchase_unit_net_eur = float(list_at_one)
        elif sp.purchase_price is not None:
            purchase_unit_net_eur = float(sp.purchase_price)
    basis_d = date.today()
    rate_eur, _, _ = fx_rates.resolve_rate_to_pln(
        db, tenant_id=tenant_id, currency="EUR", on_date=basis_d, allow_nbp_fetch=True
    )
    if purchase_unit_net_eur is not None and rate_eur is not None and float(rate_eur) > 0:
        purchase_unit_net_pln = round(float(purchase_unit_net_eur) * float(rate_eur), 4)
    elif bp is not None:
        purchase_unit_net_pln = round(float(bp), 4)
    sale_net = float(p.sale_price) if p.sale_price is not None else None
    sale_pln_gross = round(sale_net * 1.23, 2) if sale_net is not None else None
    margin_percent: Optional[float] = None
    landed_cost = cst.get("landed_cost_net")
    if sale_net is not None and sale_net > 1e-12 and landed_cost is not None:
        margin_percent = round((sale_net - float(landed_cost)) / sale_net * 100.0, 2)

    return {
        "product": _product_brief(p),
        "stock": 0.0 if abs(float(m.stock)) < 1e-12 else round(float(m.stock), 6),
        "sales_7d": round(s7, 3),
        "sales_30d": round(s30, 3),
        "sales_90d": round(s90, 3),
        "avg_daily": round(m.avg_daily, 6),
        "suggested_qty": float(sq),
        "lead_time_days": lead_days,
        "supplier_name": names.get(int(sid), None) if sid is not None else None,
        "forecast_30d": round(float(forecast_30d), 3),
        "trend_percent": trend_percent,
        "unit": unit,
        "locations": locs,
        "last_delivery_at": last_at.isoformat() if last_at else None,
        "last_purchase_price": round(last_pp, 4) if last_pp is not None else None,
        "purchase_unit_net_eur": purchase_unit_net_eur,
        "purchase_unit_net_pln": purchase_unit_net_pln,
        "landed_cost_net": landed_cost,
        "extra_cost_net": cst.get("extra_cost_net"),
        "sale_pln_gross": sale_pln_gross,
        "margin_percent": margin_percent,
    }
