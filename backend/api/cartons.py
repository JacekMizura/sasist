"""CRUD for cartons (logistics boxes) + M2M shipping methods + pricing tiers."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models.carton import Carton
from ..models.manufacturer import Manufacturer
from ..models.shipping_method import ShippingMethod
from ..models.supplier import Supplier
from ..models.wm_price_tier import WmPriceTier
from ..schemas.warehouse_materials import (
    CartonCreate,
    CartonRead,
    CartonUpdate,
    PriceTierIn,
    PriceTierRead,
    ShippingMethodMini,
    WmBulkSupplierBody,
    carton_base_unit_prices,
)
from ..services.wm_pricing import complete_package_totals, serialize_wm_tiers

router = APIRouter(prefix="/cartons", tags=["Warehouse materials — cartons"])


def _sm_mini(sm: ShippingMethod) -> ShippingMethodMini:
    raw = getattr(sm, "logo_url", None)
    logo_url = (str(raw).strip() if raw is not None else "") or None
    return ShippingMethodMini(
        id=str(sm.id),
        name=str(sm.name or ""),
        code=str(getattr(sm, "code", None) or "").strip().upper(),
        logo_url=logo_url,
    )


def _tier_reads_for_carton(row: Carton) -> list[PriceTierRead]:
    vat = float(getattr(row, "vat_rate_pct", 23) or 23)
    raw = serialize_wm_tiers(getattr(row, "price_tiers", None) or [], vat_rate_pct=vat)
    return [
        PriceTierRead(
            id=str(d["id"]),
            sort_index=int(d.get("sort_index", 0)),
            qty_from=float(d.get("qty_from", 1) or 1),
            package_qty=d.get("package_qty"),
            package_net_total=d.get("package_net_total"),
            package_gross_total=d.get("package_gross_total"),
            unit_net=d.get("unit_net"),
            unit_gross=d.get("unit_gross"),
            discount_pct=d.get("discount_pct"),
        )
        for d in raw
    ]


def _fopt_row(row: Carton, attr: str) -> Optional[float]:
    v = getattr(row, attr, None)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _carton_to_read(row: Carton) -> CartonRead:
    sms = list(getattr(row, "shipping_methods", None) or [])
    sup = getattr(row, "supplier", None)
    supplier_name = None
    if sup is not None:
        supplier_name = (getattr(sup, "name", None) or "").strip() or None
    prod = getattr(row, "producer", None)
    producer_id = int(row.producer_id) if getattr(row, "producer_id", None) is not None else None
    producer_name = (getattr(prod, "name", None) or "").strip() or None if prod is not None else None
    sku_sup = getattr(row, "supplier_sku", None)
    loc = getattr(row, "location_label", None)
    img = getattr(row, "image_url", None)
    sku_own = getattr(row, "sku", None)
    ean_own = getattr(row, "ean", None)
    sk = float(getattr(row, "stock", 0) or 0)
    rq = float(getattr(row, "reserved_qty", 0) or 0)
    avail = max(0.0, sk - rq)
    vat = float(getattr(row, "vat_rate_pct", 23) or 23)
    pq = getattr(row, "package_qty", None)
    pnt = getattr(row, "package_net_total", None)
    pgt = getattr(row, "package_gross_total", None)
    _, _, unit_net, unit_gross = carton_base_unit_prices(
        vat_rate_pct=vat,
        package_qty=float(pq) if pq is not None else None,
        package_net_total=float(pnt) if pnt is not None else None,
        package_gross_total=float(pgt) if pgt is not None else None,
    )
    tier_reads = _tier_reads_for_carton(row)
    if tier_reads and tier_reads[0].unit_net is not None:
        unit_net = tier_reads[0].unit_net
        unit_gross = tier_reads[0].unit_gross
    return CartonRead(
        id=str(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        name=str(row.name or ""),
        image_url=(str(img).strip() if img else None) or None,
        sku=(str(sku_own).strip()[:128] if sku_own else None) or None,
        ean=(str(ean_own).strip()[:64] if ean_own else None) or None,
        material_type=(str(getattr(row, "material_type", None) or "").strip() or None) or None,
        length_cm=float(row.length_cm or 0),
        width_cm=float(row.width_cm or 0),
        height_cm=float(row.height_cm or 0),
        internal_length_cm=_fopt_row(row, "internal_length_cm"),
        internal_width_cm=_fopt_row(row, "internal_width_cm"),
        internal_height_cm=_fopt_row(row, "internal_height_cm"),
        max_payload_kg=_fopt_row(row, "max_payload_kg"),
        weight_kg=float(row.weight_kg or 0),
        is_active=bool(getattr(row, "is_active", True)),
        supplier_id=int(row.supplier_id) if getattr(row, "supplier_id", None) is not None else None,
        supplier_name=supplier_name,
        producer_id=producer_id,
        producer_name=producer_name,
        supplier_name_override=(str(getattr(row, "supplier_name_override", None) or "").strip()[:256] or None)
        if getattr(row, "supplier_name_override", None)
        else None,
        lead_time_days=int(row.lead_time_days) if getattr(row, "lead_time_days", None) is not None else None,
        moq=_fopt_row(row, "moq"),
        purchase_pack_qty=_fopt_row(row, "purchase_pack_qty"),
        free_shipping_threshold_net=_fopt_row(row, "free_shipping_threshold_net"),
        last_purchase_price_net=_fopt_row(row, "last_purchase_price_net"),
        supplier_sku=(str(sku_sup).strip() if sku_sup else None) or None,
        stock=sk,
        reserved_qty=rq,
        available_qty=avail,
        location_label=(str(loc).strip() if loc else None) or None,
        purchase_price=float(row.purchase_price) if getattr(row, "purchase_price", None) is not None else None,
        unit_cost=float(row.unit_cost) if getattr(row, "unit_cost", None) is not None else None,
        vat_rate_pct=vat,
        package_qty=float(pq) if pq is not None else None,
        package_net_total=float(pnt) if pnt is not None else None,
        package_gross_total=float(pgt) if pgt is not None else None,
        unit_net_price=unit_net,
        unit_gross_price=unit_gross,
        low_stock_threshold=float(getattr(row, "low_stock_threshold", None))
        if getattr(row, "low_stock_threshold", None) is not None
        else None,
        reorder_qty=float(getattr(row, "reorder_qty", None)) if getattr(row, "reorder_qty", None) is not None else None,
        plastic_kg_per_unit=float(getattr(row, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(row, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(row, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(row, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(row, "metal_kg_per_unit", 0) or 0),
        packaging_type=(str(getattr(row, "packaging_type", None) or "").strip() or None) or None,
        include_in_bdo=bool(getattr(row, "include_in_bdo", False)),
        shipping_method_ids=[str(x.id) for x in sms],
        shipping_methods=[_sm_mini(x) for x in sms],
        price_tiers=tier_reads,
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
    )


def _validate_supplier_id(db: Session, *, tenant_id: int, supplier_id: Optional[int]) -> None:
    if supplier_id is None:
        return
    ok = (
        db.query(Supplier)
        .filter(Supplier.id == int(supplier_id), Supplier.tenant_id == int(tenant_id))
        .first()
    )
    if ok is None:
        raise HTTPException(status_code=400, detail="Nieprawidłowy dostawca (supplier_id) dla tenanta.")


def _validate_producer_id(db: Session, *, tenant_id: int, producer_id: Optional[int]) -> None:
    if producer_id is None:
        return
    ok = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == int(producer_id), Manufacturer.tenant_id == int(tenant_id))
        .first()
    )
    if ok is None:
        raise HTTPException(status_code=400, detail="Nieprawidłowy producent (producer_id) dla tenanta.")


def _validate_shipping_method_ids(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    ids: List[str],
) -> None:
    if not ids:
        return
    uniq = list({str(x).strip() for x in ids if str(x).strip()})
    if not uniq:
        return
    n = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.tenant_id == int(tenant_id),
            ShippingMethod.warehouse_id == int(warehouse_id),
            ShippingMethod.id.in_(uniq),
        )
        .count()
    )
    if int(n) != len(uniq):
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowe lub obce ID metody dostawy dla tego magazynu.",
        )


def _replace_carton_tiers(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    carton_id: str,
    tiers: List[PriceTierIn],
    vat_rate_pct: float,
) -> None:
    db.query(WmPriceTier).filter(WmPriceTier.carton_id == str(carton_id).strip()).delete(synchronize_session=False)
    now = datetime.utcnow()
    for i, t in enumerate(tiers):
        pn, pg = complete_package_totals(
            t.package_net_total,
            t.package_gross_total,
            vat_rate_pct=vat_rate_pct,
        )
        db.add(
            WmPriceTier(
                id=str(uuid.uuid4()),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                carton_id=str(carton_id).strip(),
                packaging_material_id=None,
                sort_index=int(i),
                qty_from=float(t.qty_from),
                package_qty=float(t.package_qty) if t.package_qty is not None else None,
                package_net_total=float(pn) if pn is not None else None,
                package_gross_total=float(pg) if pg is not None else None,
                created_at=now,
                updated_at=now,
            )
        )


def _carton_base_query(db: Session, *, tenant_id: int, warehouse_id: int):
    return (
        db.query(Carton)
        .options(
            joinedload(Carton.supplier),
            joinedload(Carton.producer),
            selectinload(Carton.shipping_methods),
            selectinload(Carton.price_tiers),
        )
        .filter(Carton.tenant_id == int(tenant_id), Carton.warehouse_id == int(warehouse_id))
    )


@router.get("/", response_model=list[CartonRead])
def list_cartons(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    active_only: bool = Query(False),
    q: Optional[str] = Query(None, description="Szybkie szukanie po nazwie / SKU."),
    shipping_method_id: Optional[str] = Query(
        None,
        description="Jeśli podane — tylko kartony przypisane do tej metody dostawy (np. ekran pakowania).",
    ),
    db: Session = Depends(get_db),
):
    query = _carton_base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id).order_by(Carton.name.asc())
    if active_only:
        query = query.filter(Carton.is_active.is_(True))
    sid = (shipping_method_id or "").strip()
    if sid:
        query = query.filter(Carton.shipping_methods.any(ShippingMethod.id == sid))
    qq = (q or "").strip().lower()
    if qq:
        like = f"%{qq}%"
        query = query.filter(
            or_(
                func.lower(Carton.name).like(like),
                func.lower(func.coalesce(Carton.sku, "")).like(like),
            )
        )
    return [_carton_to_read(x) for x in query.all()]


@router.get("/{carton_id}/", response_model=CartonRead)
def get_carton(
    carton_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        _carton_base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(Carton.id == str(carton_id).strip())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono kartonu.")
    return _carton_to_read(row)


@router.post("/{carton_id}/duplicate/", response_model=CartonRead, status_code=201)
def duplicate_carton(
    carton_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    src = (
        _carton_base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(Carton.id == str(carton_id).strip())
        .first()
    )
    if not src:
        raise HTTPException(status_code=404, detail="Nie znaleziono kartonu.")
    now = datetime.utcnow()
    nid = str(uuid.uuid4())
    base_name = str(src.name or "").strip() or "Karton"
    new_name = f"{base_name} copy"[:256]
    row = Carton(
        id=nid,
        tenant_id=int(src.tenant_id),
        warehouse_id=int(src.warehouse_id),
        name=new_name,
        image_url=getattr(src, "image_url", None),
        sku=getattr(src, "sku", None),
        ean=getattr(src, "ean", None),
        material_type=getattr(src, "material_type", None),
        length_cm=float(src.length_cm or 0),
        width_cm=float(src.width_cm or 0),
        height_cm=float(src.height_cm or 0),
        weight_kg=float(src.weight_kg or 0),
        is_active=bool(getattr(src, "is_active", True)),
        supplier_id=int(src.supplier_id) if getattr(src, "supplier_id", None) is not None else None,
        producer_id=int(src.producer_id) if getattr(src, "producer_id", None) is not None else None,
        supplier_name_override=getattr(src, "supplier_name_override", None),
        lead_time_days=getattr(src, "lead_time_days", None),
        moq=getattr(src, "moq", None),
        purchase_pack_qty=getattr(src, "purchase_pack_qty", None),
        free_shipping_threshold_net=getattr(src, "free_shipping_threshold_net", None),
        last_purchase_price_net=getattr(src, "last_purchase_price_net", None),
        supplier_sku=getattr(src, "supplier_sku", None),
        stock=float(getattr(src, "stock", 0) or 0),
        reserved_qty=float(getattr(src, "reserved_qty", 0) or 0),
        location_label=getattr(src, "location_label", None),
        purchase_price=getattr(src, "purchase_price", None),
        unit_cost=getattr(src, "unit_cost", None),
        vat_rate_pct=float(getattr(src, "vat_rate_pct", 23) or 23),
        package_qty=getattr(src, "package_qty", None),
        package_net_total=getattr(src, "package_net_total", None),
        package_gross_total=getattr(src, "package_gross_total", None),
        low_stock_threshold=getattr(src, "low_stock_threshold", None),
        reorder_qty=getattr(src, "reorder_qty", None),
        plastic_kg_per_unit=float(getattr(src, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(src, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(src, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(src, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(src, "metal_kg_per_unit", 0) or 0),
        packaging_type=getattr(src, "packaging_type", None),
        include_in_bdo=bool(getattr(src, "include_in_bdo", False)),
        notes=getattr(src, "notes", None),
        created_at=now,
        updated_at=now,
    )
    row.shipping_methods = list(getattr(src, "shipping_methods", None) or [])
    db.add(row)
    db.flush()
    vat = float(getattr(src, "vat_rate_pct", 23) or 23)
    for t in getattr(src, "price_tiers", None) or []:
        pn, pg = complete_package_totals(
            getattr(t, "package_net_total", None),
            getattr(t, "package_gross_total", None),
            vat_rate_pct=vat,
        )
        db.add(
            WmPriceTier(
                id=str(uuid.uuid4()),
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                carton_id=nid,
                packaging_material_id=None,
                sort_index=int(getattr(t, "sort_index", 0) or 0),
                qty_from=float(getattr(t, "qty_from", 1) or 1),
                package_qty=float(getattr(t, "package_qty", None)) if getattr(t, "package_qty", None) is not None else None,
                package_net_total=float(pn) if pn is not None else None,
                package_gross_total=float(pg) if pg is not None else None,
                created_at=now,
                updated_at=now,
            )
        )
    db.commit()
    row = (
        _carton_base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(Carton.id == nid)
        .first()
    )
    return _carton_to_read(row)


@router.post("/", response_model=CartonRead, status_code=201)
def create_carton(body: CartonCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    _validate_supplier_id(db, tenant_id=body.tenant_id, supplier_id=body.supplier_id)
    _validate_producer_id(db, tenant_id=body.tenant_id, producer_id=body.producer_id)
    _validate_shipping_method_ids(
        db,
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        ids=body.shipping_method_ids,
    )
    now = datetime.utcnow()
    vat = float(body.vat_rate_pct)
    pn, pg = complete_package_totals(
        body.package_net_total,
        body.package_gross_total,
        vat_rate_pct=vat,
    )
    plastic = float(body.plastic_kg_per_unit) if body.plastic_kg_per_unit is not None else 0.0
    paper = float(body.paper_kg_per_unit) if body.paper_kg_per_unit is not None else float(body.weight_kg)
    row = Carton(
        id=str(uuid.uuid4()),
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        name=name[:256],
        image_url=(str(body.image_url).strip()[:512] if body.image_url else None) or None,
        sku=(str(body.sku).strip()[:128] if body.sku else None) or None,
        ean=(str(body.ean).strip()[:64] if body.ean else None) or None,
        material_type=(str(body.material_type).strip()[:128] if body.material_type else None) or None,
        length_cm=float(body.length_cm),
        width_cm=float(body.width_cm),
        height_cm=float(body.height_cm),
        internal_length_cm=float(body.internal_length_cm) if body.internal_length_cm is not None else None,
        internal_width_cm=float(body.internal_width_cm) if body.internal_width_cm is not None else None,
        internal_height_cm=float(body.internal_height_cm) if body.internal_height_cm is not None else None,
        max_payload_kg=float(body.max_payload_kg) if body.max_payload_kg is not None else None,
        weight_kg=float(body.weight_kg),
        is_active=bool(body.is_active),
        supplier_id=int(body.supplier_id) if body.supplier_id is not None else None,
        producer_id=int(body.producer_id) if body.producer_id is not None else None,
        supplier_name_override=(str(body.supplier_name_override).strip()[:256] or None)
        if body.supplier_name_override is not None
        else None,
        lead_time_days=int(body.lead_time_days) if body.lead_time_days is not None else None,
        moq=float(body.moq) if body.moq is not None else None,
        purchase_pack_qty=float(body.purchase_pack_qty) if body.purchase_pack_qty is not None else None,
        free_shipping_threshold_net=float(body.free_shipping_threshold_net)
        if body.free_shipping_threshold_net is not None
        else None,
        last_purchase_price_net=float(body.last_purchase_price_net) if body.last_purchase_price_net is not None else None,
        supplier_sku=(body.supplier_sku or "").strip()[:128] or None,
        stock=float(body.stock),
        reserved_qty=float(body.reserved_qty),
        location_label=(body.location_label or "").strip()[:512] or None,
        purchase_price=float(body.purchase_price) if body.purchase_price is not None else None,
        unit_cost=float(body.unit_cost) if body.unit_cost is not None else None,
        vat_rate_pct=vat,
        package_qty=float(body.package_qty) if body.package_qty is not None else None,
        package_net_total=float(pn) if pn is not None else None,
        package_gross_total=float(pg) if pg is not None else None,
        low_stock_threshold=float(body.low_stock_threshold) if body.low_stock_threshold is not None else None,
        reorder_qty=float(body.reorder_qty) if body.reorder_qty is not None else None,
        plastic_kg_per_unit=plastic,
        paper_kg_per_unit=paper,
        wood_kg_per_unit=float(body.wood_kg_per_unit) if body.wood_kg_per_unit is not None else 0.0,
        glass_kg_per_unit=float(body.glass_kg_per_unit) if body.glass_kg_per_unit is not None else 0.0,
        metal_kg_per_unit=float(body.metal_kg_per_unit) if body.metal_kg_per_unit is not None else 0.0,
        packaging_type=(str(body.packaging_type).strip()[:64] if body.packaging_type else None) or None,
        include_in_bdo=bool(body.include_in_bdo),
        created_at=now,
        updated_at=now,
    )
    if body.shipping_method_ids:
        uniq = list({str(x).strip() for x in body.shipping_method_ids if str(x).strip()})
        sms = (
            db.query(ShippingMethod)
            .filter(
                ShippingMethod.tenant_id == int(body.tenant_id),
                ShippingMethod.warehouse_id == int(body.warehouse_id),
                ShippingMethod.id.in_(uniq),
            )
            .all()
        )
        row.shipping_methods = sms
    db.add(row)
    db.flush()
    if body.price_tiers:
        _replace_carton_tiers(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=body.warehouse_id,
            carton_id=str(row.id),
            tiers=body.price_tiers,
            vat_rate_pct=vat,
        )
    db.commit()
    row = (
        _carton_base_query(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id)
        .filter(Carton.id == row.id)
        .first()
    )
    return _carton_to_read(row)


@router.put("/{carton_id}/", response_model=CartonRead)
def update_carton(
    carton_id: str,
    body: CartonUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(Carton)
        .options(selectinload(Carton.shipping_methods), selectinload(Carton.price_tiers))
        .filter(
            Carton.id == str(carton_id).strip(),
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono kartonu.")

    patch = body.model_dump(exclude_unset=True)
    if "supplier_id" in patch:
        _validate_supplier_id(db, tenant_id=int(tenant_id), supplier_id=patch.get("supplier_id"))
    if "producer_id" in patch:
        _validate_producer_id(db, tenant_id=int(tenant_id), producer_id=patch.get("producer_id"))
    if "shipping_method_ids" in patch:
        ids = patch.get("shipping_method_ids")
        if ids is None:
            row.shipping_methods = []
        else:
            _validate_shipping_method_ids(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                ids=ids,
            )
            uniq = list({str(x).strip() for x in ids if str(x).strip()})
            if uniq:
                sms = (
                    db.query(ShippingMethod)
                    .filter(
                        ShippingMethod.tenant_id == int(tenant_id),
                        ShippingMethod.warehouse_id == int(warehouse_id),
                        ShippingMethod.id.in_(uniq),
                    )
                    .all()
                )
                row.shipping_methods = sms
            else:
                row.shipping_methods = []

    if "name" in patch:
        nn = (patch.get("name") or "").strip()
        if not nn:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = nn[:256]
    if "image_url" in patch:
        raw = patch.get("image_url")
        row.image_url = (str(raw).strip()[:512] if raw is not None else "") or None
    if "sku" in patch:
        raw = patch.get("sku")
        row.sku = (str(raw).strip()[:128] if raw is not None else "") or None
    if "ean" in patch:
        raw = patch.get("ean")
        row.ean = (str(raw).strip()[:64] if raw is not None else "") or None
    if "material_type" in patch:
        raw = patch.get("material_type")
        row.material_type = (str(raw).strip()[:128] if raw is not None else "") or None
    if "length_cm" in patch and patch["length_cm"] is not None:
        row.length_cm = float(patch["length_cm"])
    if "width_cm" in patch and patch["width_cm"] is not None:
        row.width_cm = float(patch["width_cm"])
    if "height_cm" in patch and patch["height_cm"] is not None:
        row.height_cm = float(patch["height_cm"])
    if "internal_length_cm" in patch:
        v = patch.get("internal_length_cm")
        row.internal_length_cm = float(v) if v is not None else None
    if "internal_width_cm" in patch:
        v = patch.get("internal_width_cm")
        row.internal_width_cm = float(v) if v is not None else None
    if "internal_height_cm" in patch:
        v = patch.get("internal_height_cm")
        row.internal_height_cm = float(v) if v is not None else None
    if "max_payload_kg" in patch:
        v = patch.get("max_payload_kg")
        row.max_payload_kg = float(v) if v is not None else None
    if "weight_kg" in patch and patch["weight_kg"] is not None:
        row.weight_kg = float(patch["weight_kg"])
        if "paper_kg_per_unit" not in patch:
            row.paper_kg_per_unit = float(patch["weight_kg"])
    if "is_active" in patch and patch["is_active"] is not None:
        row.is_active = bool(patch["is_active"])
    if "supplier_id" in patch:
        sid = patch.get("supplier_id")
        row.supplier_id = int(sid) if sid is not None else None
    if "producer_id" in patch:
        pid = patch.get("producer_id")
        row.producer_id = int(pid) if pid is not None else None
    if "supplier_name_override" in patch:
        raw = patch.get("supplier_name_override")
        row.supplier_name_override = (str(raw).strip()[:256] if raw is not None else "") or None
    if "lead_time_days" in patch:
        v = patch.get("lead_time_days")
        row.lead_time_days = int(v) if v is not None else None
    if "moq" in patch:
        v = patch.get("moq")
        row.moq = float(v) if v is not None else None
    if "purchase_pack_qty" in patch:
        v = patch.get("purchase_pack_qty")
        row.purchase_pack_qty = float(v) if v is not None else None
    if "free_shipping_threshold_net" in patch:
        v = patch.get("free_shipping_threshold_net")
        row.free_shipping_threshold_net = float(v) if v is not None else None
    if "last_purchase_price_net" in patch:
        v = patch.get("last_purchase_price_net")
        row.last_purchase_price_net = float(v) if v is not None else None
    if "supplier_sku" in patch:
        raw = patch.get("supplier_sku")
        row.supplier_sku = (str(raw).strip()[:128] if raw is not None else "") or None
    if "stock" in patch and patch["stock"] is not None:
        row.stock = float(patch["stock"])
    if "reserved_qty" in patch and patch["reserved_qty"] is not None:
        row.reserved_qty = float(patch["reserved_qty"])
    if "location_label" in patch:
        raw = patch.get("location_label")
        row.location_label = (str(raw).strip()[:512] if raw is not None else "") or None
    if "purchase_price" in patch:
        pp = patch.get("purchase_price")
        row.purchase_price = float(pp) if pp is not None else None
    if "unit_cost" in patch:
        uc = patch.get("unit_cost")
        row.unit_cost = float(uc) if uc is not None else None
    if "vat_rate_pct" in patch and patch["vat_rate_pct"] is not None:
        row.vat_rate_pct = float(patch["vat_rate_pct"])
    if "package_qty" in patch:
        pq = patch.get("package_qty")
        row.package_qty = float(pq) if pq is not None else None
    if "package_net_total" in patch or "package_gross_total" in patch:
        vat = float(row.vat_rate_pct or 23)
        cur_n = row.package_net_total
        cur_g = row.package_gross_total
        if "package_net_total" in patch:
            cur_n = patch.get("package_net_total")
        if "package_gross_total" in patch:
            cur_g = patch.get("package_gross_total")
        pn, pg = complete_package_totals(cur_n, cur_g, vat_rate_pct=vat)
        row.package_net_total = float(pn) if pn is not None else None
        row.package_gross_total = float(pg) if pg is not None else None
    if "low_stock_threshold" in patch:
        v = patch.get("low_stock_threshold")
        row.low_stock_threshold = float(v) if v is not None else None
    if "reorder_qty" in patch:
        v = patch.get("reorder_qty")
        row.reorder_qty = float(v) if v is not None else None
    for fld in ("plastic_kg_per_unit", "paper_kg_per_unit", "wood_kg_per_unit", "glass_kg_per_unit", "metal_kg_per_unit"):
        if fld in patch:
            v = patch.get(fld)
            setattr(row, fld, float(v) if v is not None else 0.0)
    if "packaging_type" in patch:
        raw = patch.get("packaging_type")
        row.packaging_type = (str(raw).strip()[:64] if raw is not None else "") or None
    if "include_in_bdo" in patch and patch["include_in_bdo"] is not None:
        row.include_in_bdo = bool(patch["include_in_bdo"])

    if "price_tiers" in patch:
        tiers = patch.get("price_tiers")
        vat = float(row.vat_rate_pct or 23)
        if tiers is None:
            pass
        elif len(tiers) == 0:
            db.query(WmPriceTier).filter(WmPriceTier.carton_id == str(carton_id).strip()).delete(synchronize_session=False)
        else:
            _replace_carton_tiers(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                carton_id=str(carton_id).strip(),
                tiers=[PriceTierIn.model_validate(x) for x in tiers],
                vat_rate_pct=vat,
            )

    row.updated_at = datetime.utcnow()
    db.commit()
    row = (
        _carton_base_query(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        .filter(Carton.id == str(carton_id).strip())
        .first()
    )
    return _carton_to_read(row)


@router.patch("/bulk-supplier/", response_model=dict)
def bulk_set_carton_supplier(
    body: WmBulkSupplierBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    _validate_supplier_id(db, tenant_id=int(tenant_id), supplier_id=body.supplier_id)
    ids = [str(x).strip() for x in body.ids if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="ids is required")
    rows = (
        db.query(Carton)
        .filter(
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
            Carton.id.in_(ids),
        )
        .all()
    )
    now = datetime.utcnow()
    for row in rows:
        row.supplier_id = int(body.supplier_id) if body.supplier_id is not None else None
        row.updated_at = now
    db.commit()
    return {"updated": len(rows), "requested": len(ids)}


@router.delete("/{carton_id}/")
def delete_carton(
    carton_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(Carton)
        .filter(
            Carton.id == str(carton_id).strip(),
            Carton.tenant_id == int(tenant_id),
            Carton.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono kartonu.")
    db.delete(row)
    db.commit()
    return {"ok": True}
