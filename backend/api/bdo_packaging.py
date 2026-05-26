"""API: BDO — raporty środowiskowe; materiały = asortyment (packaging + kartony)."""

from __future__ import annotations

import csv
import io
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from typing import List, Optional, Tuple, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.bdo_packaging import (
    BdoAuditLog,
    BdoCorrection,
    BdoPackagingPurchase,
    BdoSettings,
    BdoStockCountLine,
    BdoStockCountSession,
)
from ..models.carton import Carton
from ..models.packaging_material import PackagingMaterial
from ..schemas.bdo_packaging import (
    BdoAuditRead,
    BdoCorrectionCreate,
    BdoCorrectionRead,
    BdoDashboardRead,
    BdoMonthlyReportRead,
    BdoMonthlyReportRow,
    BdoPurchaseCreate,
    BdoPurchaseRead,
    BdoSettingsRead,
    BdoSettingsUpdate,
    BdoStockCountCreate,
    BdoStockCountRead,
    BdoStockCountLineRead,
    BdoMovementRead,
    BdoWmBdoFieldsPatch,
    BdoWmCatalogRow,
)

router = APIRouter(prefix="/warehouse/bdo", tags=["BDO — materiały opakowaniowe"])

WM_PACKAGING = "packaging"
WM_CARTON = "carton"
WmRow = Union[PackagingMaterial, Carton]


def _last_day(y: int, m: int) -> date:
    return date(y, m, monthrange(y, m)[1])


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


def _wm_name(row: WmRow) -> str:
    return str(row.name or "")


def _wm_sku(row: WmRow) -> Optional[str]:
    sku = getattr(row, "sku", None)
    if sku is None or str(sku).strip() == "":
        return None
    return str(sku).strip()[:128]


def _require_bdo_tracked(row: WmRow) -> None:
    if not bool(getattr(row, "include_in_bdo", False)):
        raise HTTPException(status_code=400, detail="Materiał nie jest włączony do BDO (pole include_in_bdo).")


def _packaging_to_catalog(r: PackagingMaterial) -> BdoWmCatalogRow:
    return BdoWmCatalogRow(
        wm_ref=_wm_ref(WM_PACKAGING, str(r.id)),
        kind=WM_PACKAGING,
        warehouse_id=int(r.warehouse_id),
        name=str(r.name or ""),
        sku=_wm_sku(r),
        category=str(r.material_type or ""),
        unit=str(r.unit or ""),
        stock=float(r.stock or 0),
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


def _carton_to_catalog(r: Carton) -> BdoWmCatalogRow:
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
        stock=float(getattr(r, "stock", 0) or 0),
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


def _log(
    db: Session,
    *,
    tenant_id: int,
    action: str,
    detail: str | None = None,
    user_label: str | None = None,
) -> None:
    db.add(
        BdoAuditLog(
            tenant_id=tenant_id,
            created_at=datetime.utcnow(),
            action=action,
            detail=detail,
            user_label=user_label,
        )
    )


def _ledger_upto(db: Session, tenant_id: int, wm_kind: str, wm_id: str, as_of: date) -> float:
    p = (
        db.query(func.coalesce(func.sum(BdoPackagingPurchase.qty), 0.0))
        .filter(
            BdoPackagingPurchase.tenant_id == tenant_id,
            BdoPackagingPurchase.wm_kind == wm_kind,
            BdoPackagingPurchase.wm_id == wm_id,
            BdoPackagingPurchase.purchase_date <= as_of,
        )
        .scalar()
        or 0.0
    )
    c = (
        db.query(func.coalesce(func.sum(BdoCorrection.qty), 0.0))
        .filter(
            BdoCorrection.tenant_id == tenant_id,
            BdoCorrection.wm_kind == wm_kind,
            BdoCorrection.wm_id == wm_id,
            BdoCorrection.correction_date <= as_of,
        )
        .scalar()
        or 0.0
    )
    return float(p) + float(c)


def _purchases_in_range(db: Session, tenant_id: int, wm_kind: str, wm_id: str, d0: date, d1: date) -> float:
    return float(
        db.query(func.coalesce(func.sum(BdoPackagingPurchase.qty), 0.0))
        .filter(
            BdoPackagingPurchase.tenant_id == tenant_id,
            BdoPackagingPurchase.wm_kind == wm_kind,
            BdoPackagingPurchase.wm_id == wm_id,
            BdoPackagingPurchase.purchase_date >= d0,
            BdoPackagingPurchase.purchase_date <= d1,
        )
        .scalar()
        or 0.0
    )


def _corrections_in_range(db: Session, tenant_id: int, wm_kind: str, wm_id: str, d0: date, d1: date) -> float:
    return float(
        db.query(func.coalesce(func.sum(BdoCorrection.qty), 0.0))
        .filter(
            BdoCorrection.tenant_id == tenant_id,
            BdoCorrection.wm_kind == wm_kind,
            BdoCorrection.wm_id == wm_id,
            BdoCorrection.correction_date >= d0,
            BdoCorrection.correction_date <= d1,
        )
        .scalar()
        or 0.0
    )


def _counted_before(db: Session, tenant_id: int, wm_kind: str, wm_id: str, before: date) -> Optional[float]:
    row = (
        db.query(BdoStockCountLine.counted_stock, BdoStockCountSession.count_date)
        .join(BdoStockCountSession, BdoStockCountLine.session_id == BdoStockCountSession.id)
        .filter(
            BdoStockCountSession.tenant_id == tenant_id,
            BdoStockCountLine.wm_kind == wm_kind,
            BdoStockCountLine.wm_id == wm_id,
            BdoStockCountSession.count_date < before,
        )
        .order_by(BdoStockCountSession.count_date.desc(), BdoStockCountSession.id.desc())
        .first()
    )
    if row is None:
        return None
    return float(row[0])


def _counted_upto(db: Session, tenant_id: int, wm_kind: str, wm_id: str, last: date) -> Optional[float]:
    row = (
        db.query(BdoStockCountLine.counted_stock, BdoStockCountSession.count_date)
        .join(BdoStockCountSession, BdoStockCountLine.session_id == BdoStockCountSession.id)
        .filter(
            BdoStockCountSession.tenant_id == tenant_id,
            BdoStockCountLine.wm_kind == wm_kind,
            BdoStockCountLine.wm_id == wm_id,
            BdoStockCountSession.count_date <= last,
        )
        .order_by(BdoStockCountSession.count_date.desc(), BdoStockCountSession.id.desc())
        .first()
    )
    if row is None:
        return None
    return float(row[0])


def _bdo_tracked_materials(
    db: Session, tenant_id: int, warehouse_id: Optional[int] = None
) -> List[Tuple[str, str, WmRow]]:
    """(wm_kind, wm_id, row) dla pozycji include_in_bdo."""
    out: List[Tuple[str, str, WmRow]] = []
    q1 = db.query(PackagingMaterial).filter(
        PackagingMaterial.tenant_id == int(tenant_id),
        PackagingMaterial.include_in_bdo.is_(True),
        PackagingMaterial.is_active.is_(True),
    )
    if warehouse_id is not None:
        q1 = q1.filter(PackagingMaterial.warehouse_id == int(warehouse_id))
    for r in q1.all():
        out.append((WM_PACKAGING, str(r.id), r))
    q2 = db.query(Carton).filter(
        Carton.tenant_id == int(tenant_id),
        Carton.include_in_bdo.is_(True),
        Carton.is_active.is_(True),
    )
    if warehouse_id is not None:
        q2 = q2.filter(Carton.warehouse_id == int(warehouse_id))
    for r in q2.all():
        out.append((WM_CARTON, str(r.id), r))
    return out


@router.get("/dashboard", response_model=BdoDashboardRead)
def bdo_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    mats = _bdo_tracked_materials(db, tenant_id, warehouse_id)
    today = date.today()
    first_m = date(today.year, today.month, 1)
    ledger_plastic = 0.0
    ledger_paper = 0.0
    catalog_plastic = 0.0
    catalog_paper = 0.0
    for kind, wid, m in mats:
        q = _ledger_upto(db, tenant_id, kind, wid, today)
        ledger_plastic += q * float(getattr(m, "plastic_kg_per_unit", 0) or 0)
        ledger_paper += q * float(getattr(m, "paper_kg_per_unit", 0) or 0)
        stock_qty = max(0.0, float(getattr(m, "stock", 0) or 0))
        catalog_plastic += stock_qty * float(getattr(m, "plastic_kg_per_unit", 0) or 0)
        catalog_paper += stock_qty * float(getattr(m, "paper_kg_per_unit", 0) or 0)

    pq = db.query(BdoPackagingPurchase).filter(BdoPackagingPurchase.tenant_id == tenant_id)
    if warehouse_id is not None:
        kinds_ids = {(k, i) for k, i, _ in mats}
        if kinds_ids:
            flt = [(BdoPackagingPurchase.wm_kind == k) & (BdoPackagingPurchase.wm_id == i) for k, i in kinds_ids]
            pq = pq.filter(or_(*flt))
        else:
            pq = pq.filter(BdoPackagingPurchase.id == -1)

    month_total = (
        pq.filter(BdoPackagingPurchase.purchase_date >= first_m, BdoPackagingPurchase.purchase_date <= today)
        .with_entities(func.coalesce(func.sum(BdoPackagingPurchase.total), 0.0))
        .scalar()
        or 0.0
    )
    if month_total == 0:
        month_total = (
            pq.filter(
                BdoPackagingPurchase.purchase_date >= first_m,
                BdoPackagingPurchase.purchase_date <= today,
                BdoPackagingPurchase.unit_cost.isnot(None),
            )
            .with_entities(func.coalesce(func.sum(BdoPackagingPurchase.qty * BdoPackagingPurchase.unit_cost), 0.0))
            .scalar()
            or 0.0
        )

    last_sess = (
        db.query(BdoStockCountSession)
        .filter(BdoStockCountSession.tenant_id == tenant_id)
        .order_by(BdoStockCountSession.count_date.desc(), BdoStockCountSession.id.desc())
        .first()
    )
    last_label = None
    if last_sess and last_sess.period_label:
        last_label = str(last_sess.period_label)
    elif last_sess:
        last_label = last_sess.count_date.strftime("%Y-%m")

    cutoff = today - timedelta(days=90)
    missing = 0
    for kind, wid, _ in mats:
        last_d = (
            db.query(func.max(BdoStockCountSession.count_date))
            .join(BdoStockCountLine, BdoStockCountLine.session_id == BdoStockCountSession.id)
            .filter(
                BdoStockCountSession.tenant_id == tenant_id,
                BdoStockCountLine.wm_kind == kind,
                BdoStockCountLine.wm_id == wid,
            )
            .scalar()
        )
        if last_d is None or last_d < cutoff:
            missing += 1

    return BdoDashboardRead(
        materials_tracked=len(mats),
        estimated_plastic_kg=round(catalog_plastic, 3),
        estimated_paper_kg=round(catalog_paper, 3),
        month_purchases_pln=float(month_total),
        last_report_month_label=last_label,
        missing_stock_counts=missing,
        ledger_plastic_kg=round(ledger_plastic, 3),
        ledger_paper_kg=round(ledger_paper, 3),
    )


@router.get("/dashboard/recent", response_model=list[BdoAuditRead])
def bdo_dashboard_recent(
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(BdoAuditLog)
        .filter(BdoAuditLog.tenant_id == tenant_id)
        .order_by(BdoAuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [BdoAuditRead.model_validate(r) for r in rows]


@router.get("/ledger-preview")
def ledger_preview(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    as_of: date = Query(..., description="Stan księgowy na dzień (włącznie)"),
    db: Session = Depends(get_db),
):
    """Stan szacowany z zakupów + korekt (bez spisu) — klucz = wm_ref."""
    mats = _bdo_tracked_materials(db, tenant_id, warehouse_id)
    return {_wm_ref(k, i): _ledger_upto(db, tenant_id, k, i, as_of) for k, i, _ in mats}


@router.get("/catalog", response_model=list[BdoWmCatalogRow])
def list_catalog(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    include_in_bdo_only: bool = Query(False),
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Materiały z Asortyment → Materiały magazynowe (bez duplikacji katalogu BDO)."""
    q1 = (
        db.query(PackagingMaterial)
        .filter(
            PackagingMaterial.tenant_id == int(tenant_id),
            PackagingMaterial.warehouse_id == int(warehouse_id),
        )
        .order_by(PackagingMaterial.material_type.asc(), PackagingMaterial.name.asc())
    )
    q2 = (
        db.query(Carton)
        .filter(Carton.tenant_id == int(tenant_id), Carton.warehouse_id == int(warehouse_id))
        .order_by(Carton.name.asc())
    )
    if active_only:
        q1 = q1.filter(PackagingMaterial.is_active.is_(True))
        q2 = q2.filter(Carton.is_active.is_(True))
    if include_in_bdo_only:
        q1 = q1.filter(PackagingMaterial.include_in_bdo.is_(True))
        q2 = q2.filter(Carton.include_in_bdo.is_(True))
    rows: list[BdoWmCatalogRow] = [_packaging_to_catalog(r) for r in q1.all()]
    rows.extend(_carton_to_catalog(r) for r in q2.all())
    rows.sort(key=lambda x: (x.kind, x.name.lower()))
    return rows


@router.patch("/catalog/wm-fields", response_model=BdoWmCatalogRow)
def patch_wm_bdo_fields(
    body: BdoWmBdoFieldsPatch,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Wyłącznie pola BDO na istniejącym materiale magazynowym."""
    kind, wid = _parse_wm_ref(body.wm_ref)
    row = _load_wm(db, tenant_id, kind, wid)
    if row is None or int(row.warehouse_id) != int(warehouse_id):
        raise HTTPException(status_code=404, detail="Nie znaleziono materiału w tym magazynie")
    data = body.model_dump(exclude_unset=True, exclude={"wm_ref"})
    for k in (
        "plastic_kg_per_unit",
        "paper_kg_per_unit",
        "wood_kg_per_unit",
        "glass_kg_per_unit",
        "metal_kg_per_unit",
    ):
        if k in data and data[k] is not None:
            setattr(row, k, float(data[k]))
    if "packaging_type" in data:
        row.packaging_type = (str(data["packaging_type"]).strip()[:64] or None) if data["packaging_type"] is not None else None
    if "include_in_bdo" in data and data["include_in_bdo"] is not None:
        row.include_in_bdo = bool(data["include_in_bdo"])
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    _log(db, tenant_id=tenant_id, action="BDO — pola materiału", detail=f"{_wm_ref(kind, wid)}")
    db.commit()
    return _packaging_to_catalog(row) if kind == WM_PACKAGING else _carton_to_catalog(row)  # type: ignore[arg-type]


@router.get("/purchases", response_model=list[BdoPurchaseRead])
def list_purchases(
    tenant_id: int = Query(..., ge=1),
    wm_ref: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(BdoPackagingPurchase).filter(BdoPackagingPurchase.tenant_id == tenant_id).order_by(
        BdoPackagingPurchase.purchase_date.desc(), BdoPackagingPurchase.id.desc()
    )
    if wm_ref:
        k, i = _parse_wm_ref(wm_ref)
        q = q.filter(BdoPackagingPurchase.wm_kind == k, BdoPackagingPurchase.wm_id == i)
    out: list[BdoPurchaseRead] = []
    for p in q.all():
        wm = _load_wm(db, tenant_id, str(p.wm_kind), str(p.wm_id))
        out.append(
            BdoPurchaseRead(
                id=int(p.id),
                tenant_id=int(p.tenant_id),
                wm_ref=_wm_ref(str(p.wm_kind), str(p.wm_id)),
                material_name=_wm_name(wm) if wm else "",
                purchase_date=p.purchase_date,
                supplier_name=str(p.supplier_name or ""),
                qty=float(p.qty),
                unit_cost=float(p.unit_cost) if p.unit_cost is not None else None,
                total=float(p.total) if p.total is not None else None,
                document_no=p.document_no,
                notes=p.notes,
                created_at=p.created_at,
            )
        )
    return out


@router.post("/purchases", response_model=BdoPurchaseRead, status_code=201)
def create_purchase(body: BdoPurchaseCreate, db: Session = Depends(get_db)):
    kind, wid = _parse_wm_ref(body.wm_ref)
    m = _load_wm(db, body.tenant_id, kind, wid)
    if m is None:
        raise HTTPException(status_code=400, detail="Nieprawidłowy materiał (wm_ref)")
    _require_bdo_tracked(m)
    total = body.total
    if total is None and body.unit_cost is not None:
        total = round(float(body.qty) * float(body.unit_cost), 2)
    row = BdoPackagingPurchase(
        tenant_id=body.tenant_id,
        wm_kind=kind,
        wm_id=wid,
        purchase_date=body.purchase_date,
        supplier_name=(body.supplier_name or "").strip()[:512],
        qty=float(body.qty),
        unit_cost=float(body.unit_cost) if body.unit_cost is not None else None,
        total=float(total) if total is not None else None,
        document_no=(body.document_no or "").strip()[:256] or None,
        notes=body.notes,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(db, tenant_id=body.tenant_id, action="Zakup — zapis", detail=f"{_wm_name(m)}: +{body.qty}")
    db.commit()
    return BdoPurchaseRead(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        wm_ref=_wm_ref(str(row.wm_kind), str(row.wm_id)),
        material_name=_wm_name(m),
        purchase_date=row.purchase_date,
        supplier_name=str(row.supplier_name or ""),
        qty=float(row.qty),
        unit_cost=float(row.unit_cost) if row.unit_cost is not None else None,
        total=float(row.total) if row.total is not None else None,
        document_no=row.document_no,
        notes=row.notes,
        created_at=row.created_at,
    )


@router.get("/stock-counts", response_model=list[BdoStockCountRead])
def list_stock_counts(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    sessions = (
        db.query(BdoStockCountSession)
        .filter(BdoStockCountSession.tenant_id == tenant_id)
        .order_by(BdoStockCountSession.count_date.desc(), BdoStockCountSession.id.desc())
        .all()
    )
    out: list[BdoStockCountRead] = []
    for s in sessions:
        lines = db.query(BdoStockCountLine).filter(BdoStockCountLine.session_id == s.id).all()
        lr = []
        for ln in lines:
            wm = _load_wm(db, tenant_id, str(ln.wm_kind), str(ln.wm_id))
            lr.append(
                BdoStockCountLineRead(
                    wm_ref=_wm_ref(str(ln.wm_kind), str(ln.wm_id)),
                    material_name=_wm_name(wm) if wm else "",
                    system_stock=float(ln.system_stock),
                    counted_stock=float(ln.counted_stock),
                    difference=float(ln.difference),
                    notes=ln.notes,
                )
            )
        out.append(
            BdoStockCountRead(
                id=int(s.id),
                tenant_id=int(s.tenant_id),
                count_date=s.count_date,
                period_label=s.period_label,
                notes=s.notes,
                created_by_label=s.created_by_label,
                created_at=s.created_at,
                lines=lr,
            )
        )
    return out


@router.post("/stock-counts", response_model=BdoStockCountRead, status_code=201)
def create_stock_count(body: BdoStockCountCreate, db: Session = Depends(get_db)):
    if not body.lines:
        raise HTTPException(status_code=400, detail="Dodaj co najmniej jedną pozycję spisu")
    sess = BdoStockCountSession(
        tenant_id=body.tenant_id,
        count_date=body.count_date,
        period_label=(body.period_label or body.count_date.strftime("%Y-%m"))[:32],
        notes=body.notes,
        created_by_label=body.created_by_label,
        created_at=datetime.utcnow(),
    )
    db.add(sess)
    db.flush()
    lr_out: list[BdoStockCountLineRead] = []
    for li in body.lines:
        kind, wid = _parse_wm_ref(li.wm_ref)
        mat = _load_wm(db, body.tenant_id, kind, wid)
        if mat is None:
            raise HTTPException(status_code=400, detail=f"Nieznany materiał {li.wm_ref}")
        _require_bdo_tracked(mat)
        sys_stock = _ledger_upto(db, body.tenant_id, kind, wid, body.count_date)
        diff = float(li.counted_stock) - float(sys_stock)
        ln = BdoStockCountLine(
            session_id=int(sess.id),
            wm_kind=kind,
            wm_id=wid,
            system_stock=float(sys_stock),
            counted_stock=float(li.counted_stock),
            difference=float(diff),
            notes=li.notes,
        )
        db.add(ln)
        lr_out.append(
            BdoStockCountLineRead(
                wm_ref=_wm_ref(kind, wid),
                material_name=_wm_name(mat),
                system_stock=float(sys_stock),
                counted_stock=float(li.counted_stock),
                difference=float(diff),
                notes=li.notes,
            )
        )
    _log(db, tenant_id=body.tenant_id, action="Spis z natury — zapis", detail=f"Data {body.count_date}, pozycji: {len(body.lines)}")
    db.commit()
    db.refresh(sess)
    return BdoStockCountRead(
        id=int(sess.id),
        tenant_id=int(sess.tenant_id),
        count_date=sess.count_date,
        period_label=sess.period_label,
        notes=sess.notes,
        created_by_label=sess.created_by_label,
        created_at=sess.created_at,
        lines=lr_out,
    )


@router.get("/corrections", response_model=list[BdoCorrectionRead])
def list_corrections(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    q = (
        db.query(BdoCorrection)
        .filter(BdoCorrection.tenant_id == tenant_id)
        .order_by(BdoCorrection.correction_date.desc(), BdoCorrection.id.desc())
    )
    out: list[BdoCorrectionRead] = []
    for c in q.all():
        wm = _load_wm(db, tenant_id, str(c.wm_kind), str(c.wm_id))
        out.append(
            BdoCorrectionRead(
                id=int(c.id),
                tenant_id=int(c.tenant_id),
                wm_ref=_wm_ref(str(c.wm_kind), str(c.wm_id)),
                material_name=_wm_name(wm) if wm else "",
                correction_date=c.correction_date,
                qty=float(c.qty),
                reason=str(c.reason),
                notes=c.notes,
                created_at=c.created_at,
            )
        )
    return out


@router.post("/corrections", response_model=BdoCorrectionRead, status_code=201)
def create_correction(body: BdoCorrectionCreate, db: Session = Depends(get_db)):
    kind, wid = _parse_wm_ref(body.wm_ref)
    m = _load_wm(db, body.tenant_id, kind, wid)
    if m is None:
        raise HTTPException(status_code=400, detail="Nieprawidłowy materiał")
    _require_bdo_tracked(m)
    row = BdoCorrection(
        tenant_id=body.tenant_id,
        wm_kind=kind,
        wm_id=wid,
        correction_date=body.correction_date,
        qty=float(body.qty),
        reason=str(body.reason),
        notes=body.notes,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(db, tenant_id=body.tenant_id, action="Korekta", detail=f"{_wm_name(m)}: {body.qty} ({body.reason})")
    return BdoCorrectionRead(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        wm_ref=_wm_ref(str(row.wm_kind), str(row.wm_id)),
        material_name=_wm_name(m),
        correction_date=row.correction_date,
        qty=float(row.qty),
        reason=str(row.reason),
        notes=row.notes,
        created_at=row.created_at,
    )


@router.get("/settings", response_model=BdoSettingsRead)
def get_settings(tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    row = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    if row is None:
        row = BdoSettings(tenant_id=tenant_id, allow_negative_stock=False, updated_at=datetime.utcnow())
        db.add(row)
        db.commit()
        db.refresh(row)
    return BdoSettingsRead.model_validate(row)


@router.put("/settings", response_model=BdoSettingsRead)
def put_settings(body: BdoSettingsUpdate, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    row = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    if row is None:
        row = BdoSettings(tenant_id=tenant_id, allow_negative_stock=False)
        db.add(row)
        db.flush()
    data = body.model_dump(exclude_unset=True)
    if "reporting_company_name" in data:
        row.reporting_company_name = data["reporting_company_name"]
    if "registration_numbers" in data:
        row.registration_numbers = data["registration_numbers"]
    if "default_methodology_text" in data:
        row.default_methodology_text = data["default_methodology_text"]
    if "allow_negative_stock" in data and data["allow_negative_stock"] is not None:
        row.allow_negative_stock = bool(data["allow_negative_stock"])
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    _log(db, tenant_id=tenant_id, action="Ustawienia BDO — zapis", detail=None)
    return BdoSettingsRead.model_validate(row)


def _wm_row_warehouse_id(db: Session, tenant_id: int, kind: str, wm_id: str) -> Optional[int]:
    row = _load_wm(db, tenant_id, kind, wm_id)
    if row is None:
        return None
    return int(getattr(row, "warehouse_id", 0) or 0)


@router.get("/movements", response_model=list[BdoMovementRead])
def list_bdo_movements(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    movement_type: Optional[str] = Query(None, description="purchase | correction | stock_count"),
    limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    """Jedna lista: zakupy BDO, korekty, spisy — do zakładki Historia ruchów."""
    rows: list[BdoMovementRead] = []
    mt = (movement_type or "").strip().lower()
    if mt not in ("purchase", "zakup", "correction", "korekta", "stock_count", "spis"):
        mt = ""

    if mt in ("", "purchase", "zakup"):
        for p in (
            db.query(BdoPackagingPurchase)
            .filter(BdoPackagingPurchase.tenant_id == tenant_id)
            .order_by(BdoPackagingPurchase.created_at.desc())
            .limit(limit)
            .all()
        ):
            if warehouse_id is not None and _wm_row_warehouse_id(db, tenant_id, str(p.wm_kind), str(p.wm_id)) != int(
                warehouse_id
            ):
                continue
            d_cmp = p.purchase_date
            if date_from is not None and d_cmp < date_from:
                continue
            if date_to is not None and d_cmp > date_to:
                continue
            wm = _load_wm(db, tenant_id, str(p.wm_kind), str(p.wm_id))
            occ = p.created_at if getattr(p, "created_at", None) else datetime.combine(p.purchase_date, time(12, 0))
            amt = float(p.total) if p.total is not None else None
            if amt is None and p.unit_cost is not None:
                amt = float(p.qty) * float(p.unit_cost)
            rows.append(
                BdoMovementRead(
                    id=f"purchase-{p.id}",
                    occurred_at=occ,
                    movement_type="purchase",
                    wm_ref=_wm_ref(str(p.wm_kind), str(p.wm_id)),
                    material_name=_wm_name(wm) if wm else "",
                    qty=float(p.qty),
                    amount_pln=amt,
                    reference=(p.document_no or "")[:256] or None,
                    notes=p.notes,
                )
            )

    if mt in ("", "correction", "korekta"):
        for c in (
            db.query(BdoCorrection)
            .filter(BdoCorrection.tenant_id == tenant_id)
            .order_by(BdoCorrection.created_at.desc())
            .limit(limit)
            .all()
        ):
            if warehouse_id is not None and _wm_row_warehouse_id(db, tenant_id, str(c.wm_kind), str(c.wm_id)) != int(
                warehouse_id
            ):
                continue
            d_cmp = c.correction_date
            if date_from is not None and d_cmp < date_from:
                continue
            if date_to is not None and d_cmp > date_to:
                continue
            wm = _load_wm(db, tenant_id, str(c.wm_kind), str(c.wm_id))
            rows.append(
                BdoMovementRead(
                    id=f"correction-{c.id}",
                    occurred_at=c.created_at,
                    movement_type="correction",
                    wm_ref=_wm_ref(str(c.wm_kind), str(c.wm_id)),
                    material_name=_wm_name(wm) if wm else "",
                    qty=float(c.qty),
                    amount_pln=None,
                    reference=str(c.reason),
                    notes=c.notes,
                )
            )

    if mt in ("", "stock_count", "spis"):
        for s in (
            db.query(BdoStockCountSession)
            .filter(BdoStockCountSession.tenant_id == tenant_id)
            .order_by(BdoStockCountSession.created_at.desc())
            .limit(limit)
            .all()
        ):
            d_cmp = s.count_date
            if date_from is not None and d_cmp < date_from:
                continue
            if date_to is not None and d_cmp > date_to:
                continue
            nlines = (
                db.query(func.count(BdoStockCountLine.id))
                .filter(BdoStockCountLine.session_id == s.id)
                .scalar()
                or 0
            )
            if warehouse_id is not None:
                lids = (
                    db.query(BdoStockCountLine.wm_kind, BdoStockCountLine.wm_id)
                    .filter(BdoStockCountLine.session_id == s.id)
                    .all()
                )
                if lids and not any(
                    _wm_row_warehouse_id(db, tenant_id, str(k), str(i)) == int(warehouse_id) for k, i in lids
                ):
                    continue
            rows.append(
                BdoMovementRead(
                    id=f"stockcount-{s.id}",
                    occurred_at=s.created_at,
                    movement_type="stock_count",
                    wm_ref=None,
                    material_name="Spis z natury",
                    qty=None,
                    amount_pln=None,
                    reference=s.period_label,
                    notes=(s.notes or "").strip()
                    or (f"{int(nlines)} pozycji materiałów" if nlines else "Spis zamknięty"),
                )
            )

    rows.sort(key=lambda r: r.occurred_at, reverse=True)
    return rows[:limit]


def _monthly_report(
    db: Session, tenant_id: int, year: int, month: int, warehouse_id: Optional[int] = None
) -> BdoMonthlyReportRead:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Nieprawidłowy miesiąc")
    first = date(year, month, 1)
    last = _last_day(year, month)
    settings = db.query(BdoSettings).filter(BdoSettings.tenant_id == tenant_id).first()
    methodology = settings.default_methodology_text if settings else None

    mats = _bdo_tracked_materials(db, tenant_id, warehouse_id)
    rows: list[BdoMonthlyReportRow] = []
    tp = tw = tg = tm = tpaper = 0.0
    for kind, wid, m in mats:
        beg_c = _counted_before(db, tenant_id, kind, wid, first)
        if beg_c is None:
            beg = _ledger_upto(db, tenant_id, kind, wid, first - timedelta(days=1))
        else:
            beg = float(beg_c)
        pur = _purchases_in_range(db, tenant_id, kind, wid, first, last)
        cor = _corrections_in_range(db, tenant_id, kind, wid, first, last)
        end_c = _counted_upto(db, tenant_id, kind, wid, last)
        if end_c is None:
            used = None
            end = None
        else:
            end = float(end_c)
            raw_used = float(beg + pur + cor - end)
            used = max(0.0, raw_used)
        u = float(used) if used is not None else 0.0
        plastic = u * float(getattr(m, "plastic_kg_per_unit", 0) or 0)
        paper = u * float(getattr(m, "paper_kg_per_unit", 0) or 0)
        wood = u * float(getattr(m, "wood_kg_per_unit", 0) or 0)
        glass = u * float(getattr(m, "glass_kg_per_unit", 0) or 0)
        metal = u * float(getattr(m, "metal_kg_per_unit", 0) or 0)
        if used is not None:
            tp += plastic
            tpaper += paper
            tw += wood
            tg += glass
            tm += metal
        rows.append(
            BdoMonthlyReportRow(
                wm_ref=_wm_ref(kind, wid),
                material_name=_wm_name(m),
                sku=_wm_sku(m),
                beginning_qty=float(beg),
                purchased_qty=float(pur),
                corrections_qty=float(cor),
                ending_qty=end,
                used_qty=used,
                plastic_kg=round(plastic, 4),
                paper_kg=round(paper, 4),
                wood_kg=round(wood, 4),
                glass_kg=round(glass, 4),
                metal_kg=round(metal, 4),
            )
        )
    return BdoMonthlyReportRead(
        year=year,
        month=month,
        methodology_note=methodology,
        totals_plastic_kg=round(tp, 3),
        totals_paper_kg=round(tpaper, 3),
        totals_wood_kg=round(tw, 3),
        totals_glass_kg=round(tg, 3),
        totals_metal_kg=round(tm, 3),
        rows=rows,
    )


@router.get("/reports/monthly", response_model=BdoMonthlyReportRead)
def monthly_report_json(
    tenant_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    return _monthly_report(db, tenant_id, year, month, warehouse_id)


@router.get("/reports/monthly.csv")
def monthly_report_csv(
    tenant_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    rep = _monthly_report(db, tenant_id, year, month, warehouse_id)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(
        [
            "Materiał",
            "SKU",
            "Stan początkowy",
            "Zakupy w okresie",
            "Korekty w okresie",
            "Stan końcowy (spis)",
            "Zużycie szac.",
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
                r.beginning_qty,
                r.purchased_qty,
                r.corrections_qty,
                "" if r.ending_qty is None else r.ending_qty,
                "" if r.used_qty is None else r.used_qty,
                r.plastic_kg,
                r.paper_kg,
                r.wood_kg,
                r.glass_kg,
                r.metal_kg,
            ]
        )
    data = buf.getvalue().encode("utf-8-sig")
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="bdo_raport_{year}_{month:02d}.csv"'},
    )


@router.get("/reports/monthly.xlsx")
def monthly_report_xlsx(
    tenant_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Eksport XLSX wymaga pakietu openpyxl (pip install openpyxl).",
        )
    rep = _monthly_report(db, tenant_id, year, month, warehouse_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Raport"
    headers = [
        "Materiał",
        "SKU",
        "Stan początkowy",
        "Zakupy",
        "Korekty",
        "Stan końcowy",
        "Zużycie",
        "Tworzywo kg",
        "Papier kg",
        "Drewno kg",
        "Szkło kg",
        "Metal kg",
    ]
    ws.append(headers)
    for r in rep.rows:
        ws.append(
            [
                r.material_name,
                r.sku or "",
                r.beginning_qty,
                r.purchased_qty,
                r.corrections_qty,
                r.ending_qty if r.ending_qty is not None else "",
                r.used_qty if r.used_qty is not None else "",
                r.plastic_kg,
                r.paper_kg,
                r.wood_kg,
                r.glass_kg,
                r.metal_kg,
            ]
        )
    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)
    return Response(
        content=bio.read(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="bdo_raport_{year}_{month:02d}.xlsx"'},
    )
