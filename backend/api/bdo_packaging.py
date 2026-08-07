"""API: BDO — report-only layer over packaging materials + warehouse documents."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.bdo_packaging import BdoAuditLog, BdoSettings
from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial
from ..schemas.bdo_packaging import (
    BdoAuditRead,
    BdoDashboardRead,
    BdoMonthlyReportRead,
    BdoMovementRead,
    BdoSettingsRead,
    BdoSettingsUpdate,
    BdoWmBdoFieldsPatch,
    BdoWmCatalogRow,
)
from ..services.packaging_materials.bdo_report_service import build_monthly_bdo_report
from ..services.packaging_materials.inventory_qty import packaging_inventory_quantity
from ..services.packaging_materials.stockable_bridge import (
    ensure_carton_stockable_product,
    ensure_packaging_stockable_product,
)

router = APIRouter(prefix="/warehouse/bdo", tags=["BDO — materiały opakowaniowe"])

WM_PACKAGING = "packaging"
WM_CARTON = "carton"
WmRow = Union[PackagingMaterial, Carton]

_GONE = "Endpoint usunięty — BDO jest warstwą raportową. Używaj dokumentów PZ/RW i inwentaryzacji WMS."


def _wm_ref(kind: str, wm_id: str) -> str:
    return f"{kind.strip().lower()}:{str(wm_id).strip()}"


def _parse_wm_ref(wm_ref: str) -> Tuple[str, str]:
    s = (wm_ref or "").strip()
    if ":" not in s:
        raise HTTPException(status_code=400, detail="Nieprawidłowy wm_ref")
    kind, rid = s.split(":", 1)
    k = kind.strip().lower()
    rid = rid.strip()
    if k not in (WM_PACKAGING, WM_CARTON) or not rid:
        raise HTTPException(status_code=400, detail="Nieprawidłowy wm_ref")
    return k, rid


def _load_wm(db: Session, tenant_id: int, kind: str, wm_id: str) -> Optional[WmRow]:
    if kind == WM_PACKAGING:
        return (
            db.query(PackagingMaterial)
            .filter(PackagingMaterial.id == wm_id, PackagingMaterial.tenant_id == int(tenant_id))
            .first()
        )
    return db.query(Carton).filter(Carton.id == wm_id, Carton.tenant_id == int(tenant_id)).first()


def _wm_sku(row: WmRow) -> Optional[str]:
    sku = getattr(row, "sku", None)
    if sku is None or str(sku).strip() == "":
        return None
    return str(sku).strip()[:128]


def _inventory_stock(db: Session, row: WmRow) -> float:
    if isinstance(row, Carton):
        prod = ensure_carton_stockable_product(db, row)
    else:
        prod = ensure_packaging_stockable_product(db, row)
    return packaging_inventory_quantity(
        db,
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        product_id=int(prod.id),
    )


def _packaging_to_catalog(db: Session, r: PackagingMaterial) -> BdoWmCatalogRow:
    return BdoWmCatalogRow(
        wm_ref=_wm_ref(WM_PACKAGING, str(r.id)),
        kind=WM_PACKAGING,
        warehouse_id=int(r.warehouse_id),
        name=str(r.name or ""),
        sku=_wm_sku(r),
        category=str(r.material_type or ""),
        unit=str(r.unit or ""),
        stock=_inventory_stock(db, r),
        is_active=bool(getattr(r, "is_active", True)),
        include_in_bdo=bool(getattr(r, "include_in_bdo", False)),
        packaging_type=getattr(r, "packaging_type", None),
        plastic_kg_per_unit=float(getattr(r, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(r, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(r, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(r, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(r, "metal_kg_per_unit", 0) or 0),
        created_at=getattr(r, "created_at", None),
        updated_at=getattr(r, "updated_at", None),
    )


def _carton_to_catalog(db: Session, r: Carton) -> BdoWmCatalogRow:
    pt = getattr(r, "packaging_type", None)
    cat = str(pt).strip() if pt else "carton"
    return BdoWmCatalogRow(
        wm_ref=_wm_ref(WM_CARTON, str(r.id)),
        kind=WM_CARTON,
        warehouse_id=int(r.warehouse_id),
        name=str(r.name or ""),
        sku=_wm_sku(r),
        category=cat,
        unit="pcs",
        stock=_inventory_stock(db, r),
        is_active=bool(getattr(r, "is_active", True)),
        include_in_bdo=bool(getattr(r, "include_in_bdo", False)),
        packaging_type=getattr(r, "packaging_type", None),
        plastic_kg_per_unit=float(getattr(r, "plastic_kg_per_unit", 0) or 0),
        paper_kg_per_unit=float(getattr(r, "paper_kg_per_unit", 0) or 0),
        wood_kg_per_unit=float(getattr(r, "wood_kg_per_unit", 0) or 0),
        glass_kg_per_unit=float(getattr(r, "glass_kg_per_unit", 0) or 0),
        metal_kg_per_unit=float(getattr(r, "metal_kg_per_unit", 0) or 0),
        created_at=getattr(r, "created_at", None),
        updated_at=getattr(r, "updated_at", None),
    )


def _log(db: Session, *, tenant_id: int, action: str, detail: str | None = None) -> None:
    db.add(
        BdoAuditLog(
            tenant_id=int(tenant_id),
            created_at=datetime.utcnow(),
            action=action[:128],
            detail=detail,
        )
    )


@router.get("/dashboard", response_model=BdoDashboardRead)
def bdo_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    mats: list[WmRow] = []
    q1 = db.query(PackagingMaterial).filter(
        PackagingMaterial.tenant_id == int(tenant_id), PackagingMaterial.include_in_bdo.is_(True)
    )
    q2 = db.query(Carton).filter(Carton.tenant_id == int(tenant_id), Carton.include_in_bdo.is_(True))
    if warehouse_id is not None:
        q1 = q1.filter(PackagingMaterial.warehouse_id == int(warehouse_id))
        q2 = q2.filter(Carton.warehouse_id == int(warehouse_id))
    mats.extend(q1.all())
    mats.extend(q2.all())
    catalog_plastic = catalog_paper = 0.0
    for m in mats:
        qty = _inventory_stock(db, m)
        catalog_plastic += qty * float(getattr(m, "plastic_kg_per_unit", 0) or 0)
        catalog_paper += qty * float(getattr(m, "paper_kg_per_unit", 0) or 0)
    return BdoDashboardRead(
        materials_tracked=len(mats),
        estimated_plastic_kg=round(catalog_plastic, 3),
        estimated_paper_kg=round(catalog_paper, 3),
        month_purchases_pln=0.0,
        last_report_month_label=None,
        missing_stock_counts=0,
        ledger_plastic_kg=0.0,
        ledger_paper_kg=0.0,
    )


@router.get("/dashboard/recent", response_model=list[BdoAuditRead])
def bdo_dashboard_recent(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    rows = (
        db.query(BdoAuditLog)
        .filter(BdoAuditLog.tenant_id == int(tenant_id))
        .order_by(BdoAuditLog.created_at.desc(), BdoAuditLog.id.desc())
        .limit(40)
        .all()
    )
    return [
        BdoAuditRead(
            id=int(r.id),
            created_at=r.created_at,
            action=str(r.action),
            detail=r.detail,
            user_label=r.user_label,
        )
        for r in rows
    ]


@router.get("/catalog", response_model=list[BdoWmCatalogRow])
def list_catalog(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    out: list[BdoWmCatalogRow] = []
    q1 = db.query(PackagingMaterial).filter(PackagingMaterial.tenant_id == int(tenant_id))
    q2 = db.query(Carton).filter(Carton.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q1 = q1.filter(PackagingMaterial.warehouse_id == int(warehouse_id))
        q2 = q2.filter(Carton.warehouse_id == int(warehouse_id))
    if not include_inactive:
        q1 = q1.filter(PackagingMaterial.is_active.is_(True))
        q2 = q2.filter(Carton.is_active.is_(True))
    for r in q1.all():
        out.append(_packaging_to_catalog(db, r))
    for r in q2.all():
        out.append(_carton_to_catalog(db, r))
    out.sort(key=lambda x: (x.name or "").lower())
    return out


@router.patch("/catalog/wm-fields", response_model=BdoWmCatalogRow)
def patch_wm_bdo_fields(body: BdoWmBdoFieldsPatch, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    kind, wid = _parse_wm_ref(body.wm_ref)
    row = _load_wm(db, tenant_id, kind, wid)
    if row is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału")
    data = body.model_dump(exclude_unset=True)
    for key in (
        "plastic_kg_per_unit",
        "paper_kg_per_unit",
        "wood_kg_per_unit",
        "glass_kg_per_unit",
        "metal_kg_per_unit",
        "packaging_type",
        "include_in_bdo",
    ):
        if key in data and data[key] is not None:
            setattr(row, key, data[key])
    row.updated_at = datetime.utcnow()
    _log(db, tenant_id=tenant_id, action="Aktualizacja pól BDO", detail=_wm_ref(kind, wid))
    db.commit()
    db.refresh(row)
    return _packaging_to_catalog(db, row) if kind == WM_PACKAGING else _carton_to_catalog(db, row)


@router.get("/settings", response_model=BdoSettingsRead)
def get_settings(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    row = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    if row is None:
        row = BdoSettings(tenant_id=tenant_id, allow_negative_stock=False, updated_at=datetime.utcnow())
        db.add(row)
        db.commit()
        db.refresh(row)
    return BdoSettingsRead(
        tenant_id=int(row.tenant_id),
        reporting_company_name=row.reporting_company_name,
        registration_numbers=row.registration_numbers,
        default_methodology_text=row.default_methodology_text,
        allow_negative_stock=bool(row.allow_negative_stock),
        updated_at=row.updated_at,
    )


@router.put("/settings", response_model=BdoSettingsRead)
def put_settings(body: BdoSettingsUpdate, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    row = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    if row is None:
        row = BdoSettings(tenant_id=tenant_id, allow_negative_stock=False)
        db.add(row)
    data = body.model_dump(exclude_unset=True)
    for key in ("reporting_company_name", "registration_numbers", "default_methodology_text", "allow_negative_stock"):
        if key in data:
            setattr(row, key, data[key])
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return get_settings(tenant_id=tenant_id, db=db)


def _monthly(db: Session, tenant_id: int, year: int, month: int, warehouse_id: Optional[int]) -> BdoMonthlyReportRead:
    settings = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    note = settings.default_methodology_text if settings else None
    try:
        return build_monthly_bdo_report(
            db,
            tenant_id=tenant_id,
            year=year,
            month=month,
            warehouse_id=warehouse_id,
            methodology_note=note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/reports/monthly", response_model=BdoMonthlyReportRead)
def monthly_report_json(
    tenant_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    return _monthly(db, tenant_id, year, month, warehouse_id)


@router.get("/reports/monthly.csv")
def monthly_report_csv(
    tenant_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    rep = _monthly(db, tenant_id, year, month, warehouse_id)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(
        [
            "Materiał",
            "SKU",
            "Przyjęcia (PZ)",
            "Zużycie (RW)",
            "Tworzywo kg",
            "Papier kg",
            "Drewno kg",
            "Szkło kg",
            "Metal kg",
        ]
    )
    for r in rep.rows:
        w.writerow(
            [
                r.material_name,
                r.sku or "",
                r.purchased_qty,
                "" if r.used_qty is None else r.used_qty,
                r.plastic_kg,
                r.paper_kg,
                r.wood_kg,
                r.glass_kg,
                r.metal_kg,
            ]
        )
    return Response(
        content=buf.getvalue().encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="bdo_raport_{year}_{month:02d}.csv"'},
    )


@router.get("/movements", response_model=list[BdoMovementRead])
def list_bdo_movements(
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """History is document-driven — empty stub until document movement projection is wired in UI."""
    _ = (tenant_id, limit, db)
    return []


# Removed operational BDO ledger endpoints (410).
@router.api_route("/purchases", methods=["GET", "POST"])
@router.api_route("/stock-counts", methods=["GET", "POST"])
@router.api_route("/corrections", methods=["GET", "POST"])
def _removed_bdo_ledger():
    raise HTTPException(status_code=410, detail=_GONE)
