"""CRUD for manufacturers (producers), tenant-scoped."""

from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.inventory import Inventory
from ..models.manufacturer import Manufacturer
from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from ..schemas.manufacturer import (
    ManufacturerCreateBody,
    ManufacturerDetailRead,
    ManufacturerProductBrief,
    ManufacturerRead,
    ManufacturerSupplierBrief,
    ManufacturerUpdateBody,
)

router = APIRouter(prefix="/manufacturers", tags=["Manufacturers"])


def _strip_opt(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def _supplier_counts_for_manufacturer_ids(db: Session, tenant_id: int, ids: List[int]) -> Dict[int, int]:
    if not ids:
        return {}
    rows = (
        db.query(Product.manufacturer_id, func.count(func.distinct(Supplier.id)))
        .join(SupplierProduct, SupplierProduct.product_id == Product.id)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.manufacturer_id.in_(ids),
        )
        .group_by(Product.manufacturer_id)
        .all()
    )
    return {int(mid): int(c or 0) for mid, c in rows if mid is not None}


def _serialize_row(
    m: Manufacturer,
    product_count: int,
    *,
    total_inventory_quantity: float = 0.0,
    out_of_stock_product_count: int = 0,
    supplier_count: int = 0,
) -> ManufacturerRead:
    return ManufacturerRead(
        id=m.id,
        tenant_id=m.tenant_id,
        name=m.name,
        company_name=_strip_opt(getattr(m, "company_name", None)),
        tax_id=_strip_opt(getattr(m, "tax_id", None)),
        logo_url=_strip_opt(getattr(m, "logo_url", None)),
        country=_strip_opt(getattr(m, "country", None)),
        city=_strip_opt(getattr(m, "city", None)),
        postal_code=_strip_opt(getattr(m, "postal_code", None)),
        street=_strip_opt(getattr(m, "street", None)),
        website=_strip_opt(getattr(m, "website", None)),
        email=_strip_opt(getattr(m, "email", None)),
        phone=_strip_opt(getattr(m, "phone", None)),
        active=bool(m.active),
        responsible_person_name=_strip_opt(getattr(m, "responsible_person_name", None)),
        responsible_person_email=_strip_opt(getattr(m, "responsible_person_email", None)),
        product_count=int(product_count),
        supplier_count=int(supplier_count),
        total_inventory_quantity=float(total_inventory_quantity),
        out_of_stock_product_count=int(out_of_stock_product_count),
    )


def _product_counts_for_manufacturer_ids(db: Session, tenant_id: int, ids: List[int]) -> Dict[int, int]:
    if not ids:
        return {}
    rows = (
        db.query(Product.manufacturer_id, func.count(Product.id))
        .filter(
            Product.tenant_id == tenant_id,
            Product.manufacturer_id.in_(ids),
        )
        .group_by(Product.manufacturer_id)
        .all()
    )
    return {int(mid): int(c or 0) for mid, c in rows if mid is not None}


def _inventory_stats_by_manufacturer_ids(
    db: Session, tenant_id: int, mids: List[int]
) -> Dict[int, Tuple[float, int]]:
    """Per manufacturer: (sum of inventory qty for assigned products, count of products with no stock)."""
    if not mids:
        return {}
    prow = (
        db.query(Product.manufacturer_id, Product.id)
        .filter(
            Product.tenant_id == tenant_id,
            Product.manufacturer_id.in_(mids),
        )
        .all()
    )
    mid_to_pids: Dict[int, List[int]] = {int(m): [] for m in mids}
    all_pids: List[int] = []
    for mid, pid in prow:
        if mid is None:
            continue
        im = int(mid)
        ip = int(pid)
        if im not in mid_to_pids:
            mid_to_pids[im] = []
        mid_to_pids[im].append(ip)
        all_pids.append(ip)
    if not all_pids:
        return {int(m): (0.0, 0) for m in mids}
    inv_rows = (
        db.query(Inventory.product_id, func.sum(Inventory.quantity))
        .filter(Inventory.tenant_id == tenant_id, Inventory.product_id.in_(all_pids))
        .group_by(Inventory.product_id)
        .all()
    )
    qty_by_pid = {int(pid): float(s or 0) for pid, s in inv_rows}
    out: Dict[int, Tuple[float, int]] = {}
    for mid in mids:
        pids = mid_to_pids.get(int(mid), [])
        tot = sum(qty_by_pid.get(p, 0.0) for p in pids)
        oos = sum(1 for p in pids if qty_by_pid.get(p, 0.0) <= 0)
        out[int(mid)] = (float(tot), int(oos))
    return out


@router.get("/", response_model=List[ManufacturerRead])
def list_manufacturers(
    tenant_id: int = Query(..., ge=1),
    name: Optional[str] = Query(None, description="Partial match on name"),
    country: Optional[str] = Query(None, description="Partial match on country"),
    tax_id: Optional[str] = Query(None, description="Partial match on NIP / tax id"),
    city: Optional[str] = Query(None, description="Partial match on city"),
    email: Optional[str] = Query(None, description="Partial match on email"),
    phone: Optional[str] = Query(None, description="Partial match on phone"),
    supplier: Optional[str] = Query(None, description="Partial match on linked supplier name"),
    status: str = Query("all", description="all | active | inactive"),
    sort_by: str = Query("name", description="name | product_count"),
    sort_dir: str = Query("asc", description="asc | desc"),
    db: Session = Depends(get_db),
):
    """
    List manufacturers. ``product_count`` counts products (``Product.manufacturer_id``) only.
    Inventory aggregates are returned separately as ``total_inventory_quantity`` and ``out_of_stock_product_count``.
    """
    q = db.query(Manufacturer).filter(Manufacturer.tenant_id == tenant_id)
    st = (status or "all").strip().lower()
    if st == "active":
        q = q.filter(Manufacturer.active.is_(True))
    elif st == "inactive":
        q = q.filter(Manufacturer.active.is_(False))
    if name and name.strip():
        term = f"%{name.strip()}%"
        q = q.filter(
            or_(
                Manufacturer.name.ilike(term),
                Manufacturer.company_name.ilike(term),
                Manufacturer.tax_id.ilike(term),
            )
        )
    if country and country.strip():
        q = q.filter(Manufacturer.country.ilike(f"%{country.strip()}%"))
    if tax_id and tax_id.strip():
        q = q.filter(Manufacturer.tax_id.ilike(f"%{tax_id.strip()}%"))
    if city and city.strip():
        q = q.filter(Manufacturer.city.ilike(f"%{city.strip()}%"))
    if email and email.strip():
        q = q.filter(Manufacturer.email.ilike(f"%{email.strip()}%"))
    if phone and phone.strip():
        q = q.filter(Manufacturer.phone.ilike(f"%{phone.strip()}%"))
    if supplier and supplier.strip():
        term = f"%{supplier.strip()}%"
        linked_mids = (
            db.query(Product.manufacturer_id)
            .join(SupplierProduct, SupplierProduct.product_id == Product.id)
            .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
            .filter(
                Product.tenant_id == tenant_id,
                Product.manufacturer_id.isnot(None),
                Supplier.name.ilike(term),
            )
            .distinct()
            .subquery()
        )
        q = q.filter(Manufacturer.id.in_(linked_mids))
    rows = q.all()
    mids = [m.id for m in rows]
    counts = _product_counts_for_manufacturer_ids(db, tenant_id, mids)
    inv_stats = _inventory_stats_by_manufacturer_ids(db, tenant_id, mids)
    supplier_counts = _supplier_counts_for_manufacturer_ids(db, tenant_id, mids)
    out = [
        _serialize_row(
            m,
            counts.get(m.id, 0),
            total_inventory_quantity=inv_stats.get(m.id, (0.0, 0))[0],
            out_of_stock_product_count=inv_stats.get(m.id, (0.0, 0))[1],
            supplier_count=supplier_counts.get(m.id, 0),
        )
        for m in rows
    ]
    sb = (sort_by or "name").strip().lower()
    rev = (sort_dir or "asc").strip().lower() == "desc"
    if sb == "product_count":
        out.sort(key=lambda r: r.product_count, reverse=rev)
    else:
        out.sort(key=lambda r: (r.name or "").lower(), reverse=rev)
    return out


@router.get("/{manufacturer_id}/suppliers", response_model=List[ManufacturerSupplierBrief])
def list_manufacturer_suppliers(
    manufacturer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Distinct suppliers that offer at least one product of this manufacturer (via supplier_products)."""
    m = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == manufacturer_id, Manufacturer.tenant_id == tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Manufacturer not found")

    rows = (
        db.query(Supplier.id, Supplier.name, Supplier.active, func.count(SupplierProduct.id))
        .join(SupplierProduct, SupplierProduct.supplier_id == Supplier.id)
        .join(Product, Product.id == SupplierProduct.product_id)
        .filter(
            Product.manufacturer_id == manufacturer_id,
            Product.tenant_id == tenant_id,
            Supplier.tenant_id == tenant_id,
        )
        .group_by(Supplier.id, Supplier.name, Supplier.active)
        .order_by(Supplier.name.asc())
        .all()
    )
    return [
        ManufacturerSupplierBrief(
            supplier_id=int(sid),
            name=(sname or "").strip() or f"#{sid}",
            active=bool(sactive),
            linked_product_count=int(cnt or 0),
        )
        for sid, sname, sactive, cnt in rows
    ]


@router.get("/{manufacturer_id}", response_model=ManufacturerDetailRead)
def get_manufacturer(
    manufacturer_id: int,
    tenant_id: int = Query(..., ge=1),
    products_limit: int = Query(500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    m = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == manufacturer_id, Manufacturer.tenant_id == tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    cnt = (
        db.query(func.count(Product.id))
        .filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id)
        .scalar()
    )
    all_pids = [
        int(r[0])
        for r in db.query(Product.id)
        .filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id)
        .all()
    ]
    total_inv = 0.0
    oos_count = 0
    if all_pids:
        inv_rows = (
            db.query(Inventory.product_id, func.sum(Inventory.quantity))
            .filter(Inventory.tenant_id == tenant_id, Inventory.product_id.in_(all_pids))
            .group_by(Inventory.product_id)
            .all()
        )
        qty_by_pid = {int(pid): float(s or 0) for pid, s in inv_rows}
        total_inv = float(sum(qty_by_pid.values()))
        oos_count = sum(1 for pid in all_pids if qty_by_pid.get(pid, 0) <= 0)
    base = _serialize_row(
        m,
        int(cnt or 0),
        total_inventory_quantity=total_inv,
        out_of_stock_product_count=oos_count,
    )
    prows = (
        db.query(Product)
        .filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id)
        .order_by(Product.name)
        .limit(products_limit)
        .all()
    )
    products = [
        ManufacturerProductBrief(
            id=p.id,
            name=p.name,
            symbol=p.symbol,
            ean=p.ean,
        )
        for p in prows
    ]
    return ManufacturerDetailRead(
        **base.model_dump(),
        products=products,
    )


@router.post("/", response_model=ManufacturerRead, status_code=201)
def create_manufacturer(body: ManufacturerCreateBody, db: Session = Depends(get_db)):
    m = Manufacturer(
        tenant_id=body.tenant_id,
        name=body.name.strip(),
        company_name=_strip_opt(body.company_name),
        tax_id=_strip_opt(body.tax_id),
        logo_url=_strip_opt(body.logo_url),
        country=_strip_opt(body.country),
        city=_strip_opt(body.city),
        postal_code=_strip_opt(body.postal_code),
        street=_strip_opt(body.street),
        website=_strip_opt(body.website),
        email=_strip_opt(body.email),
        phone=_strip_opt(body.phone),
        active=bool(body.active),
        responsible_person_name=_strip_opt(body.responsible_person_name),
        responsible_person_email=_strip_opt(body.responsible_person_email),
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _serialize_row(m, 0)


@router.put("/{manufacturer_id}", response_model=ManufacturerRead)
def update_manufacturer(
    manufacturer_id: int,
    body: ManufacturerUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    m = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == manufacturer_id, Manufacturer.tenant_id == tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    m.name = body.name.strip()
    m.company_name = _strip_opt(body.company_name)
    m.tax_id = _strip_opt(body.tax_id)
    m.logo_url = _strip_opt(body.logo_url)
    m.country = _strip_opt(body.country)
    m.city = _strip_opt(body.city)
    m.postal_code = _strip_opt(body.postal_code)
    m.street = _strip_opt(body.street)
    m.website = _strip_opt(body.website)
    m.email = _strip_opt(body.email)
    m.phone = _strip_opt(body.phone)
    m.active = bool(body.active)
    m.responsible_person_name = _strip_opt(body.responsible_person_name)
    m.responsible_person_email = _strip_opt(body.responsible_person_email)
    db.commit()
    db.refresh(m)
    db.query(Product).filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id).update(
        {Product.manufacturer: m.name}, synchronize_session=False
    )
    db.commit()
    cnt = (
        db.query(func.count(Product.id))
        .filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id)
        .scalar()
    )
    inv = _inventory_stats_by_manufacturer_ids(db, tenant_id, [m.id]).get(m.id, (0.0, 0))
    return _serialize_row(
        m,
        int(cnt or 0),
        total_inventory_quantity=inv[0],
        out_of_stock_product_count=inv[1],
    )


@router.delete("/{manufacturer_id}")
def delete_manufacturer(
    manufacturer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    m = (
        db.query(Manufacturer)
        .filter(Manufacturer.id == manufacturer_id, Manufacturer.tenant_id == tenant_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    cnt = (
        db.query(func.count(Product.id))
        .filter(Product.manufacturer_id == m.id, Product.tenant_id == tenant_id)
        .scalar()
    )
    n = int(cnt or 0)
    if n > 0:
        m.active = False
        db.commit()
        return {"deactivated": True, "product_count": n, "detail": "Manufacturer has products — marked inactive instead of removed."}
    db.delete(m)
    db.commit()
    return {"deleted": True, "product_count": 0}
