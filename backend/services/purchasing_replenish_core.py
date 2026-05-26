"""
Shared purchasing / replenishment math: stock maps, sales velocity, suggested order qty.

Used by dashboard KPIs and GET /purchasing/replenishment — keep formulas in one place.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct

SALES_LOOKBACK_DAYS = 30
TARGET_COVER_DAYS = 14  # używane w is_low_stock (pokrycie „niskie”)
OPEN_DELIVERY_STATUSES = ("draft", "ordered", "in_transit")
# Docelowe pokrycie: popyt w czasie realizacji + bufor bezpieczeństwa (domyślnie 7 dni).
DEFAULT_SAFETY_DAYS = 7
DEFAULT_LEAD_TIME_DAYS = 7  # gdy brak lead_time w ofercie dostawcy i brak default_lead_time na dostawcy


@dataclass
class SupplierOfferConstraints:
    """Ograniczenia z supplier_products (+ lead z dostawcy)."""

    lead_time_days: Optional[int]
    min_order_qty: Optional[float]
    pack_qty: Optional[float]
    carton_qty: Optional[float]


@dataclass
class ProductReplenishMetrics:
    """Per-product inputs for suggestion + margin helpers."""

    product_id: int
    name: str
    sku: Optional[str]
    ean: Optional[str]
    image_url: Optional[str]
    #: Stan dostępny (on_hand − rezerwacje), spójny z Asortymentem / widokiem stanu.
    stock: float
    sales_30d: float
    avg_daily: float
    min_total_stock: Optional[float]
    min_pick_quantity: Optional[float]
    resolved_supplier_id: Optional[int]
    product_purchase_price: Optional[float]
    #: Suma pipeline zakupowego (otwarte ZZ + dostawy w toku), bez duplikatu szkiców.
    incoming: float


def stock_by_product(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Dict[int, float]:
    """Widoczny stan fizyczny (suma inventory po tym samym filtrze co Asortyment)."""
    from .product_inventory_snapshot_service import visible_on_hand_by_product

    return visible_on_hand_by_product(db, tenant_id, warehouse_id, None)


def sales_qty_by_product(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> Dict[int, float]:
    since = datetime.utcnow() - timedelta(days=SALES_LOOKBACK_DAYS)
    q = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id)
        .filter(Order.deleted_at.is_(None))
        .filter(OrderItem.product_id.isnot(None))
        .filter(func.coalesce(Order.created_at, Order.order_date) >= since)
    )
    if warehouse_id is not None:
        q = q.filter(Order.warehouse_id == int(warehouse_id))
    rows = q.group_by(OrderItem.product_id).all()
    return {int(pid): float(qty or 0) for pid, qty in rows}


def incoming_by_product(db: Session, tenant_id: int, warehouse_id: Optional[int] = None) -> Dict[int, float]:
    """Łączna ilość w drodze (ZZ + dostawy), z filtrem magazynu — zgodnie z ``inbound_total_by_product_map``."""
    from .product_inventory_snapshot_service import inbound_total_by_product_map

    return inbound_total_by_product_map(db, tenant_id, warehouse_id)


def supplier_price_map(db: Session, tenant_id: int) -> Dict[Tuple[int, int], float]:
    rows = (
        db.query(SupplierProduct)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id)
        .all()
    )
    out: Dict[Tuple[int, int], float] = {}
    for r in rows:
        if r.purchase_price is None:
            continue
        out[(int(r.supplier_id), int(r.product_id))] = float(r.purchase_price)
    return out


def supplier_names(db: Session, tenant_id: int) -> Dict[int, str]:
    rows = db.query(Supplier.id, Supplier.name).filter(Supplier.tenant_id == tenant_id).all()
    return {int(sid): (nm or "").strip() or f"#{sid}" for sid, nm in rows}


def catalog_supplier_first(db: Session, tenant_id: int) -> Dict[int, int]:
    """product_id -> first supplier_id from catalog (deterministic: min supplier id)."""
    rows = (
        db.query(SupplierProduct.product_id, func.min(SupplierProduct.supplier_id))
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id)
        .group_by(SupplierProduct.product_id)
        .all()
    )
    return {int(pid): int(sid) for pid, sid in rows}


def is_critical(stock: float, min_total: Optional[float]) -> bool:
    if stock <= 0:
        return True
    if min_total is not None and float(min_total) > 0 and stock < float(min_total):
        return True
    return False


def days_cover(stock: float, avg_daily: float) -> Optional[float]:
    if avg_daily <= 0:
        return None
    return round(float(stock) / float(avg_daily), 1)


def _minimal_stock_target_level(m: ProductReplenishMetrics) -> float:
    """Minimalny poziom zapasu (sztuki docelowe na półce), nie „luka” — używany w max() z popytem czasowym."""
    vals: List[float] = []
    if m.min_total_stock is not None and float(m.min_total_stock) > 0:
        vals.append(float(m.min_total_stock))
    if m.min_pick_quantity is not None and float(m.min_pick_quantity) > 0:
        vals.append(float(m.min_pick_quantity))
    return max(vals) if vals else 0.0


def _effective_lead_days(offer: Optional[SupplierOfferConstraints], supplier_default_lead: Optional[int]) -> int:
    if offer and offer.lead_time_days is not None and int(offer.lead_time_days) > 0:
        return int(offer.lead_time_days)
    if supplier_default_lead is not None and int(supplier_default_lead) > 0:
        return int(supplier_default_lead)
    return DEFAULT_LEAD_TIME_DAYS


def gross_inventory_target(
    m: ProductReplenishMetrics,
    offer: Optional[SupplierOfferConstraints],
    supplier_default_lead: Optional[int],
) -> float:
    """Docelowy poziom zapasu przed odjęciem stanu i drogi: max(min_progu, lead×śr_dziennie + safety×śr_dziennie)."""
    avg = float(m.avg_daily)
    ld = int(_effective_lead_days(offer, supplier_default_lead))
    lead_dem = avg * float(ld)
    safety = avg * float(DEFAULT_SAFETY_DAYS)
    min_lvl = _minimal_stock_target_level(m)
    return max(min_lvl, lead_dem + safety)


def raw_suggested_order_qty(
    m: ProductReplenishMetrics,
    offer: Optional[SupplierOfferConstraints],
    supplier_default_lead: Optional[int],
) -> float:
    gross = gross_inventory_target(m, offer, supplier_default_lead)
    return gross - float(m.stock) - float(m.incoming)


def is_piece_like_unit(unit: Optional[str]) -> bool:
    """Sztuki / opakowania zliczane w całkowitych jednostkach — zaokrąglenie w górę."""
    if unit is None or not str(unit).strip():
        return True
    u = str(unit).strip().casefold()
    if u in ("szt", "pcs", "pc", "op", "kpl", "ea", "eac", "piece", "pieces", "unit", "item", "szt.", "sztuk"):
        return True
    if "szt" in u and len(u) <= 8:
        return True
    return False


def is_weight_dimension_unit(unit: Optional[str]) -> bool:
    u = (unit or "").strip().casefold()
    return u in ("kg", "g", "m", "l", "lm", "mb", "m2", "m3", "dm3", "cm", "mm")


def apply_moq_pack_carton_constraints(
    q: float,
    offer: Optional[SupplierOfferConstraints],
    carton_product_fallback: Optional[float],
    *,
    apply_offer_moq: bool = True,
) -> float:
    """MOQ + wielokrotności paczki/kartonu (kolejność malejąca kroku)."""
    if q <= 0:
        return 0.0
    moq = None
    if apply_offer_moq:
        moq = float(offer.min_order_qty) if offer and offer.min_order_qty and float(offer.min_order_qty) > 0 else None
    pack = float(offer.pack_qty) if offer and offer.pack_qty and float(offer.pack_qty) > 0 else None
    carton = float(offer.carton_qty) if offer and offer.carton_qty and float(offer.carton_qty) > 0 else None
    if carton is None and carton_product_fallback and float(carton_product_fallback) > 0:
        carton = float(carton_product_fallback)
    x = float(q)
    if moq is not None:
        x = max(x, moq)
    steps = sorted({s for s in (pack, carton) if s is not None and s > 0}, reverse=True)
    for step in steps:
        x = math.ceil(x / step) * step
    return x


def round_suggested_for_unit(q: float, unit: Optional[str]) -> float:
    if is_piece_like_unit(unit):
        return float(max(0, math.ceil(q - 1e-9)))
    if is_weight_dimension_unit(unit):
        return round(q + 1e-9, 2)
    return round(q + 1e-9, 3)


def compute_replenishment_suggested_qty(
    m: ProductReplenishMetrics,
    *,
    product_unit: Optional[str],
    offer: Optional[SupplierOfferConstraints],
    supplier_default_lead: Optional[int],
    units_per_carton_fallback: Optional[float],
    apply_offer_moq: bool = True,
) -> float:
    """Sugestia zamówienia: cel magazynowy − stan − droga, potem MOQ/paczki, potem zaokrąglenie wg jednostki."""
    raw = max(0.0, raw_suggested_order_qty(m, offer, supplier_default_lead))
    packed = apply_moq_pack_carton_constraints(
        raw, offer, units_per_carton_fallback, apply_offer_moq=apply_offer_moq
    )
    return round_suggested_for_unit(packed, product_unit)


def suggested_qty(m: ProductReplenishMetrics) -> float:
    """Skrót bez kontekstu dostawcy — lead domyślny 7d, bez MOQ z katalogu."""
    return compute_replenishment_suggested_qty(
        m,
        product_unit=None,
        offer=None,
        supplier_default_lead=None,
        units_per_carton_fallback=None,
    )


def buy_price(m: ProductReplenishMetrics, supplier_prices: Dict[Tuple[int, int], float]) -> Optional[float]:
    if m.resolved_supplier_id is None:
        if m.product_purchase_price is not None:
            return float(m.product_purchase_price)
        return None
    key = (int(m.resolved_supplier_id), int(m.product_id))
    if key in supplier_prices:
        return supplier_prices[key]
    if m.product_purchase_price is not None:
        return float(m.product_purchase_price)
    return None


def min_stock_display(m: ProductReplenishMetrics) -> Optional[float]:
    a = m.min_total_stock
    b = m.min_pick_quantity
    if a is None and b is None:
        return None
    if a is None:
        return float(b) if b is not None else None
    if b is None:
        return float(a)
    return max(float(a), float(b))


def is_low_stock(m: ProductReplenishMetrics, critical: bool) -> bool:
    """Non-critical but cover window short (<= 14 days) when velocity known."""
    if critical:
        return False
    dc = days_cover(m.stock, m.avg_daily)
    if dc is not None and 0 < dc <= 14:
        return True
    return False


def gather_dashboard_candidate_ids(db: Session, tenant_id: int, warehouse_id: Optional[int] = None) -> set[int]:
    """Product id union for purchasing views (inventory / sales / inbound / alerts / catalog)."""
    from .product_inventory_snapshot_service import (
        inbound_total_all_product_ids,
        on_hand_visible_all_product_ids,
        reserved_product_ids_positive,
    )

    stock_ids = on_hand_visible_all_product_ids(db, tenant_id, warehouse_id)
    sales_map = sales_qty_by_product(db, tenant_id, warehouse_id)
    incoming_ids = inbound_total_all_product_ids(db, tenant_id, warehouse_id)
    reserved_ids = reserved_product_ids_positive(db, tenant_id, warehouse_id)
    candidate_ids = set(stock_ids) | set(sales_map) | incoming_ids | reserved_ids
    alert_products = (
        db.query(Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.deleted_at.is_(None),
            or_(
                Product.min_total_stock.isnot(None),
                Product.min_pick_quantity.isnot(None),
                Product.enable_stock_alert.is_(True),
            ),
        )
        .all()
    )
    candidate_ids |= {int(r[0]) for r in alert_products}
    catalog_product_ids = (
        db.query(SupplierProduct.product_id)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id)
        .distinct()
        .all()
    )
    candidate_ids |= {int(r[0]) for r in catalog_product_ids}
    return candidate_ids


def metrics_from_product(
    p: Product,
    available_by_product: Dict[int, float],
    sales_map: Dict[int, float],
    inbound_total_by_product: Dict[int, float],
    catalog_first_supplier: Dict[int, int],
) -> ProductReplenishMetrics:
    """``available_by_product`` = stan dostępny; ``inbound_total_by_product`` = w drodze (pipeline)."""
    pid = int(p.id)
    sold = float(sales_map.get(pid, 0.0))
    avg = sold / float(SALES_LOOKBACK_DAYS) if SALES_LOOKBACK_DAYS else 0.0
    rsid = int(p.default_supplier_id) if p.default_supplier_id is not None else catalog_first_supplier.get(pid)
    sku = (str(p.symbol).strip() if getattr(p, "symbol", None) else None) or (
        str(p.sku).strip() if getattr(p, "sku", None) else None
    )
    ean = str(p.ean).strip() if getattr(p, "ean", None) else None
    img = str(p.image_url).strip() if getattr(p, "image_url", None) and str(p.image_url).strip() else None
    av = float(available_by_product.get(pid, 0.0))
    inc = float(inbound_total_by_product.get(pid, 0.0))
    if abs(av) < 1e-12:
        av = 0.0
    if abs(inc) < 1e-12:
        inc = 0.0
    return ProductReplenishMetrics(
        product_id=pid,
        name=(p.name or "").strip() or f"Product #{pid}",
        sku=sku or None,
        ean=ean or None,
        image_url=img,
        stock=av,
        sales_30d=sold,
        avg_daily=avg,
        min_total_stock=float(p.min_total_stock) if p.min_total_stock is not None else None,
        min_pick_quantity=float(p.min_pick_quantity) if p.min_pick_quantity is not None else None,
        resolved_supplier_id=rsid,
        product_purchase_price=float(p.purchase_price) if p.purchase_price is not None else None,
        incoming=inc,
    )
