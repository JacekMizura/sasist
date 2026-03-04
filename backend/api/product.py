"""
API: Products

GET /products/ supports optional query params for server-side filtering.
Volume is computed as (length * width * height) / 1000 (dm³) when not stored.
POST /products/ creates a product; PUT /products/{id}/ updates it.
assigned_locations is persisted as JSON and returned as a list.
"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional, Any

from ..database import get_db
from ..models.product import Product


router = APIRouter(
    prefix="/products",
    tags=["Products"],
)


class ProductBody(BaseModel):
    """Request body for create/update. All fields optional for update; name required for create."""
    name: Optional[str] = None
    ean: Optional[str] = None
    symbol: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    volume: Optional[float] = None
    image_url: Optional[str] = None
    tenant_id: Optional[int] = None
    assigned_locations: Optional[List[dict]] = None  # accepted but not stored on Product model

# Dozwolone pola sortowania
SORT_FIELDS = {"id", "name", "ean", "symbol", "length", "width", "height", "weight", "volume"}


def _parse_assigned_locations(raw: Any) -> List[dict]:
    """Parse assigned_locations from DB (JSON string) to list of dicts."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            out = json.loads(raw)
            return out if isinstance(out, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _product_to_dict(p: Product) -> dict:
    """Serialize product to dict with assigned_locations as list for API response."""
    return {
        "id": p.id,
        "tenant_id": p.tenant_id,
        "name": p.name,
        "ean": p.ean,
        "symbol": p.symbol,
        "length": p.length,
        "width": p.width,
        "height": p.height,
        "weight": p.weight,
        "volume": p.volume,
        "location": p.location,
        "purchase_price": p.purchase_price,
        "image_url": p.image_url,
        "assigned_locations": _parse_assigned_locations(p.assigned_locations),
    }


def _product_volume_dm3(p: Product) -> float:
    """Objętość w dm³: (L×W×H)/1000 lub product.volume jeśli ustawione."""
    if p.volume is not None and p.volume > 0:
        return float(p.volume)
    l_, w_, h_ = p.length or 0, p.width or 0, p.height or 0
    if l_ and w_ and h_:
        return (l_ * w_ * h_) / 1000.0
    return 0.0


@router.get("/")
def get_products(
    tenant_id: int,
    db: Session = Depends(get_db),
    ean: Optional[str] = None,
    name: Optional[str] = None,
    symbol: Optional[str] = None,
    volume_min: Optional[float] = None,
    volume_max: Optional[float] = None,
    weight_min: Optional[float] = None,
    weight_max: Optional[float] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
):
    """
    Lista produktów z filtrowaniem, sortowaniem (sort_by, sort_dir: asc|desc) i paginacją.
    """
    q = db.query(Product).filter(Product.tenant_id == tenant_id)

    if ean and ean.strip():
        q = q.filter(Product.ean.ilike(f"%{ean.strip()}%"))
    if name and name.strip():
        q = q.filter(Product.name.ilike(f"%{name.strip()}%"))
    if symbol and symbol.strip():
        q = q.filter(Product.symbol.ilike(f"%{symbol.strip()}%"))
    if weight_min is not None:
        q = q.filter(Product.weight >= weight_min)
    if weight_max is not None:
        q = q.filter(Product.weight <= weight_max)

    if volume_min is not None or volume_max is not None:
        volume_expr = func.coalesce(
            Product.volume,
            (Product.length * Product.width * Product.height) / 1000.0,
            0.0,
        )
        if volume_min is not None:
            q = q.filter(volume_expr >= volume_min)
        if volume_max is not None:
            q = q.filter(volume_expr <= volume_max)

    if sort_by and sort_by in SORT_FIELDS:
        col = getattr(Product, sort_by, None)
        if col is not None:
            q = q.order_by(col.desc() if sort_dir == "desc" else col.asc())

    use_pagination = (limit is not None and limit > 0) or (offset is not None and offset > 0)
    if use_pagination:
        total = q.count()
    if offset is not None and offset > 0:
        q = q.offset(offset)
    if limit is not None and limit > 0:
        q = q.limit(limit)
    rows = q.all()
    items = [_product_to_dict(p) for p in rows]
    if use_pagination:
        return {"items": items, "total": total}
    return items


def _round_float(v: Optional[float], decimals: int) -> Optional[float]:
    if v is None:
        return None
    try:
        return round(float(v), decimals)
    except (TypeError, ValueError):
        return None


@router.post("/", status_code=201)
def create_product(
    tenant_id: int,
    body: ProductBody,
    db: Session = Depends(get_db),
):
    """Tworzy nowy produkt. Wymaga tenant_id w query i pola name w body."""
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    tid = body.tenant_id if body.tenant_id is not None else tenant_id
    assigned_json = json.dumps(body.assigned_locations) if body.assigned_locations is not None else None
    product = Product(
        tenant_id=tid,
        name=(body.name or "").strip(),
        ean=(body.ean or "").strip() or None,
        symbol=(body.symbol or "").strip() or None,
        length=_round_float(body.length, 2),
        width=_round_float(body.width, 2),
        height=_round_float(body.height, 2),
        weight=_round_float(body.weight, 3),
        volume=_round_float(body.volume, 2),
        image_url=(body.image_url or "").strip() or None,
        assigned_locations=assigned_json,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return _product_to_dict(product)


@router.put("/{product_id}/")
def update_product(
    product_id: int,
    tenant_id: int,
    body: ProductBody,
    db: Session = Depends(get_db),
):
    """Aktualizuje produkt po ID (główny klucz bazy). Wymaga tenant_id w query."""
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == tenant_id,
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.name is not None:
        product.name = (body.name or "").strip()
    if body.ean is not None:
        product.ean = (body.ean or "").strip() or None
    if body.symbol is not None:
        product.symbol = (body.symbol or "").strip() or None
    if body.length is not None:
        product.length = _round_float(body.length, 2)
    if body.width is not None:
        product.width = _round_float(body.width, 2)
    if body.height is not None:
        product.height = _round_float(body.height, 2)
    if body.weight is not None:
        product.weight = _round_float(body.weight, 3)
    if body.volume is not None:
        product.volume = _round_float(body.volume, 2)
    if body.image_url is not None:
        product.image_url = (body.image_url or "").strip() or None
    if body.assigned_locations is not None:
        product.assigned_locations = json.dumps(body.assigned_locations)
    db.commit()
    db.refresh(product)
    return _product_to_dict(product)


@router.delete("/bulk")
def bulk_delete_products(
    tenant_id: int,
    ids: str,
    db: Session = Depends(get_db),
):
    """Usuwa wiele produktów po ID (ids=1,2,3)."""
    if not ids or not ids.strip():
        return {"deleted": 0}
    id_list = []
    for s in ids.split(","):
        s = s.strip()
        if s.isdigit():
            id_list.append(int(s))
    if not id_list:
        return {"deleted": 0}
    deleted = db.query(Product).filter(
        Product.tenant_id == tenant_id,
        Product.id.in_(id_list),
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}