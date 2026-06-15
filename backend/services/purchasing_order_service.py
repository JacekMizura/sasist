"""Purchase order workflow: create from replenishment generator, CRUD, inbound delivery bridge."""

from __future__ import annotations

import time
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from ..domain.supplier_product_linkage import product_allowed_for_supplier
from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from .delivery_item_catalog_snapshot import hydrate_delivery_item_snapshots
from ..models.product import Product
from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from ..models.tenant_warehouse import TenantWarehouse
from . import purchasing_replenish_core as core
from . import currency_rate_service as fx_rates
from .product_inventory_snapshot_service import inventory_snapshots_for_products
from .purchasing_replenishment_service import replenishment_rows_for_export
from .purchase_order_warehouse_sync_service import sync_purchase_order_status_for_po_id

# API / DB status strings (match product spec)
PO_DRAFT = "Draft"
PO_SENT = "Sent"
PO_CONFIRMED = "Confirmed"
PO_PARTIALLY_RECEIVED = "PartiallyReceived"
PO_DELIVERED = "Delivered"
PO_CLOSED = "Closed"
PO_CANCELLED = "Cancelled"

TAX_MODE_DOMESTIC = "domestic_vat"
TAX_MODE_INTRA_EU_RC = "intra_eu_reverse_charge"

PO_STATUSES = frozenset(
    {PO_DRAFT, PO_SENT, PO_CONFIRMED, PO_PARTIALLY_RECEIVED, PO_DELIVERED, PO_CLOSED, PO_CANCELLED}
)

_ALLOWED_TRANSITIONS: Dict[str, frozenset[str]] = {
    PO_DRAFT: frozenset({PO_SENT, PO_CANCELLED}),
    PO_SENT: frozenset({PO_CONFIRMED, PO_PARTIALLY_RECEIVED, PO_DELIVERED, PO_CANCELLED}),
    PO_CONFIRMED: frozenset({PO_PARTIALLY_RECEIVED, PO_DELIVERED, PO_CLOSED, PO_CANCELLED}),
    PO_PARTIALLY_RECEIVED: frozenset({PO_PARTIALLY_RECEIVED, PO_DELIVERED, PO_CLOSED, PO_CANCELLED}),
    PO_DELIVERED: frozenset({PO_DELIVERED, PO_CLOSED, PO_CANCELLED}),
    PO_CLOSED: frozenset(),
    PO_CANCELLED: frozenset(),
}


ERR_PO_WAREHOUSE_REQUIRED = "Zamówienie zakupu wymaga przypisanego magazynu."


def _assert_warehouse_for_tenant(db: Session, tenant_id: int, warehouse_id: Optional[int]) -> None:
    if warehouse_id is None:
        raise HTTPException(status_code=400, detail=ERR_PO_WAREHOUSE_REQUIRED)
    ok = (
        db.query(TenantWarehouse.id)
        .filter(TenantWarehouse.tenant_id == tenant_id, TenantWarehouse.warehouse_id == int(warehouse_id))
        .first()
    )
    if not ok:
        raise HTTPException(status_code=400, detail="warehouse_id is not linked to this tenant")


def _line_total(qty: float, unit_price: Optional[float]) -> float:
    if unit_price is None:
        return 0.0
    return round(float(qty) * float(unit_price), 2)


def _po_valuation_date(po: PurchaseOrder) -> date:
    inv = getattr(po, "invoice_date", None)
    if inv is not None:
        if isinstance(inv, datetime):
            return inv.date()
        return inv if isinstance(inv, date) else date.today()
    if po.expected_date is not None:
        ed = po.expected_date
        return ed.date() if isinstance(ed, datetime) else ed if isinstance(ed, date) else date.today()
    ca = po.created_at or datetime.utcnow()
    return ca.date() if hasattr(ca, "date") else date.today()


def _present_order_number(po: PurchaseOrder) -> str:
    """Human-readable visible format for UI while keeping DB field backward-compatible."""
    dt = getattr(po, "created_at", None) or datetime.utcnow()
    yy = int(getattr(dt, "year", datetime.utcnow().year))
    return f"PO/{yy}/{int(po.id)}"


def recalculate_purchase_order_totals(po: PurchaseOrder) -> None:
    sub = round(sum(float(it.line_total or 0) for it in po.items), 2)
    po.subtotal = sub
    ship = float(po.shipping_cost or 0.0)
    po.total_value = round(sub + ship, 2)


def _supplier_warnings(sup: Supplier, total_qty: float, subtotal: float) -> List[str]:
    out: List[str] = []
    req_moq = bool(getattr(sup, "requires_moq", True))
    if req_moq:
        moq = getattr(sup, "minimum_order_qty", None)
        if moq is not None and int(moq) > 0 and total_qty + 1e-9 < int(moq):
            out.append(f"Total quantity {total_qty:g} is below supplier minimum order quantity ({int(moq)}).")
        mov = sup.minimum_order_value
        if mov is not None and float(mov) > 0 and subtotal + 1e-9 < float(mov):
            out.append(f"Order subtotal {subtotal:.2f} is below supplier minimum order value ({float(mov):.2f}).")
    if bool(getattr(sup, "offers_free_shipping", True)):
        fst = sup.free_shipping_threshold
        if fst is not None and float(fst) > 0 and subtotal + 1e-9 < float(fst):
            out.append(
                f"Order subtotal {subtotal:.2f} is below free-shipping threshold ({float(fst):.2f}); shipping may apply."
            )
    return out


def create_orders_from_generator(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Sequence[int],
    override_qty_map: Optional[Dict[int, float]] = None,
) -> Dict[str, Any]:
    # Tworzenie szkiców PO z jawnego wyboru w generatorze — nie pomijamy linii tylko dlatego, że sugestia = 0.
    if not product_ids:
        raise HTTPException(status_code=400, detail="product_ids must not be empty")
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    override_qty_map = override_qty_map or {}
    uniq_ids = list({int(x) for x in product_ids})
    rows = replenishment_rows_for_export(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        search=None,
        supplier_id=None,
        category_id=None,
        critical_only=False,
        low_stock_only=False,
        positive_margin_only=False,
        sort_by="product_name",
        sort_dir="asc",
        product_ids=uniq_ids,
        max_rows=len(uniq_ids) + 50,
    )
    by_pid = {int(r["product_id"]): r for r in rows}
    skipped: List[int] = []
    # Licznik pominięć z powodu braku dostawcy (do komunikatu UI po polsku).
    skipped_no_supplier = 0
    groups: Dict[int, List[Dict[str, Any]]] = {}
    for pid in uniq_ids:
        row = by_pid.get(pid)
        if not row:
            skipped.append(pid)
            continue
        sid = row.get("supplier_id")
        if sid is None:
            skipped.append(pid)
            skipped_no_supplier += 1
            continue
        groups.setdefault(int(sid), []).append(row)

    created: List[Dict[str, Any]] = []
    now = datetime.utcnow()

    for supplier_id, g_rows in groups.items():
        sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
        if not sup:
            for r in g_rows:
                skipped.append(int(r["product_id"]))
            continue

        cur = (
            str(sup.default_currency).strip() if getattr(sup, "default_currency", None) is not None else None
        ) or "PLN"
        tax_mode = fx_rates.default_tax_mode_for_supplier_currency(getattr(sup, "country", None), cur)
        po = PurchaseOrder(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            supplier_id=supplier_id,
            order_number=f"TMP-{supplier_id}-{time.time_ns()}",
            status=PO_DRAFT,
            currency=cur,
            tax_mode=tax_mode,
            invoice_date=None,
            subtotal=0.0,
            shipping_cost=0.0,
            total_value=0.0,
            notes=None,
            created_at=now,
            updated_at=now,
            expected_date=None,
            sent_at=None,
            confirmed_at=None,
            closed_at=None,
        )
        db.add(po)
        db.flush()
        po.order_number = _present_order_number(po)
        db.flush()

        total_qty = 0.0
        for r in g_rows:
            pid = int(r["product_id"])
            p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
            if not p or p.deleted_at is not None:
                skipped.append(pid)
                continue
            if not product_allowed_for_supplier(db, p, supplier_id):
                skipped.append(pid)
                continue
            # Jawny wybór wiersza w generatorze = zamówienie ma powstać nawet przy sugestii 0.
            base_qty = float(r.get("suggested_qty") or 0.0)
            if pid in override_qty_map:
                base_qty = float(override_qty_map[pid])
            if base_qty <= 0:
                base_qty = 1.0
            up = r.get("buy_price")
            unit_price = float(up) if up is not None else None
            lt = _line_total(base_qty, unit_price)
            it = PurchaseOrderItem(
                purchase_order_id=po.id,
                product_id=pid,
                qty=base_qty,
                received_qty=0.0,
                unit_price=unit_price,
                line_total=lt,
                notes=None,
            )
            db.add(it)
            total_qty += base_qty

        db.flush()
        if not po.items:
            db.delete(po)
            db.flush()
            continue

        recalculate_purchase_order_totals(po)
        warnings = _supplier_warnings(sup, total_qty, float(po.subtotal or 0.0))
        created.append({"order_id": po.id, "warnings": warnings})

    db.commit()
    out_orders = []
    for c in created:
        po = (
            db.query(PurchaseOrder)
            .options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.supplier))
            .filter(PurchaseOrder.id == c["order_id"])
            .first()
        )
        out_orders.append(
            {
                "order": purchase_order_to_detail_dict(db, po),
                "warnings": c["warnings"],
            }
        )
    return {
        "created_orders": out_orders,
        "skipped_product_ids": sorted(set(skipped)),
        "skipped_no_supplier_count": int(skipped_no_supplier),
    }


def purchase_order_to_list_dict(db: Session, po: PurchaseOrder) -> Dict[str, Any]:
    sup = po.supplier or db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    item_count = (
        db.query(func.count(PurchaseOrderItem.id)).filter(PurchaseOrderItem.purchase_order_id == po.id).scalar() or 0
    )
    return {
        "id": po.id,
        "tenant_id": po.tenant_id,
        "warehouse_id": po.warehouse_id,
        "supplier_id": po.supplier_id,
        "supplier_name": (sup.name or "").strip() if sup else "",
        "order_number": _present_order_number(po),
        "status": po.status,
        "currency": po.currency,
        "tax_mode": getattr(po, "tax_mode", None) or TAX_MODE_DOMESTIC,
        "subtotal": float(po.subtotal or 0),
        "shipping_cost": float(po.shipping_cost or 0),
        "total_value": float(po.total_value or 0),
        "item_count": int(item_count),
        "created_at": po.created_at,
        "updated_at": po.updated_at,
        "expected_date": po.expected_date,
        "sent_at": po.sent_at,
        "confirmed_at": po.confirmed_at,
        "closed_at": po.closed_at,
    }


def _item_to_dict(db: Session, it: PurchaseOrderItem) -> Dict[str, Any]:
    """Podstawowy kształt linii — użyj ``_po_lines_enriched`` w szczegółach zamówienia."""
    p = db.query(Product).filter(Product.id == it.product_id).first()
    return {
        "id": it.id,
        "purchase_order_id": it.purchase_order_id,
        "product_id": it.product_id,
        "product_name": (p.name or "").strip() if p else None,
        "sku": (str(p.symbol).strip() if p and getattr(p, "symbol", None) else None)
        or (str(p.sku).strip() if p and getattr(p, "sku", None) else None),
        "qty": float(it.qty),
        "received_qty": float(it.received_qty or 0),
        "unit_price": float(it.unit_price) if it.unit_price is not None else None,
        "line_total": float(it.line_total or 0),
        "notes": it.notes,
    }


def _po_lines_enriched(db: Session, po: PurchaseOrder) -> List[Dict[str, Any]]:
    """Linie PO z polami pomocniczymi do tabeli (stan, sprzedaż, sugestia, lead)."""
    items = sorted(po.items, key=lambda x: x.id) if po.items else []
    if not items:
        return []
    pids = [int(it.product_id) for it in items]
    products = db.query(Product).filter(Product.id.in_(pids)).all()
    pmap = {int(x.id): x for x in products}
    sales_map = core.sales_qty_by_product(db, int(po.tenant_id), po.warehouse_id)
    cat_first = core.catalog_supplier_first(db, int(po.tenant_id))
    price_map = core.supplier_price_map(db, int(po.tenant_id))
    line_snaps = inventory_snapshots_for_products(db, int(po.tenant_id), po.warehouse_id, pids)
    available_map = {pid: float(s["available"]) for pid, s in line_snaps.items()}
    inbound_map = {pid: float(s["inbound_total"]) for pid, s in line_snaps.items()}
    # Odczyt powiązań produkt–dostawca; przy błędzie DB nie przerywamy odpowiedzi — cena z linii PO, lead z dostawcy.
    sp_by_pid: Dict[int, Any] = {}
    try:
        sp_rows = (
            db.query(SupplierProduct)
            .filter(SupplierProduct.supplier_id == int(po.supplier_id), SupplierProduct.product_id.in_(pids))
            .all()
        )
        sp_by_pid = {int(r.product_id): r for r in sp_rows}
    except SQLAlchemyError:
        sp_by_pid = {}
    sup = db.query(Supplier).filter(Supplier.id == int(po.supplier_id)).first()
    supplier_default_lead = int(sup.default_lead_time_days) if sup and sup.default_lead_time_days else None
    supplier_name = (sup.name or "").strip() if sup else ""
    out: List[Dict[str, Any]] = []
    for it in items:
        p = pmap.get(int(it.product_id))
        base = _item_to_dict(db, it)
        if not p:
            out.append(base)
            continue
        m = core.metrics_from_product(p, available_map, sales_map, inbound_map, cat_first)
        sp = sp_by_pid.get(int(p.id))
        offer = None
        if sp:
            pk = getattr(sp, "pack_qty", None)
            ck = getattr(sp, "carton_qty", None)
            offer = core.SupplierOfferConstraints(
                lead_time_days=int(sp.lead_time_days) if sp.lead_time_days is not None else None,
                min_order_qty=float(sp.min_order_qty) if sp.min_order_qty is not None else None,
                pack_qty=float(pk) if pk is not None and float(pk) > 0 else None,
                carton_qty=float(ck) if ck is not None and float(ck) > 0 else None,
            )
        upc = (
            float(p.units_per_carton)
            if getattr(p, "units_per_carton", None) is not None and float(p.units_per_carton or 0) > 0
            else None
        )
        apply_offer_moq = bool(getattr(sup, "requires_moq", True)) if sup else True
        sq = core.compute_replenishment_suggested_qty(
            m,
            product_unit=getattr(p, "unit", None),
            offer=offer,
            supplier_default_lead=supplier_default_lead,
            units_per_carton_fallback=upc,
            apply_offer_moq=apply_offer_moq,
        )
        ld = None
        if sp and sp.lead_time_days is not None:
            ld = int(sp.lead_time_days)
        elif supplier_default_lead is not None:
            ld = supplier_default_lead
        base.update(
            {
                "ean": getattr(p, "ean", None),
                "image_url": str(p.image_url).strip() if getattr(p, "image_url", None) else None,
                "current_stock": 0.0 if abs(float(m.stock)) < 1e-12 else round(float(m.stock), 6),
                "sales_30d": round(float(m.sales_30d), 3),
                "suggested_qty": float(sq),
                "sell_price": float(p.sale_price) if p.sale_price is not None else None,
                "supplier_name": supplier_name,
                "lead_time_days": ld,
            }
        )
        out.append(base)
    return out


def _enrich_purchase_order_detail_fx(db: Session, tenant_id: int, po: PurchaseOrder, base: Dict[str, Any]) -> None:
    mode = getattr(po, "tax_mode", None) or TAX_MODE_DOMESTIC
    base["tax_mode"] = mode
    inv = getattr(po, "invoice_date", None)
    if inv is not None:
        if isinstance(inv, datetime):
            base["invoice_date"] = inv.date().isoformat()
        elif isinstance(inv, date):
            base["invoice_date"] = inv.isoformat()
        else:
            base["invoice_date"] = str(inv)[:10]
    else:
        base["invoice_date"] = None
    cur = (po.currency or "PLN").strip().upper()
    basis = _po_valuation_date(po)
    base["fx_basis_date"] = basis.isoformat()
    rate, eff_date, rsrc = fx_rates.resolve_rate_to_pln(
        db,
        tenant_id=tenant_id,
        currency=cur,
        on_date=basis,
        allow_nbp_fetch=True,
    )
    base["fx_rate_to_pln"] = rate
    base["fx_rate_effective_date"] = eff_date.isoformat() if eff_date else None
    base["fx_source_used"] = rsrc
    ship = float(po.shipping_cost or 0.0)
    sub = float(po.subtotal or 0.0)
    net_doc = round(sub + ship, 2)
    intra_doc_vat0 = mode == TAX_MODE_INTRA_EU_RC and cur != "PLN"
    if intra_doc_vat0:
        base["supplier_invoice_vat_rate_percent"] = 0.0
        base["document_net"] = net_doc
        base["document_vat_supplier"] = 0.0
        base["document_gross"] = net_doc
    else:
        base["supplier_invoice_vat_rate_percent"] = 23.0
        vat_doc = round(net_doc * 0.23, 2)
        base["document_net"] = net_doc
        base["document_vat_supplier"] = vat_doc
        base["document_gross"] = round(net_doc + vat_doc, 2)
    if rate is not None and cur != "PLN":
        pln_net = round(net_doc * float(rate), 2)
        pln_vat = round(pln_net * 0.23, 2)
        base["pln_net_total_sim"] = pln_net
        base["pln_vat_23_sim"] = pln_vat
        base["pln_gross_sim"] = round(pln_net + pln_vat, 2)
    elif cur == "PLN":
        pln_net = net_doc
        pln_vat = round(pln_net * 0.23, 2)
        base["pln_net_total_sim"] = pln_net
        base["pln_vat_23_sim"] = pln_vat
        base["pln_gross_sim"] = round(pln_net + pln_vat, 2)
    else:
        base["pln_net_total_sim"] = None
        base["pln_vat_23_sim"] = None
        base["pln_gross_sim"] = None


def purchase_order_to_detail_dict(db: Session, po: PurchaseOrder) -> Dict[str, Any]:
    base = purchase_order_to_list_dict(db, po)
    sup = po.supplier or db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    items = sorted(po.items, key=lambda x: x.id) if po.items else []
    base["supplier"] = (
        {
            "id": sup.id,
            "name": (sup.name or "").strip(),
            "email": sup.email,
            "phone": sup.phone,
            "default_currency": str(sup.default_currency) if sup.default_currency else None,
            "minimum_order_qty": int(sup.minimum_order_qty) if sup.minimum_order_qty is not None else None,
            "minimum_order_value": float(sup.minimum_order_value) if sup.minimum_order_value is not None else None,
            "free_shipping_threshold": float(sup.free_shipping_threshold)
            if sup.free_shipping_threshold is not None
            else None,
            "offers_free_shipping": bool(getattr(sup, "offers_free_shipping", True)),
            "requires_moq": bool(getattr(sup, "requires_moq", True)),
            "lead_time_days": int(sup.default_lead_time_days) if sup.default_lead_time_days is not None else None,
        }
        if sup
        else None
    )
    base["notes"] = po.notes
    base["items"] = _po_lines_enriched(db, po)
    existing_delivery = (
        db.query(InboundDelivery.id)
        .filter(InboundDelivery.tenant_id == po.tenant_id, InboundDelivery.purchase_order_id == po.id)
        .first()
    )
    base["inbound_delivery_id"] = int(existing_delivery[0]) if existing_delivery else None
    _enrich_purchase_order_detail_fx(db, int(po.tenant_id), po, base)
    return base


def list_purchase_orders(
    db: Session,
    *,
    tenant_id: int,
    supplier_id: Optional[int],
    status: Optional[str],
    page: int,
    page_size: int,
) -> Tuple[List[Dict[str, Any]], int]:
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), 200)
    q = db.query(PurchaseOrder).filter(PurchaseOrder.tenant_id == tenant_id)
    if supplier_id is not None:
        q = q.filter(PurchaseOrder.supplier_id == int(supplier_id))
    if status and status.strip():
        st = status.strip()
        if st not in PO_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        q = q.filter(PurchaseOrder.status == st)
    total = q.count()
    rows = (
        q.order_by(PurchaseOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [purchase_order_to_list_dict(db, po) for po in rows], total


def get_purchase_order(db: Session, tenant_id: int, order_id: int) -> Dict[str, Any]:
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.tenant_id == tenant_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return purchase_order_to_detail_dict(db, po)


def _assert_po_editable(po: PurchaseOrder) -> None:
    if po.status in (PO_CLOSED, PO_CANCELLED):
        raise HTTPException(status_code=400, detail="Purchase order is not editable in this status")


def patch_purchase_order(
    db: Session,
    tenant_id: int,
    order_id: int,
    *,
    notes: Optional[str] = None,
    expected_date: Optional[datetime] = None,
    shipping_cost: Optional[float] = None,
    currency: Optional[str] = None,
    invoice_date: Optional[date] = None,
    update_invoice_date: bool = False,
    tax_mode: Optional[str] = None,
    line_updates: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.tenant_id == tenant_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _assert_po_editable(po)

    if notes is not None:
        po.notes = notes.strip() if notes.strip() else None
    if expected_date is not None:
        po.expected_date = expected_date
    if shipping_cost is not None:
        po.shipping_cost = float(shipping_cost)
    if currency is not None:
        po.currency = (currency.strip() or "PLN")[:8]
        sup2 = po.supplier or db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
        po.tax_mode = fx_rates.default_tax_mode_for_supplier_currency(
            getattr(sup2, "country", None) if sup2 else None, po.currency
        )
    if update_invoice_date:
        po.invoice_date = invoice_date
    if tax_mode is not None:
        tm = str(tax_mode).strip()
        if tm not in (TAX_MODE_DOMESTIC, TAX_MODE_INTRA_EU_RC):
            raise HTTPException(status_code=400, detail="Invalid tax_mode")
        po.tax_mode = tm

    if line_updates:
        draft_only = po.status == PO_DRAFT
        by_id = {it.id: it for it in po.items}
        for patch in line_updates:
            iid = int(patch["id"])
            it = by_id.get(iid)
            if not it or it.purchase_order_id != po.id:
                raise HTTPException(status_code=400, detail=f"Unknown line id {iid}")
            if not draft_only:
                if ("qty" in patch and patch["qty"] is not None) or ("unit_price" in patch and patch.get("unit_price") is not None):
                    raise HTTPException(
                        status_code=400,
                        detail="Quantity and unit price can only be edited while the purchase order is in Draft status.",
                    )
            if draft_only and "qty" in patch and patch["qty"] is not None:
                qv = float(patch["qty"])
                if qv < float(it.received_qty or 0) - 1e-9:
                    raise HTTPException(status_code=400, detail="qty cannot be below received_qty")
                it.qty = qv
            if draft_only and "unit_price" in patch:
                ppv = patch["unit_price"]
                it.unit_price = None if ppv is None else float(ppv)
            if "received_qty" in patch and patch["received_qty"] is not None:
                rv = float(patch["received_qty"])
                if rv < 0 or rv > float(it.qty) + 1e-9:
                    raise HTTPException(status_code=400, detail="received_qty out of range")
                it.received_qty = rv
            if "notes" in patch:
                nv = patch["notes"]
                it.notes = None if nv is None else (str(nv).strip() or None)
            it.line_total = _line_total(float(it.qty), it.unit_price)

    po.updated_at = datetime.utcnow()
    recalculate_purchase_order_totals(po)
    db.commit()
    db.refresh(po)
    return get_purchase_order(db, tenant_id, order_id)


def patch_purchase_order_status(db: Session, tenant_id: int, order_id: int, new_status: str) -> Dict[str, Any]:
    st = (new_status or "").strip()
    if st not in PO_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id, PurchaseOrder.tenant_id == tenant_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    cur = po.status
    if st == cur:
        return get_purchase_order(db, tenant_id, order_id)
    allowed = _ALLOWED_TRANSITIONS.get(cur, frozenset())
    if st not in allowed:
        raise HTTPException(status_code=400, detail=f"Cannot transition from {cur} to {st}")
    now = datetime.utcnow()
    po.status = st
    if st == PO_SENT and po.sent_at is None:
        po.sent_at = now
    if st == PO_CONFIRMED and po.confirmed_at is None:
        po.confirmed_at = now
    if st == PO_CLOSED and po.closed_at is None:
        po.closed_at = now
    po.updated_at = now
    db.commit()
    db.refresh(po)
    return get_purchase_order(db, tenant_id, order_id)


def delete_or_archive_purchase_order(db: Session, tenant_id: int, order_id: int) -> Dict[str, Any]:
    """
    Deletion policy:
    - Draft + no linked PZ receipts => hard delete.
    - Non-draft => archive via status=Cancelled.
    - If linked PZ receipts exist => never hard delete.
    """
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.tenant_id == tenant_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    linked_pz_docs = (
        db.query(StockDocument.id)
        .join(InboundDelivery, InboundDelivery.id == StockDocument.delivery_id)
        .filter(
            InboundDelivery.tenant_id == tenant_id,
            InboundDelivery.purchase_order_id == po.id,
            StockDocument.document_type == "PZ",
        )
        .all()
    )
    linked_pz_ids = [int(r[0]) for r in linked_pz_docs]
    has_pz_receipts = False
    if linked_pz_ids:
        rec_sum = (
            db.query(func.coalesce(func.sum(StockDocumentItem.received_quantity), 0.0))
            .filter(StockDocumentItem.document_id.in_(linked_pz_ids))
            .scalar()
            or 0.0
        )
        has_pz_receipts = float(rec_sum) > 1e-9

    # Draft without PZ receipts can be removed physically.
    if po.status == PO_DRAFT and not has_pz_receipts:
        db.delete(po)
        db.commit()
        return {"action": "deleted", "order_id": order_id, "hard_deleted": True}

    # Sent/confirmed/etc. and any PO linked to PZ receipts => soft archive via Cancelled.
    if po.status != PO_CANCELLED:
        po.status = PO_CANCELLED
        po.updated_at = datetime.utcnow()
        if po.notes:
            if "[ARCHIVED]" not in po.notes:
                po.notes = f"{po.notes}\n[ARCHIVED] {datetime.utcnow().isoformat()}".strip()
        else:
            po.notes = f"[ARCHIVED] {datetime.utcnow().isoformat()}"
    db.commit()
    db.refresh(po)
    return {
        "action": "archived",
        "order_id": order_id,
        "hard_deleted": False,
        "blocked_by_pz_receipts": bool(has_pz_receipts),
        "status": po.status,
    }


def _default_delivery_name(supplier_name: str, when: datetime) -> str:
    nm = (supplier_name or "").strip()
    ds = when.strftime("%d.%m.%Y")
    return f"{nm} {ds}".strip() if nm else ds


def create_inbound_delivery_from_purchase_order(db: Session, tenant_id: int, order_id: int) -> Dict[str, Any]:
    """Create a draft inbound delivery (`deliveries`) linked to this PO; does not change PO status."""
    po = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items), joinedload(PurchaseOrder.supplier))
        .filter(PurchaseOrder.id == order_id, PurchaseOrder.tenant_id == tenant_id)
        .first()
    )
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status in (PO_CANCELLED,):
        raise HTTPException(status_code=400, detail="Cannot create delivery for a cancelled purchase order")
    existing = (
        db.query(InboundDelivery)
        .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.purchase_order_id == po.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Inbound delivery already exists for this purchase order")

    lines: List[Tuple[int, float, Optional[float]]] = []
    for it in sorted(po.items, key=lambda x: x.id):
        rem = max(0.0, float(it.qty) - float(it.received_qty or 0))
        if rem <= 1e-9:
            continue
        lines.append((int(it.product_id), rem, float(it.unit_price) if it.unit_price is not None else None))
    if not lines:
        raise HTTPException(status_code=400, detail="No remaining quantity to put on inbound delivery")

    sup = po.supplier or db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
    if not sup:
        raise HTTPException(status_code=400, detail="Supplier not found")
    if po.warehouse_id is None or int(po.warehouse_id) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Zamówienie zakupu nie ma przypisanego magazynu — nie można utworzyć dostawy.",
        )
    now = datetime.utcnow()
    d = InboundDelivery(
        tenant_id=tenant_id,
        supplier_id=po.supplier_id,
        purchase_order_id=po.id,
        warehouse_id=int(po.warehouse_id),
        name=_default_delivery_name((sup.name or "").strip(), now),
        status="draft",
        created_at=now,
        updated_at=now,
        expected_date=po.expected_date,
        received_at=None,
        notes=(f"Stworzony z dostawy {po.order_number}" + (f"\n{po.notes}" if po.notes else "")).strip(),
    )
    db.add(d)
    db.flush()
    for pid, qty, pp in lines:
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
        if not p:
            raise HTTPException(status_code=400, detail=f"Product {pid} not found")
        if not product_allowed_for_supplier(db, p, po.supplier_id):
            raise HTTPException(status_code=400, detail=f"Product {pid} is not valid for this supplier")
        db.add(
            DeliveryItem(
                delivery_id=d.id,
                product_id=pid,
                quantity_ordered=float(qty),
                quantity_received=0.0,
                purchase_price=pp,
            )
        )
    db.flush()
    for row in db.query(DeliveryItem).filter(DeliveryItem.delivery_id == d.id).all():
        hydrate_delivery_item_snapshots(db, tenant_id, row)
    sync_purchase_order_status_for_po_id(db, tenant_id, po.id)
    db.commit()
    db.refresh(d)
    return {"delivery_id": d.id, "tenant_id": tenant_id}


def derive_purchase_order_status(po: PurchaseOrder, db: Session) -> Optional[str]:
    """
    Single entry point for UI / jobs: warehouse-derived PO status from linked deliveries + PZ.
    Returns None when warehouse data should not override (e.g. no linked deliveries).
    """
    from .purchase_order_warehouse_sync_service import derive_purchase_order_status_from_warehouse

    return derive_purchase_order_status_from_warehouse(db, int(po.tenant_id), int(po.id))
