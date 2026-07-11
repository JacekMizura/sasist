"""Paginated replenishment generator rows + summary (uses purchasing_replenish_core)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from . import purchasing_replenish_core as core
from .product_inventory_snapshot_service import inventory_snapshots_for_products
from .product_cost_service import get_products_current_costs


def _allowed_supplier_products(db: Session, tenant_id: int, supplier_id: int) -> Set[int]:
    rows = (
        db.query(SupplierProduct.product_id)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id, SupplierProduct.supplier_id == int(supplier_id))
        .all()
    )
    return {int(r[0]) for r in rows}


def _search_product_ids(db: Session, tenant_id: int, search: str) -> Set[int]:
    term = f"%{search.strip()}%"
    rows = (
        db.query(Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.symbol.ilike(term),
                Product.ean.ilike(term),
            ),
        )
        .all()
    )
    return {int(r[0]) for r in rows}


def _default_supplier_product_ids(db: Session, tenant_id: int) -> Set[int]:
    rows = (
        db.query(Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            Product.default_supplier_id.isnot(None),
        )
        .all()
    )
    return {int(r[0]) for r in rows}


def replenishment_candidate_ids(
    db: Session,
    tenant_id: int,
    warehouse_id: Optional[int],
    *,
    search: Optional[str] = None,
    supplier_id: Optional[int] = None,
    category_id: Optional[int] = None,
) -> Set[int]:
    """Finite universe of product ids for the replenishment generator."""
    if search and search.strip():
        base = _search_product_ids(db, tenant_id, search.strip())
    else:
        base = core.gather_dashboard_candidate_ids(db, tenant_id, warehouse_id)
        base |= _default_supplier_product_ids(db, tenant_id)
    if category_id is not None:
        # No product category table in current schema — ignore until ETAP 4+ adds FK.
        pass
    if supplier_id is not None:
        allowed = _allowed_supplier_products(db, tenant_id, supplier_id)
        allowed |= {
            int(r[0])
            for r in db.query(Product.id)
            .filter(
                Product.tenant_id == tenant_id,
                Product.deleted_at.is_(None),
                Product.default_supplier_id == int(supplier_id),
            )
            .all()
        }
        base &= allowed
    return base


def _row_dict(
    p: Product,
    m: core.ProductReplenishMetrics,
    supplier_prices: Dict[Tuple[int, int], float],
    names: Dict[int, str],
    offer: Optional[core.SupplierOfferConstraints],
    supplier_default_lead_by_id: Dict[int, Optional[int]],
    units_per_carton_fallback: Optional[float],
    supplier_requires_moq_by_id: Dict[int, bool],
    cost_by_product: Dict[int, Dict[str, Any]],
) -> Dict[str, Any]:
    crit = core.is_critical(m.stock, m.min_total_stock)
    dc = core.days_cover(m.stock, m.avg_daily)
    sid = m.resolved_supplier_id
    sdl = supplier_default_lead_by_id.get(int(sid)) if sid is not None else None
    apply_offer_moq = supplier_requires_moq_by_id.get(int(sid), True) if sid is not None else True
    sq = core.compute_replenishment_suggested_qty(
        m,
        product_unit=getattr(p, "unit", None),
        offer=offer,
        supplier_default_lead=sdl,
        units_per_carton_fallback=units_per_carton_fallback,
        apply_offer_moq=apply_offer_moq,
    )
    bp = core.buy_price(m, supplier_prices)
    cost = cost_by_product.get(int(m.product_id), {})
    landed = cost.get("landed_cost_net")
    buy_basis = float(landed) if landed is not None else (float(bp) if bp is not None else None)
    sell = float(p.sale_price) if p.sale_price is not None else None
    margin_pct: Optional[float] = None
    margin_val: Optional[float] = None
    if sell is not None and buy_basis is not None and sell > 0:
        margin_pct = round((sell - buy_basis) / sell * 100.0, 2)
        margin_val = round((sell - buy_basis) * sq, 2)
    est = round(sq * float(buy_basis or 0.0), 2)
    return {
        "product_id": m.product_id,
        "image_url": m.image_url,
        "product_name": m.name,
        "sku": m.sku,
        "ean": m.ean,
        "category_name": None,
        "supplier_id": sid,
        "supplier_name": names.get(int(sid), None) if sid is not None else None,
        "current_stock": 0.0 if abs(float(m.stock)) < 1e-12 else round(float(m.stock), 6),
        "incoming_qty": 0.0 if abs(float(m.incoming)) < 1e-12 else round(float(m.incoming), 6),
        "sales_30d": round(m.sales_30d, 3),
        "avg_daily_sales": round(m.avg_daily, 6),
        "stock_cover_days": dc,
        "min_stock": core.min_stock_display(m),
        "suggested_qty": float(sq),
        "buy_price": float(bp) if bp is not None else None,
        "landed_cost_net": float(landed) if landed is not None else None,
        "extra_cost_net": float(cost.get("extra_cost_net")) if cost.get("extra_cost_net") is not None else None,
        "sell_price": sell,
        "margin_value": margin_val,
        "margin_percent": margin_pct,
        "estimated_order_value": est,
        "critical_flag": crit,
        "low_stock_flag": core.is_low_stock(m, crit),
        # Jednostka produktu — UI zaokrągla wyświetlanie (szt. w górę, kg/m/l: 2 miejsca).
        "product_unit": (str(p.unit).strip() if getattr(p, "unit", None) and str(p.unit).strip() else None),
    }


def _build_sorted_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    search: Optional[str],
    supplier_id: Optional[int],
    category_id: Optional[int],
    critical_only: bool,
    low_stock_only: bool,
    positive_margin_only: bool,
    sort_by: str,
    sort_dir: str,
    stock_zero_only: bool = False,
    below_min_stock_only: bool = False,
    has_buy_price_only: bool = False,
    margin_min: Optional[float] = None,
    show_loss_products: bool = False,
    low_margin_lt: Optional[float] = None,
    top_sales_limit: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    ids = replenishment_candidate_ids(
        db,
        tenant_id,
        warehouse_id,
        search=search,
        supplier_id=supplier_id,
        category_id=category_id,
    )
    if not ids:
        return [], {
            "total_rows": 0,
            "total_suggested_value": 0.0,
            "critical_count": 0,
            "suggested_count": 0,
            "low_stock_count": 0,
        }

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None), Product.id.in_(ids))
        .all()
    )
    sales_map = core.sales_qty_by_product(db, tenant_id, warehouse_id)
    price_map = core.supplier_price_map(db, tenant_id)
    names = core.supplier_names(db, tenant_id)
    cat_first = core.catalog_supplier_first(db, tenant_id)

    pid_list = [int(p.id) for p in products]
    cost_by_product = get_products_current_costs(db, tenant_id, pid_list)
    snaps = inventory_snapshots_for_products(db, tenant_id, warehouse_id, pid_list)
    available_map = {pid: float(s["available"]) for pid, s in snaps.items()}
    inbound_total_map = {pid: float(s["inbound_total"]) for pid, s in snaps.items()}
    sup_ids: Set[int] = set()
    for p in products:
        if p.default_supplier_id:
            sup_ids.add(int(p.default_supplier_id))
    for _pid, sid in cat_first.items():
        sup_ids.add(int(sid))
    supplier_default_lead_by_id: Dict[int, Optional[int]] = {}
    supplier_requires_moq_by_id: Dict[int, bool] = {}
    if sup_ids:
        for sid, ld, rq in (
            db.query(Supplier.id, Supplier.default_lead_time_days, Supplier.requires_moq)
            .filter(Supplier.id.in_(sup_ids))
            .all()
        ):
            supplier_default_lead_by_id[int(sid)] = int(ld) if ld is not None else None
            supplier_requires_moq_by_id[int(sid)] = bool(rq) if rq is not None else True

    sp_rows = db.query(SupplierProduct).filter(SupplierProduct.product_id.in_(pid_list)).all()
    offers: Dict[Tuple[int, int], core.SupplierOfferConstraints] = {}
    for sp in sp_rows:
        pk = getattr(sp, "pack_qty", None)
        ck = getattr(sp, "carton_qty", None)
        offers[(int(sp.supplier_id), int(sp.product_id))] = core.SupplierOfferConstraints(
            lead_time_days=int(sp.lead_time_days) if sp.lead_time_days is not None else None,
            min_order_qty=float(sp.min_order_qty) if sp.min_order_qty is not None else None,
            pack_qty=float(pk) if pk is not None and float(pk) > 0 else None,
            carton_qty=float(ck) if ck is not None and float(ck) > 0 else None,
        )

    rows: List[Dict[str, Any]] = []
    for p in products:
        m = core.metrics_from_product(p, available_map, sales_map, inbound_total_map, cat_first)
        sid = m.resolved_supplier_id
        offer = offers.get((int(sid), int(m.product_id))) if sid is not None else None
        upc = (
            float(p.units_per_carton)
            if getattr(p, "units_per_carton", None) is not None and float(p.units_per_carton or 0) > 0
            else None
        )
        rows.append(
            _row_dict(
                p,
                m,
                price_map,
                names,
                offer,
                supplier_default_lead_by_id,
                upc,
                supplier_requires_moq_by_id,
                cost_by_product,
            )
        )

    if critical_only:
        rows = [r for r in rows if r["critical_flag"]]
    if low_stock_only:
        rows = [r for r in rows if r.get("low_stock_flag")]
    if positive_margin_only:
        rows = [r for r in rows if (r.get("margin_percent") or 0) > 0]
    if stock_zero_only:
        rows = [r for r in rows if float(r["current_stock"]) <= 0]
    if below_min_stock_only:
        rows = [
            r
            for r in rows
            if r.get("min_stock") is not None and float(r["current_stock"]) < float(r["min_stock"])
        ]
    if has_buy_price_only:
        rows = [r for r in rows if r.get("buy_price") is not None]
    if margin_min is not None:
        rows = [r for r in rows if float(r.get("margin_percent") or 0) >= float(margin_min)]
    if show_loss_products:
        rows = [r for r in rows if float(r.get("margin_percent") or 0) < 0.0]
    if low_margin_lt is not None:
        rows = [r for r in rows if float(r.get("margin_percent") or 0) < float(low_margin_lt)]
    if top_sales_limit is not None and int(top_sales_limit) > 0:
        rows = sorted(rows, key=lambda r: -float(r["sales_30d"]))[: int(top_sales_limit)]

    sort_keys = {
        "product_name": lambda r: (r["product_name"] or "").lower(),
        "current_stock": lambda r: float(r["current_stock"]),
        "suggested_qty": lambda r: float(r["suggested_qty"]),
        "estimated_order_value": lambda r: float(r["estimated_order_value"]),
        "margin_percent": lambda r: float(r["margin_percent"] or -1e9),
        "avg_daily_sales": lambda r: float(r["avg_daily_sales"]),
    }
    key_fn = sort_keys.get((sort_by or "suggested_qty").strip().lower(), sort_keys["suggested_qty"])
    rev = (sort_dir or "desc").strip().lower() == "desc"
    rows.sort(key=key_fn, reverse=rev)

    total_rows = len(rows)
    critical_count = sum(1 for r in rows if r["critical_flag"])
    suggested_count = sum(1 for r in rows if float(r["suggested_qty"]) >= 1.0)
    low_stock_count = sum(1 for r in rows if r.get("low_stock_flag"))
    total_suggested_value = sum(float(r["estimated_order_value"]) for r in rows if float(r["suggested_qty"]) >= 1.0)

    summary = {
        "total_rows": int(total_rows),
        "total_suggested_value": round(float(total_suggested_value), 2),
        "critical_count": int(critical_count),
        "suggested_count": int(suggested_count),
        "low_stock_count": int(low_stock_count),
    }
    return rows, summary


def build_replenishment_payload(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    page: int,
    page_size: int,
    search: Optional[str],
    supplier_id: Optional[int],
    category_id: Optional[int],
    critical_only: bool,
    low_stock_only: bool,
    positive_margin_only: bool,
    sort_by: str,
    sort_dir: str,
    stock_zero_only: bool = False,
    below_min_stock_only: bool = False,
    has_buy_price_only: bool = False,
    margin_min: Optional[float] = None,
    show_loss_products: bool = False,
    low_margin_lt: Optional[float] = None,
    top_sales_limit: Optional[int] = None,
) -> Dict[str, Any]:
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 200)
    rows, summary = _build_sorted_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        search=search,
        supplier_id=supplier_id,
        category_id=category_id,
        critical_only=critical_only,
        low_stock_only=low_stock_only,
        positive_margin_only=positive_margin_only,
        sort_by=sort_by,
        sort_dir=sort_dir,
        stock_zero_only=stock_zero_only,
        below_min_stock_only=below_min_stock_only,
        has_buy_price_only=has_buy_price_only,
        margin_min=margin_min,
        show_loss_products=show_loss_products,
        low_margin_lt=low_margin_lt,
        top_sales_limit=top_sales_limit,
    )
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    return {
        "rows": page_rows,
        "summary": summary,
        "page": page,
        "page_size": page_size,
    }


def replenishment_rows_for_export(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    search: Optional[str],
    supplier_id: Optional[int],
    category_id: Optional[int],
    critical_only: bool,
    low_stock_only: bool,
    positive_margin_only: bool,
    sort_by: str,
    sort_dir: str,
    product_ids: Optional[Sequence[int]] = None,
    max_rows: int = 10_000,
    stock_zero_only: bool = False,
    below_min_stock_only: bool = False,
    has_buy_price_only: bool = False,
    margin_min: Optional[float] = None,
    show_loss_products: bool = False,
    low_margin_lt: Optional[float] = None,
    top_sales_limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Full sorted row list for CSV (optional intersection with product_ids)."""
    rows, _ = _build_sorted_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        search=search,
        supplier_id=supplier_id,
        category_id=category_id,
        critical_only=critical_only,
        low_stock_only=low_stock_only,
        positive_margin_only=positive_margin_only,
        sort_by=sort_by,
        sort_dir=sort_dir,
        stock_zero_only=stock_zero_only,
        below_min_stock_only=below_min_stock_only,
        has_buy_price_only=has_buy_price_only,
        margin_min=margin_min,
        show_loss_products=show_loss_products,
        low_margin_lt=low_margin_lt,
        top_sales_limit=top_sales_limit,
    )
    if product_ids is not None:
        wanted = {int(x) for x in product_ids}
        rows = [r for r in rows if int(r["product_id"]) in wanted]
    return rows[:max_rows]
