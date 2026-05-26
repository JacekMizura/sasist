"""Purchase orders (deliveries table): CRUD + line items. Business layer only — no inventory / warehouse."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, time
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..domain.supplier_product_linkage import product_allowed_for_supplier
from ..utils.product_vat import product_vat_rate_percent
from ..models.carton import Carton
from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.packaging_material import PackagingMaterial
from ..models.product import Product
from ..models.supplier import Supplier
from ..schemas.delivery import (
    DELIVERY_STATUSES,
    DeliveryCreateBody,
    DeliveryItemCreateBody,
    DeliveryItemPatchBody,
    DeliveryItemRead,
    DeliveryListRow,
    DeliveryRead,
    DeliveryUpdateBody,
    QuickFromProductBody,
)
from ..schemas.stock_document import CreatePzResult
from ..services.delivery_item_catalog_snapshot import (
    hydrate_delivery_item_snapshots,
    resolve_delivery_line_display,
)
from ..services.delivery_line_pricing import resolve_product_unit_net, resolve_wm_unit_net
from ..services.document_creator_service import app_user_full_name
from ..services.delivery_pz_service import create_pz_from_delivery, pz_display_number
from ..services.wms_workforce_activity import MODULE_RECEIVING, log_wms_workforce_activity

router = APIRouter(prefix="/deliveries", tags=["Purchase orders"])

_TERMINAL_EDIT = frozenset({"received", "cancelled"})


def _default_delivery_name(supplier_name: str, when: datetime) -> str:
    """Auto-fill: «{SupplierName} {dd.mm.yyyy}»."""
    nm = (supplier_name or "").strip()
    ds = when.strftime("%d.%m.%Y")
    return f"{nm} {ds}".strip() if nm else ds


def _line_total_value(qty_ordered: float, purchase_price: Optional[float]) -> float:
    if purchase_price is None:
        return 0.0
    return round(float(qty_ordered) * float(purchase_price), 2)


def _vat_rate_for_delivery_item(db: Session, it: DeliveryItem) -> float:
    if it.product_id is not None:
        p = db.query(Product).filter(Product.id == it.product_id).first()
        return product_vat_rate_percent(getattr(p, "metadata_json", None)) if p else 23.0
    k = (getattr(it, "wm_kind", None) or "").strip().lower()
    wid = (getattr(it, "wm_id", None) or "").strip()
    if k == "carton" and wid:
        c = db.query(Carton).filter(Carton.id == wid).first()
        return float(getattr(c, "vat_rate_pct", 23) or 23) if c else 23.0
    if k == "packaging" and wid:
        m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid).first()
        return float(getattr(m, "vat_rate_pct", 23) or 23) if m else 23.0
    return 23.0


def _auto_unit_net_and_hint(
    db: Session, d: InboundDelivery, it: DeliveryItem, qty: float
) -> Tuple[Optional[float], Optional[str]]:
    """Resolved unit net + tier hint for this delivery supplier and line (product or WM)."""
    tid = int(d.tenant_id)
    sid = int(d.supplier_id)
    qn = float(qty)
    if it.product_id is not None:
        return resolve_product_unit_net(
            db, tenant_id=tid, supplier_id=sid, product_id=int(it.product_id), qty=qn
        )
    k = (getattr(it, "wm_kind", None) or "").strip().lower()
    wid = (getattr(it, "wm_id", None) or "").strip()
    if k == "carton" and wid:
        row = (
            db.query(Carton)
            .options(selectinload(Carton.price_tiers))
            .filter(Carton.id == wid, Carton.tenant_id == tid)
            .first()
        )
    elif k == "packaging" and wid:
        row = (
            db.query(PackagingMaterial)
            .options(selectinload(PackagingMaterial.price_tiers))
            .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == tid)
            .first()
        )
    else:
        return None, None
    if row is None:
        return None, None
    return resolve_wm_unit_net(row, qn)


def _item_preview_label(db: Session, it: DeliveryItem) -> str:
    snap = (getattr(it, "item_name", None) or "").strip()
    if snap:
        return snap
    if it.product_id is not None:
        p = db.query(Product).filter(Product.id == it.product_id).first()
        if p and (p.name or "").strip():
            return (p.name or "").strip()
        return f"Produkt #{int(it.product_id)}"
    k = (getattr(it, "wm_kind", None) or "").strip().lower()
    wid = (getattr(it, "wm_id", None) or "").strip()
    if k == "carton" and wid:
        c = db.query(Carton).filter(Carton.id == wid).first()
        return (c.name or "").strip() if c else f"Karton #{wid}"
    if k == "packaging" and wid:
        m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid).first()
        return (m.name or "").strip() if m else f"Materiał #{wid}"
    return "Pozycja"


def _item_to_read(db: Session, it: DeliveryItem) -> DeliveryItemRead:
    qo = float(it.quantity_ordered)
    pp = float(it.purchase_price) if it.purchase_price is not None else None
    vat = _vat_rate_for_delivery_item(db, it)
    line_net = _line_total_value(qo, pp)
    line_vat = round(line_net * (vat / 100.0), 2) if pp is not None else 0.0
    line_gross = round(line_net + line_vat, 2) if pp is not None else 0.0
    manual = bool(getattr(it, "purchase_price_manual", False))
    d = db.query(InboundDelivery).filter(InboundDelivery.id == it.delivery_id).first()
    pricing_hint: Optional[str] = None
    pricing_warning: Optional[str] = None
    catalog_compare_unit_net: Optional[float] = None
    if d is not None:
        list_un, _ = _auto_unit_net_and_hint(db, d, it, 1.0)
        catalog_compare_unit_net = list_un
        if not manual:
            _, pricing_hint = _auto_unit_net_and_hint(db, d, it, qo)
    if pp is None:
        pricing_warning = "Brak ceny — uzupełnij ręcznie lub w cenniku u dostawcy."
    img = None
    wm_kind = None
    wm_id = None
    wm_name = None
    pid = int(it.product_id) if it.product_id is not None else None
    pname = psym = pean = None
    if pid is not None:
        p = db.query(Product).filter(Product.id == pid).first()
        if p:
            pname = (p.name or "").strip() or None
            psym = (p.symbol or "").strip() or None
            pean = (p.ean or "").strip() or None
            if getattr(p, "image_url", None):
                s = (p.image_url or "").strip()
                img = s or None
    else:
        k = (getattr(it, "wm_kind", None) or "").strip().lower()
        wid = (getattr(it, "wm_id", None) or "").strip()
        if k in ("carton", "packaging") and wid:
            wm_kind = k  # type: ignore[assignment]
            wm_id = wid
            wm_name = _item_preview_label(db, it)
            if k == "carton":
                c = db.query(Carton).filter(Carton.id == wid).first()
                if c and getattr(c, "image_url", None):
                    s = (c.image_url or "").strip()
                    img = s or None
            elif k == "packaging":
                m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid).first()
                if m and getattr(m, "image_url", None):
                    s = (m.image_url or "").strip()
                    img = s or None
    disp = resolve_delivery_line_display(
        snapshot_name=getattr(it, "item_name", None),
        snapshot_sku=getattr(it, "item_sku", None),
        snapshot_ean=getattr(it, "item_ean", None),
        snapshot_photo=getattr(it, "item_photo_url", None),
        snapshot_unit=getattr(it, "item_unit", None),
        source_label=getattr(it, "source_label", None),
        live_product_name=pname,
        live_product_symbol=psym,
        live_product_ean=pean,
        live_wm_name=wm_name,
    )
    img_out = disp.get("display_photo_url") or img
    return DeliveryItemRead(
        id=it.id,
        delivery_id=it.delivery_id,
        product_id=pid,
        wm_kind=wm_kind,
        wm_id=wm_id,
        wm_name=wm_name,
        product_name=pname,
        product_symbol=psym,
        product_ean=pean,
        product_image_url=img_out,
        display_name=str(disp.get("display_name") or "Pozycja usunięta"),
        line_item_type=getattr(it, "line_item_type", None),
        line_item_ref_id=getattr(it, "line_item_ref_id", None),
        item_name=getattr(it, "item_name", None),
        item_sku=getattr(it, "item_sku", None),
        item_ean=getattr(it, "item_ean", None),
        item_unit=getattr(it, "item_unit", None),
        source_label=disp.get("source_label_resolved"),
        display_sku=disp.get("display_sku"),
        display_ean=disp.get("display_ean"),
        quantity_ordered=qo,
        quantity_received=float(it.quantity_received or 0),
        purchase_price=pp,
        purchase_price_net=pp,
        vat_rate=vat,
        line_total_value=line_net,
        line_total_net=line_net,
        line_vat_amount=line_vat,
        line_total_gross=line_gross,
        purchase_price_manual=manual,
        pricing_hint=pricing_hint,
        pricing_warning=pricing_warning,
        catalog_compare_unit_net=catalog_compare_unit_net,
    )


def _parse_date_start(s: Optional[str]) -> Optional[datetime]:
    if not s or not str(s).strip():
        return None
    raw = str(s).strip()[:10]
    parts = raw.split("-")
    if len(parts) != 3:
        return None
    try:
        y, m, d = (int(parts[0]), int(parts[1]), int(parts[2]))
        return datetime(y, m, d)
    except (TypeError, ValueError):
        return None


def _parse_date_end_inclusive(s: Optional[str]) -> Optional[datetime]:
    dt = _parse_date_start(s)
    if dt is None:
        return None
    return datetime.combine(dt.date(), time(23, 59, 59, 999999))


def _aggregate_delivery_net_vat_gross(db: Session, delivery_ids: List[int]) -> Dict[int, Tuple[float, float, float]]:
    """Per delivery_id: (total_net, total_vat, total_gross) from line items (products + warehouse materials)."""
    if not delivery_ids:
        return {}
    items = (
        db.query(DeliveryItem)
        .filter(DeliveryItem.delivery_id.in_(delivery_ids))
        .all()
    )
    sums: Dict[int, List[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
    for it in items:
        qo = float(it.quantity_ordered)
        pp = float(it.purchase_price) if it.purchase_price is not None else None
        if pp is None:
            continue
        vat = _vat_rate_for_delivery_item(db, it)
        line_net = round(qo * pp, 2)
        line_vat = round(line_net * (vat / 100.0), 2)
        line_gross = round(line_net + line_vat, 2)
        did = int(it.delivery_id)
        sums[did][0] += line_net
        sums[did][1] += line_vat
        sums[did][2] += line_gross
    return {k: (round(v[0], 2), round(v[1], 2), round(v[2], 2)) for k, v in sums.items()}


def _delivery_to_list_row(
    db: Session,
    d: InboundDelivery,
    item_count: int,
    total_value: float,
    items_preview: Optional[List[str]] = None,
    *,
    total_net: Optional[float] = None,
    total_vat: Optional[float] = None,
    total_gross: Optional[float] = None,
) -> DeliveryListRow:
    sup = db.query(Supplier).filter(Supplier.id == d.supplier_id).first()
    dn = getattr(d, "name", None)
    name_val = None if dn is None else (str(dn).strip() or None)
    tn = float(total_net) if total_net is not None else float(total_value)
    tv = float(total_vat) if total_vat is not None else 0.0
    tg = float(total_gross) if total_gross is not None else float(tn + tv)
    return DeliveryListRow(
        id=d.id,
        tenant_id=d.tenant_id,
        supplier_id=d.supplier_id,
        supplier_name=(sup.name or "").strip() if sup else "",
        name=name_val,
        status=d.status,
        created_at=d.created_at,
        expected_date=d.expected_date,
        received_at=d.received_at,
        item_count=item_count,
        total_value=total_value,
        total_net=tn,
        total_vat=round(tv, 2),
        total_gross=round(tg, 2),
        items_preview=list(items_preview or []),
    )


def _apply_wm_inventory_from_received_delivery(db: Session, tenant_id: int, delivery_id: int) -> None:
    """When a purchase order is marked received, add WM line quantities to carton / packaging stock."""
    items = db.query(DeliveryItem).filter(DeliveryItem.delivery_id == delivery_id).all()
    for it in items:
        k = (getattr(it, "wm_kind", None) or "").strip().lower()
        wid = (getattr(it, "wm_id", None) or "").strip()
        if not k or not wid:
            continue
        qrecv = float(it.quantity_received or 0)
        if qrecv < 1e-9:
            qrecv = float(it.quantity_ordered or 0)
            it.quantity_received = qrecv
        if qrecv < 1e-9:
            continue
        if k == "carton":
            c = db.query(Carton).filter(Carton.id == wid, Carton.tenant_id == int(tenant_id)).first()
            if not c:
                continue
            c.stock = float(c.stock or 0) + qrecv
            if it.purchase_price is not None:
                c.last_purchase_price_net = float(it.purchase_price)
        elif k == "packaging":
            m = db.query(PackagingMaterial).filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id)).first()
            if not m:
                continue
            m.stock = float(m.stock or 0) + qrecv
            if it.purchase_price is not None:
                m.last_purchase_price_net = float(it.purchase_price)


def _delivery_to_read(db: Session, d: InboundDelivery) -> DeliveryRead:
    items = sorted(d.items, key=lambda x: x.id)
    sup = db.query(Supplier).filter(Supplier.id == d.supplier_id).first()
    item_reads = [_item_to_read(db, it) for it in items]
    total_net = round(sum(r.line_total_net for r in item_reads), 2)
    total_vat = round(sum(r.line_vat_amount for r in item_reads), 2)
    total_gross = round(sum(r.line_total_gross for r in item_reads), 2)
    dn = getattr(d, "name", None)
    name_val = None if dn is None else (str(dn).strip() or None)
    return DeliveryRead(
        id=d.id,
        tenant_id=d.tenant_id,
        supplier_id=d.supplier_id,
        supplier_name=(sup.name or "").strip() if sup else "",
        name=name_val,
        status=d.status,
        created_at=d.created_at,
        updated_at=d.updated_at,
        expected_date=d.expected_date,
        received_at=d.received_at,
        notes=d.notes,
        item_count=len(items),
        total_value=total_net,
        total_net=total_net,
        total_vat=total_vat,
        total_gross=total_gross,
        items=item_reads,
    )


def _assert_editable(d: InboundDelivery) -> None:
    if d.status in _TERMINAL_EDIT:
        raise HTTPException(status_code=400, detail="Purchase order is closed for editing (received or cancelled)")


@router.post("/quick-from-product", response_model=DeliveryRead, status_code=201)
def quick_purchase_order_from_product(body: QuickFromProductBody, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == body.product_id, Product.tenant_id == body.tenant_id).first()
    if not p:
        raise HTTPException(status_code=400, detail="Product not found for tenant")
    sid = body.supplier_id
    if sid is None:
        sid = getattr(p, "default_supplier_id", None)
    if sid is None:
        raise HTTPException(
            status_code=400,
            detail="supplier_id required or set product default_supplier_id",
        )
    sup = db.query(Supplier).filter(Supplier.id == sid, Supplier.tenant_id == body.tenant_id).first()
    if not sup:
        raise HTTPException(status_code=400, detail="Invalid supplier_id for tenant")
    if not product_allowed_for_supplier(db, p, int(sid)):
        raise HTTPException(
            status_code=400,
            detail="Product is not linked to this supplier (supplier catalog or default supplier).",
        )
    now = datetime.utcnow()
    d = InboundDelivery(
        tenant_id=body.tenant_id,
        supplier_id=int(sid),
        name=_default_delivery_name((sup.name or "").strip(), now),
        status="draft",
        created_at=now,
        updated_at=now,
        expected_date=None,
        received_at=None,
        notes=None,
    )
    db.add(d)
    db.flush()
    pp_f, _ = resolve_product_unit_net(
        db,
        tenant_id=int(body.tenant_id),
        supplier_id=int(sid),
        product_id=int(p.id),
        qty=float(body.quantity),
    )
    it = DeliveryItem(
        delivery_id=d.id,
        product_id=p.id,
        quantity_ordered=float(body.quantity),
        quantity_received=0.0,
        purchase_price=pp_f,
        purchase_price_manual=False,
    )
    db.add(it)
    hydrate_delivery_item_snapshots(db, int(body.tenant_id), it)
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.get("/", response_model=List[DeliveryListRow])
def list_deliveries(
    tenant_id: int = Query(..., ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Matches delivery name or supplier name (substring)"),
    created_from: Optional[str] = Query(None, description="ISO date YYYY-MM-DD — filter created_at from start of day"),
    created_to: Optional[str] = Query(None, description="ISO date YYYY-MM-DD — filter created_at through end of day"),
    db: Session = Depends(get_db),
):
    q = db.query(InboundDelivery).filter(InboundDelivery.tenant_id == tenant_id)
    if supplier_id is not None:
        q = q.filter(InboundDelivery.supplier_id == supplier_id)
    if status and status.strip():
        st = status.strip().lower()
        if st not in DELIVERY_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        q = q.filter(InboundDelivery.status == st)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.join(Supplier, Supplier.id == InboundDelivery.supplier_id).filter(
            or_(InboundDelivery.name.like(term), Supplier.name.like(term))
        )
    dt_from = _parse_date_start(created_from)
    if dt_from is not None:
        q = q.filter(InboundDelivery.created_at >= dt_from)
    dt_to = _parse_date_end_inclusive(created_to)
    if dt_to is not None:
        q = q.filter(InboundDelivery.created_at <= dt_to)
    rows = q.order_by(InboundDelivery.created_at.desc()).all()
    dids = [d.id for d in rows]
    counts: dict[int, int] = {}
    totals: dict[int, float] = {}
    if dids:
        cnt_rows = (
            db.query(DeliveryItem.delivery_id, func.count(DeliveryItem.id))
            .filter(DeliveryItem.delivery_id.in_(dids))
            .group_by(DeliveryItem.delivery_id)
            .all()
        )
        counts = {int(did): int(c or 0) for did, c in cnt_rows}
        val_rows = (
            db.query(
                DeliveryItem.delivery_id,
                func.coalesce(
                    func.sum(DeliveryItem.quantity_ordered * func.coalesce(DeliveryItem.purchase_price, 0)),
                    0,
                ),
            )
            .filter(DeliveryItem.delivery_id.in_(dids))
            .group_by(DeliveryItem.delivery_id)
            .all()
        )
        totals = {int(did): round(float(s or 0), 2) for did, s in val_rows}
        nv_map = _aggregate_delivery_net_vat_gross(db, dids)
        preview_map: dict[int, list[str]] = defaultdict(list)
        ri = (
            db.query(DeliveryItem)
            .filter(DeliveryItem.delivery_id.in_(dids))
            .order_by(DeliveryItem.delivery_id.asc(), DeliveryItem.id.asc())
            .all()
        )
        for it in ri:
            did = int(it.delivery_id)
            if len(preview_map[did]) >= 10:
                continue
            preview_map[did].append(_item_preview_label(db, it))
    else:
        preview_map = {}
        nv_map = {}
    return [
        _delivery_to_list_row(
            db,
            d,
            counts.get(d.id, 0),
            totals.get(d.id, 0.0),
            preview_map.get(d.id, []),
            total_net=nv_map.get(int(d.id), (0.0, 0.0, 0.0))[0] if nv_map else None,
            total_vat=nv_map.get(int(d.id), (0.0, 0.0, 0.0))[1] if nv_map else None,
            total_gross=nv_map.get(int(d.id), (0.0, 0.0, 0.0))[2] if nv_map else None,
        )
        for d in rows
    ]


@router.get("/{delivery_id}", response_model=DeliveryRead)
def get_delivery(delivery_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _delivery_to_read(db, d)


@router.post("/", response_model=DeliveryRead, status_code=201)
def create_delivery(body: DeliveryCreateBody, db: Session = Depends(get_db)):
    sup = db.query(Supplier).filter(Supplier.id == body.supplier_id, Supplier.tenant_id == body.tenant_id).first()
    if not sup:
        raise HTTPException(status_code=400, detail="Invalid supplier_id for tenant")
    now = datetime.utcnow()
    note_s = (body.notes or "").strip() if body.notes is not None else ""
    custom_name = (body.name or "").strip() if body.name is not None else ""
    if custom_name:
        resolved_name = custom_name[:512]
    else:
        resolved_name = _default_delivery_name((sup.name or "").strip(), now)
    d = InboundDelivery(
        tenant_id=body.tenant_id,
        supplier_id=body.supplier_id,
        name=resolved_name,
        status=body.status,
        created_at=now,
        updated_at=now,
        expected_date=body.expected_date,
        received_at=None,
        notes=note_s or None,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.put("/{delivery_id}", response_model=DeliveryRead)
def update_delivery(
    delivery_id: int,
    body: DeliveryUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    old_status = (d.status or "draft").strip().lower()
    if body.supplier_id is not None:
        sup = db.query(Supplier).filter(Supplier.id == body.supplier_id, Supplier.tenant_id == tenant_id).first()
        if not sup:
            raise HTTPException(status_code=400, detail="Invalid supplier_id")
        d.supplier_id = body.supplier_id
    if body.status is not None:
        new_s = body.status.strip().lower()
        if new_s not in DELIVERY_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        if d.status == "received" and new_s != "received":
            raise HTTPException(status_code=400, detail="Cannot reopen a received purchase order")
        d.status = new_s
        if new_s == "received" and d.received_at is None:
            d.received_at = datetime.utcnow()
        if new_s == "received" and old_status != "received":
            _apply_wm_inventory_from_received_delivery(db, int(tenant_id), int(d.id))
    if body.expected_date is not None:
        d.expected_date = body.expected_date
    if body.notes is not None:
        d.notes = body.notes.strip() if body.notes.strip() else None
    upd = body.model_dump(exclude_unset=True)
    if "name" in upd:
        d.name = (body.name or "").strip() or None
        if d.name is not None and len(d.name) > 512:
            d.name = d.name[:512]
    d.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.delete("/{delivery_id}")
def delete_delivery(delivery_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if d.status != "draft":
        raise HTTPException(status_code=400, detail="Nie można usunąć zamówienia w tym statusie")
    db.delete(d)
    db.commit()
    return {"deleted": True}


@router.post("/{delivery_id}/items", response_model=DeliveryRead, status_code=201)
def add_delivery_item(
    delivery_id: int,
    body: DeliveryItemCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _assert_editable(d)
    if body.product_id is not None:
        p = db.query(Product).filter(Product.id == body.product_id, Product.tenant_id == tenant_id).first()
        if not p:
            raise HTTPException(status_code=400, detail="Invalid product_id for tenant")
        if not product_allowed_for_supplier(db, p, d.supplier_id):
            raise HTTPException(
                status_code=400,
                detail="Product is not in this supplier's catalog (link table or default supplier).",
            )
        qn = float(body.quantity_ordered)
        if body.purchase_price_manual:
            resolved_pp = float(body.purchase_price) if body.purchase_price is not None else None
            manual_flag = True
        else:
            resolved_pp, _ = resolve_product_unit_net(
                db,
                tenant_id=int(tenant_id),
                supplier_id=int(d.supplier_id),
                product_id=int(body.product_id),
                qty=qn,
            )
            manual_flag = False
        it = DeliveryItem(
            delivery_id=d.id,
            product_id=int(body.product_id),
            wm_kind=None,
            wm_id=None,
            quantity_ordered=qn,
            quantity_received=0.0,
            purchase_price=resolved_pp,
            purchase_price_manual=manual_flag,
        )
    else:
        kind = (body.wm_kind or "").strip().lower()
        wid = (body.wm_id or "").strip()
        if kind == "carton":
            row = (
                db.query(Carton)
                .options(selectinload(Carton.price_tiers))
                .filter(Carton.id == wid, Carton.tenant_id == int(tenant_id))
                .first()
            )
        elif kind == "packaging":
            row = (
                db.query(PackagingMaterial)
                .options(selectinload(PackagingMaterial.price_tiers))
                .filter(PackagingMaterial.id == wid, PackagingMaterial.tenant_id == int(tenant_id))
                .first()
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid wm_kind")
        if not row:
            raise HTTPException(status_code=400, detail="Warehouse material not found for tenant")
        sid_row = getattr(row, "supplier_id", None)
        if sid_row is None or int(sid_row) != int(d.supplier_id):
            raise HTTPException(
                status_code=400,
                detail="Przypisz temu dostawcy ten karton / materiał pakowy (zakładka Dostawca), aby dodać go do zamówienia.",
            )
        qn = float(body.quantity_ordered)
        if body.purchase_price_manual:
            resolved_pp = float(body.purchase_price) if body.purchase_price is not None else None
            manual_flag = True
        else:
            resolved_pp, _ = resolve_wm_unit_net(row, qn)
            manual_flag = False
        it = DeliveryItem(
            delivery_id=d.id,
            product_id=None,
            wm_kind=kind,
            wm_id=wid,
            quantity_ordered=qn,
            quantity_received=0.0,
            purchase_price=resolved_pp,
            purchase_price_manual=manual_flag,
        )
    db.add(it)
    hydrate_delivery_item_snapshots(db, int(tenant_id), it)
    d.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.patch("/{delivery_id}/items/{item_id}", response_model=DeliveryRead)
def patch_delivery_item(
    delivery_id: int,
    item_id: int,
    body: DeliveryItemPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _assert_editable(d)
    it = (
        db.query(DeliveryItem)
        .filter(DeliveryItem.id == item_id, DeliveryItem.delivery_id == delivery_id)
        .first()
    )
    if not it:
        raise HTTPException(status_code=404, detail="Line not found")
    raw = body.model_dump(exclude_unset=True)
    want_restore = body.restore_catalog_price is True
    if want_restore:
        it.purchase_price_manual = False
    if "quantity_ordered" in raw:
        qv = raw["quantity_ordered"]
        if qv is not None:
            if float(it.quantity_received or 0) > float(qv) + 1e-9:
                raise HTTPException(status_code=400, detail="quantity_ordered cannot be below quantity_received")
            it.quantity_ordered = float(qv)
    new_qty = float(it.quantity_ordered or 0)
    auto_p, _ = _auto_unit_net_and_hint(db, d, it, new_qty)
    if want_restore:
        it.purchase_price = auto_p
    elif "purchase_price" in raw:
        ppv = raw["purchase_price"]
        if ppv is None:
            it.purchase_price = None
            it.purchase_price_manual = False
        else:
            fp = float(ppv)
            if auto_p is not None and abs(fp - float(auto_p)) <= 1e-5:
                it.purchase_price = auto_p
                it.purchase_price_manual = False
            else:
                it.purchase_price = fp
                it.purchase_price_manual = True
    elif "quantity_ordered" in raw and not bool(getattr(it, "purchase_price_manual", False)):
        it.purchase_price = auto_p
    d.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.delete("/{delivery_id}/items/{item_id}", response_model=DeliveryRead)
def remove_delivery_item(
    delivery_id: int,
    item_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    d = db.query(InboundDelivery).filter(InboundDelivery.id == delivery_id, InboundDelivery.tenant_id == tenant_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    _assert_editable(d)
    it = (
        db.query(DeliveryItem)
        .filter(DeliveryItem.id == item_id, DeliveryItem.delivery_id == delivery_id)
        .first()
    )
    if not it:
        raise HTTPException(status_code=404, detail="Line not found")
    db.delete(it)
    d.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(d)
    return _delivery_to_read(db, d)


@router.post("/{delivery_id}/create-pz", response_model=CreatePzResult)
def create_pz_from_supplier_order(
    delivery_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """
    Create a draft PZ from the purchase order: lines use ordered qty and price from delivery items only.
    Does not post inventory or receipt totals — use WMS / PATCH / accept on the stock document.
    """
    try:
        doc = create_pz_from_delivery(db, tenant_id, delivery_id, created_by=user)
        log_wms_workforce_activity(
            db,
            user=user,
            tenant_id=tenant_id,
            module=MODULE_RECEIVING,
            action_type="pz_create_from_delivery",
            entity_type="StockDocument",
            entity_id=int(doc.id),
            metadata={
                "delivery_id": int(delivery_id),
                "created_by": app_user_full_name(user),
            },
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return CreatePzResult(
        id=doc.id,
        number=pz_display_number(doc.created_at, doc.id),
        status="draft",
    )
