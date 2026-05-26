"""CRUD for packaging consumables + pricing tiers + duplicate."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models.manufacturer import Manufacturer
from ..models.packaging_material import PackagingMaterial
from ..models.supplier import Supplier
from ..models.wm_price_tier import WmPriceTier
from ..schemas.warehouse_materials import (
    PackagingMaterialCreate,
    PackagingMaterialRead,
    PackagingMaterialStockPatch,
    PackagingMaterialUpdate,
    PriceTierIn,
    PriceTierRead,
    WmBulkSupplierBody,
    carton_base_unit_prices,
)
from ..services.wm_pricing import complete_package_totals, serialize_wm_tiers

router = APIRouter(prefix="/packaging-materials", tags=["Warehouse materials — consumables"])


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


def _tier_reads(row: PackagingMaterial) -> list[PriceTierRead]:
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


def _row_to_read(row: PackagingMaterial) -> PackagingMaterialRead:
    sup = getattr(row, "supplier", None)
    supplier_name = (getattr(sup, "name", None) or "").strip() or None if sup else None
    prod = getattr(row, "producer", None)
    producer_id = int(row.producer_id) if getattr(row, "producer_id", None) is not None else None
    producer_name = (getattr(prod, "name", None) or "").strip() or None if prod is not None else None
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
    tier_reads = _tier_reads(row)
    if tier_reads and tier_reads[0].unit_net is not None:
        unit_net = tier_reads[0].unit_net
        unit_gross = tier_reads[0].unit_gross
    return PackagingMaterialRead(
        id=str(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        name=str(row.name or ""),
        material_type=str(row.material_type or ""),
        unit=str(row.unit or ""),
        image_url=(str(getattr(row, "image_url", None) or "").strip() or None) or None,
        sku=(str(getattr(row, "sku", None) or "").strip()[:128] or None) if getattr(row, "sku", None) else None,
        stock=sk,
        reserved_qty=rq,
        available_qty=avail,
        is_active=bool(getattr(row, "is_active", True)),
        supplier_id=int(row.supplier_id) if getattr(row, "supplier_id", None) is not None else None,
        supplier_name=supplier_name,
        producer_id=producer_id,
        producer_name=producer_name,
        supplier_name_override=(
            (str(getattr(row, "supplier_name_override", None) or "").strip()[:256] or None)
            if getattr(row, "supplier_name_override", None) is not None
            else None
        ),
        lead_time_days=int(row.lead_time_days) if getattr(row, "lead_time_days", None) is not None else None,
        moq=_fopt(row, "moq"),
        purchase_pack_qty=_fopt(row, "purchase_pack_qty"),
        free_shipping_threshold_net=_fopt(row, "free_shipping_threshold_net"),
        last_purchase_price_net=_fopt(row, "last_purchase_price_net"),
        supplier_sku=(str(getattr(row, "supplier_sku", None) or "").strip() or None)
        if getattr(row, "supplier_sku", None)
        else None,
        location_label=(str(getattr(row, "location_label", None) or "").strip() or None) or None,
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
        notes=(str(getattr(row, "notes", None) or "").strip() or None) or None,
        width_mm=_fopt(row, "width_mm"),
        length_m=_fopt(row, "length_m"),
        thickness_micron=_fopt(row, "thickness_micron"),
        color=(str(getattr(row, "color", None) or "").strip() or None) or None,
        net_weight_foil_kg=_fopt(row, "net_weight_foil_kg"),
        tube_weight_kg=_fopt(row, "tube_weight_kg"),
        stretch_percent=_fopt(row, "stretch_percent"),
        tube_diameter_mm=_fopt(row, "tube_diameter_mm"),
        adhesive_type=(str(getattr(row, "adhesive_type", None) or "").strip() or None) or None,
        tape_weight_kg=_fopt(row, "tape_weight_kg"),
        core_paper_weight_kg=_fopt(row, "core_paper_weight_kg"),
        roll_diameter_mm=_fopt(row, "roll_diameter_mm"),
        grammage_gsm=_fopt(row, "grammage_gsm"),
        paper_type=(str(getattr(row, "paper_type", None) or "").strip() or None) or None,
        roll_weight_kg=_fopt(row, "roll_weight_kg"),
        bubble_width_cm=_fopt(row, "bubble_width_cm"),
        bubble_diameter_mm=_fopt(row, "bubble_diameter_mm"),
        tolerance_percent=_fopt(row, "tolerance_percent"),
        bubble_weight_kg=_fopt(row, "bubble_weight_kg"),
        plastic_kg_per_unit=float(getattr(row, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(row, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(row, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(row, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(row, "metal_kg_per_unit", 0) or 0),
        packaging_type=(str(getattr(row, "packaging_type", None) or "").strip() or None) or None,
        include_in_bdo=bool(getattr(row, "include_in_bdo", False)),
        price_tiers=tier_reads,
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
    )


def _fopt(row: PackagingMaterial, attr: str) -> Optional[float]:
    v = getattr(row, attr, None)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _base_query(db: Session, *, tenant_id: int, warehouse_id: int):
    return (
        db.query(PackagingMaterial)
        .options(
            joinedload(PackagingMaterial.supplier),
            joinedload(PackagingMaterial.producer),
            selectinload(PackagingMaterial.price_tiers),
        )
        .filter(
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
        )
    )


def _replace_packaging_tiers(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    material_id: str,
    tiers: List[PriceTierIn],
    vat_rate_pct: float,
) -> None:
    mid = str(material_id).strip()
    db.query(WmPriceTier).filter(WmPriceTier.packaging_material_id == mid).delete(synchronize_session=False)
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
                carton_id=None,
                packaging_material_id=mid,
                sort_index=int(i),
                qty_from=float(t.qty_from),
                package_qty=float(t.package_qty) if t.package_qty is not None else None,
                package_net_total=float(pn) if pn is not None else None,
                package_gross_total=float(pg) if pg is not None else None,
                created_at=now,
                updated_at=now,
            )
        )


def _apply_payload_to_row(row: PackagingMaterial, body: PackagingMaterialCreate | PackagingMaterialUpdate, *, is_create: bool) -> None:
    """Mutate row from pydantic body (create uses all fields; update uses model_dump exclude_unset)."""
    if is_create:
        data = body.model_dump() if isinstance(body, PackagingMaterialCreate) else {}
    else:
        data = body.model_dump(exclude_unset=True)  # type: ignore[union-attr]
    if is_create:
        name = str((body if isinstance(body, PackagingMaterialCreate) else body).name).strip()  # noqa: SLF001
    else:
        name = None
    if is_create:
        row.name = str(body.name).strip()[:256]  # type: ignore[union-attr]
        row.material_type = str(body.material_type).strip()[:32]  # type: ignore[union-attr]
        row.unit = str(body.unit).strip()[:32]  # type: ignore[union-attr]
        row.stock = float(body.stock)  # type: ignore[union-attr]
        row.reserved_qty = float(body.reserved_qty)  # type: ignore[union-attr]
        row.is_active = bool(body.is_active)  # type: ignore[union-attr]
    if "name" in data and not is_create:
        nn = str(data["name"] or "").strip()
        if not nn:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = nn[:256]
    if "material_type" in data and not is_create:
        row.material_type = str(data["material_type"]).strip()[:32]
    if "unit" in data and not is_create:
        row.unit = str(data["unit"]).strip()[:32]
    if "stock" in data and not is_create and data["stock"] is not None:
        row.stock = float(data["stock"])
    if "reserved_qty" in data and not is_create and data["reserved_qty"] is not None:
        row.reserved_qty = float(data["reserved_qty"])
    if "is_active" in data and not is_create and data["is_active"] is not None:
        row.is_active = bool(data["is_active"])

    def s_opt(key: str, max_len: Optional[int] = None) -> None:
        if key not in data:
            return
        raw = data.get(key)
        if raw is None:
            setattr(row, key, None)
            return
        s = str(raw).strip()
        setattr(row, key, (s[:max_len] if max_len else s) or None)

    for key in ("image_url",):
        if key in data or is_create:
            if is_create:
                raw = getattr(body, key, None)  # type: ignore[arg-type]
            else:
                raw = data.get(key)
            setattr(row, key, (str(raw).strip()[:512] if raw is not None else "") or None)

    if "sku" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("sku") if not is_create else body.sku  # type: ignore[union-attr]
        row.sku = (str(raw).strip()[:128] if raw is not None else "") or None

    if "supplier_id" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        sid = data.get("supplier_id") if not is_create else body.supplier_id  # type: ignore[union-attr]
        row.supplier_id = int(sid) if sid is not None else None
    if "supplier_sku" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("supplier_sku") if not is_create else body.supplier_sku  # type: ignore[union-attr]
        row.supplier_sku = (str(raw).strip()[:128] if raw is not None else "") or None
    if "producer_id" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        pid = data.get("producer_id") if not is_create else body.producer_id  # type: ignore[union-attr]
        row.producer_id = int(pid) if pid is not None else None
    if "supplier_name_override" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("supplier_name_override") if not is_create else body.supplier_name_override  # type: ignore[union-attr]
        row.supplier_name_override = (str(raw).strip()[:256] if raw is not None else "") or None
    if "lead_time_days" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("lead_time_days") if not is_create else body.lead_time_days  # type: ignore[union-attr]
        row.lead_time_days = int(v) if v is not None else None
    for key in ("moq", "purchase_pack_qty", "free_shipping_threshold_net", "last_purchase_price_net"):
        if key in data or (is_create and isinstance(body, PackagingMaterialCreate)):
            v = getattr(body, key, None) if is_create else data.get(key)
            setattr(row, key, float(v) if v is not None else None)
    if "location_label" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("location_label") if not is_create else body.location_label  # type: ignore[union-attr]
        row.location_label = (str(raw).strip()[:512] if raw is not None else "") or None
    if "purchase_price" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("purchase_price") if not is_create else body.purchase_price  # type: ignore[union-attr]
        row.purchase_price = float(v) if v is not None else None
    if "unit_cost" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("unit_cost") if not is_create else body.unit_cost  # type: ignore[union-attr]
        row.unit_cost = float(v) if v is not None else None
    if "vat_rate_pct" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("vat_rate_pct") if not is_create else body.vat_rate_pct  # type: ignore[union-attr]
        row.vat_rate_pct = float(v) if v is not None else 23.0
    if "package_qty" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("package_qty") if not is_create else body.package_qty  # type: ignore[union-attr]
        row.package_qty = float(v) if v is not None else None
    if "package_net_total" in data or "package_gross_total" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        vat = float(row.vat_rate_pct or 23)
        cur_n = row.package_net_total
        cur_g = row.package_gross_total
        if not is_create:
            if "package_net_total" in data:
                cur_n = data.get("package_net_total")
            if "package_gross_total" in data:
                cur_g = data.get("package_gross_total")
        else:
            cur_n = body.package_net_total  # type: ignore[union-attr]
            cur_g = body.package_gross_total  # type: ignore[union-attr]
        pn, pg = complete_package_totals(cur_n, cur_g, vat_rate_pct=vat)
        row.package_net_total = float(pn) if pn is not None else None
        row.package_gross_total = float(pg) if pg is not None else None
    if "low_stock_threshold" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("low_stock_threshold") if not is_create else body.low_stock_threshold  # type: ignore[union-attr]
        row.low_stock_threshold = float(v) if v is not None else None
    if "reorder_qty" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("reorder_qty") if not is_create else body.reorder_qty  # type: ignore[union-attr]
        row.reorder_qty = float(v) if v is not None else None
    if "notes" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("notes") if not is_create else body.notes  # type: ignore[union-attr]
        row.notes = (str(raw).strip() if raw is not None else "") or None

    for key in (
        "width_mm",
        "length_m",
        "thickness_micron",
        "net_weight_foil_kg",
        "tube_weight_kg",
        "stretch_percent",
        "tube_diameter_mm",
        "tape_weight_kg",
        "core_paper_weight_kg",
        "roll_diameter_mm",
        "grammage_gsm",
        "roll_weight_kg",
        "bubble_width_cm",
        "bubble_diameter_mm",
        "tolerance_percent",
        "bubble_weight_kg",
    ):
        if key in data or (is_create and isinstance(body, PackagingMaterialCreate)):
            v = getattr(body, key, None) if is_create else data.get(key)
            setattr(row, key, float(v) if v is not None else None)

    if "color" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("color") if not is_create else body.color  # type: ignore[union-attr]
        row.color = (str(raw).strip()[:64] if raw is not None else "") or None
    if "adhesive_type" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("adhesive_type") if not is_create else body.adhesive_type  # type: ignore[union-attr]
        row.adhesive_type = (str(raw).strip()[:64] if raw is not None else "") or None
    if "paper_type" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("paper_type") if not is_create else body.paper_type  # type: ignore[union-attr]
        row.paper_type = (str(raw).strip()[:128] if raw is not None else "") or None

    for key in ("plastic_kg_per_unit", "paper_kg_per_unit", "wood_kg_per_unit", "glass_kg_per_unit", "metal_kg_per_unit"):
        if key in data or (is_create and isinstance(body, PackagingMaterialCreate)):
            v = getattr(body, key, None) if is_create else data.get(key)
            setattr(row, key, float(v) if v is not None else 0.0)
    if "packaging_type" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        raw = data.get("packaging_type") if not is_create else body.packaging_type  # type: ignore[union-attr]
        row.packaging_type = (str(raw).strip()[:64] if raw is not None else "") or None
    if "include_in_bdo" in data or (is_create and isinstance(body, PackagingMaterialCreate)):
        v = data.get("include_in_bdo") if not is_create else body.include_in_bdo  # type: ignore[union-attr]
        row.include_in_bdo = bool(v)


@router.get("/", response_model=list[PackagingMaterialRead])
def list_packaging_materials(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    material_type: Optional[str] = Query(None, description="Filtr typu (np. stretch_foil, packing_tape)."),
    active_only: bool = Query(False),
    q: Optional[str] = Query(None, description="Szybkie szukanie po nazwie / SKU."),
    db: Session = Depends(get_db),
):
    query = _base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id).order_by(
        PackagingMaterial.material_type.asc(), PackagingMaterial.name.asc()
    )
    if material_type and str(material_type).strip():
        query = query.filter(PackagingMaterial.material_type == str(material_type).strip())
    if active_only:
        query = query.filter(PackagingMaterial.is_active.is_(True))
    qq = (q or "").strip().lower()
    if qq:
        like = f"%{qq}%"
        query = query.filter(
            or_(
                func.lower(PackagingMaterial.name).like(like),
                func.lower(func.coalesce(PackagingMaterial.sku, "")).like(like),
            )
        )
    return [_row_to_read(x) for x in query.all()]


@router.get("/{material_id}/", response_model=PackagingMaterialRead)
def get_packaging_material(
    material_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        _base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(PackagingMaterial.id == str(material_id).strip())
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału.")
    return _row_to_read(row)


@router.post("/{material_id}/duplicate/", response_model=PackagingMaterialRead, status_code=201)
def duplicate_packaging_material(
    material_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    src = (
        _base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(PackagingMaterial.id == str(material_id).strip())
        .first()
    )
    if not src:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału.")
    now = datetime.utcnow()
    nid = str(uuid.uuid4())
    base_name = str(src.name or "").strip() or "Materiał"
    row = PackagingMaterial(
        id=nid,
        tenant_id=int(src.tenant_id),
        warehouse_id=int(src.warehouse_id),
        name=f"{base_name} copy"[:256],
        material_type=str(src.material_type or "other")[:32],
        unit=str(src.unit or "roll")[:32],
        image_url=getattr(src, "image_url", None),
        sku=getattr(src, "sku", None),
        stock=float(getattr(src, "stock", 0) or 0),
        reserved_qty=float(getattr(src, "reserved_qty", 0) or 0),
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
        location_label=getattr(src, "location_label", None),
        purchase_price=getattr(src, "purchase_price", None),
        unit_cost=getattr(src, "unit_cost", None),
        vat_rate_pct=float(getattr(src, "vat_rate_pct", 23) or 23),
        package_qty=getattr(src, "package_qty", None),
        package_net_total=getattr(src, "package_net_total", None),
        package_gross_total=getattr(src, "package_gross_total", None),
        low_stock_threshold=getattr(src, "low_stock_threshold", None),
        reorder_qty=getattr(src, "reorder_qty", None),
        notes=getattr(src, "notes", None),
        width_mm=getattr(src, "width_mm", None),
        length_m=getattr(src, "length_m", None),
        thickness_micron=getattr(src, "thickness_micron", None),
        color=getattr(src, "color", None),
        net_weight_foil_kg=getattr(src, "net_weight_foil_kg", None),
        tube_weight_kg=getattr(src, "tube_weight_kg", None),
        stretch_percent=getattr(src, "stretch_percent", None),
        tube_diameter_mm=getattr(src, "tube_diameter_mm", None),
        adhesive_type=getattr(src, "adhesive_type", None),
        tape_weight_kg=getattr(src, "tape_weight_kg", None),
        core_paper_weight_kg=getattr(src, "core_paper_weight_kg", None),
        roll_diameter_mm=getattr(src, "roll_diameter_mm", None),
        grammage_gsm=getattr(src, "grammage_gsm", None),
        paper_type=getattr(src, "paper_type", None),
        roll_weight_kg=getattr(src, "roll_weight_kg", None),
        bubble_width_cm=getattr(src, "bubble_width_cm", None),
        bubble_diameter_mm=getattr(src, "bubble_diameter_mm", None),
        tolerance_percent=getattr(src, "tolerance_percent", None),
        bubble_weight_kg=getattr(src, "bubble_weight_kg", None),
        plastic_kg_per_unit=float(getattr(src, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(src, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(src, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(src, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(src, "metal_kg_per_unit", 0) or 0),
        packaging_type=getattr(src, "packaging_type", None),
        include_in_bdo=bool(getattr(src, "include_in_bdo", False)),
        created_at=now,
        updated_at=now,
    )
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
                carton_id=None,
                packaging_material_id=nid,
                sort_index=int(getattr(t, "sort_index", 0) or 0),
                qty_from=float(getattr(t, "qty_from", 1) or 1),
                package_qty=float(getattr(t, "package_qty")) if getattr(t, "package_qty", None) is not None else None,
                package_net_total=float(pn) if pn is not None else None,
                package_gross_total=float(pg) if pg is not None else None,
                created_at=now,
                updated_at=now,
            )
        )
    db.commit()
    row = (
        _base_query(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
        .filter(PackagingMaterial.id == nid)
        .first()
    )
    return _row_to_read(row)


@router.post("/", response_model=PackagingMaterialRead, status_code=201)
def create_packaging_material(body: PackagingMaterialCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    _validate_supplier_id(db, tenant_id=body.tenant_id, supplier_id=body.supplier_id)
    _validate_producer_id(db, tenant_id=body.tenant_id, producer_id=body.producer_id)
    now = datetime.utcnow()
    row = PackagingMaterial(
        id=str(uuid.uuid4()),
        tenant_id=int(body.tenant_id),
        warehouse_id=int(body.warehouse_id),
        name=name[:256],
        material_type=str(body.material_type).strip()[:32],
        unit=str(body.unit).strip()[:32],
        created_at=now,
        updated_at=now,
    )
    _apply_payload_to_row(row, body, is_create=True)
    db.add(row)
    db.flush()
    if body.price_tiers:
        _replace_packaging_tiers(
            db,
            tenant_id=body.tenant_id,
            warehouse_id=body.warehouse_id,
            material_id=str(row.id),
            tiers=body.price_tiers,
            vat_rate_pct=float(row.vat_rate_pct or 23),
        )
    db.commit()
    row = (
        _base_query(db, tenant_id=body.tenant_id, warehouse_id=body.warehouse_id)
        .filter(PackagingMaterial.id == row.id)
        .first()
    )
    return _row_to_read(row)


@router.put("/{material_id}/", response_model=PackagingMaterialRead)
def update_packaging_material(
    material_id: str,
    body: PackagingMaterialUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PackagingMaterial)
        .options(selectinload(PackagingMaterial.price_tiers))
        .filter(
            PackagingMaterial.id == str(material_id).strip(),
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału.")
    patch = body.model_dump(exclude_unset=True)
    if "supplier_id" in patch:
        _validate_supplier_id(db, tenant_id=int(tenant_id), supplier_id=patch.get("supplier_id"))
    if "producer_id" in patch:
        _validate_producer_id(db, tenant_id=int(tenant_id), producer_id=patch.get("producer_id"))
    _apply_payload_to_row(row, body, is_create=False)

    if "price_tiers" in patch:
        tiers = patch.get("price_tiers")
        vat = float(row.vat_rate_pct or 23)
        mid = str(material_id).strip()
        if tiers is None:
            pass
        elif len(tiers) == 0:
            db.query(WmPriceTier).filter(WmPriceTier.packaging_material_id == mid).delete(synchronize_session=False)
        else:
            _replace_packaging_tiers(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                material_id=mid,
                tiers=[PriceTierIn.model_validate(x) for x in tiers],
                vat_rate_pct=vat,
            )
    row.updated_at = datetime.utcnow()
    db.commit()
    row = (
        _base_query(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        .filter(PackagingMaterial.id == str(material_id).strip())
        .first()
    )
    return _row_to_read(row)


@router.patch("/{material_id}/stock/", response_model=PackagingMaterialRead)
def patch_packaging_stock(
    material_id: str,
    body: PackagingMaterialStockPatch,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PackagingMaterial)
        .filter(
            PackagingMaterial.id == str(material_id).strip(),
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału.")
    row.stock = float(body.stock)
    row.updated_at = datetime.utcnow()
    db.commit()
    row = (
        _base_query(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        .filter(PackagingMaterial.id == str(material_id).strip())
        .first()
    )
    return _row_to_read(row)


@router.patch("/bulk-supplier/", response_model=dict)
def bulk_set_packaging_supplier(
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
        db.query(PackagingMaterial)
        .filter(
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
            PackagingMaterial.id.in_(ids),
        )
        .all()
    )
    now = datetime.utcnow()
    for row in rows:
        row.supplier_id = int(body.supplier_id) if body.supplier_id is not None else None
        row.updated_at = now
    db.commit()
    return {"updated": len(rows), "requested": len(ids)}


@router.delete("/{material_id}/")
def delete_packaging_material(
    material_id: str,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(PackagingMaterial)
        .filter(
            PackagingMaterial.id == str(material_id).strip(),
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału.")
    db.delete(row)
    db.commit()
    return {"ok": True}
