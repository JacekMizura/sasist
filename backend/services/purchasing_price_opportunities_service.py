"""
Silnik okazji cenowych (Price Opportunity) — wyłącznie na danych z bazy (katalog dostawców, PO, dostawy, sprzedaż).
Bez sztucznych kwot: przy braku porównań zwracamy pusty zestaw + komunikat.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.product import Product
from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_RECEIPT, StockOperation
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from . import purchasing_replenish_core as core
from .purchasing_forecast_service import sales_qty_by_days

# Statusy PO uznawane za „realne” zakupy do historii cen (bez szkiców i anulowanych).
_PO_STATUSES_HISTORICAL = ("Sent", "Confirmed", "PartiallyReceived", "Closed")


def _since(range_days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=int(range_days))


def _f(x: Any) -> float:
    try:
        if x is None:
            return 0.0
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def _severity_from_percent(pct: float, *, inverse: bool = False) -> str:
    """inverse=True: niższy % = gorzej (np. podwyżka kosztu)."""
    a = abs(pct)
    if inverse:
        if a >= 12.0:
            return "high"
        if a >= 5.0:
            return "medium"
        return "low"
    if a >= 15.0:
        return "high"
    if a >= 6.0:
        return "medium"
    return "low"


def _monthly_purchase_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    since: datetime,
    product_ids: Optional[Set[int]] = None,
) -> Dict[int, float]:
    """Średnia miesięczna ilość zakupiona (szt.) z realnych przyjęć PZ."""
    q = (
        db.query(StockDocumentItem.product_id, func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0))
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(StockDocument.tenant_id == tenant_id)
        .filter(StockDocument.document_type == "PZ")
        .filter(StockDocument.created_at >= since)
        .filter(StockDocumentItem.product_id.isnot(None))
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))
    if product_ids:
        q = q.filter(StockDocumentItem.product_id.in_(product_ids))
    rows = q.group_by(StockDocumentItem.product_id).all()
    days = max(1, (datetime.utcnow() - since).days)
    factor = 30.0 / float(days)
    return {int(pid): float(qty or 0) * factor for pid, qty in rows}


def _dominant_supplier_from_receipts(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_id: int,
    since: datetime,
) -> Optional[int]:
    q = (
        db.query(StockDocument.supplier_id, func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0))
        .join(StockDocumentItem, StockDocumentItem.document_id == StockDocument.id)
        .filter(StockDocument.tenant_id == tenant_id)
        .filter(StockDocument.document_type == "PZ")
        .filter(StockDocument.created_at >= since)
        .filter(StockDocumentItem.product_id == int(product_id))
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))
    rows = q.group_by(StockDocument.supplier_id).all()
    if not rows:
        return None
    return int(max(rows, key=lambda x: _f(x[1]))[0])


def _weighted_avg_receipt_unit_price(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_id: int,
    supplier_id: int,
    since: datetime,
) -> Tuple[Optional[float], float]:
    """Średnia ważona ceny jednostkowej z realnych przyjęć (RECEIPT), fallback: linie PZ."""
    q = (
        db.query(
            func.coalesce(func.sum(StockOperation.qty * func.coalesce(StockOperation.unit_price_net, 0.0)), 0.0),
            func.coalesce(func.sum(StockOperation.qty), 0.0),
        )
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .filter(StockDocument.tenant_id == tenant_id)
        .filter(StockDocument.supplier_id == int(supplier_id))
        .filter(StockDocument.document_type == "PZ")
        .filter(StockDocument.created_at >= since)
        .filter(StockOperation.product_id == int(product_id))
        .filter(StockOperation.type == STOCK_OP_RECEIPT)
        .filter(StockOperation.unit_price_net.isnot(None))
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))
    num, den = q.one()
    num_f, den_f = _f(num), _f(den)
    if den_f <= 1e-9:
        q2 = (
            db.query(
                func.coalesce(func.sum(StockDocumentItem.received_quantity * func.coalesce(StockDocumentItem.purchase_price_net, 0.0)), 0.0),
                func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0),
            )
            .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
            .filter(
                StockDocument.tenant_id == tenant_id,
                StockDocument.supplier_id == int(supplier_id),
                StockDocument.document_type == "PZ",
                StockDocument.created_at >= since,
                StockDocumentItem.product_id == int(product_id),
                StockDocumentItem.purchase_price_net.isnot(None),
            )
        )
        if warehouse_id is not None:
            q2 = q2.filter(StockDocument.warehouse_id == int(warehouse_id))
        num, den = q2.one()
        num_f, den_f = _f(num), _f(den)
    if den_f <= 1e-9:
        return None, 0.0
    return num_f / den_f, den_f


def _catalog_price_for(
    offers_by_product: Dict[int, List[Dict[str, Any]]],
    product_id: int,
    supplier_id: int,
    product_row: Product,
) -> Optional[float]:
    for o in offers_by_product.get(int(product_id), []):
        if int(o["supplier_id"]) == int(supplier_id) and o.get("purchase_price") is not None:
            return _f(o["purchase_price"])
    if product_row.default_supplier_id == supplier_id and product_row.purchase_price is not None:
        return _f(product_row.purchase_price)
    return None


def _load_offers_by_product(db: Session, tenant_id: int) -> Dict[int, List[Dict[str, Any]]]:
    rows = (
        db.query(
            SupplierProduct.product_id,
            SupplierProduct.supplier_id,
            SupplierProduct.purchase_price,
            SupplierProduct.min_order_qty,
            Supplier.name,
        )
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(Supplier.tenant_id == tenant_id)
        .filter(Supplier.active.is_(True))
        .all()
    )
    by_p: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for pid, sid, price, moq, name in rows:
        by_p[int(pid)].append(
            {
                "supplier_id": int(sid),
                "supplier_name": (name or "").strip() or f"Dostawca #{sid}",
                "purchase_price": float(price) if price is not None else None,
                "min_order_qty": float(moq) if moq is not None else None,
            }
        )
    return by_p


def _draft_totals_by_supplier(
    db: Session, *, tenant_id: int, warehouse_id: Optional[int]
) -> Dict[int, float]:
    q = db.query(PurchaseOrder.supplier_id, func.coalesce(func.sum(PurchaseOrder.total_value), 0.0)).filter(
        PurchaseOrder.tenant_id == tenant_id,
        PurchaseOrder.status == "Draft",
    )
    if warehouse_id is not None:
        q = q.filter(PurchaseOrder.warehouse_id == int(warehouse_id))
    rows = q.group_by(PurchaseOrder.supplier_id).all()
    return {int(sid): float(val or 0) for sid, val in rows}


def _bulk_median_prices(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_id: int,
    supplier_id: int,
    moq: float,
    since: datetime,
) -> Tuple[Optional[float], Optional[float], int, int]:
    """Mediana ceny jedn. dla PZ linii z qty < moq oraz qty >= moq; liczności próbek."""
    q = (
        db.query(StockDocumentItem.received_quantity, StockDocumentItem.purchase_price_net)
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(StockDocument.tenant_id == tenant_id)
        .filter(StockDocument.supplier_id == int(supplier_id))
        .filter(StockDocument.document_type == "PZ")
        .filter(StockDocument.created_at >= since)
        .filter(StockDocumentItem.product_id == int(product_id))
        .filter(StockDocumentItem.purchase_price_net.isnot(None))
    )
    if warehouse_id is not None:
        q = q.filter(StockDocument.warehouse_id == int(warehouse_id))
    below: List[float] = []
    above: List[float] = []
    for qty, up in q.all():
        if up is None:
            continue
        qv = _f(qty)
        if qv < moq - 1e-6:
            below.append(_f(up))
        elif qv >= moq:
            above.append(_f(up))
    mb = statistics.median(below) if len(below) >= 2 else None
    ma = statistics.median(above) if len(above) >= 2 else None
    return mb, ma, len(below), len(above)


def build_price_history_drawer(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: Optional[int],
    range_days: int,
) -> List[Dict[str, Any]]:
    since = _since(range_days)
    points: List[Tuple[datetime, float, float, str]] = []

    q_po = (
        db.query(PurchaseOrder.created_at, PurchaseOrderItem.unit_price, PurchaseOrderItem.qty)
        .join(PurchaseOrderItem, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
        .filter(PurchaseOrder.tenant_id == tenant_id)
        .filter(PurchaseOrderItem.product_id == int(product_id))
        .filter(PurchaseOrder.created_at >= since)
        .filter(PurchaseOrderItem.unit_price.isnot(None))
    )
    if warehouse_id is not None:
        q_po = q_po.filter(PurchaseOrder.warehouse_id == int(warehouse_id))
    for ts, up, qty in q_po.order_by(PurchaseOrder.created_at.desc()).limit(80).all():
        if ts is None or up is None:
            continue
        points.append((ts, float(up), float(qty or 0), "purchase_order"))

    q_di = (
        db.query(
            func.coalesce(InboundDelivery.received_at, InboundDelivery.created_at),
            DeliveryItem.purchase_price,
            DeliveryItem.quantity_received,
        )
        .join(DeliveryItem, DeliveryItem.delivery_id == InboundDelivery.id)
        .filter(InboundDelivery.tenant_id == tenant_id)
        .filter(DeliveryItem.product_id == int(product_id))
        .filter(func.coalesce(InboundDelivery.received_at, InboundDelivery.created_at) >= since)
    )
    for ts, pp, qn in q_di.order_by(InboundDelivery.created_at.desc()).limit(80).all():
        if ts is None or pp is None:
            continue
        points.append((ts, float(pp), float(qn or 0), "delivery"))

    points.sort(key=lambda x: x[0], reverse=True)
    out: List[Dict[str, Any]] = []
    for ts, up, qty, src in points[:40]:
        out.append(
            {
                "date": ts.isoformat() if isinstance(ts, datetime) else str(ts),
                "unit_price": round(up, 4),
                "quantity": round(qty, 4),
                "source": src,
            }
        )
    return out


def build_supplier_offers_drawer(
    db: Session, *, tenant_id: int, product_id: int
) -> List[Dict[str, Any]]:
    offers = _load_offers_by_product(db, tenant_id).get(int(product_id), [])
    return [
        {
            "supplier_id": int(o["supplier_id"]),
            "supplier_name": str(o["supplier_name"]),
            "purchase_price": float(o["purchase_price"]) if o.get("purchase_price") is not None else None,
            "min_order_qty": float(o["min_order_qty"]) if o.get("min_order_qty") is not None else None,
        }
        for o in offers
        if o.get("purchase_price") is not None and float(o["purchase_price"]) > 0
    ]


def build_price_opportunities(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: Optional[int],
    warehouse_id: Optional[int],
    type_filter: Optional[str],
    range_days: int,
    active_sku_only: bool,
    detail_product_id: Optional[int],
) -> Dict[str, Any]:
    if range_days not in (30, 90, 365):
        range_days = 90
    since = _since(range_days)
    tf = (type_filter or "").strip().lower() or None

    supplier_names = {
        int(sid): (nm or "").strip() or f"Dostawca #{sid}"
        for sid, nm in db.query(Supplier.id, Supplier.name).filter(Supplier.tenant_id == tenant_id).all()
    }

    offers_by_product = _load_offers_by_product(db, tenant_id)
    if not offers_by_product:
        return {
            "summary": {
                "total_opportunities": 0,
                "total_possible_savings": 0.0,
                "cheaper_supplier_cases": 0,
                "threshold_discount_cases": 0,
                "price_increase_cases": 0,
                "bulk_discount_cases": 0,
                "low_rotation_high_cost_cases": 0,
            },
            "rows": [],
            "data_message": "Brak wystarczających danych — brak powiązań produkt–dostawca w katalogu.",
            "drawer": None,
        }

    products = (
        db.query(Product)
        .filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .filter(Product.id.in_(list(offers_by_product.keys())))
    )
    products_list = products.all()
    product_by_id = {int(p.id): p for p in products_list}

    monthly_purchase = _monthly_purchase_by_product(db, tenant_id=tenant_id, warehouse_id=warehouse_id, since=since)
    sales_30 = sales_qty_by_days(db, tenant_id, warehouse_id, int(range_days))
    monthly_sales = {pid: (qty / float(range_days)) * 30.0 for pid, qty in sales_30.items()}
    stock_map = core.stock_by_product(db, tenant_id, warehouse_id) if active_sku_only else {}

    def sku_jest_aktywne(pid: int) -> bool:
        if not active_sku_only:
            return True
        if monthly_purchase.get(pid, 0.0) > 1e-6:
            return True
        if monthly_sales.get(pid, 0.0) > 1e-6:
            return True
        if float(stock_map.get(pid, 0.0) or 0) > 1e-6:
            return True
        return False

    rows_out: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set()

    def add_row(d: Dict[str, Any]) -> None:
        key = f"{d['type']}:{d.get('product_id') or 0}:{d['supplier_id']}"
        if key in seen_keys:
            return
        seen_keys.add(key)
        rows_out.append(d)

    # --- 1) Tańszy inny dostawca ---
    if tf is None or tf == "cheaper_supplier":
        for pid, offers in offers_by_product.items():
            priced = [o for o in offers if o.get("purchase_price") is not None and _f(o["purchase_price"]) > 0]
            if len(priced) < 2:
                continue
            p = product_by_id.get(pid)
            if p is None:
                continue
            if not sku_jest_aktywne(pid):
                continue
            cur_sid = int(p.default_supplier_id) if p.default_supplier_id is not None else _dominant_supplier_from_receipts(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid, since=since
            )
            if cur_sid is None:
                cur_sid = int(min(priced, key=lambda o: _f(o["purchase_price"]))["supplier_id"])
            if supplier_id is not None and int(supplier_id) != int(cur_sid):
                continue
            cur_price = _catalog_price_for(offers_by_product, pid, cur_sid, p)
            if cur_price is None or cur_price <= 0:
                continue
            best_o = min(priced, key=lambda o: _f(o["purchase_price"]))
            best_price = _f(best_o["purchase_price"])
            best_sid = int(best_o["supplier_id"])
            if best_sid == cur_sid or best_price >= cur_price * 0.999:
                continue
            diff_v = cur_price - best_price
            pct = 100.0 * diff_v / cur_price if cur_price else 0.0
            vol = monthly_purchase.get(pid, 0.0) or monthly_sales.get(pid, 0.0)
            saving = diff_v * vol if vol > 1e-6 else 0.0
            add_row(
                {
                    "type": "cheaper_supplier",
                    "severity": _severity_from_percent(pct),
                    "product_id": pid,
                    "product_name": (p.name or "").strip() or f"Produkt #{pid}",
                    "supplier_id": cur_sid,
                    "supplier_name": supplier_names.get(cur_sid)
                    or next((x["supplier_name"] for x in priced if int(x["supplier_id"]) == cur_sid), ""),
                    "current_price": round(cur_price, 4),
                    "best_price": round(best_price, 4),
                    "previous_price": None,
                    "price_diff_value": round(diff_v, 4),
                    "price_diff_percent": round(pct, 2),
                    "estimated_saving": round(max(0.0, saving), 2),
                    "monthly_volume": round(vol, 3),
                    "recommendation": f"Ten sam produkt u dostawcy „{best_o['supplier_name']}” jest po {round(pct, 1)}% niższej cenie katalogowej.",
                    "action_label": "Otwórz generator z filtrem dostawcy",
                }
            )

    # --- 2) Podwyżka ceny katalogu vs średnia z zakupów (ten sam dostawca) ---
    if tf is None or tf == "price_increase":
        for pid, offers in offers_by_product.items():
            p = product_by_id.get(pid)
            if p is None:
                continue
            if not sku_jest_aktywne(pid):
                continue
            cur_sid = int(p.default_supplier_id) if p.default_supplier_id is not None else _dominant_supplier_from_receipts(
                db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=pid, since=since
            )
            if cur_sid is None:
                continue
            if supplier_id is not None and int(supplier_id) != int(cur_sid):
                continue
            hist_avg, qty_hist = _weighted_avg_receipt_unit_price(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                product_id=pid,
                supplier_id=cur_sid,
                since=since,
            )
            if hist_avg is None or hist_avg <= 0 or qty_hist < 3.0:
                continue
            cat = _catalog_price_for(offers_by_product, pid, cur_sid, p)
            if cat is None or cat <= 0:
                continue
            if cat <= hist_avg * 1.025:
                continue
            diff_v = cat - hist_avg
            pct = 100.0 * diff_v / hist_avg
            vol = monthly_purchase.get(pid, 0.0) or monthly_sales.get(pid, 0.0)
            extra = diff_v * vol if vol > 1e-6 else 0.0
            sup_name = next(
                (o["supplier_name"] for o in offers if int(o["supplier_id"]) == cur_sid),
                supplier_names.get(cur_sid, ""),
            )
            add_row(
                {
                    "type": "price_increase",
                    "severity": _severity_from_percent(pct, inverse=True),
                    "product_id": pid,
                    "product_name": (p.name or "").strip() or f"Produkt #{pid}",
                    "supplier_id": cur_sid,
                    "supplier_name": sup_name,
                    "current_price": round(cat, 4),
                    "best_price": round(hist_avg, 4),
                    "previous_price": round(hist_avg, 4),
                    "price_diff_value": round(diff_v, 4),
                    "price_diff_percent": round(pct, 2),
                    "estimated_saving": round(max(0.0, extra), 2),
                    "monthly_volume": round(vol, 3),
                    "recommendation": "Cena katalogowa u bieżącego dostawcy przewyższa średnią z ostatnich zamówień — rozważ renegocjację lub zmianę oferty.",
                    "action_label": "Historia w szczegółach",
                }
            )

    # --- 3) Próg darmowej dostawy / progu zamówienia (suma szkiców PO) ---
    if tf is None or tf == "threshold_discount":
        draft_tot = _draft_totals_by_supplier(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        sups = db.query(Supplier).filter(Supplier.tenant_id == tenant_id, Supplier.active.is_(True)).all()
        for s in sups:
            if supplier_id is not None and int(supplier_id) != int(s.id):
                continue
            if not bool(getattr(s, "offers_free_shipping", True)):
                continue
            thr = s.free_shipping_threshold
            if thr is None or _f(thr) <= 0:
                continue
            tval = _f(thr)
            cur = draft_tot.get(int(s.id), 0.0)
            if cur <= 0:
                continue
            gap = tval - cur
            if gap <= 0 or gap >= tval:
                continue
            add_row(
                {
                    "type": "threshold_discount",
                    "severity": "medium",
                    "product_id": None,
                    "product_name": "Szkice zamówień u dostawcy",
                    "supplier_id": int(s.id),
                    "supplier_name": (s.name or "").strip() or f"Dostawca #{s.id}",
                    "current_price": round(cur, 2),
                    "best_price": round(tval, 2),
                    "previous_price": None,
                    "price_diff_value": round(gap, 2),
                    "price_diff_percent": round(100.0 * gap / tval, 2) if tval else None,
                    "estimated_saving": 0.0,
                    "monthly_volume": 0.0,
                    "recommendation": f"Brakuje ok. {round(gap, 2)} PLN wartości zamówienia do progu {round(tval, 2)} PLN (np. darmowa dostawa).",
                    "action_label": "Otwórz szkice PO",
                }
            )

    # --- 4) Bulk: mediana ceny poniżej vs powyżej MOQ z historii ---
    if tf is None or tf == "bulk_discount":
        for pid, offers in offers_by_product.items():
            p = product_by_id.get(pid)
            if p is None:
                continue
            if not sku_jest_aktywne(pid):
                continue
            for o in offers:
                sid = int(o["supplier_id"])
                if supplier_id is not None and int(supplier_id) != sid:
                    continue
                moq = o.get("min_order_qty")
                if moq is None or _f(moq) < 2.0:
                    continue
                moqf = float(moq)
                mb, ma, nb, na = _bulk_median_prices(
                    db,
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    product_id=pid,
                    supplier_id=sid,
                    moq=moqf,
                    since=since,
                )
                if mb is None or ma is None or mb <= 0 or ma <= 0:
                    continue
                if ma >= mb * 0.995:
                    continue
                pct = 100.0 * (mb - ma) / mb
                if pct < 1.5:
                    continue
                vol = monthly_purchase.get(pid, 0.0)
                saving = (mb - ma) * vol if vol > 1e-6 else 0.0
                add_row(
                    {
                        "type": "bulk_discount",
                        "severity": _severity_from_percent(pct),
                        "product_id": pid,
                        "product_name": (p.name or "").strip() or f"Produkt #{pid}",
                        "supplier_id": sid,
                        "supplier_name": str(o["supplier_name"]),
                        "current_price": round(mb, 4),
                        "best_price": round(ma, 4),
                        "previous_price": round(ma, 4),
                        "price_diff_value": round(mb - ma, 4),
                        "price_diff_percent": round(pct, 2),
                        "estimated_saving": round(max(0.0, saving), 2),
                        "monthly_volume": round(vol, 3),
                        "recommendation": f"Przy zamówieniach co najmniej {moqf:g} szt. mediana ceny zakupu była niższa niż przy mniejszych partiach.",
                        "action_label": "Dodaj do zamówienia (generator)",
                    }
                )

    # --- 5) Niska rotacja + relatywnie wysoka cena vs najtańsza oferta ---
    if tf is None or tf == "low_rotation_high_cost":
        low_rotation_threshold = max(0.05, float(range_days) / 30.0 * 0.15)
        for pid, p in product_by_id.items():
            if monthly_sales.get(pid, 0.0) > low_rotation_threshold:
                continue
            if not sku_jest_aktywne(pid):
                continue
            offers = offers_by_product.get(pid, [])
            priced = [o for o in offers if o.get("purchase_price") is not None and _f(o["purchase_price"]) > 0]
            if not priced:
                continue
            min_price = min(_f(o["purchase_price"]) for o in priced)
            cur_sid = int(p.default_supplier_id) if p.default_supplier_id is not None else int(priced[0]["supplier_id"])
            if supplier_id is not None and int(supplier_id) != int(cur_sid):
                continue
            cur_price = _catalog_price_for(offers_by_product, pid, cur_sid, p)
            if cur_price is None or min_price <= 0:
                continue
            if cur_price <= min_price * 1.08:
                continue
            diff_v = cur_price - min_price
            pct = 100.0 * diff_v / cur_price if cur_price else 0.0
            vol = monthly_sales.get(pid, 0.0)
            saving = diff_v * vol if vol > 1e-6 else 0.0
            sup_name = supplier_names.get(cur_sid) or next(
                (x["supplier_name"] for x in priced if int(x["supplier_id"]) == cur_sid),
                "",
            )
            add_row(
                {
                    "type": "low_rotation_high_cost",
                    "severity": "high" if pct >= 12 else "medium",
                    "product_id": pid,
                    "product_name": (p.name or "").strip() or f"Produkt #{pid}",
                    "supplier_id": cur_sid,
                    "supplier_name": sup_name,
                    "current_price": round(cur_price, 4),
                    "best_price": round(min_price, 4),
                    "previous_price": None,
                    "price_diff_value": round(diff_v, 4),
                    "price_diff_percent": round(pct, 2),
                    "estimated_saving": round(max(0.0, saving), 2),
                    "monthly_volume": round(vol, 3),
                    "recommendation": f"Niska rotacja — płacisz powyżej najniższej ceny katalogowej o ok. {round(pct, 1)}%.",
                    "action_label": "Porównaj dostawców",
                }
            )

    rows_out.sort(key=lambda x: (-float(x.get("estimated_saving") or 0), str(x.get("type"))))

    cheaper_n = sum(1 for x in rows_out if x["type"] == "cheaper_supplier")
    thr_n = sum(1 for x in rows_out if x["type"] == "threshold_discount")
    inc_n = sum(1 for x in rows_out if x["type"] == "price_increase")
    bulk_n = sum(1 for x in rows_out if x["type"] == "bulk_discount")
    low_n = sum(1 for x in rows_out if x["type"] == "low_rotation_high_cost")
    total_save = sum(float(x.get("estimated_saving") or 0) for x in rows_out)

    data_message: Optional[str] = None
    if not rows_out:
        data_message = "Brak wystarczających danych do wykrycia okazji w wybranym oknie — potrzebne są m.in. ceny katalogowe u ≥2 dostawców lub historia PO."

    drawer: Optional[Dict[str, Any]] = None
    if detail_product_id is not None:
        dp = product_by_id.get(int(detail_product_id))
        if dp is None:
            dp = (
                db.query(Product)
                .filter(
                    Product.tenant_id == tenant_id,
                    Product.id == int(detail_product_id),
                    Product.deleted_at.is_(None),
                )
                .first()
            )
        drawer = {
            "product_id": int(detail_product_id),
            "product_name": (dp.name or "").strip() if dp else f"Produkt #{detail_product_id}",
            "price_history": build_price_history_drawer(
                db, tenant_id=tenant_id, product_id=int(detail_product_id), warehouse_id=warehouse_id, range_days=range_days
            ),
            "supplier_offers": build_supplier_offers_drawer(db, tenant_id=tenant_id, product_id=int(detail_product_id)),
            "monthly_purchase_units": round(monthly_purchase.get(int(detail_product_id), 0.0), 4),
            "monthly_sales_units": round(monthly_sales.get(int(detail_product_id), 0.0), 4),
        }

    return {
        "summary": {
            "total_opportunities": len(rows_out),
            "total_possible_savings": round(total_save, 2),
            "cheaper_supplier_cases": cheaper_n,
            "threshold_discount_cases": thr_n,
            "price_increase_cases": inc_n,
            "bulk_discount_cases": bulk_n,
            "low_rotation_high_cost_cases": low_n,
        },
        "rows": rows_out,
        "data_message": data_message,
        "drawer": drawer,
    }
