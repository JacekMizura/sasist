"""
API: Products

GET /products/ supports optional query params for server-side filtering.
Volume is computed as (length * width * height) / 1000 (dm³) when not stored.
POST /products/ creates a product; PUT /products/{id}/ updates it.
assigned_locations is persisted as JSON and returned as a list.
"""

import json
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, field_validator
from typing import List, Optional, Any

from ..database import get_db
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_item import OrderItem
from ..services.randomize_locations_service import randomize_product_locations


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/products",
    tags=["Products"],
)


def _coerce_float(v: Any) -> Optional[float]:
    """Safe parse: accept int/float or string (comma as decimal); return float or None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", ".")
        if not s or s.lower() == "null":
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _parse_float(v: Any) -> Optional[float]:
    """Parse numeric field from payload; use for both legacy (length/weight) and alternate (length_cm/weight_kg) names."""
    if v in (None, "", "null"):
        return None
    return _coerce_float(v)


class ProductBody(BaseModel):
    """Request body for create/update. All fields optional for update; name required for create.
    Accepts both legacy (length, weight, volume) and alternate (length_cm, weight_kg, volume_dm3) names."""
    name: Optional[str] = None
    ean: Optional[str] = None
    symbol: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    volume: Optional[float] = None
    # Alternate names (frontend may send these)
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    volume_dm3: Optional[float] = None
    image_url: Optional[str] = None
    tenant_id: Optional[int] = None
    assigned_locations: Optional[List[dict]] = None  # accepted but not stored on Product model
    label_template_id: Optional[int] = None  # FK to saved_label_templates.id; use for product labels
    sale_price: Optional[float] = None
    purchase_price: Optional[float] = None
    manufacturer: Optional[str] = None
    unit: Optional[str] = None
    stock_quantity: Optional[float] = None  # when set on update, write to first inventory row (or create)

    @field_validator(
        "length", "width", "height", "weight", "volume",
        "length_cm", "width_cm", "height_cm", "weight_kg", "volume_dm3",
        "sale_price", "purchase_price", "stock_quantity",
        mode="before",
    )
    @classmethod
    def coerce_numeric(cls, v: Any) -> Optional[float]:
        return _coerce_float(v)

# Dozwolone pola sortowania
SORT_FIELDS = {"id", "name", "ean", "symbol", "length", "width", "height", "weight", "volume"}


class RandomizeLocationsBody(BaseModel):
    """Request body for POST /products/randomize-locations/{warehouse_id}. Required for testing tool."""
    tenant_id: int


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


def _inventory_locations_by_product_ids(db: Session, product_ids: list[int]) -> dict[int, list[dict]]:
    """Return product_id -> list of { name, quantity, warehouse_id } for inventory.quantity > 0."""
    if not product_ids:
        return {}
    rows = (
        db.query(
            Inventory.product_id,
            Inventory.warehouse_id,
            Location.name.label("location_name"),
            Inventory.quantity,
        )
        .join(Location, Inventory.location_id == Location.id)
        .filter(Inventory.product_id.in_(product_ids), Inventory.quantity > 0)
        .all()
    )
    out: dict[int, list[dict]] = {}
    for r in rows:
        pid = r.product_id
        if pid not in out:
            out[pid] = []
        qty = float(r.quantity) if r.quantity is not None else 0
        out[pid].append({
            "name": (r.location_name or "").strip() or None,
            "quantity": qty,
            "warehouse_id": r.warehouse_id,
        })
    return out


def _product_to_dict(p: Product) -> dict:
    """Serialize product to dict with assigned_locations as list for API response. Volume always rounded to 2 decimals."""
    vol = p.volume
    if vol is not None:
        vol = round(float(vol), 2)
    sale = getattr(p, "sale_price", None)
    sale_float = float(sale) if sale is not None else None
    purchase = getattr(p, "purchase_price", None)
    purchase_float = float(purchase) if purchase is not None else None
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
        "volume": vol,
        "location": p.location,
        "purchase_price": purchase_float,
        "sale_price": sale_float,
        "manufacturer": getattr(p, "manufacturer", None),
        "unit": getattr(p, "unit", None),
        "image_url": p.image_url,
        "assigned_locations": _parse_assigned_locations(p.assigned_locations),
        "label_template_id": getattr(p, "label_template_id", None),
    }


def _product_volume_dm3(p: Product) -> float:
    """Objętość w dm³: (L×W×H)/1000 lub product.volume jeśli ustawione. Zawsze zaokrąglone do 2 miejsc."""
    if p.volume is not None and p.volume > 0:
        return round(float(p.volume), 2)
    l_, w_, h_ = p.length or 0, p.width or 0, p.height or 0
    if l_ and w_ and h_:
        return round((l_ * w_ * h_) / 1000.0, 2)
    return 0.0


def _sync_inventory_from_assigned_locations(
    db: Session,
    product: Product,
    assigned_locations: List[dict],
) -> None:
    """
    Sync inventory with product.assigned_locations: one inventory row per assigned location.
    Resolves location by locationAddress (or locationUUID/label); updates or creates inventory;
    removes inventory rows in the same warehouse that are no longer in assigned_locations.
    """
    if not assigned_locations or not isinstance(assigned_locations, list):
        return
    # Current warehouse: from first existing inventory row, or default 1
    first_inv = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == product.id,
            Inventory.tenant_id == product.tenant_id,
        )
        .order_by(Inventory.id)
        .first()
    )
    warehouse_id = first_inv.warehouse_id if first_inv else 1
    tenant_id = product.tenant_id
    product_id = product.id
    synced_location_ids = []
    for ent in assigned_locations:
        if not isinstance(ent, dict):
            continue
        location_address = (
            (ent.get("locationAddress") or ent.get("locationUUID") or ent.get("label")) or ""
        ).strip()
        if not location_address:
            continue
        loc = (
            db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.name == location_address,
            )
            .first()
        )
        if not loc:
            continue
        assigned_quantity = ent.get("quantity")
        if assigned_quantity is None:
            assigned_quantity = 0
        try:
            qty = float(assigned_quantity)
        except (TypeError, ValueError):
            qty = 0.0
        qty = max(0.0, qty)
        synced_location_ids.append(loc.id)
        existing = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == tenant_id,
                Inventory.product_id == product_id,
                Inventory.location_id == loc.id,
            )
            .first()
        )
        if existing:
            existing.quantity = qty
            if existing.warehouse_id != warehouse_id:
                existing.warehouse_id = warehouse_id
        else:
            inv = Inventory(
                tenant_id=tenant_id,
                product_id=product_id,
                warehouse_id=warehouse_id,
                location_id=loc.id,
                quantity=qty,
            )
            db.add(inv)
    # Remove inventory rows for this product in this warehouse that are not in synced locations
    if synced_location_ids:
        to_remove = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == product_id,
                Inventory.tenant_id == tenant_id,
                Inventory.warehouse_id == warehouse_id,
                ~Inventory.location_id.in_(synced_location_ids),
            )
            .all()
        )
        for inv in to_remove:
            db.delete(inv)
    db.flush()
    logger.info(
        "Inventory synchronized with assigned_locations for product %s",
        product.id,
    )


@router.get("/")
def get_products(
    tenant_id: Optional[int] = None,
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
    tenant_id optional: when provided, only products for that tenant; when omitted, all products.
    """
    q = db.query(Product)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)

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

    # SUM(inventory.quantity) per (product_id, tenant_id) in one query
    stock_map = {}
    sales_map = {}  # product_id -> (sales_30d: int, rotation_30d: float)
    if rows:
        product_ids = [p.id for p in rows]
        qty_rows = (
            db.query(Inventory.product_id, Inventory.tenant_id, func.sum(Inventory.quantity).label("qty"))
            .filter(Inventory.product_id.in_(product_ids))
            .group_by(Inventory.product_id, Inventory.tenant_id)
            .all()
        )
        for r in qty_rows:
            qty = r.qty
            if qty is not None:
                stock_map[(r.product_id, r.tenant_id)] = int(round(float(qty)))
            else:
                stock_map[(r.product_id, r.tenant_id)] = 0

        # Sales last 30 days: SUM(order_items.quantity) grouped by product_id
        since = datetime.utcnow() - timedelta(days=30)
        sales_q = (
            db.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("sales_30d"))
            .join(Order, Order.id == OrderItem.order_id)
            .filter(Order.order_date >= since)
            .filter(OrderItem.product_id.in_(product_ids))
        )
        if tenant_id is not None:
            sales_q = sales_q.filter(Order.tenant_id == tenant_id)
        sales_rows = sales_q.group_by(OrderItem.product_id).all()
        for r in sales_rows:
            s30 = int(r.sales_30d) if r.sales_30d is not None else 0
            sales_map[r.product_id] = (s30, round(s30 / 30.0, 2))

        loc_map = _inventory_locations_by_product_ids(db, product_ids)
    else:
        loc_map = {}

    items = []
    for p in rows:
        d = _product_to_dict(p)
        stock_qty = stock_map.get((p.id, p.tenant_id), 0)
        d["stock_quantity"] = stock_qty
        s30, rot = sales_map.get(p.id, (0, 0.0))
        d["sales_30d"] = s30
        d["rotation_30d"] = rot
        if rot and rot > 0:
            d["days_of_stock"] = int(round(stock_qty / rot))
        else:
            d["days_of_stock"] = None
        d["locations"] = loc_map.get(p.id, [])
        items.append(d)

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


def _volume_from_dimensions_dm3(length_cm: Optional[float], width_cm: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    """Volume in dm³: (length_cm * width_cm * height_cm) / 1000, rounded to 2 decimals."""
    if length_cm is None or width_cm is None or height_cm is None:
        return None
    try:
        l, w, h = float(length_cm), float(width_cm), float(height_cm)
        if l <= 0 or w <= 0 or h <= 0:
            return None
        return round((l * w * h) / 1000.0, 2)
    except (TypeError, ValueError):
        return None


@router.post("/", status_code=201)
def create_product(
    body: ProductBody,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Create product. Requires name in body and tenant_id (in body or query)."""
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="name is required")
    tid = body.tenant_id if body.tenant_id is not None else tenant_id
    if tid is None:
        raise HTTPException(status_code=400, detail="tenant_id is required when creating a product")
    assigned_json = json.dumps(body.assigned_locations) if body.assigned_locations is not None else None
    len_ = _round_float(body.length, 2)
    wid_ = _round_float(body.width, 2)
    hei_ = _round_float(body.height, 2)
    vol = _volume_from_dimensions_dm3(len_, wid_, hei_)
    if vol is None and body.volume is not None:
        vol = _round_float(body.volume, 2)
    product = Product(
        tenant_id=tid,
        name=(body.name or "").strip(),
        ean=(body.ean or "").strip() or None,
        symbol=(body.symbol or "").strip() or None,
        length=len_,
        width=wid_,
        height=hei_,
        weight=_round_float(body.weight, 3),
        volume=vol,
        image_url=(body.image_url or "").strip() or None,
        assigned_locations=assigned_json,
        label_template_id=body.label_template_id,
        sale_price=body.sale_price,
        manufacturer=(body.manufacturer or "").strip() or None,
        unit=(body.unit or "").strip() or None,
    )
    db.add(product)
    db.flush()
    from ..services.barcode_generation import next_product_barcode
    product.barcode = next_product_barcode(db, tid)
    db.commit()
    db.refresh(product)
    out = _product_to_dict(product)
    loc_map = _inventory_locations_by_product_ids(db, [product.id])
    out["locations"] = loc_map.get(product.id, [])
    return out


@router.get("/{product_id}/")
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Returns a single product by ID. tenant_id optional (when provided, scopes to that tenant)."""
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    out = _product_to_dict(product)
    # Add stock_quantity (SUM inventory.quantity) for single-product response
    qty_row = (
        db.query(func.sum(Inventory.quantity).label("qty"))
        .filter(
            Inventory.product_id == product.id,
            Inventory.tenant_id == product.tenant_id,
        )
        .first()
    )
    out["stock_quantity"] = int(round(float(qty_row.qty or 0))) if qty_row and qty_row.qty is not None else 0
    loc_map = _inventory_locations_by_product_ids(db, [product.id])
    out["locations"] = loc_map.get(product.id, [])
    return out


@router.put("/{product_id}/")
def update_product(
    product_id: int,
    body: ProductBody,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Update product by ID. tenant_id optional for scoping; body.tenant_id can change product's tenant.
    Accepts both legacy (length, weight, volume) and alternate (length_cm, weight_kg, volume_dm3) field names."""
    payload = body.model_dump()
    print("PRODUCT UPDATE PAYLOAD:", payload)  # noqa: T201 - temporary debug
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.name is not None:
        product.name = (body.name or "").strip()
    if body.tenant_id is not None:
        product.tenant_id = body.tenant_id
    if body.ean is not None:
        product.ean = (body.ean or "").strip() or None
    if body.symbol is not None:
        product.symbol = (body.symbol or "").strip() or None
    # Numeric fields: accept both legacy and alternate names, safe parse (comma decimal, strings)
    length_val = _parse_float(payload.get("length_cm") or payload.get("length"))
    if length_val is not None:
        product.length = _round_float(length_val, 2)
    width_val = _parse_float(payload.get("width_cm") or payload.get("width"))
    if width_val is not None:
        product.width = _round_float(width_val, 2)
    height_val = _parse_float(payload.get("height_cm") or payload.get("height"))
    if height_val is not None:
        product.height = _round_float(height_val, 2)
    weight_val = _parse_float(payload.get("weight_kg") or payload.get("weight"))
    if weight_val is not None:
        product.weight = _round_float(weight_val, 3)
    # Recompute volume from dimensions when all three are set; otherwise use body.volume / volume_dm3 if provided
    len_ = product.length
    wid_ = product.width
    hei_ = product.height
    vol = _volume_from_dimensions_dm3(len_, wid_, hei_)
    if vol is not None:
        product.volume = vol
    else:
        volume_val = _parse_float(payload.get("volume_dm3") or payload.get("volume"))
        if volume_val is not None:
            product.volume = _round_float(volume_val, 2)
    if body.image_url is not None:
        product.image_url = (body.image_url or "").strip() or None
    if body.assigned_locations is not None:
        product.assigned_locations = json.dumps(body.assigned_locations)
        # Sync inventory with assigned_locations: one inventory row per assigned location
        _sync_inventory_from_assigned_locations(db, product, body.assigned_locations)
    if body.label_template_id is not None:
        product.label_template_id = body.label_template_id
    if body.sale_price is not None:
        product.sale_price = body.sale_price
    if body.purchase_price is not None:
        product.purchase_price = _round_float(body.purchase_price, 2)
    if body.manufacturer is not None:
        product.manufacturer = (body.manufacturer or "").strip() or None
    if body.unit is not None:
        product.unit = (body.unit or "").strip() or None

    # Optional: update stock (first inventory row or create one)
    stock_qty_val = _parse_float(payload.get("stock_quantity"))
    if stock_qty_val is not None:
        first_inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == product.id,
                Inventory.tenant_id == product.tenant_id,
            )
            .order_by(Inventory.id)
            .first()
        )
        qty = float(stock_qty_val)
        if first_inv:
            first_inv.quantity = qty
        else:
            # No inventory row: create one (default warehouse 1, location "Import")
            default_warehouse_id = 1
            loc = (
                db.query(Location)
                .filter(
                    Location.warehouse_id == default_warehouse_id,
                    Location.name == "Import",
                )
                .first()
            )
            if not loc:
                loc = Location(warehouse_id=default_warehouse_id, name="Import", type="pick")
                db.add(loc)
                db.flush()
            inv = Inventory(
                tenant_id=product.tenant_id,
                product_id=product.id,
                warehouse_id=default_warehouse_id,
                location_id=loc.id,
                quantity=qty,
            )
            db.add(inv)

    try:
        db.commit()
        db.refresh(product)
        out = _product_to_dict(product)
        qty_row = (
            db.query(func.sum(Inventory.quantity).label("qty"))
            .filter(Inventory.product_id == product.id, Inventory.tenant_id == product.tenant_id)
            .first()
        )
        out["stock_quantity"] = int(round(float(qty_row.qty or 0))) if qty_row and qty_row.qty is not None else 0
        loc_map = _inventory_locations_by_product_ids(db, [product.id])
        out["locations"] = loc_map.get(product.id, [])
        return out
    except Exception as e:
        db.rollback()
        logger.exception("Product update failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Product update failed: {e!s}") from e


@router.post("/randomize-locations/{warehouse_id}")
def post_randomize_locations(
    warehouse_id: int,
    body: RandomizeLocationsBody,
    db: Session = Depends(get_db),
):
    """
    Testing utility: randomly assign product inventory to warehouse locations.
    Only modifies inventory records where quantity > 0; does not delete rows.
    Returns products_processed, assigned_successfully, failed_assignments.
    """
    return randomize_product_locations(db, warehouse_id=warehouse_id, tenant_id=body.tenant_id)


@router.delete("/bulk/")
def bulk_delete_products(
    ids: str,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Delete multiple products by ID (ids=1,2,3). tenant_id optional: when provided, only deletes products of that tenant. Accepts trailing slash for frontend compatibility."""
    if not ids or not ids.strip():
        return {"deleted": 0}
    id_list = []
    for s in ids.split(","):
        s = s.strip()
        if s.isdigit():
            id_list.append(int(s))
    if not id_list:
        return {"deleted": 0}
    q = db.query(Product).filter(Product.id.in_(id_list))
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}