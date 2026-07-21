"""Central source of truth for product purchase cost + landed margin."""

from __future__ import annotations

import json
import math
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional

from sqlalchemy.orm import Session

from ..models.inbound_delivery import DeliveryItem
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_RECEIPT, StockOperation
from ..models.supplier_product import SupplierProduct


def _safe_float(v: object) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _product_vat_percent(p: Product) -> float:
    raw = getattr(p, "metadata_json", None)
    if not raw:
        return 23.0
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return 23.0
    if not isinstance(obj, dict):
        return 23.0
    ui = obj.get("product_ui")
    if isinstance(ui, dict):
        v = _safe_float(ui.get("vat_rate"))
        if v is not None and v >= 0:
            return v
    return 23.0


def _line_receipt_weighted_unit(db: Session, line_id: int) -> Optional[float]:
    rows = (
        db.query(StockOperation.qty, StockOperation.unit_price_net)
        .filter(StockOperation.document_line_id == int(line_id), StockOperation.type == STOCK_OP_RECEIPT)
        .all()
    )
    net_sum = 0.0
    qty_sum = 0.0
    for q, p in rows:
        qf = _safe_float(q)
        pf = _safe_float(p)
        if qf is None or pf is None or qf <= 1e-12 or pf < 0:
            continue
        qty_sum += qf
        net_sum += qf * pf
    if qty_sum <= 1e-12:
        return None
    return net_sum / qty_sum


def _resolve_line_unit_net(db: Session, row: StockDocumentItem) -> Optional[float]:
    line_price = _safe_float(getattr(row, "purchase_price_net", None))
    if line_price is not None and line_price >= 0:
        return line_price
    w = _line_receipt_weighted_unit(db, int(row.id))
    if w is not None:
        return w
    if getattr(row, "delivery_item_id", None) is not None:
        di = db.query(DeliveryItem).filter(DeliveryItem.id == int(row.delivery_item_id)).first()
        if di is not None:
            pp = _safe_float(getattr(di, "purchase_price", None))
            if pp is not None and pp >= 0:
                return pp
    return None


def _latest_posted_pz_unit_for_product(
    db: Session,
    tenant_id: int,
    product_id: int,
    source_doc_id: Optional[int] = None,
) -> tuple[Optional[float], Optional[datetime], Optional[str], Optional[int]]:
    q = (
        db.query(StockDocument)
        .join(StockDocumentItem, StockDocumentItem.document_id == StockDocument.id)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.document_type == "PZ",
            StockDocumentItem.product_id == int(product_id),
            StockDocumentItem.received_quantity > 1e-9,
        )
    )
    if source_doc_id is None:
        q = q.filter(StockDocument.status == "posted")
    if source_doc_id is not None:
        q = q.filter(StockDocument.id == int(source_doc_id))
    doc = q.order_by(StockDocument.updated_at.desc(), StockDocument.id.desc()).first()
    if doc is None:
        return None, None, None, None
    lines = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.product_id == int(product_id),
            StockDocumentItem.received_quantity > 1e-9,
        )
        .all()
    )
    net_sum = 0.0
    qty_sum = 0.0
    for ln in lines:
        qty = _safe_float(getattr(ln, "received_quantity", None))
        if qty is None or qty <= 1e-12:
            continue
        unit = _resolve_line_unit_net(db, ln)
        if unit is None:
            continue
        net_sum += qty * unit
        qty_sum += qty
    if qty_sum <= 1e-12:
        return None, doc.updated_at, (getattr(doc, "currency", None) or "PLN"), int(doc.id)
    return (net_sum / qty_sum), doc.updated_at, (getattr(doc, "currency", None) or "PLN"), int(doc.id)


def _latest_supplier_price_for_product(
    db: Session,
    tenant_id: int,
    p: Product,
    *,
    prefer_supplier_id: Optional[int] = None,
) -> Optional[float]:
    sid = prefer_supplier_id if prefer_supplier_id is not None else getattr(p, "default_supplier_id", None)
    if sid is not None:
        row = (
            db.query(SupplierProduct.purchase_price)
            .filter(
                SupplierProduct.tenant_id == int(tenant_id),
                SupplierProduct.product_id == int(p.id),
                SupplierProduct.supplier_id == int(sid),
                SupplierProduct.purchase_price.isnot(None),
            )
            .order_by(SupplierProduct.id.desc())
            .first()
        )
        if row is not None:
            v = _safe_float(row[0])
            if v is not None and v >= 0:
                return v
    row2 = (
        db.query(SupplierProduct.purchase_price)
        .filter(
            SupplierProduct.tenant_id == int(tenant_id),
            SupplierProduct.product_id == int(p.id),
            SupplierProduct.purchase_price.isnot(None),
        )
        .order_by(SupplierProduct.id.desc())
        .first()
    )
    if row2 is None:
        return None
    v2 = _safe_float(row2[0])
    return v2 if v2 is not None and v2 >= 0 else None


def _latest_posted_pz_unit_for_product_supplier(
    db: Session,
    tenant_id: int,
    product_id: int,
    supplier_id: int,
) -> Optional[float]:
    """Last reliable purchase unit net for product from posted PZ of this supplier (tenant-scoped)."""
    doc = (
        db.query(StockDocument)
        .join(StockDocumentItem, StockDocumentItem.document_id == StockDocument.id)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.document_type == "PZ",
            StockDocument.status == "posted",
            StockDocument.supplier_id == int(supplier_id),
            StockDocumentItem.product_id == int(product_id),
            StockDocumentItem.received_quantity > 1e-9,
        )
        .order_by(StockDocument.updated_at.desc(), StockDocument.id.desc())
        .first()
    )
    if doc is None:
        return None
    lines = (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(doc.id),
            StockDocumentItem.product_id == int(product_id),
            StockDocumentItem.received_quantity > 1e-9,
        )
        .all()
    )
    net_sum = 0.0
    qty_sum = 0.0
    for ln in lines:
        qty = _safe_float(getattr(ln, "received_quantity", None))
        if qty is None or qty <= 1e-12:
            continue
        unit = _resolve_line_unit_net(db, ln)
        if unit is None:
            continue
        net_sum += qty * unit
        qty_sum += qty
    if qty_sum <= 1e-12:
        return None
    return net_sum / qty_sum


def resolve_suggested_purchase_price_net_for_pz(
    db: Session,
    tenant_id: int,
    product_id: int,
    *,
    supplier_id: Optional[int] = None,
) -> Optional[float]:
    """
    Hint for new WMS/manual PZ line — last reliable purchase net (never sale price, never fake 0).

    Priority:
      1) last posted PZ line for this product + current supplier,
      2) last posted PZ line for this product (tenant-global),
      3) supplier_products.purchase_price (prefer current supplier),
      4) product.purchase_price master snapshot.
    """
    if supplier_id is not None:
        from_sup = _latest_posted_pz_unit_for_product_supplier(
            db, int(tenant_id), int(product_id), int(supplier_id)
        )
        if from_sup is not None and from_sup >= 0:
            return round(float(from_sup), 4)

    pz_cost, _pz_dt, _pz_ccy, _pz_doc = _latest_posted_pz_unit_for_product(
        db, int(tenant_id), int(product_id)
    )
    if pz_cost is not None and pz_cost >= 0:
        return round(float(pz_cost), 4)

    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if p is None:
        return None

    try:
        from sqlalchemy.exc import OperationalError, ProgrammingError

        nested = db.begin_nested()
        try:
            sup_price = _latest_supplier_price_for_product(
                db, int(tenant_id), p, prefer_supplier_id=supplier_id
            )
            nested.commit()
        except (OperationalError, ProgrammingError):
            nested.rollback()
            sup_price = None
    except Exception:
        # begin_nested unavailable — skip supplier fallback without poisoning outer txn
        sup_price = None
    if sup_price is not None and sup_price >= 0:
        return round(float(sup_price), 4)

    manual = _safe_float(getattr(p, "purchase_price", None))
    if manual is not None and manual >= 0:
        return round(float(manual), 4)
    return None


def get_product_current_cost(db: Session, tenant_id: int, product_id: int) -> Dict[str, Any]:
    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if p is None:
        return {
            "purchase_net": None,
            "purchase_gross": None,
            "extra_cost_net": None,
            "landed_cost_net": None,
            "vat_percent": 23.0,
            "sale_net": None,
            "sale_gross": None,
            "margin_value": None,
            "margin_percent": None,
            "updated_at": None,
            "source": "missing_product",
        }

    purchase_net = None
    source = "none"
    updated_at = getattr(p, "last_purchase_date", None)
    pz_cost, pz_dt, _pz_ccy, pz_doc_id = _latest_posted_pz_unit_for_product(db, tenant_id, int(product_id))
    if pz_cost is not None:
        purchase_net = pz_cost
        source = f"pz:{pz_doc_id}"
        updated_at = pz_dt or updated_at
    else:
        sup_price = _latest_supplier_price_for_product(db, tenant_id, p)
        if sup_price is not None:
            purchase_net = sup_price
            source = "supplier_price"
        else:
            manual = _safe_float(getattr(p, "purchase_price", None))
            if manual is not None:
                purchase_net = manual
                source = "manual_purchase_price"

    sale_net = _safe_float(getattr(p, "sale_price", None))
    vat_percent = _product_vat_percent(p)

    packaging = _safe_float(getattr(p, "extra_cost_packaging_net", None)) or 0.0
    other = _safe_float(getattr(p, "extra_cost_other_net", None)) or 0.0
    commission_percent = _safe_float(getattr(p, "extra_cost_commission_percent", None)) or 0.0
    commission_cost = (sale_net * commission_percent / 100.0) if sale_net is not None else 0.0
    extra_cost_net = packaging + other + commission_cost

    landed_cost_net = (purchase_net + extra_cost_net) if purchase_net is not None else None
    sale_gross = (sale_net * (1.0 + vat_percent / 100.0)) if sale_net is not None else None
    purchase_gross = (purchase_net * (1.0 + vat_percent / 100.0)) if purchase_net is not None else None
    margin_value = (sale_net - landed_cost_net) if sale_net is not None and landed_cost_net is not None else None
    margin_percent = ((margin_value / sale_net) * 100.0) if margin_value is not None and sale_net and sale_net > 1e-12 else None

    return {
        "purchase_net": round(purchase_net, 4) if purchase_net is not None else None,
        "purchase_gross": round(purchase_gross, 4) if purchase_gross is not None else None,
        "extra_cost_net": round(extra_cost_net, 4),
        "landed_cost_net": round(landed_cost_net, 4) if landed_cost_net is not None else None,
        "vat_percent": round(vat_percent, 2),
        "sale_net": round(sale_net, 4) if sale_net is not None else None,
        "sale_gross": round(sale_gross, 4) if sale_gross is not None else None,
        "margin_value": round(margin_value, 4) if margin_value is not None else None,
        "margin_percent": round(margin_percent, 4) if margin_percent is not None else None,
        "updated_at": updated_at.isoformat() if isinstance(updated_at, datetime) else None,
        "source": source,
    }


def calculate_product_margin(db: Session, tenant_id: int, product_id: int) -> Dict[str, Any]:
    return get_product_current_cost(db, tenant_id, product_id)


def refresh_product_cost_from_pz(
    db: Session,
    tenant_id: int,
    product_id: int,
    source_doc_id: Optional[int] = None,
) -> Dict[str, Any]:
    p = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if p is None:
        return get_product_current_cost(db, tenant_id, product_id)
    purchase_net, pz_dt, pz_ccy, pz_doc_id = _latest_posted_pz_unit_for_product(
        db, tenant_id, product_id, source_doc_id=source_doc_id
    )
    if purchase_net is not None:
        cur = _safe_float(getattr(p, "purchase_price", None))
        if cur is not None:
            p.previous_purchase_price = Decimal(str(round(cur, 2)))
        p.purchase_price = Decimal(str(round(purchase_net, 2)))
        p.purchase_price_original = Decimal(str(round(purchase_net, 4)))
        p.purchase_currency = (pz_ccy or "PLN").strip().upper()[:8]
        when = pz_dt or datetime.utcnow()
        p.last_purchased_at = when
        p.last_purchase_date = when
        if pz_doc_id is not None:
            pz = db.query(StockDocument).filter(StockDocument.id == int(pz_doc_id)).first()
            if pz is not None:
                p.last_supplier_id = getattr(pz, "supplier_id", None)
                p.last_purchase_currency = (getattr(pz, "currency", None) or "PLN").strip().upper()[:8]
    return get_product_current_cost(db, tenant_id, product_id)


def get_products_current_costs(db: Session, tenant_id: int, product_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    out: Dict[int, Dict[str, Any]] = {}
    for pid in {int(x) for x in product_ids}:
        out[pid] = get_product_current_cost(db, tenant_id, pid)
    return out

