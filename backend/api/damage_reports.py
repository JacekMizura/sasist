import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.damage_report import DamageEntry, DamageReport, DamageReportItem, DamageReportImage
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..models.warehouse import Bin, Warehouse
from ..schemas.damage_report import (
    DamageEntryCreate,
    DamageEntryRead,
    DamageEntryReview,
    DamageReportCreate,
    DamageReportItemRead,
    DamageReportRead,
)

router = APIRouter(tags=["Damage"])


def _normalize_storage_type(v: object) -> str:
    return str(v or "").strip().lower()


def _normalize_uuid(v: object) -> str:
    s = str(v or "").strip()
    if not s or s.lower() == "null":
        return ""
    return s


def _entry_photo_urls(entry: DamageEntry) -> List[str]:
    raw = getattr(entry, "photo_urls", None)
    if raw is not None and not isinstance(raw, list):
        if isinstance(raw, str) and raw.strip().startswith("["):
            try:
                parsed = json.loads(raw)
                raw = parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                raw = None
    if isinstance(raw, list):
        out = [str(u).strip() for u in raw if str(u).strip()]
        if out:
            return out
    u = str(entry.photo_url or "").strip()
    return [u] if u else []


def _normalize_create_photo_urls(body: DamageEntryCreate) -> List[str]:
    raw = [str(u).strip() for u in (body.photo_urls or []) if str(u).strip()]
    for u in raw:
        if not u.startswith("/uploads/"):
            raise HTTPException(
                status_code=400,
                detail="Each photo_urls entry must be a server path starting with /uploads/",
            )
    return raw

def _next_report_number(db: Session, *, year: int, month: int) -> str:
    prefix = f"PS/{year}/{month:02d}/"
    rows = (
        db.query(DamageReport.report_number)
        .filter(DamageReport.report_number.like(f"{prefix}%"))
        .all()
    )
    max_seq = 0
    for (num,) in rows:
        tail = str(num or "").split("/")[-1]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1:03d}"


def _build_item_read(item: DamageReportItem) -> DamageReportItemRead:
    return DamageReportItemRead(
        id=item.id,
        product_id=item.product_id,
        product_name=item.product_name,
        sku=item.sku,
        location_uuid=item.location_uuid,
        location_label=item.location_label,
        quantity=float(item.quantity),
        purchase_price=float(item.purchase_price),
        total_value=float(item.total_value),
        damage_type=item.damage_type,  # type: ignore[arg-type]
        description=item.description,
        decision=item.decision,  # type: ignore[arg-type]
        image_urls=[img.image_url for img in item.images],
    )


def _build_report_read(report: DamageReport) -> DamageReportRead:
    wh_name = getattr(report.warehouse, "name", None)
    return DamageReportRead(
        id=report.id,
        tenant_id=report.tenant_id,
        warehouse_id=report.warehouse_id,
        warehouse_name=wh_name,
        report_number=report.report_number,
        created_at=report.created_at,
        created_by=report.created_by,
        status=report.status,  # type: ignore[arg-type]
        total_value=float(report.total_value),
        items=[_build_item_read(it) for it in report.items],
    )


def _build_entry_read(entry: DamageEntry) -> DamageEntryRead:
    purls = _entry_photo_urls(entry)
    primary = purls[0] if purls else str(entry.photo_url or "")
    return DamageEntryRead(
        id=entry.id,
        tenant_id=entry.tenant_id,
        warehouse_id=entry.warehouse_id,
        product_id=entry.product_id,
        product_name=entry.product_name,
        sku=entry.sku,
        location_uuid=entry.location_uuid,
        location_label=entry.location_label,
        quantity=float(entry.quantity),
        photo_url=primary,
        photo_urls=purls,
        created_at=entry.created_at,
        created_by=entry.created_by,
        status=entry.status,  # type: ignore[arg-type]
        damage_type=entry.damage_type,  # type: ignore[arg-type]
        description=entry.description,
        decision=entry.decision,  # type: ignore[arg-type]
        reviewed_by=entry.reviewed_by,
        reviewed_at=entry.reviewed_at,
        purchase_price=float(entry.purchase_price or 0),
        total_value=float(entry.total_value or 0),
    )


@router.post("/damage-entries/", response_model=DamageEntryRead, status_code=201)
def create_damage_entry(body: DamageEntryCreate, db: Session = Depends(get_db)):
    # WMS / returns: evidence required. location_uuid optional — not inventory movement; no bin/stock checks.
    photo_urls = _normalize_create_photo_urls(body)
    if not photo_urls:
        raise HTTPException(status_code=400, detail="At least one photo is required (photo_urls)")

    product = db.query(Product).filter(Product.id == body.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {body.product_id} not found")
    wh = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    loc_uuid = _normalize_uuid(body.location_uuid)
    location_label = None
    if loc_uuid:
        bin_row = (
            db.query(Bin)
            .filter(Bin.location_uuid == loc_uuid, Bin.is_active == True)  # noqa: E712
            .first()
        )
        loc = db.query(Location).filter(Location.location_uuid == loc_uuid).first()
        if loc and getattr(loc, "name", None):
            location_label = str(loc.name).strip() or None
        if bin_row and getattr(bin_row, "label", None):
            location_label = location_label or str(bin_row.label).strip() or None
    purchase_price = float(product.purchase_price or 0)
    total_value = float(body.quantity) * purchase_price
    entry = DamageEntry(
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        product_id=product.id,
        product_name=str(product.name or "").strip() or "Nieznany produkt",
        sku=(str(product.sku).strip() if product.sku is not None else None),
        location_uuid=loc_uuid,
        location_label=location_label,
        quantity=float(body.quantity),
        photo_url=photo_urls[0],
        photo_urls=photo_urls,
        created_by=body.created_by,
        status="NEW",
        purchase_price=purchase_price,
        total_value=total_value,
        damage_type=body.damage_type or "other",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _build_entry_read(entry)


@router.get("/damage-entries/", response_model=List[DamageEntryRead])
def list_damage_entries(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(None),
    statuses: Optional[str] = Query(None, description="Comma list, e.g. NEW,REVIEWED"),
    db: Session = Depends(get_db),
):
    q = db.query(DamageEntry).filter(DamageEntry.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(DamageEntry.warehouse_id == warehouse_id)
    if statuses:
        accepted = [s.strip().upper() for s in statuses.split(",") if s.strip()]
        if accepted:
            q = q.filter(DamageEntry.status.in_(accepted))
    rows = q.order_by(DamageEntry.created_at.desc()).all()
    return [_build_entry_read(r) for r in rows]


@router.post("/damage-entries/{entry_id}/review", response_model=DamageEntryRead)
def review_damage_entry(
    entry_id: int,
    body: DamageEntryReview,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    row = db.query(DamageEntry).filter(DamageEntry.id == entry_id, DamageEntry.tenant_id == tenant_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Damage entry not found")
    if row.status == "INCLUDED_IN_REPORT":
        raise HTTPException(status_code=400, detail="Entry already included in report")
    row.damage_type = body.damage_type
    row.description = body.description
    row.decision = body.decision
    row.reviewed_by = body.reviewed_by
    row.reviewed_at = datetime.utcnow().isoformat()
    row.status = "REVIEWED"
    db.commit()
    db.refresh(row)
    return _build_entry_read(row)


@router.post("/damage-reports/", response_model=DamageReportRead, status_code=201)
def create_damage_report(body: DamageReportCreate, db: Session = Depends(get_db)):
    if not body.items and not body.entry_ids:
        raise HTTPException(status_code=400, detail="Report must contain at least one item or reviewed entry")

    wh = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    now = datetime.utcnow()
    report = DamageReport(
        tenant_id=body.tenant_id,
        warehouse_id=body.warehouse_id,
        report_number=_next_report_number(db, year=now.year, month=now.month),
        created_by=body.created_by,
        status="draft",
        total_value=0,
    )
    db.add(report)
    db.flush()

    total = 0.0

    # New flow: report from reviewed office entries only.
    if body.entry_ids:
        entries = (
            db.query(DamageEntry)
            .filter(
                DamageEntry.tenant_id == body.tenant_id,
                DamageEntry.warehouse_id == body.warehouse_id,
                DamageEntry.id.in_(body.entry_ids),
            )
            .all()
        )
        if len(entries) != len(set(body.entry_ids)):
            raise HTTPException(status_code=400, detail="Some entry_ids are invalid")
        for ent in entries:
            if ent.status != "REVIEWED":
                raise HTTPException(status_code=400, detail=f"Entry {ent.id} is not REVIEWED")
            item_total = float(ent.total_value or 0)
            total += item_total
            item = DamageReportItem(
                report_id=report.id,
                damage_entry_id=ent.id,
                product_id=ent.product_id,
                product_name=ent.product_name,
                sku=ent.sku,
                location_uuid=ent.location_uuid,
                location_label=ent.location_label,
                quantity=float(ent.quantity),
                purchase_price=float(ent.purchase_price or 0),
                total_value=item_total,
                damage_type=(ent.damage_type or "other"),
                description=ent.description,
                decision=ent.decision,
            )
            db.add(item)
            db.flush()
            for img_url in _entry_photo_urls(ent):
                if str(img_url).strip():
                    db.add(DamageReportImage(report_item_id=item.id, image_url=str(img_url).strip()))
            ent.status = "INCLUDED_IN_REPORT"

        report.total_value = total
        db.commit()
        db.refresh(report)
        return _build_report_read(report)

    # Legacy/manual flow (kept for compatibility)
    for it in body.items:
        if it.quantity <= 0:
            raise HTTPException(status_code=400, detail="Item quantity must be > 0")

        product = db.query(Product).filter(Product.id == it.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {it.product_id} not found")

        loc_uuid = _normalize_uuid(it.location_uuid)
        if not loc_uuid:
            raise HTTPException(status_code=400, detail="location_uuid is required")

        bin_row = (
            db.query(Bin)
            .filter(
                Bin.location_uuid == loc_uuid,
                Bin.is_active == True,  # noqa: E712
            )
            .first()
        )
        if not bin_row or _normalize_storage_type(bin_row.storage_type) != "damaged":
            raise HTTPException(
                status_code=400,
                detail=f"Product must come from damaged location (location_uuid={loc_uuid})",
            )

        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == body.tenant_id,
                Inventory.warehouse_id == body.warehouse_id,
                Inventory.product_id == it.product_id,
                Inventory.location_uuid == loc_uuid,
            )
            .first()
        )
        if not inv or float(inv.quantity or 0) < float(it.quantity):
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient inventory on damaged location for product {it.product_id}",
            )

        loc = db.query(Location).filter(Location.location_uuid == loc_uuid).first()
        location_label = (loc.name if loc else None) or bin_row.label
        purchase_price = float(product.purchase_price or 0)
        item_total = float(it.quantity) * purchase_price
        total += item_total

        item = DamageReportItem(
            report_id=report.id,
            product_id=product.id,
            product_name=str(product.name or "").strip() or "Nieznany produkt",
            sku=(str(product.sku).strip() if product.sku is not None else None),
            location_uuid=loc_uuid,
            location_label=location_label,
            quantity=float(it.quantity),
            purchase_price=purchase_price,
            total_value=item_total,
            damage_type=it.damage_type,
            description=it.description,
            decision=None,
        )
        db.add(item)
        db.flush()
        for url in it.image_urls:
            if str(url).strip():
                db.add(DamageReportImage(report_item_id=item.id, image_url=str(url).strip()))

    report.total_value = total
    db.commit()
    db.refresh(report)
    return _build_report_read(report)


@router.get("/damage-reports/", response_model=List[DamageReportRead])
def list_damage_reports(
    tenant_id: int = Query(...),
    warehouse_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(DamageReport).filter(DamageReport.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(DamageReport.warehouse_id == warehouse_id)
    rows = q.order_by(DamageReport.created_at.desc()).all()
    return [_build_report_read(r) for r in rows]


@router.get("/damage-reports/{report_id}", response_model=DamageReportRead)
def get_damage_report(report_id: int, tenant_id: int = Query(...), db: Session = Depends(get_db)):
    row = (
        db.query(DamageReport)
        .filter(DamageReport.id == report_id, DamageReport.tenant_id == tenant_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Damage report not found")
    return _build_report_read(row)


@router.post("/damage-reports/{report_id}/confirm", response_model=DamageReportRead)
def confirm_damage_report(report_id: int, tenant_id: int = Query(...), db: Session = Depends(get_db)):
    row = (
        db.query(DamageReport)
        .filter(DamageReport.id == report_id, DamageReport.tenant_id == tenant_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Damage report not found")
    if row.status == "confirmed":
        return _build_report_read(row)
    row.status = "confirmed"
    db.commit()
    db.refresh(row)
    return _build_report_read(row)
