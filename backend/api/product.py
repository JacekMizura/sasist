"""
API: Products

GET /products/ supports optional query params for server-side filtering.
Volume is computed as (length * width * height) / 1000 (dm³) when not stored.
POST /products/ creates a product; PUT /products/{id}/ updates it.
assigned_locations is persisted as JSON and returned as a list.
"""

import json
import logging
import re
import unicodedata
try:
    from unidecode import unidecode as _unidecode  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    _unidecode = None
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case
from sqlalchemy.sql import select
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Any, Tuple
from collections import defaultdict

from ..database import engine, get_db
from ..schemas.entity_delete import EntityBulkDeleteResult, entity_bulk_delete_result_from_service_dict
from ..schemas.order_bulk import BulkProductsDeleteBody, BulkProductsSelection, ProductBulkListFilters, ProductBulkUpdateExtendedBody
from ..domain.supplier_product_linkage import apply_supplier_product_filter
from ..config import product_refactor_flags as pr_flags
from ..models.manufacturer import Manufacturer
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from ..models.product import Product
from ..models.inventory import Inventory
from ..models.location import Location
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product_substitution import ProductSubstitution
from ..models.stock_reservation import StockReservation
from ..models.warehouse import Bin, Rack, WarehouseLayout
from ..storage_types import UNKNOWN_STORAGE_TYPE, normalize_storage_type
from ..models.tenant_warehouse import TenantWarehouse
from ..models.stock_movement import StockMovement
from ..models.inventory_movement import InventoryMovement
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse_carrier import WarehouseCarrier
from ..services.inventory_serial_service import list_on_hand_serial_groups_for_products
from ..services.inventory_traceability_service import (
    InventoryTraceabilityConflictError,
    update_inventory_traceability,
)
from ..models.stock_operation import (
    STOCK_OP_ADJUSTMENT,
    STOCK_OP_ISSUE,
    STOCK_OP_MOVE,
    STOCK_OP_MOVE_IN,
    STOCK_OP_MOVE_OUT,
    STOCK_OP_PUTAWAY,
    STOCK_OP_RECEIPT,
    StockOperation,
)
from ..models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from ..services.delete_service import delete_products_bulk
from ..services.randomize_locations_service import randomize_product_locations
from ..services.inventory_damage_trace_service import inventory_damage_trace_dict
from ..services.inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from ..services.stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    normalize_stock_disposition,
    stock_disposition_display_badge,
    damaged_inventory_badge_label,
)
from ..services.legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location
from ..services.product_cost_service import calculate_product_margin
from ..services.product_profitability_service import get_products_profitability
from ..schemas.product_profitability import ProductProfitabilityListOut


logger = logging.getLogger(__name__)


def _stock_map_visible_by_product_tenant(db: Session, product_ids: list[int]) -> dict[tuple[int, int], int]:
    """SUM(inventory.quantity) per (product_id, tenant_id), excluding legacy import-placeholder locations."""
    if not product_ids:
        return {}
    rows = (
        db.query(
            Inventory.product_id,
            Inventory.tenant_id,
            Inventory.quantity,
            Location.name,
            Location.type,
            Location.location_type,
            Location.location_uuid,
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(Inventory.product_id.in_(product_ids))
        .all()
    )
    acc: dict[tuple[int, int], float] = defaultdict(float)
    for r in rows:
        if should_hide_legacy_csv_import_inventory_location(
            loc_name=r.name or "",
            loc_type=r.type,
            location_type=r.location_type,
            location_uuid=r.location_uuid,
        ):
            continue
        key = (int(r.product_id), int(r.tenant_id))
        acc[key] += float(r.quantity or 0)
    return {k: int(round(v)) for k, v in acc.items()}


def _visible_stock_quantity_for_product(db: Session, product: Product) -> int:
    m = _stock_map_visible_by_product_tenant(db, [int(product.id)])
    return m.get((int(product.id), int(product.tenant_id)), 0)


def _location_uuids_from_assigned_locations(assigned_locations: Optional[List[dict]]) -> List[str]:
    """Collect non-empty location UUID strings from assignment entries (locationUUID or location_uuid)."""
    if not assigned_locations or not isinstance(assigned_locations, list):
        return []
    out: List[str] = []
    for ent in assigned_locations:
        if not isinstance(ent, dict):
            continue
        u = ent.get("locationUUID") or ent.get("location_uuid")
        if isinstance(u, str):
            s = u.strip()
            if s:
                out.append(s)
    return out


def _raise_invalid_assigned_locations(
    *,
    invalid_uuids: List[str],
    not_found: Optional[List[str]] = None,
    inactive: Optional[List[str]] = None,
    wrong_warehouse: Optional[List[str]] = None,
) -> None:
    detail: dict = {
        "detail": "Invalid location assignment",
        "invalid_uuids": sorted(dict.fromkeys(invalid_uuids)),
    }
    nf = sorted(dict.fromkeys(not_found or []))
    ia = sorted(dict.fromkeys(inactive or []))
    ww = sorted(dict.fromkeys(wrong_warehouse or []))
    if nf:
        detail["not_found"] = nf
    if ia:
        detail["inactive"] = ia
    if ww:
        detail["wrong_warehouse"] = ww
    raise HTTPException(status_code=400, detail=detail)


def _validate_assigned_locations_for_tenant(
    db: Session,
    tenant_id: int,
    assigned_locations: Optional[List[dict]],
) -> None:
    """
    Ensure every assigned location UUID refers to an active bin on an active rack in a layout
    warehouse linked to the tenant. All UUIDs must resolve to the same warehouse.
    Uses default session filters (active bin/rack only); inactive bins are rejected.
    """
    uuids = _location_uuids_from_assigned_locations(assigned_locations)
    if not uuids:
        return
    unique = list(dict.fromkeys(uuids))
    rows = (
        db.query(Bin.location_uuid, WarehouseLayout.warehouse_id)
        .join(Rack, Bin.rack_id == Rack.id)
        .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
        .join(
            TenantWarehouse,
            and_(
                TenantWarehouse.warehouse_id == WarehouseLayout.warehouse_id,
                TenantWarehouse.tenant_id == tenant_id,
            ),
        )
        .filter(Bin.location_uuid.in_(unique))
        .all()
    )
    found = set()
    warehouse_ids = set()
    for loc_uuid, wh_id in rows:
        if loc_uuid is None:
            continue
        s = str(loc_uuid).strip()
        if s:
            found.add(s)
            warehouse_ids.add(int(wh_id))
    if len(found) == len(unique) and len(warehouse_ids) == 1:
        return

    not_found: list[str] = []
    inactive: list[str] = []
    wrong_warehouse: list[str] = []

    if len(found) == len(unique) and len(warehouse_ids) != 1:
        wrong_warehouse.extend(unique)
    elif len(warehouse_ids) > 1:
        wrong_warehouse.extend(sorted(found))

    missing = [u for u in unique if u not in found]
    if missing:
        tenant_wh_ids = {
            int(r[0])
            for r in db.query(TenantWarehouse.warehouse_id)
            .filter(TenantWarehouse.tenant_id == tenant_id)
            .all()
        }
        broad_rows = (
            db.query(Bin.location_uuid, WarehouseLayout.warehouse_id, Bin.is_active, Rack.is_active)
            .join(Rack, Bin.rack_id == Rack.id)
            .join(WarehouseLayout, Rack.layout_id == WarehouseLayout.id)
            .filter(Bin.location_uuid.in_(missing))
            .execution_options(include_inactive=True)
            .all()
        )
        by_uuid: dict[str, list[tuple[int, bool, bool]]] = {}
        for loc_uuid, wh_id, bin_active, rack_active in broad_rows:
            if loc_uuid is None:
                continue
            s = str(loc_uuid).strip()
            if not s:
                continue
            by_uuid.setdefault(s, []).append(
                (int(wh_id), bool(bin_active), bool(rack_active))
            )

        for u in missing:
            entries = by_uuid.get(u) or []
            if not entries:
                not_found.append(u)
                continue
            tenant_entries = [(wh, b, r) for wh, b, r in entries if wh in tenant_wh_ids]
            if not tenant_entries:
                wrong_warehouse.append(u)
                continue
            if any(b and r for wh, b, r in tenant_entries):
                wrong_warehouse.append(u)
            else:
                inactive.append(u)

    _raise_invalid_assigned_locations(
        invalid_uuids=sorted(unique),
        not_found=not_found,
        inactive=inactive,
        wrong_warehouse=wrong_warehouse,
    )

router = APIRouter(
    prefix="/products",
    tags=["Products"],
)

_product_read_schema_ready = False


def _ensure_product_read_schema() -> None:
    """Synchronous schema sync before product GET (detail + inventory enrichment)."""
    global _product_read_schema_ready
    if _product_read_schema_ready:
        return
    from ..services.product_detail_service import ensure_product_detail_read_schema

    ensure_product_detail_read_schema()
    _product_read_schema_ready = True


class ProductIdByEanResponse(BaseModel):
    """Dokładne dopasowanie pola ``Product.ean`` (WMS / skan)."""

    id: int = Field(..., ge=1)


class ReplacementSuggestionProduct(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    stock_qty: float = 0.0
    reserved_qty: float = 0.0
    available_qty: float = 0.0
    location_count: int = 0
    locations: List[str] = Field(default_factory=list)
    similarity_reasons: List[str] = Field(default_factory=list)
    badge: Optional[str] = None
    usage_count: Optional[int] = None
    last_used_at: Optional[datetime] = None
    score: float = 0.0
    match_group: Optional[str] = None
    match_flags: dict[str, bool] = Field(default_factory=dict)


class ReplacementSuggestionsResponse(BaseModel):
    recent: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    popular: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    similar: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    search_results: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    best_match: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    alternatives: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    others: List[ReplacementSuggestionProduct] = Field(default_factory=list)
    debug: Optional[dict[str, Any]] = None


def _product_category_from_meta(meta_raw: Optional[str]) -> Optional[str]:
    if not meta_raw:
        return None
    try:
        meta = json.loads(meta_raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(meta, dict):
        return None
    for k in ("category", "category_name", "kategoria", "product_category"):
        v = meta.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()[:120]
    return None


def _product_category_id_from_meta(meta_raw: Optional[str]) -> Optional[int]:
    if not meta_raw:
        return None
    try:
        meta = json.loads(meta_raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(meta, dict):
        return None
    for k in ("category_id", "kategoria_id", "categoryId"):
        v = meta.get(k)
        if isinstance(v, int):
            return v
        if isinstance(v, str) and v.strip().isdigit():
            return int(v.strip())
    return None


def _product_dimensions_key(p: Product) -> tuple[int, int, int]:
    return (
        int(round(float(getattr(p, "length", 0) or 0))),
        int(round(float(getattr(p, "width", 0) or 0))),
        int(round(float(getattr(p, "height", 0) or 0))),
    )


def _product_meta_dict(meta_raw: Optional[str]) -> dict:
    if not meta_raw:
        return {}
    try:
        meta = json.loads(meta_raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return meta if isinstance(meta, dict) else {}


_DIM_TOKEN_RE = re.compile(r"^(\d{1,4})(mm|cm|m)$", re.IGNORECASE)
_STOPWORDS = {
    "i", "oraz", "do", "na", "z", "ze", "w", "o", "od", "dla", "the", "and", "or", "a", "an",
    "mm", "cm", "m", "xl", "xxl",
    "bezowy", "bialy", "czarny", "czerwony", "zielony", "niebieski", "granatowy", "szary", "zolty",
}
_COLOR_TOKENS = {
    "bezowy", "bez", "czarny", "bialy", "biala", "brazowy", "granatowy", "niebieski", "czerwony",
    "zielony", "zolty", "szary", "fioletowy", "rozowy", "pomaranczowy",
}


def normalize_token_text(text: str) -> str:
    raw = str(text or "").lower()
    if _unidecode is not None:
        text = _unidecode(raw)
    else:
        raw = raw.replace("ł", "l")
        folded = unicodedata.normalize("NFKD", raw)
        text = "".join(ch for ch in folded if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalize_token(s: str) -> str:
    return re.sub(r"\s+", "", normalize_token_text(s))


def _extract_tokens(name: str) -> list[str]:
    return [
        token
        for token in normalize_token_text(name).split()
        if token not in _STOPWORDS and len(token) > 2 and not token.isdigit()
    ]


def _primary_token(tokens: list[str]) -> str:
    return tokens[0] if tokens else ""


_ALIASES = {
    "sznurek": {"sznurowadla"},
    "sznurowadla": {"sznurek"},
}


def _producer_candidates(p: Product) -> set[str]:
    meta = _product_meta_dict(getattr(p, "metadata_json", None))
    out = {
        _normalize_token(str(getattr(p, "manufacturer", "") or "")),
        _normalize_token(str(meta.get("producer_name") or "")),
        _normalize_token(str(meta.get("manufacturer_name") or "")),
        _normalize_token(str(meta.get("brand") or "")),
    }
    return {x for x in out if x}


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
    extra_cost_packaging_net: Optional[float] = None
    extra_cost_commission_percent: Optional[float] = None
    extra_cost_other_net: Optional[float] = None
    manufacturer: Optional[str] = None
    manufacturer_id: Optional[int] = None
    default_supplier_id: Optional[int] = None
    unit: Optional[str] = None
    stock_quantity: Optional[float] = None  # when set on update, write to first inventory row (or create)
    orientation_type: Optional[str] = None  # deprecated: use product_orientation_type (same DB column)
    shape_type: Optional[str] = None
    stack_compressible: Optional[bool] = None
    compressed_height_cm: Optional[float] = None
    max_stack_weight: Optional[float] = None
    stack_behavior: Optional[str] = None  # deprecated: use product_stack_behavior
    # Explicit single-unit (product) stacking — preferred; maps to orientation_type / shape_type / … columns
    product_orientation_type: Optional[str] = None
    product_shape_type: Optional[str] = None
    product_stack_compressible: Optional[bool] = None
    product_compressed_height_cm: Optional[float] = None
    product_max_stack_weight: Optional[float] = None
    product_stack_behavior: Optional[str] = None
    # When True on update with assigned_locations: persist JSON without Inventory sync/delete.
    skip_inventory_sync: Optional[bool] = None
    # Optional JSON string (e.g. merged client extensions under product_ui).
    metadata_json: Optional[str] = None
    # Replenishment thresholds for pick face (quantities, product-level).
    min_pick_quantity: Optional[float] = None
    max_pick_quantity: Optional[float] = None
    min_reserve_quantity: Optional[float] = None
    max_reserve_quantity: Optional[float] = None
    # Global low-stock alert: SUM(inventory.quantity) vs threshold (notification logic elsewhere).
    enable_stock_alert: Optional[bool] = None
    min_total_stock: Optional[float] = None
    # Opakowanie zbiorcze (osobno od pojedynczej sztuki)
    bulk_ean: Optional[str] = None
    units_per_carton: Optional[float] = None
    carton_length_cm: Optional[float] = None
    carton_width_cm: Optional[float] = None
    carton_height_cm: Optional[float] = None
    carton_weight_kg: Optional[float] = None
    carton_volume_dm3: Optional[float] = None
    # Carton (bulk) stacking — separate columns
    carton_orientation_type: Optional[str] = None
    carton_shape_type: Optional[str] = None
    carton_stack_compressible: Optional[bool] = None
    carton_compressed_height_cm: Optional[float] = None
    carton_max_stack_weight: Optional[float] = None
    carton_stack_behavior: Optional[str] = None
    # WMS: śledzenie partii / daty ważności przy przyjęciu i w inventory
    track_batch: Optional[bool] = None
    track_expiry: Optional[bool] = None
    track_serial: Optional[bool] = None
    require_recv_height: Optional[bool] = None
    require_recv_width: Optional[bool] = None
    require_recv_length: Optional[bool] = None
    require_recv_weight: Optional[bool] = None
    require_recv_master_carton: Optional[bool] = None
    require_recv_master_carton_ean: Optional[bool] = None
    require_recv_master_carton_qty: Optional[bool] = None
    require_recv_master_carton_dims: Optional[bool] = None
    require_recv_master_carton_weight: Optional[bool] = None

    @field_validator(
        "length", "width", "height", "weight", "volume",
        "length_cm", "width_cm", "height_cm", "weight_kg", "volume_dm3",
        "sale_price", "purchase_price", "stock_quantity",
        "extra_cost_packaging_net", "extra_cost_commission_percent", "extra_cost_other_net",
        "compressed_height_cm", "max_stack_weight",
        "product_compressed_height_cm", "product_max_stack_weight",
        "carton_compressed_height_cm", "carton_max_stack_weight",
        "min_pick_quantity", "max_pick_quantity",
        "min_reserve_quantity", "max_reserve_quantity",
        "min_total_stock",
        "units_per_carton",
        "carton_length_cm", "carton_width_cm", "carton_height_cm",
        "carton_weight_kg", "carton_volume_dm3",
        mode="before",
    )
    @classmethod
    def coerce_numeric(cls, v: Any) -> Optional[float]:
        return _coerce_float(v)

    @field_validator("orientation_type")
    @classmethod
    def validate_orientation_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("any", "upright", "no_stack"):
            raise ValueError("orientation_type must be one of: any, upright, no_stack")
        return v

    @field_validator("shape_type")
    @classmethod
    def validate_shape_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("box", "cylinder"):
            raise ValueError("shape_type must be one of: box, cylinder")
        return v

    @field_validator("compressed_height_cm")
    @classmethod
    def validate_compressed_height_cm(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        f = _coerce_float(v)
        if f is not None and f <= 0:
            raise ValueError("compressed_height_cm must be > 0")
        return f

    @field_validator("max_stack_weight")
    @classmethod
    def validate_max_stack_weight(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        f = _coerce_float(v)
        if f is not None and f <= 0:
            raise ValueError("max_stack_weight must be > 0")
        return f

    @field_validator("stack_behavior")
    @classmethod
    def validate_stack_behavior(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("stackable", "no_stack"):
            raise ValueError("stack_behavior must be one of: stackable, no_stack")
        return v

    @field_validator(
        "product_orientation_type",
        "carton_orientation_type",
    )
    @classmethod
    def validate_product_carton_orientation(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("any", "upright", "no_stack"):
            raise ValueError("orientation must be one of: any, upright, no_stack")
        return v

    @field_validator("product_shape_type", "carton_shape_type")
    @classmethod
    def validate_product_carton_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("box", "cylinder"):
            raise ValueError("shape_type must be one of: box, cylinder")
        return v

    @field_validator("product_compressed_height_cm", "carton_compressed_height_cm")
    @classmethod
    def validate_product_carton_compressed_height(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        f = _coerce_float(v)
        if f is not None and f <= 0:
            raise ValueError("compressed_height_cm must be > 0")
        return f

    @field_validator("product_max_stack_weight", "carton_max_stack_weight")
    @classmethod
    def validate_product_carton_max_stack_weight(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        f = _coerce_float(v)
        if f is not None and f <= 0:
            raise ValueError("max_stack_weight must be > 0")
        return f

    @field_validator("product_stack_behavior", "carton_stack_behavior")
    @classmethod
    def validate_product_carton_stack_behavior(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in ("stackable", "no_stack"):
            raise ValueError("stack_behavior must be one of: stackable, no_stack")
        return v

    @model_validator(mode="after")
    def validate_replenishment_levels(self) -> "ProductBody":
        mn = self.min_pick_quantity
        mx = self.max_pick_quantity
        if mn is not None and mn < 0:
            raise ValueError("min_pick_quantity must be >= 0")
        if mx is not None and mx < 0:
            raise ValueError("max_pick_quantity must be >= 0")
        if mn is not None and mx is not None and mn > mx:
            raise ValueError("min_pick_quantity must be <= max_pick_quantity")
        rmn = self.min_reserve_quantity
        rmx = self.max_reserve_quantity
        if rmn is not None and rmn < 0:
            raise ValueError("min_reserve_quantity must be >= 0")
        if rmx is not None and rmx < 0:
            raise ValueError("max_reserve_quantity must be >= 0")
        if rmn is not None and rmx is not None and rmn > rmx:
            raise ValueError("min_reserve_quantity must be <= max_reserve_quantity")
        mts = self.min_total_stock
        if mts is not None and mts < 0:
            raise ValueError("min_total_stock must be >= 0")
        for label, v in (
            ("units_per_carton", self.units_per_carton),
            ("carton_length_cm", self.carton_length_cm),
            ("carton_width_cm", self.carton_width_cm),
            ("carton_height_cm", self.carton_height_cm),
            ("carton_weight_kg", self.carton_weight_kg),
            ("carton_volume_dm3", self.carton_volume_dm3),
        ):
            if v is not None and v < 0:
                raise ValueError(f"{label} must be >= 0")
        return self


# Dozwolone pola sortowania
SORT_FIELDS = {"id", "name", "ean", "symbol", "length", "width", "height", "weight", "volume", "inventory_value"}


def _inventory_value_sql_expr(tenant_id: int):
    """SQL expression: physical stock × weighted avg RECEIPT price; NULL if stock>0 but no priced receipts."""
    inv_sum = (
        select(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .where(
            Inventory.product_id == Product.id,
            Inventory.tenant_id == tenant_id,
        )
        .scalar_subquery()
    )
    r_num = (
        select(func.coalesce(func.sum(StockOperation.qty * StockOperation.unit_price_net), 0.0))
        .select_from(StockOperation)
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .where(
            StockOperation.product_id == Product.id,
            StockDocument.tenant_id == tenant_id,
            StockOperation.type == STOCK_OP_RECEIPT,
            StockOperation.unit_price_net.isnot(None),
        )
        .scalar_subquery()
    )
    r_den = (
        select(func.coalesce(func.sum(StockOperation.qty), 0.0))
        .select_from(StockOperation)
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .where(
            StockOperation.product_id == Product.id,
            StockDocument.tenant_id == tenant_id,
            StockOperation.type == STOCK_OP_RECEIPT,
            StockOperation.unit_price_net.isnot(None),
        )
        .scalar_subquery()
    )
    return case(
        (inv_sum <= 0, 0.0),
        (r_den <= 0, None),
        else_=inv_sum * r_num / r_den,
    )


def _receipt_weighted_avg_price_by_product(
    db: Session, tenant_id: int, product_ids: List[int]
) -> dict[int, Optional[float]]:
    if not product_ids:
        return {}
    rows = (
        db.query(
            StockOperation.product_id,
            func.sum(StockOperation.qty * StockOperation.unit_price_net).label("num"),
            func.sum(StockOperation.qty).label("den"),
        )
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockOperation.product_id.in_(product_ids),
            StockOperation.type == STOCK_OP_RECEIPT,
            StockOperation.unit_price_net.isnot(None),
        )
        .group_by(StockOperation.product_id)
        .all()
    )
    out: dict[int, Optional[float]] = {int(pid): None for pid in product_ids}
    for pid, num, den in rows:
        d = float(den or 0)
        if d > 1e-12:
            out[int(pid)] = float(num or 0) / d
    return out


class RandomizeLocationsBody(BaseModel):
    """Request body for POST /products/randomize-locations/{warehouse_id}. Required for testing tool."""
    tenant_id: int


BULK_UPDATE_ACTIONS = frozenset({
    "set_manufacturer",
    "set_supplier",
    "set_price",
    "increase_price_percent",
    "set_vat_rate",
    "set_weight",
    "set_dimensions",
    "set_min_stock",
    "patch_logistics_fields",
    "clear_logistics_data",
    "toggle_master_carton_pack",
})

# Bulk „set_vat_rate” — canonical tokens stored in metadata_json.product_ui.vat_rate (same as karta produktu).
_BULK_VAT_RATE_TOKENS = frozenset({"23", "8", "5", "0", "zw", "np"})


def _products_query_from_bulk_filters(db: Session, tenant_id: int, f: ProductBulkListFilters):
    q = db.query(Product).filter(Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
    if f.manufacturer_id is not None:
        q = q.filter(Product.manufacturer_id == f.manufacturer_id)
    if f.default_supplier_id is not None:
        q = apply_supplier_product_filter(q, f.default_supplier_id)
    if f.search and str(f.search).strip():
        term = f"%{f.search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(term),
                Product.symbol.ilike(term),
                Product.ean.ilike(term),
            )
        )
    else:
        if f.ean and str(f.ean).strip():
            q = q.filter(Product.ean.ilike(f"%{str(f.ean).strip()}%"))
        if f.name and str(f.name).strip():
            q = q.filter(Product.name.ilike(f"%{str(f.name).strip()}%"))
        if f.symbol and str(f.symbol).strip():
            q = q.filter(Product.symbol.ilike(f"%{str(f.symbol).strip()}%"))
    if f.weight_min is not None:
        q = q.filter(Product.weight >= f.weight_min)
    if f.weight_max is not None:
        q = q.filter(Product.weight <= f.weight_max)
    if f.volume_min is not None or f.volume_max is not None:
        volume_expr = func.coalesce(
            Product.volume,
            (Product.length * Product.width * Product.height) / 1000.0,
            0.0,
        )
        if f.volume_min is not None:
            q = q.filter(volume_expr >= f.volume_min)
        if f.volume_max is not None:
            q = q.filter(volume_expr <= f.volume_max)
    return q


def _product_ids_matching_filters(db: Session, tenant_id: int, f: ProductBulkListFilters) -> List[int]:
    q = _products_query_from_bulk_filters(db, tenant_id, f)
    return [int(r[0]) for r in q.with_entities(Product.id).all()]


def _resolve_bulk_product_ids(db: Session, tenant_id: int, selection: BulkProductsSelection) -> List[int]:
    if selection.mode == "explicit_ids":
        return sorted({int(i) for i in selection.ids if isinstance(i, int) and i > 0})
    assert selection.filters is not None
    return _product_ids_matching_filters(db, tenant_id, selection.filters)


def _execute_product_bulk_update(
    db: Session,
    tenant_id: int,
    product_ids: List[int],
    action: str,
    value: Any,
) -> int:
    act = (action or "").strip().lower()
    if act not in BULK_UPDATE_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action. Allowed: {sorted(BULK_UPDATE_ACTIONS)}")
    ids = sorted({int(i) for i in product_ids if isinstance(i, int) and i > 0})
    if not ids:
        return 0
    filt = and_(Product.tenant_id == tenant_id, Product.id.in_(ids), Product.deleted_at.is_(None))

    if act == "set_manufacturer":
        if value is None:
            return (
                db.query(Product)
                .filter(filt)
                .update(
                    {Product.manufacturer_id: None, Product.manufacturer: None},
                    synchronize_session=False,
                )
            )
        mid = int(value)
        m = db.query(Manufacturer).filter(Manufacturer.id == mid, Manufacturer.tenant_id == tenant_id).first()
        if not m:
            raise HTTPException(status_code=400, detail="Invalid manufacturer_id for tenant")
        return (
            db.query(Product)
            .filter(filt)
            .update(
                {Product.manufacturer_id: mid, Product.manufacturer: m.name},
                synchronize_session=False,
            )
        )

    if act == "set_supplier":
        if value is None:
            return db.query(Product).filter(filt).update({Product.default_supplier_id: None}, synchronize_session=False)
        sid = int(value)
        s = db.query(Supplier).filter(Supplier.id == sid, Supplier.tenant_id == tenant_id).first()
        if not s:
            raise HTTPException(status_code=400, detail="Invalid default_supplier_id for tenant")
        n = db.query(Product).filter(filt).update({Product.default_supplier_id: sid}, synchronize_session=False)
        for pr in db.query(Product).filter(filt).all():
            _ensure_supplier_product_link(db, pr)
        return n

    if act == "set_price":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="value must be object with field and amount")
        field = str(value.get("field") or "").strip().lower()
        if field not in ("sale_price", "purchase_price"):
            raise HTTPException(status_code=400, detail="field must be sale_price or purchase_price")
        try:
            amt = float(value.get("amount"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="amount must be a number")
        if amt < 0:
            raise HTTPException(status_code=400, detail="amount must be >= 0")
        col = Product.sale_price if field == "sale_price" else Product.purchase_price
        amt_r = _round_float(amt, 2)
        return db.query(Product).filter(filt).update({col: amt_r}, synchronize_session=False)

    if act == "increase_price_percent":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="value must be object with field and percent")
        field = str(value.get("field") or "").strip().lower()
        if field not in ("sale_price", "purchase_price"):
            raise HTTPException(status_code=400, detail="field must be sale_price or purchase_price")
        try:
            pct = float(value.get("percent"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="percent must be a number")
        col = Product.sale_price if field == "sale_price" else Product.purchase_price
        factor = 1.0 + (pct / 100.0)
        return db.query(Product).filter(filt).update({col: col * factor}, synchronize_session=False)

    if act == "set_vat_rate":
        token = str(value or "").strip().lower()
        if token not in _BULK_VAT_RATE_TOKENS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid VAT token. Allowed: {sorted(_BULK_VAT_RATE_TOKENS)}",
            )
        rows = db.query(Product).filter(filt).all()
        n = 0
        for p in rows:
            meta = _safe_parse_metadata_json(getattr(p, "metadata_json", None))
            if meta is None:
                meta = {}
            ui = meta.get("product_ui")
            if not isinstance(ui, dict):
                ui = {}
            ui["vat_rate"] = token
            meta["product_ui"] = ui
            p.metadata_json = json.dumps(meta, ensure_ascii=False)
            n += 1
        return n

    if act == "set_weight":
        try:
            w = float(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="value must be weight in kg (number)")
        if w < 0:
            raise HTTPException(status_code=400, detail="weight must be >= 0")
        w_r = _round_float(w, 3)
        return db.query(Product).filter(filt).update({Product.weight: w_r}, synchronize_session=False)

    if act == "set_dimensions":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="value must be object with length_cm, width_cm, height_cm")
        try:
            L = float(value.get("length_cm"))
            W = float(value.get("width_cm"))
            H = float(value.get("height_cm"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="length_cm, width_cm, height_cm must be numbers")
        if L <= 0 or W <= 0 or H <= 0:
            raise HTTPException(status_code=400, detail="dimensions must be > 0")
        vol = round((L * W * H) / 1000.0, 2)
        return (
            db.query(Product)
            .filter(filt)
            .update(
                {
                    Product.length: round(L, 2),
                    Product.width: round(W, 2),
                    Product.height: round(H, 2),
                    Product.volume: vol,
                },
                synchronize_session=False,
            )
        )

    if act == "set_min_stock":
        if not isinstance(value, dict):
            raise HTTPException(status_code=400, detail="value must be object with min_total_stock")
        try:
            m = float(value.get("min_total_stock"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="min_total_stock must be a number")
        if m < 0:
            raise HTTPException(status_code=400, detail="min_total_stock must be >= 0")
        alert = value.get("enable_stock_alert")
        if alert is None:
            alert = True
        return (
            db.query(Product)
            .filter(filt)
            .update(
                {
                    Product.min_total_stock: _round_float(m, 2),
                    Product.enable_stock_alert: bool(alert),
                },
                synchronize_session=False,
            )
        )

    if act == "patch_logistics_fields":
        from ..services.product_bulk_logistics_patch import apply_product_logistics_patch

        return apply_product_logistics_patch(db, filt, value)

    if act == "clear_logistics_data":
        from ..services.product_bulk_logistics_patch import apply_clear_unit_logistics

        return apply_clear_unit_logistics(db, filt)

    if act == "toggle_master_carton_pack":
        from ..services.product_bulk_logistics_patch import apply_toggle_master_carton_pack

        return apply_toggle_master_carton_pack(db, filt, value)

    raise HTTPException(status_code=400, detail="Unhandled action")


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


def _inventory_payload_for_product_ids(
    db: Session,
    product_ids: list[int],
    *,
    warehouse_id: Optional[int] = None,
) -> tuple[dict[int, list[dict]], dict[int, list[dict]]]:
    """
    From `inventory` table only: legacy `locations` (badges) + canonical `inventory` rows for qty > 0.
    Location/Bin resolution uses include_inactive so rows are not dropped when a bin/location is inactive.
    """
    if not product_ids:
        return {}, {}
    inv_q = db.query(Inventory).filter(
        Inventory.product_id.in_(product_ids),
        Inventory.quantity > 0,
    )
    if warehouse_id is not None:
        inv_q = inv_q.filter(Inventory.warehouse_id == int(warehouse_id))
    inv_rows = inv_q.order_by(Inventory.product_id, Inventory.id).all()
    if not inv_rows:
        return {}, {}
    loc_ids = {int(r.location_id) for r in inv_rows}
    carrier_ids = {int(r.carrier_id) for r in inv_rows if getattr(r, "carrier_id", None) is not None}
    loc_objs = (
        db.query(Location)
        .filter(Location.id.in_(loc_ids))
        .execution_options(include_inactive=True)
        .all()
    )
    loc_by_id: dict[int, Location] = {int(loc.id): loc for loc in loc_objs}
    car_by_id: dict[int, WarehouseCarrier] = {}
    if carrier_ids:
        car_objs = db.query(WarehouseCarrier).filter(WarehouseCarrier.id.in_(carrier_ids)).all()
        car_by_id = {int(c.id): c for c in car_objs}
    uuids: set[str] = set()
    for loc in loc_objs:
        u = (getattr(loc, "location_uuid", None) or "").strip()
        if u:
            uuids.add(u)
    for r in inv_rows:
        loc = loc_by_id.get(int(r.location_id))
        u = (getattr(r, "location_uuid", None) or "").strip()
        if not u and loc is not None:
            u = (getattr(loc, "location_uuid", None) or "").strip()
        if u:
            uuids.add(u)
    bin_type_by_uuid: dict[str, object] = {}
    if uuids:
        for bu, st in (
            db.query(Bin.location_uuid, Bin.storage_type)
            .filter(Bin.location_uuid.in_(uuids))
            .execution_options(include_inactive=True)
            .all()
        ):
            u = (bu or "").strip()
            if u and u not in bin_type_by_uuid:
                bin_type_by_uuid[u] = st

    serial_groups_by_pid = list_on_hand_serial_groups_for_products(db, product_ids)

    locations_out: dict[int, list[dict]] = {}
    inventory_out: dict[int, list[dict]] = {}
    serial_matched: dict[int, set[tuple]] = {}

    def _attach_serials(pid: int, row_dict: dict) -> None:
        loc_id = int(row_dict.get("location_id") or 0)
        cid = row_dict.get("warehouse_carrier_id")
        cid_i = int(cid) if cid is not None and int(cid) > 0 else 0
        bn = normalize_batch_number(row_dict.get("batch") or "")
        exp_raw = row_dict.get("expiry")
        if exp_raw:
            try:
                ed = date.fromisoformat(str(exp_raw)[:10])
            except ValueError:
                ed = NO_EXPIRY_SENTINEL
        else:
            ed = NO_EXPIRY_SENTINEL
        sd = normalize_stock_disposition(row_dict.get("stock_disposition"))
        key = (loc_id, cid_i, bn, ed, sd)
        for g in serial_groups_by_pid.get(pid, []):
            g_loc = int(g["location_id"]) if g.get("location_id") is not None else 0
            g_cid = int(g["warehouse_carrier_id"]) if g.get("warehouse_carrier_id") is not None else 0
            g_bn = normalize_batch_number(g.get("batch") or "")
            g_exp = g.get("expiry")
            if g_exp:
                try:
                    g_ed = date.fromisoformat(str(g_exp)[:10])
                except ValueError:
                    g_ed = NO_EXPIRY_SENTINEL
            else:
                g_ed = NO_EXPIRY_SENTINEL
            g_sd = normalize_stock_disposition(g.get("stock_disposition"))
            if (g_loc, g_cid, g_bn, g_ed, g_sd) != key:
                continue
            row_dict["serial_numbers"] = g.get("serial_numbers") or []
            row_dict["inventory_serial_ids"] = g.get("inventory_serial_ids") or []
            row_dict["serial_range_label"] = g.get("serial_range_label")
            serial_matched.setdefault(pid, set()).add(
                (g_loc, g_cid, g_bn, g_ed, g_sd)
            )
            break

    for r in inv_rows:
        pid = int(r.product_id)
        loc = loc_by_id.get(int(r.location_id))
        qty = float(r.quantity) if r.quantity is not None else 0.0
        u = (getattr(r, "location_uuid", None) or "").strip()
        if not u and loc is not None:
            u = (getattr(loc, "location_uuid", None) or "").strip()
        if u and u in bin_type_by_uuid:
            st = normalize_storage_type(bin_type_by_uuid[u])
        else:
            st = UNKNOWN_STORAGE_TYPE
        loc_name = (loc.name or "").strip() if loc is not None else ""
        if loc is not None and should_hide_legacy_csv_import_inventory_location(
            loc_name=loc_name,
            loc_type=getattr(loc, "type", None),
            location_type=getattr(loc, "location_type", None),
            location_uuid=getattr(loc, "location_uuid", None),
        ):
            continue
        loc_code = loc_name or (f"#{r.location_id}" if r.location_id is not None else "—")
        bn = normalize_batch_number(getattr(r, "batch_number", None))
        ed = getattr(r, "expiry_date", None) or NO_EXPIRY_SENTINEL
        sd_raw = getattr(r, "stock_disposition", None)
        sd = normalize_stock_disposition(sd_raw)
        dmg_fields = inventory_damage_trace_dict(db, r)
        dmg_class = (getattr(r, "damage_class", None) or dmg_fields.get("damage_class") or "").strip().upper() or None
        disp_badge = dmg_fields.get("disposition_badge") or damaged_inventory_badge_label(sd, dmg_class)
        batch_out = bn or None
        expiry_out: str | None
        if isinstance(ed, date) and ed >= NO_EXPIRY_SENTINEL:
            expiry_out = None
        elif isinstance(ed, date):
            expiry_out = ed.isoformat()
        else:
            expiry_out = None

        cid = getattr(r, "carrier_id", None)
        wc = car_by_id.get(int(cid)) if cid is not None else None
        carrier_code = (wc.code or "").strip() if wc is not None else None
        carrier_barcode = (wc.barcode or "").strip() if wc is not None else None
        carrier_mixed = bool(getattr(wc, "is_mixed", False)) if wc is not None else False
        if pid not in locations_out:
            locations_out[pid] = []
        locations_out[pid].append({
            "id": int(r.location_id),
            "code": loc_code,
            "name": loc_name or None,
            "quantity": qty,
            "warehouse_id": r.warehouse_id,
            "storage_type": st,
            "location_uuid": u if u else None,
            "stock_disposition": sd,
            "disposition_badge": disp_badge,
            "damage_class": dmg_class,
            "damage_trace": dmg_fields.get("damage_trace"),
            "warehouse_carrier_id": int(cid) if cid is not None else None,
            "carrier_code": carrier_code,
            "carrier_barcode": carrier_barcode,
            "carrier_is_mixed": carrier_mixed,
        })
        if pid not in inventory_out:
            inventory_out[pid] = []
        inv_row = {
            "inventory_id": int(r.id),
            "location_id": int(r.location_id),
            "location_code": loc_code,
            "location_type": st,
            "quantity": qty,
            "batch": batch_out,
            "expiry": expiry_out,
            "warehouse_id": int(r.warehouse_id),
            "location_uuid": u if u else None,
            "stock_disposition": sd,
            "disposition_badge": disp_badge,
            "damage_class": dmg_class,
            "damage_trace": dmg_fields.get("damage_trace"),
            "warehouse_carrier_id": int(cid) if cid is not None else None,
            "carrier_code": carrier_code,
            "carrier_barcode": carrier_barcode,
            "carrier_is_mixed": carrier_mixed,
        }
        _attach_serials(pid, inv_row)
        inventory_out[pid].append(inv_row)

    extra_loc_ids: set[int] = set()
    for groups in serial_groups_by_pid.values():
        for g in groups:
            lid = g.get("location_id")
            if lid is not None and int(lid) > 0 and int(lid) not in loc_by_id:
                extra_loc_ids.add(int(lid))
    if extra_loc_ids:
        for loc in (
            db.query(Location)
            .filter(Location.id.in_(extra_loc_ids))
            .execution_options(include_inactive=True)
            .all()
        ):
            loc_by_id[int(loc.id)] = loc
            u = (getattr(loc, "location_uuid", None) or "").strip()
            if u:
                uuids.add(u)
        if uuids:
            for bu, st in (
                db.query(Bin.location_uuid, Bin.storage_type)
                .filter(Bin.location_uuid.in_(uuids))
                .execution_options(include_inactive=True)
                .all()
            ):
                u = (bu or "").strip()
                if u and u not in bin_type_by_uuid:
                    bin_type_by_uuid[u] = st

    # Serial groups without matching inventory row (e.g. only in inventory_serials).
    for pid, groups in serial_groups_by_pid.items():
        matched = serial_matched.get(pid, set())
        for g in groups:
            g_loc = int(g["location_id"]) if g.get("location_id") is not None else 0
            g_cid = int(g["warehouse_carrier_id"]) if g.get("warehouse_carrier_id") is not None else 0
            g_bn = normalize_batch_number(g.get("batch") or "")
            g_exp = g.get("expiry")
            if g_exp:
                try:
                    g_ed = date.fromisoformat(str(g_exp)[:10])
                except ValueError:
                    g_ed = NO_EXPIRY_SENTINEL
            else:
                g_ed = NO_EXPIRY_SENTINEL
            g_sd = normalize_stock_disposition(g.get("stock_disposition"))
            key = (g_loc, g_cid, g_bn, g_ed, g_sd)
            if key in matched:
                continue
            loc = loc_by_id.get(g_loc) if g_loc > 0 else None
            if loc is not None:
                loc_name = (loc.name or "").strip()
                if should_hide_legacy_csv_import_inventory_location(
                    loc_name=loc_name,
                    loc_type=getattr(loc, "type", None),
                    location_type=getattr(loc, "location_type", None),
                    location_uuid=getattr(loc, "location_uuid", None),
                ):
                    continue
                loc_code = loc_name or f"#{g_loc}"
                u = (getattr(loc, "location_uuid", None) or "").strip()
                if u and u in bin_type_by_uuid:
                    st = normalize_storage_type(bin_type_by_uuid[u])
                else:
                    st = UNKNOWN_STORAGE_TYPE
            else:
                loc_code = f"#{g_loc}" if g_loc > 0 else "—"
                st = UNKNOWN_STORAGE_TYPE
                u = ""
            wc = car_by_id.get(g_cid) if g_cid > 0 else None
            inventory_out.setdefault(pid, []).append(
                {
                    "inventory_id": None,
                    "inventory_serial_ids": g.get("inventory_serial_ids") or [],
                    "location_id": g_loc,
                    "location_code": loc_code,
                    "location_type": st,
                    "quantity": float(g.get("quantity") or 0),
                    "batch": g.get("batch"),
                    "expiry": g.get("expiry"),
                    "warehouse_id": (
                        int(loc.warehouse_id)
                        if loc is not None and getattr(loc, "warehouse_id", None)
                        else (int(g["warehouse_id"]) if g.get("warehouse_id") else None)
                    ),
                    "location_uuid": u if u else None,
                    "stock_disposition": g_sd,
                    "disposition_badge": stock_disposition_display_badge(g_sd),
                    "warehouse_carrier_id": g_cid if g_cid > 0 else None,
                    "carrier_code": (wc.code or "").strip() if wc is not None else None,
                    "carrier_barcode": (wc.barcode or "").strip() if wc is not None else None,
                    "carrier_is_mixed": bool(getattr(wc, "is_mixed", False)) if wc is not None else False,
                    "serial_numbers": g.get("serial_numbers") or [],
                    "serial_range_label": g.get("serial_range_label"),
                }
            )
    return locations_out, inventory_out


def _safe_parse_metadata_json(raw: Optional[str]) -> Optional[dict]:
    if not raw or not str(raw).strip():
        return None
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _resolved_product_stack_from_body(body: ProductBody) -> dict:
    """Map API body to legacy product columns. Prefer explicit product_* over deprecated orientation_type / … when both sent."""
    fs = getattr(body, "model_fields_set", set()) or set()

    def pick(new_key: str, old_key: str):
        if new_key in fs:
            return getattr(body, new_key)
        if old_key in fs:
            return getattr(body, old_key)
        nv, ov = getattr(body, new_key), getattr(body, old_key)
        return nv if nv is not None else ov

    o = pick("product_orientation_type", "orientation_type")
    sh = pick("product_shape_type", "shape_type")
    sc = pick("product_stack_compressible", "stack_compressible")
    ch = pick("product_compressed_height_cm", "compressed_height_cm")
    mw = pick("product_max_stack_weight", "max_stack_weight")
    sb = pick("product_stack_behavior", "stack_behavior")
    return {
        "orientation_type": (o or "").strip() or None if isinstance(o, str) else o,
        "shape_type": (sh or "").strip() or None if isinstance(sh, str) else sh,
        "stack_compressible": sc,
        "compressed_height_cm": ch,
        "max_stack_weight": mw,
        "stack_behavior": (sb or "").strip() or None if isinstance(sb, str) else sb,
    }


def _round_float(v: Optional[float], decimals: int) -> Optional[float]:
    if v is None:
        return None
    try:
        return round(float(v), decimals)
    except (TypeError, ValueError):
        return None


def _safe_product_float(value: object) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _product_to_dict(p: Product) -> dict:
    """Serialize product to dict with assigned_locations as list for API response. Volume always rounded to 2 decimals."""
    vol = _round_float(_safe_product_float(p.volume), 2)
    sale_float = _round_float(_safe_product_float(getattr(p, "sale_price", None)), 2)
    purchase_float = _round_float(_safe_product_float(getattr(p, "purchase_price", None)), 2)
    prev_purchase_float = _round_float(_safe_product_float(getattr(p, "previous_purchase_price", None)), 2)
    purchase_orig_float = _round_float(_safe_product_float(getattr(p, "purchase_price_original", None)), 4)
    mn_pick = getattr(p, "min_pick_quantity", None)
    mx_pick = getattr(p, "max_pick_quantity", None)
    esa = getattr(p, "enable_stock_alert", None)
    mts = getattr(p, "min_total_stock", None)
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
        "extra_cost_packaging_net": _round_float(float(getattr(p, "extra_cost_packaging_net", 0) or 0), 2),
        "extra_cost_commission_percent": _round_float(float(getattr(p, "extra_cost_commission_percent", 0) or 0), 2),
        "extra_cost_other_net": _round_float(float(getattr(p, "extra_cost_other_net", 0) or 0), 2),
        "previous_purchase_price": prev_purchase_float,
        "purchase_price_original": purchase_orig_float,
        "purchase_currency": (getattr(p, "purchase_currency", None) or "").strip() or None,
        "last_purchase_date": getattr(p, "last_purchase_date", None).isoformat()
        if getattr(p, "last_purchase_date", None) is not None
        else None,
        "last_supplier_id": int(lsid) if (lsid := getattr(p, "last_supplier_id", None)) is not None else None,
        "last_purchase_currency": (getattr(p, "last_purchase_currency", None) or "").strip() or None,
        "sale_price": sale_float,
        "manufacturer": getattr(p, "manufacturer", None),
        "manufacturer_id": getattr(p, "manufacturer_id", None),
        "default_supplier_id": int(ds) if (ds := getattr(p, "default_supplier_id", None)) is not None else None,
        "unit": getattr(p, "unit", None),
        "catalog_number": getattr(p, "catalog_number", None),
        "metadata_json": _safe_parse_metadata_json(getattr(p, "metadata_json", None)),
        "image_url": p.image_url,
        "assigned_locations": _parse_assigned_locations(p.assigned_locations),
        "label_template_id": getattr(p, "label_template_id", None),
        # Single-unit stacking (canonical names)
        "product_orientation_type": getattr(p, "orientation_type", None),
        "product_shape_type": getattr(p, "shape_type", None),
        "product_stack_compressible": getattr(p, "stack_compressible", None),
        "product_compressed_height_cm": getattr(p, "compressed_height_cm", None),
        "product_max_stack_weight": getattr(p, "max_stack_weight", None),
        "product_stack_behavior": getattr(p, "stack_behavior", None),
        # Deprecated aliases — same columns as product_* (backward compatible clients)
        "orientation_type": getattr(p, "orientation_type", None),
        "shape_type": getattr(p, "shape_type", None),
        "stack_compressible": getattr(p, "stack_compressible", None),
        "compressed_height_cm": getattr(p, "compressed_height_cm", None),
        "max_stack_weight": getattr(p, "max_stack_weight", None),
        "stack_behavior": getattr(p, "stack_behavior", None),
        # Carton stacking
        "carton_orientation_type": getattr(p, "carton_orientation_type", None),
        "carton_shape_type": getattr(p, "carton_shape_type", None),
        "carton_stack_compressible": getattr(p, "carton_stack_compressible", None),
        "carton_compressed_height_cm": getattr(p, "carton_compressed_height_cm", None),
        "carton_max_stack_weight": getattr(p, "carton_max_stack_weight", None),
        "carton_stack_behavior": getattr(p, "carton_stack_behavior", None),
        "min_pick_quantity": _round_float(float(mn_pick), 2) if mn_pick is not None else None,
        "max_pick_quantity": _round_float(float(mx_pick), 2) if mx_pick is not None else None,
        "min_reserve_quantity": _round_float(float(getattr(p, "min_reserve_quantity", None)), 2)
        if getattr(p, "min_reserve_quantity", None) is not None
        else None,
        "max_reserve_quantity": _round_float(float(getattr(p, "max_reserve_quantity", None)), 2)
        if getattr(p, "max_reserve_quantity", None) is not None
        else None,
        "enable_stock_alert": bool(esa) if esa is not None else False,
        "min_total_stock": _round_float(float(mts), 2) if mts is not None else None,
        "bulk_ean": (getattr(p, "bulk_ean", None) or "").strip() or None,
        "units_per_carton": _round_float(float(upc), 2)
        if (upc := getattr(p, "units_per_carton", None)) is not None
        else None,
        "carton_length_cm": _round_float(float(cl), 2) if (cl := getattr(p, "carton_length_cm", None)) is not None else None,
        "carton_width_cm": _round_float(float(cw), 2) if (cw := getattr(p, "carton_width_cm", None)) is not None else None,
        "carton_height_cm": _round_float(float(ch), 2) if (ch := getattr(p, "carton_height_cm", None)) is not None else None,
        "carton_weight_kg": _round_float(float(cwg), 3) if (cwg := getattr(p, "carton_weight_kg", None)) is not None else None,
        "carton_volume_dm3": _round_float(float(cv), 2) if (cv := getattr(p, "carton_volume_dm3", None)) is not None else None,
        "track_batch": bool(getattr(p, "track_batch", False)),
        "track_expiry": bool(getattr(p, "track_expiry", False)),
        "track_serial": bool(getattr(p, "track_serial", False)),
        "require_recv_height": bool(getattr(p, "require_recv_height", False)),
        "require_recv_width": bool(getattr(p, "require_recv_width", False)),
        "require_recv_length": bool(getattr(p, "require_recv_length", False)),
        "require_recv_weight": bool(getattr(p, "require_recv_weight", False)),
        "require_recv_master_carton": bool(getattr(p, "require_recv_master_carton", False)),
        "require_recv_master_carton_ean": bool(getattr(p, "require_recv_master_carton_ean", False)),
        "require_recv_master_carton_qty": bool(getattr(p, "require_recv_master_carton_qty", False)),
        "require_recv_master_carton_dims": bool(getattr(p, "require_recv_master_carton_dims", False)),
        "require_recv_master_carton_weight": bool(getattr(p, "require_recv_master_carton_weight", False)),
    }


def _product_ui_gpsr_from_metadata(metadata_json: Optional[str]) -> tuple[str, str]:
    parsed = _safe_parse_metadata_json(metadata_json)
    if not parsed or not isinstance(parsed, dict):
        return "", ""
    ui = parsed.get("product_ui")
    if not isinstance(ui, dict):
        return "", ""
    return (
        str(ui.get("responsible_person") or "").strip(),
        str(ui.get("responsible_person_email") or "").strip(),
    )


def _enrich_product_manufacturer(db: Session, d: dict, p: Product) -> None:
    """Add manufacturer_brief + effective GPSR (product metadata overrides manufacturer)."""
    mid = getattr(p, "manufacturer_id", None)
    m = None
    if mid is not None:
        m = (
            db.query(Manufacturer)
            .filter(Manufacturer.id == int(mid), Manufacturer.tenant_id == p.tenant_id)
            .first()
        )
    pn, pe = _product_ui_gpsr_from_metadata(getattr(p, "metadata_json", None))
    mn = (m.responsible_person_name or "").strip() if m else ""
    me = (m.responsible_person_email or "").strip() if m else ""
    logo = (m.logo_url or "").strip() if m and m.logo_url else None
    d["manufacturer_id"] = int(mid) if mid is not None else None
    d["manufacturer_brief"] = (
        {"id": int(m.id), "name": (m.name or "").strip() or None, "logo_url": logo or None}
        if m
        else None
    )
    d["gpsr_responsible_name"] = pn or mn or None
    d["gpsr_responsible_email"] = pe or me or None


def _enrich_product_default_supplier(db: Session, d: dict, p: Product) -> None:
    sid = getattr(p, "default_supplier_id", None)
    if sid is None:
        d["default_supplier_brief"] = None
        return
    s = db.query(Supplier).filter(Supplier.id == int(sid), Supplier.tenant_id == p.tenant_id).first()
    d["default_supplier_brief"] = (
        {"id": int(s.id), "name": (s.name or "").strip() or None} if s else None
    )


def _enrich_product_last_supplier(db: Session, d: dict, p: Product) -> None:
    sid = getattr(p, "last_supplier_id", None)
    if sid is None:
        d["last_supplier_brief"] = None
        return
    s = db.query(Supplier).filter(Supplier.id == int(sid), Supplier.tenant_id == p.tenant_id).first()
    d["last_supplier_brief"] = (
        {"id": int(s.id), "name": (s.name or "").strip() or None} if s else None
    )


def _ensure_supplier_product_link(db: Session, product: Product) -> None:
    """When default supplier is set, ensure a ``supplier_products`` row exists (PO catalog + price)."""
    sid = getattr(product, "default_supplier_id", None)
    if sid is None:
        return
    exists_row = (
        db.query(SupplierProduct.id)
        .filter(
            SupplierProduct.product_id == product.id,
            SupplierProduct.supplier_id == int(sid),
        )
        .first()
    )
    if exists_row:
        return
    pp = getattr(product, "purchase_price", None)
    db.add(
        SupplierProduct(
            tenant_id=product.tenant_id,
            supplier_id=int(sid),
            product_id=product.id,
            purchase_price=pp,
            lead_time_days=None,
            min_order_qty=None,
        )
    )
    db.flush()


def _enrich_product_supplier_catalog_links(db: Session, d: dict, p: Product) -> None:
    pairs = (
        db.query(SupplierProduct, Supplier)
        .join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .filter(SupplierProduct.product_id == p.id, Supplier.tenant_id == p.tenant_id)
        .order_by(Supplier.name.asc())
        .all()
    )
    links = []
    ds = getattr(p, "default_supplier_id", None)
    for sp, s in pairs:
        if sp is None or s is None:
            continue
        try:
            spp = sp.purchase_price
            moq = sp.min_order_qty
            links.append(
                {
                    "id": int(sp.id),
                    "supplier_id": int(sp.supplier_id),
                    "supplier_name": (s.name or "").strip() if s else "",
                    "purchase_price": _round_float(float(spp), 4) if spp is not None else None,
                    "lead_time_days": int(sp.lead_time_days) if sp.lead_time_days is not None else None,
                    "min_order_qty": _round_float(float(moq), 4) if moq is not None else None,
                    "is_default": ds is not None and int(ds) == int(sp.supplier_id),
                }
            )
        except (TypeError, ValueError):
            continue
    d["supplier_catalog_links"] = links


def _attach_supplier_offers_to_product_dicts(
    db: Session,
    items: List[dict],
    product_rows: List[Product],
    supplier_id: int,
) -> None:
    """For purchase-order product search: per-hit offer from ``supplier_products`` (+ fallback price)."""
    if not product_rows:
        return
    pids = [p.id for p in product_rows]
    sid = int(supplier_id)
    sp_rows = (
        db.query(SupplierProduct)
        .filter(SupplierProduct.supplier_id == sid, SupplierProduct.product_id.in_(pids))
        .all()
    )
    by_pid = {r.product_id: r for r in sp_rows}
    for d, p in zip(items, product_rows):
        row = by_pid.get(p.id)
        catalog_pp = float(row.purchase_price) if row and row.purchase_price is not None else None
        master_pp = getattr(p, "purchase_price", None)
        master_f = float(master_pp) if master_pp is not None else None
        display_pp = catalog_pp if catalog_pp is not None else master_f
        d["supplier_offer"] = {
            "supplier_id": sid,
            "purchase_price": display_pp,
            "lead_time_days": int(row.lead_time_days) if row and row.lead_time_days is not None else None,
            "min_order_qty": float(row.min_order_qty) if row and row.min_order_qty is not None else None,
            "from_catalog_row": row is not None,
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
    *,
    bypass_sync_disable: bool = False,
) -> None:
    """
    Sync inventory with product.assigned_locations: one inventory row per assigned location.
    Resolves location by locationUUID only; updates or creates inventory;
    removes inventory rows in the same warehouse that are no longer in assigned_locations.

    When DISABLE_ASSIGNED_LOCATIONS_INVENTORY_SYNC is set, this no-ops unless
    bypass_sync_disable=True (explicit bridge endpoint).
    """
    if (
        not bypass_sync_disable
        and pr_flags.disable_assigned_locations_inventory_sync
    ):
        logger.info(
            "_sync_inventory_from_assigned_locations skipped (sync disabled)",
            extra={
                "product_id": product.id,
                "tenant_id": product.tenant_id,
                "bypass_sync_disable": bypass_sync_disable,
                "disable_assigned_locations_inventory_sync": pr_flags.disable_assigned_locations_inventory_sync,
            },
        )
        return
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
        raw_uuid = ent.get("locationUUID")
        if not isinstance(raw_uuid, str) or not raw_uuid.strip():
            raise HTTPException(
                status_code=400,
                detail="assigned_locations entries must include non-empty locationUUID",
            )
        location_uuid = raw_uuid.strip()
        loc = (
            db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.location_uuid == location_uuid,
            )
            .first()
        )
        if not loc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid locationUUID in assigned_locations: {location_uuid}",
            )
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
                Inventory.stock_disposition == DEFAULT_STOCK_DISPOSITION,
            )
            .first()
        )
        if existing:
            existing.quantity = qty
            if existing.warehouse_id != warehouse_id:
                existing.warehouse_id = warehouse_id
            existing.location_uuid = location_uuid
        else:
            inv = Inventory(
                tenant_id=tenant_id,
                product_id=product_id,
                warehouse_id=warehouse_id,
                location_id=loc.id,
                location_uuid=location_uuid,
                quantity=qty,
                stock_disposition=DEFAULT_STOCK_DISPOSITION,
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


@router.get("/by-ean/{ean}", response_model=ProductIdByEanResponse)
def get_product_id_by_ean(
    ean: str,
    tenant_id: int = Query(..., ge=1, description="Zakres tenanta"),
    db: Session = Depends(get_db),
):
    """
    Jednoznaczne ID produktu po **dokładnym** EAN (trim, bez wielkości liter).
    Zwraca 404 gdy brak, 409 gdy wiele rekordów z tym samym EAN.
    """
    code = (ean or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Pusty EAN.")

    needle = code.lower()
    q = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            Product.ean.isnot(None),
            func.lower(func.trim(Product.ean)) == needle,
        )
    )
    cnt = q.count()
    if cnt == 0:
        raise HTTPException(status_code=404, detail="Nie znaleziono produktu dla podanego EAN.")
    if cnt > 1:
        raise HTTPException(
            status_code=409,
            detail="Wiele produktów z tym samym EAN — zawęź wyszukiwanie ręcznie.",
        )
    row = q.first()
    assert row is not None
    return ProductIdByEanResponse(id=int(row.id))


@router.get("/")
def get_products(
    tenant_id: Optional[int] = None,
    warehouse_id: Optional[int] = Query(None, ge=1),
    manufacturer_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
    ean: Optional[str] = None,
    name: Optional[str] = None,
    symbol: Optional[str] = None,
    search: Optional[str] = Query(
        None,
        description="Single term matched against name, symbol (SKU), or EAN (OR). When set, ignores name/ean/symbol filters.",
    ),
    volume_min: Optional[float] = None,
    volume_max: Optional[float] = None,
    weight_min: Optional[float] = None,
    weight_max: Optional[float] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    sort_by: Optional[str] = None,
    sort_dir: Optional[str] = None,
    default_supplier_id: Optional[int] = Query(
        None,
        ge=1,
        description="When set, only products in this supplier's catalog (supplier_products or legacy default supplier). Response includes supplier_offer for PO pricing.",
    ),
):
    """
    Lista produktów z filtrowaniem, sortowaniem (sort_by, sort_dir: asc|desc) i paginacją.
    tenant_id optional: when provided, only products for that tenant; when omitted, all products.
    """
    q = db.query(Product).filter(Product.deleted_at.is_(None))
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    if manufacturer_id is not None:
        q = q.filter(Product.manufacturer_id == manufacturer_id)
    if default_supplier_id is not None:
        q = apply_supplier_product_filter(q, default_supplier_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(term),
                Product.symbol.ilike(term),
                Product.ean.ilike(term),
            )
        )
    else:
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

    if sort_by == "inventory_value" and tenant_id is not None:
        iv_expr = _inventory_value_sql_expr(tenant_id)
        is_null = case((iv_expr.is_(None), 1), else_=0)
        if sort_dir == "desc":
            q = q.order_by(is_null.asc(), iv_expr.desc())
        else:
            q = q.order_by(is_null.asc(), iv_expr.asc())
    elif sort_by == "inventory_value":
        q = q.order_by(Product.id.desc() if sort_dir == "desc" else Product.id.asc())
    elif sort_by and sort_by in SORT_FIELDS and sort_by != "inventory_value":
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

    from ..services.product_inventory_display_service import apply_inventory_display_to_dict

    sales_map = {}  # product_id -> (sales_30d: int, rotation_30d: float)
    if rows:
        product_ids = [p.id for p in rows]

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

    avg_map: dict[int, Optional[float]] = {}
    if rows:
        if tenant_id is not None:
            avg_map = _receipt_weighted_avg_price_by_product(db, tenant_id, [p.id for p in rows])
        else:
            by_tenant: dict[int, List[int]] = defaultdict(list)
            for p in rows:
                by_tenant[int(p.tenant_id)].append(p.id)
            for tid, pids in by_tenant.items():
                part = _receipt_weighted_avg_price_by_product(db, tid, pids)
                avg_map.update(part)

    items = []
    for p in rows:
        d = _product_to_dict(p)
        _enrich_product_manufacturer(db, d, p)
        _enrich_product_default_supplier(db, d, p)
        _enrich_product_last_supplier(db, d, p)
        apply_inventory_display_to_dict(
            db,
            d,
            p,
            warehouse_id=warehouse_id,
            log_tag="product.list.stock",
            include_disposition_stock=False,
        )
        stock_qty = int(d.get("stock_quantity") or 0)
        avg = avg_map.get(p.id)
        d["average_purchase_price"] = avg
        if stock_qty <= 0:
            d["inventory_value"] = 0.0
        elif avg is None:
            d["inventory_value"] = None
        else:
            d["inventory_value"] = float(stock_qty) * float(avg)
        s30, rot = sales_map.get(p.id, (0, 0.0))
        d["sales_30d"] = s30
        d["rotation_30d"] = rot
        if rot and rot > 0:
            d["days_of_stock"] = int(round(stock_qty / rot))
        else:
            d["days_of_stock"] = None
        items.append(d)

    if items and tenant_id is not None:
        from ..services.product_inventory_display_service import attach_disposition_stock_to_product_dicts

        attach_disposition_stock_to_product_dicts(
            db, tenant_id=int(tenant_id), warehouse_id=warehouse_id, product_dicts=items
        )

    if default_supplier_id is not None and items:
        _attach_supplier_offers_to_product_dicts(db, items, rows, default_supplier_id)

    if use_pagination:
        return {"items": items, "total": total}
    return items


@router.get("/{product_id}/replacement-suggestions", response_model=ReplacementSuggestionsResponse)
def get_replacement_suggestions(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    q: Optional[str] = Query(None, description="Fraza wyszukiwania (nazwa / SKU / EAN)"),
    same_manufacturer: bool = Query(False),
    same_size: bool = Query(False),
    same_category: bool = Query(False),
    available_only: bool = Query(False),
    show_similar: bool = Query(True),
    show_all_products: bool = Query(False),
    debug: bool = Query(False),
    limit: int = Query(30, ge=1, le=80),
    db: Session = Depends(get_db),
):
    src = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .first()
    )
    if src is None:
        raise HTTPException(status_code=404, detail="Produkt źródłowy nie istnieje.")
    wh_id = int(warehouse_id or 0)
    src_category = _product_category_from_meta(getattr(src, "metadata_json", None))
    src_category_id = _product_category_id_from_meta(getattr(src, "metadata_json", None))
    src_dims = _product_dimensions_key(src)
    src_tokens = _extract_tokens(str(getattr(src, "name", "") or ""))
    src_primary = _primary_token(src_tokens)
    src_tokens_no_noise = list(src_tokens)
    src_dim_tokens = set(re.findall(r"\b\d{1,4}(?:mm|cm|m)\b", normalize_token_text(str(getattr(src, "name", "") or "")))
    )
    src_color_tokens = {t for t in src_tokens if t in _COLOR_TOKENS}
    src_ean = str(getattr(src, "ean", "") or "").strip()
    src_ean_prefix = src_ean[:7] if len(src_ean) >= 7 else src_ean[:4]
    src_sku = _normalize_token(str(getattr(src, "symbol", None) or getattr(src, "sku", None) or ""))
    src_sku_prefix = src_sku[:4] if len(src_sku) >= 4 else src_sku
    src_manufacturer = _normalize_token(str(getattr(src, "manufacturer", "") or ""))
    src_manufacturer_id = int(getattr(src, "manufacturer_id", 0) or 0)
    src_producer_names = _producer_candidates(src)

    base_q = db.query(Product).filter(
        Product.tenant_id == int(tenant_id),
        Product.deleted_at.is_(None),
        Product.id != int(src.id),
    )
    q_clean = (q or "").strip()
    has_search = bool(q_clean)
    if has_search:
        term = f"%{q_clean}%"
        base_q = base_q.filter(
            or_(
                Product.name.ilike(term),
                Product.symbol.ilike(term),
                Product.sku.ilike(term),
                Product.ean.ilike(term),
                Product.manufacturer.ilike(term),
            )
        )

    candidates: list[Product] = []
    if same_manufacturer:
        strict_q = base_q
        if src_manufacturer_id > 0:
            strict_q = strict_q.filter(Product.manufacturer_id == src_manufacturer_id)
            candidates = strict_q.limit(max(120, limit * 2)).all()
        if not candidates and src_manufacturer:
            producer_name_terms = [t for t in src_producer_names if t]
            broad = base_q.limit(max(300, limit * 4)).all()
            candidates = [
                p for p in broad
                if producer_name_terms and producer_name_terms.intersection(_producer_candidates(p))
            ]
    if not candidates:
        candidates = base_q.limit(max(120, limit * 2)).all()
    logger.info({"base_candidates_count": len(candidates), "product_id": int(product_id), "tenant_id": int(tenant_id)})
    if not candidates:
        return ReplacementSuggestionsResponse()

    candidate_ids = [int(p.id) for p in candidates]
    inv_q = db.query(
        Inventory.product_id,
        func.sum(Inventory.quantity).label("qty"),
        func.count(func.distinct(Inventory.location_id)).label("locations_count"),
    ).filter(Inventory.product_id.in_(candidate_ids), Inventory.tenant_id == int(tenant_id))
    if wh_id > 0:
        inv_q = inv_q.filter(Inventory.warehouse_id == wh_id)
    inv_rows = inv_q.group_by(Inventory.product_id).all()
    qty_map = {int(r.product_id): float(r.qty or 0) for r in inv_rows}
    loc_count_map = {int(r.product_id): int(r.locations_count or 0) for r in inv_rows}

    loc_q = (
        db.query(Inventory.product_id, Location.name, func.sum(Inventory.quantity).label("qty"))
        .join(Location, Location.id == Inventory.location_id)
        .filter(Inventory.product_id.in_(candidate_ids), Inventory.tenant_id == int(tenant_id))
    )
    if wh_id > 0:
        loc_q = loc_q.filter(Inventory.warehouse_id == wh_id)
    loc_rows = loc_q.group_by(Inventory.product_id, Location.name).all()
    top_locations: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for r in loc_rows:
        top_locations[int(r.product_id)].append((str(r.name or "—"), float(r.qty or 0)))
    loc_map: dict[int, list[str]] = {}
    for pid, vals in top_locations.items():
        vals.sort(key=lambda x: x[1], reverse=True)
        loc_map[pid] = [f"{name} ({int(round(qty))})" for name, qty in vals[:3]]

    reserved_q = (
        db.query(StockReservation.product_id, func.sum(StockReservation.quantity).label("qty"))
        .join(Location, Location.id == StockReservation.location_id)
        .filter(
            StockReservation.product_id.in_(candidate_ids),
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.status == "reserved",
        )
    )
    if wh_id > 0:
        reserved_q = reserved_q.filter(Location.warehouse_id == wh_id)
    reserved_rows = reserved_q.group_by(StockReservation.product_id).all()
    reserved_map = {int(r.product_id): float(r.qty or 0) for r in reserved_rows}

    popular_rows = (
        db.query(
            ProductSubstitution.target_product_id,
            func.sum(ProductSubstitution.usage_count).label("usage_total"),
            func.max(ProductSubstitution.last_used_at).label("last_used_at"),
        )
        .filter(ProductSubstitution.source_product_id == int(src.id))
        .filter(ProductSubstitution.warehouse_id == wh_id if wh_id > 0 else True)
        .group_by(ProductSubstitution.target_product_id)
        .order_by(func.sum(ProductSubstitution.usage_count).desc(), func.max(ProductSubstitution.last_used_at).desc())
        .limit(8)
        .all()
    )
    popular_idx = {int(r.target_product_id): r for r in popular_rows}

    match_flags: dict[int, dict[str, bool]] = {}
    candidate_debug_rows: list[dict[str, Any]] = []
    base_candidate_preview: list[dict[str, Any]] = []
    for p in candidates[:20]:
        meta = _product_meta_dict(getattr(p, "metadata_json", None))
        cand_tokens = _extract_tokens(str(getattr(p, "name", "") or ""))
        cand_primary = _primary_token(cand_tokens)
        base_candidate_preview.append(
            {
                "candidate_id": int(getattr(p, "id", 0) or 0),
                "manufacturer_id": int(getattr(p, "manufacturer_id", 0) or 0) or None,
                "manufacturer_name": str(getattr(p, "manufacturer", "") or "").strip() or None,
                "producer_name": str(meta.get("producer_name") or "").strip() or None,
                "metadata_brand": str(meta.get("brand") or "").strip() or None,
                "metadata_manufacturer": str(meta.get("manufacturer") or "").strip() or None,
                "metadata_producer_name": str(meta.get("producer_name") or "").strip() or None,
                "category_id": _product_category_id_from_meta(getattr(p, "metadata_json", None)),
                "source_primary_token": src_primary or None,
                "candidate_primary_token": cand_primary or None,
            }
        )
    logger.info("replacement_suggestions base_preview=%s", base_candidate_preview)

    def build_row(p: Product) -> Optional[ReplacementSuggestionProduct]:
        pid = int(p.id)
        stock_qty = float(qty_map.get(pid, 0.0))
        reserved_qty = float(reserved_map.get(pid, 0.0))
        available_qty = max(0.0, stock_qty - reserved_qty)
        if available_only and available_qty <= 0:
            return None

        reasons: list[str] = []
        score = 0.0
        manufacturer = str(getattr(p, "manufacturer", "") or "").strip()
        manufacturer_norm = _normalize_token(manufacturer)
        cand_manufacturer_id = int(getattr(p, "manufacturer_id", 0) or 0)
        cand_producer_names = _producer_candidates(p)
        producer_id_match = bool(src_manufacturer_id > 0 and cand_manufacturer_id > 0 and cand_manufacturer_id == src_manufacturer_id)
        producer_name_match = bool(src_producer_names and cand_producer_names and src_producer_names.intersection(cand_producer_names))
        same_producer_match = producer_id_match or producer_name_match or (
            bool(manufacturer_norm and src_manufacturer) and manufacturer_norm == src_manufacturer
        )
        if same_producer_match:
            if manufacturer:
                reasons.append(manufacturer.upper())
            reasons.append("Ten sam producent")
            score += 40
        category = _product_category_from_meta(getattr(p, "metadata_json", None))
        category_id = _product_category_id_from_meta(getattr(p, "metadata_json", None))
        same_category_match = False
        if src_category_id is not None and category_id is not None and src_category_id == category_id:
            same_category_match = True
        elif category and src_category and _normalize_token(category) == _normalize_token(src_category):
            same_category_match = True
        if same_category_match:
            reasons.append("Ta sama kategoria")
            score += 40
        p_tokens = _extract_tokens(str(getattr(p, "name", "") or ""))
        p_primary = _primary_token(p_tokens)
        primary_match = bool(src_primary and p_primary and src_primary == p_primary)
        alias_match = bool(
            src_primary
            and p_primary
            and (
                p_primary in _ALIASES.get(src_primary, set())
                or src_primary in _ALIASES.get(p_primary, set())
            )
        )
        if primary_match:
            reasons.append("Podobna nazwa")
            score += 35
        if alias_match:
            reasons.append("Alias typu produktu")
            score += 30
        p_dim_tokens = set(re.findall(r"\b\d{1,4}(?:mm|cm|m)\b", normalize_token_text(str(getattr(p, "name", "") or ""))))
        shared_dim_tokens = sorted(src_dim_tokens.intersection(p_dim_tokens))
        if _product_dimensions_key(p) == src_dims and src_dims != (0, 0, 0):
            score += 20
        if shared_dim_tokens:
            score += 20
            reasons.extend([f"{t[:-2]} {t[-2:]}" for t in shared_dim_tokens[:2]])
        p_color_tokens = {t for t in p_tokens if t in _COLOR_TOKENS}
        shared_color = sorted(src_color_tokens.intersection(p_color_tokens))
        if shared_color:
            score += 10
            reasons.append(shared_color[0])
        p_sku = _normalize_token(str(getattr(p, "symbol", None) or getattr(p, "sku", None) or ""))
        if src_sku_prefix and p_sku.startswith(src_sku_prefix):
            score += 10
            reasons.append("Wspólny prefiks SKU")
        ean = str(getattr(p, "ean", "") or "").strip()
        if src_ean_prefix and ean.startswith(src_ean_prefix):
            score += 10
            reasons.append("Ten sam prefiks EAN")
        src_meta = _product_meta_dict(getattr(src, "metadata_json", None))
        p_meta = _product_meta_dict(getattr(p, "metadata_json", None))
        src_tags = {str(_normalize_token(x)) for x in (src_meta.get("tags") or []) if isinstance(x, str)}
        p_tags = {str(_normalize_token(x)) for x in (p_meta.get("tags") or []) if isinstance(x, str)}
        if src_tags and p_tags and src_tags.intersection(p_tags):
            score += 10
            reasons.append("Wspólne tagi")
        shared_named_tokens = [
            t for t in sorted(set(src_tokens).intersection(set(p_tokens)))
            if len(t) >= 5 and t not in _STOPWORDS and not _DIM_TOKEN_RE.match(t) and t not in _COLOR_TOKENS
        ]
        if shared_named_tokens:
            reasons.append(shared_named_tokens[0].capitalize())

        if pid in popular_idx:
            reasons.insert(0, "Najczęstszy zamiennik")
            score += 10

        if same_manufacturer and not same_producer_match:
            return None
        if same_category and not same_category_match:
            return None
        if same_size and not shared_dim_tokens and _product_dimensions_key(p) != src_dims:
            return None
        if has_search:
            q_low = q_clean.lower()
            p_name_low = str(getattr(p, "name", "") or "").lower()
            p_sku_low = p_sku.lower()
            p_mfr_low = manufacturer.lower()
            tag_hit = False
            for tag in p_meta.get("tags") or []:
                if isinstance(tag, str) and q_low in _normalize_token(tag):
                    tag_hit = True
                    break
            if (
                q_low in p_name_low
                or (p_sku_low and q_low in p_sku_low)
                or (ean and q_low in ean.lower())
                or (p_mfr_low and q_low in p_mfr_low)
                or tag_hit
                or any(q_low in pn for pn in cand_producer_names if pn)
            ):
                if "Dopasowanie wyszukiwania" not in reasons:
                    reasons.insert(0, "Dopasowanie wyszukiwania")
                score += 55
        if show_similar and not show_all_products and not has_search:
            if not (same_category_match or primary_match or pid in popular_idx):
                return None
        if not show_similar and pid not in popular_idx and not has_search:
            return None

        popular = popular_idx.get(pid)
        if not reasons:
            reasons.append("Podobny produkt")
        # Keep badges compact and unique (preserve order).
        seen = set()
        compact_reasons: list[str] = []
        for r in reasons:
            rv = str(r).strip()
            if not rv or rv in seen:
                continue
            seen.add(rv)
            compact_reasons.append(rv)
        reasons = compact_reasons[:6]
        group = "others"
        if score >= 220:
            group = "best_match"
        elif score >= 120:
            group = "alternatives"
        match_flags[pid] = {
            "same_producer": same_producer_match,
            "same_category": same_category_match,
            "same_size": bool(shared_dim_tokens or _product_dimensions_key(p) == src_dims),
            "primary_match": primary_match,
            "alias_match": alias_match,
            "similar_name": bool(shared_named_tokens or primary_match or alias_match),
        }
        if len(candidate_debug_rows) < 10:
            candidate_debug_rows.append(
                {
                    "id": pid,
                    "name": str(getattr(p, "name", "") or "").strip(),
                    "manufacturer": manufacturer,
                    "manufacturer_id": cand_manufacturer_id or None,
                    "category_id": category_id,
                    "category_name": category,
                    "score": round(score, 2),
                    "source_primary_token": src_primary or None,
                    "candidate_primary_token": p_primary or None,
                    "match_flags": dict(match_flags[pid]),
                }
            )
        return ReplacementSuggestionProduct(
            id=pid,
            name=str(getattr(p, "name", "") or "").strip() or f"Produkt #{pid}",
            sku=str(getattr(p, "symbol", None) or getattr(p, "sku", None) or "").strip() or None,
            ean=ean or None,
            image_url=str(getattr(p, "image_url", "") or "").strip() or None,
            category=category,
            manufacturer=manufacturer or None,
            stock_qty=round(stock_qty, 2),
            reserved_qty=round(reserved_qty, 2),
            available_qty=round(available_qty, 2),
            location_count=int(loc_count_map.get(pid, 0)),
            locations=loc_map.get(pid, []),
            similarity_reasons=reasons,
            badge=(reasons[0] if reasons else None),
            usage_count=(int(popular.usage_total) if popular and popular.usage_total is not None else None),
            last_used_at=(popular.last_used_at if popular else None),
            score=round(score, 2),
            match_group=group,
            match_flags=dict(match_flags[pid]),
        )

    rows = [r for r in (build_row(p) for p in candidates) if r is not None]

    if has_search:
        q_low = q_clean.lower()

        def _search_rank(r: ReplacementSuggestionProduct) -> tuple:
            name = (r.name or "").lower()
            sku = (r.sku or "").lower()
            ean_s = (r.ean or "").lower()
            mfr = (r.manufacturer or "").lower()
            if name.startswith(q_low):
                tier = 0
            elif q_low in name:
                tier = 1
            elif sku and (sku.startswith(q_low) or q_low in sku):
                tier = 2
            elif ean_s and (ean_s.startswith(q_low) or q_low in ean_s):
                tier = 3
            elif mfr and q_low in mfr:
                tier = 4
            else:
                tier = 5
            return (tier, -(float(r.score or 0)), -(r.usage_count or 0), -(r.available_qty or 0), name)

        rows.sort(key=_search_rank)
    else:
        rows.sort(key=lambda r: (r.available_qty <= 0, -r.score, -(r.usage_count or 0), -r.available_qty, r.name.lower()))

    scoped_rows = rows
    if same_manufacturer:
        scoped_rows = [r for r in scoped_rows if match_flags.get(int(r.id), {}).get("same_producer") is True]
    if same_category:
        scoped_rows = [r for r in scoped_rows if match_flags.get(int(r.id), {}).get("same_category") is True]

    def _stage(pred) -> list[ReplacementSuggestionProduct]:
        return [r for r in scoped_rows if pred(match_flags.get(int(r.id), {}), r)]

    stage_1 = _stage(lambda f, _r: f.get("same_category") is True and f.get("same_producer") is True)
    stage_2 = _stage(lambda f, _r: f.get("same_category") is True)
    stage_3 = _stage(lambda f, _r: f.get("same_producer") is True)
    stage_4 = _stage(lambda f, _r: f.get("primary_match") is True)
    stage_5 = _stage(lambda _f, r: float(r.score or 0) >= 60.0)
    stage_6 = scoped_rows if show_all_products else []

    if has_search:
        chosen_rows = scoped_rows[:limit]
    else:
        chosen_rows = stage_1 or stage_2 or stage_3 or stage_4 or stage_5 or stage_6

    popular = [r for r in chosen_rows if r.id in popular_idx][:8]
    recent = sorted(
        [r for r in chosen_rows if r.last_used_at is not None],
        key=lambda r: r.last_used_at or datetime.min,
        reverse=True,
    )[:8]
    similar = [r for r in chosen_rows if r.id not in {x.id for x in popular}][:10]
    best_match = [r for r in chosen_rows if (r.match_group or "") == "best_match"][:5]
    alternatives = [r for r in chosen_rows if (r.match_group or "") == "alternatives"][:8]
    others = [r for r in chosen_rows if (r.match_group or "") == "others"][:8]
    search_results = chosen_rows[:limit]
    debug_payload: Optional[dict[str, Any]] = None
    if debug:
        debug_payload = {
            "source_product": {
                "id": int(src.id),
                "name": str(getattr(src, "name", "") or "").strip(),
                "category_id": src_category_id,
                "category_name": src_category,
                "manufacturer_id": (src_manufacturer_id or None),
                "manufacturer_name": str(getattr(src, "manufacturer", "") or "").strip() or None,
                "normalized_manufacturer": src_manufacturer or None,
                "tokens": src_tokens_no_noise,
                "primary_token": src_primary or None,
            },
            "candidates_checked": len(candidates),
            "stage_results": {
                "same_producer_and_category": len(stage_1),
                "same_category": len(stage_2),
                "same_producer": len(stage_3),
                "token_match": len(stage_4),
                "similarity": len(stage_5),
                "global_fallback": len(stage_6),
                "chosen": len(chosen_rows),
            },
            "base_candidates_count": len(candidates),
            "base_candidates_preview": base_candidate_preview,
            "first_10_candidates": candidate_debug_rows,
        }
        logger.info(
            "replacement_suggestions debug source=%s checked=%s stages=%s",
            debug_payload["source_product"],
            debug_payload["candidates_checked"],
            debug_payload["stage_results"],
        )
        logger.info("replacement_suggestions first10=%s", candidate_debug_rows)

    return ReplacementSuggestionsResponse(
        recent=recent,
        popular=popular,
        similar=similar,
        search_results=search_results,
        best_match=best_match,
        alternatives=alternatives,
        others=others,
        debug=debug_payload,
    )


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
    if body.assigned_locations is not None:
        _validate_assigned_locations_for_tenant(db, tid, body.assigned_locations)
    assigned_json = json.dumps(body.assigned_locations) if body.assigned_locations is not None else None
    payload = body.model_dump()
    len_ = _round_float(_parse_float(payload.get("length_cm") or payload.get("length")), 2)
    wid_ = _round_float(_parse_float(payload.get("width_cm") or payload.get("width")), 2)
    hei_ = _round_float(_parse_float(payload.get("height_cm") or payload.get("height")), 2)
    vol = _volume_from_dimensions_dm3(len_, wid_, hei_)
    if vol is None:
        vol = _round_float(_parse_float(payload.get("volume_dm3") or payload.get("volume")), 2)
    wgt_ = _round_float(_parse_float(payload.get("weight_kg") or payload.get("weight")), 3)
    carton_vol = _volume_from_dimensions_dm3(
        _round_float(body.carton_length_cm, 2) if body.carton_length_cm is not None else None,
        _round_float(body.carton_width_cm, 2) if body.carton_width_cm is not None else None,
        _round_float(body.carton_height_cm, 2) if body.carton_height_cm is not None else None,
    )
    if carton_vol is None and body.carton_volume_dm3 is not None:
        carton_vol = _round_float(body.carton_volume_dm3, 2)
    pst = _resolved_product_stack_from_body(body)
    mid = body.manufacturer_id
    manufacturer_str = (body.manufacturer or "").strip() or None
    if mid is not None:
        mv = db.query(Manufacturer).filter(Manufacturer.id == mid, Manufacturer.tenant_id == tid).first()
        if not mv:
            raise HTTPException(status_code=400, detail="Invalid manufacturer_id for tenant")
        manufacturer_str = mv.name
    dsid = body.default_supplier_id
    if dsid is not None:
        sv = db.query(Supplier).filter(Supplier.id == dsid, Supplier.tenant_id == tid).first()
        if not sv:
            raise HTTPException(status_code=400, detail="Invalid default_supplier_id for tenant")
    product = Product(
        tenant_id=tid,
        name=(body.name or "").strip(),
        ean=(body.ean or "").strip() or None,
        symbol=(body.symbol or "").strip() or None,
        length=len_,
        width=wid_,
        height=hei_,
        weight=wgt_,
        volume=vol,
        image_url=(body.image_url or "").strip() or None,
        assigned_locations=assigned_json,
        label_template_id=body.label_template_id,
        sale_price=body.sale_price,
        purchase_price=_round_float(body.purchase_price, 2) if body.purchase_price is not None else None,
        extra_cost_packaging_net=_round_float(body.extra_cost_packaging_net, 2) if body.extra_cost_packaging_net is not None else 0.0,
        extra_cost_commission_percent=_round_float(body.extra_cost_commission_percent, 2)
        if body.extra_cost_commission_percent is not None
        else 0.0,
        extra_cost_other_net=_round_float(body.extra_cost_other_net, 2) if body.extra_cost_other_net is not None else 0.0,
        manufacturer_id=mid,
        manufacturer=manufacturer_str,
        default_supplier_id=dsid,
        unit=(body.unit or "").strip() or None,
        orientation_type=pst["orientation_type"],
        shape_type=pst["shape_type"],
        stack_compressible=pst["stack_compressible"],
        compressed_height_cm=pst["compressed_height_cm"],
        max_stack_weight=pst["max_stack_weight"],
        stack_behavior=pst["stack_behavior"],
        metadata_json=(body.metadata_json or "").strip() or None,
        min_pick_quantity=_round_float(body.min_pick_quantity, 2) if body.min_pick_quantity is not None else None,
        max_pick_quantity=_round_float(body.max_pick_quantity, 2) if body.max_pick_quantity is not None else None,
        min_reserve_quantity=_round_float(body.min_reserve_quantity, 2) if body.min_reserve_quantity is not None else None,
        max_reserve_quantity=_round_float(body.max_reserve_quantity, 2) if body.max_reserve_quantity is not None else None,
        enable_stock_alert=bool(body.enable_stock_alert) if body.enable_stock_alert is not None else False,
        min_total_stock=_round_float(body.min_total_stock, 2) if body.min_total_stock is not None else None,
        bulk_ean=(body.bulk_ean or "").strip() or None,
        units_per_carton=_round_float(body.units_per_carton, 2) if body.units_per_carton is not None else None,
        carton_length_cm=_round_float(body.carton_length_cm, 2) if body.carton_length_cm is not None else None,
        carton_width_cm=_round_float(body.carton_width_cm, 2) if body.carton_width_cm is not None else None,
        carton_height_cm=_round_float(body.carton_height_cm, 2) if body.carton_height_cm is not None else None,
        carton_weight_kg=_round_float(body.carton_weight_kg, 3) if body.carton_weight_kg is not None else None,
        carton_volume_dm3=carton_vol,
        carton_orientation_type=(body.carton_orientation_type or "").strip() or None,
        carton_shape_type=(body.carton_shape_type or "").strip() or None,
        carton_stack_behavior=(body.carton_stack_behavior or "").strip() or None,
        carton_stack_compressible=body.carton_stack_compressible,
        carton_compressed_height_cm=body.carton_compressed_height_cm,
        carton_max_stack_weight=body.carton_max_stack_weight,
        track_batch=bool(body.track_batch) if body.track_batch is not None else False,
        track_expiry=bool(body.track_expiry) if body.track_expiry is not None else False,
        track_serial=bool(body.track_serial) if body.track_serial is not None else False,
    )
    db.add(product)
    db.flush()
    from ..services.barcode_generation import next_product_barcode
    product.barcode = next_product_barcode(db, tid)
    _ensure_supplier_product_link(db, product)
    db.commit()
    db.refresh(product)
    out = _product_to_dict(product)
    out["current_cost"] = calculate_product_margin(db, product.tenant_id, product.id)
    _enrich_product_manufacturer(db, out, product)
    _enrich_product_default_supplier(db, out, product)
    _enrich_product_last_supplier(db, out, product)
    _enrich_product_supplier_catalog_links(db, out, product)
    loc_map, inv_map = _inventory_payload_for_product_ids(db, [product.id])
    out["locations"] = loc_map.get(product.id, [])
    out["inventory"] = inv_map.get(product.id, [])
    return out


@router.get("/profitability", response_model=ProductProfitabilityListOut)
def get_product_profitability(
    tenant_id: int = Query(..., ge=1),
    range_days: int = Query(30, ge=1, le=3650),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    warehouse_id: Optional[int] = Query(None, ge=1),
    brand_id: Optional[int] = Query(None, ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    category_id: Optional[int] = Query(None, ge=1),
    only_loss: bool = Query(False),
    only_low_margin: bool = Query(False),
    only_no_sales: bool = Query(False),
    only_top_profit: bool = Query(False),
    only_high_stock: bool = Query(False),
    sort: Optional[str] = Query("lowest_profit"),
    db: Session = Depends(get_db),
):
    return get_products_profitability(
        db,
        tenant_id=int(tenant_id),
        range_days=int(range_days),
        page=int(page),
        page_size=int(page_size),
        warehouse_id=warehouse_id,
        brand_id=brand_id,
        supplier_id=supplier_id,
        category_id=category_id,
        only_loss=bool(only_loss),
        only_low_margin=bool(only_low_margin),
        only_no_sales=bool(only_no_sales),
        only_top_profit=bool(only_top_profit),
        only_high_stock=bool(only_high_stock),
        sort=sort,
    )


def _stock_operation_ui_type_and_delta(op: StockOperation) -> Tuple[str, float]:
    """Map append-only stock_operations to legacy movement UI types + signed delta."""
    typ = (op.type or "").strip().upper()
    qty = float(op.qty or 0)
    if typ == STOCK_OP_RECEIPT:
        return "receive", abs(qty)
    if typ == STOCK_OP_PUTAWAY:
        # Putaway is relocation/audit in current flow, not a second global receipt.
        return "putaway", 0.0
    if typ == STOCK_OP_MOVE_OUT:
        return "move", -abs(qty)
    if typ == STOCK_OP_MOVE_IN:
        return "move", abs(qty)
    if typ == STOCK_OP_ISSUE:
        return "pick", -abs(qty)
    if typ == STOCK_OP_ADJUSTMENT:
        return "adjust", qty
    if typ == STOCK_OP_MOVE:
        return "move", qty
    return (typ.lower() or "move"), qty


def _movement_signed_delta(movement_type: Optional[str], quantity: float) -> float:
    """Interpret stored quantity as UI delta (negative = outbound from primary location)."""
    t = (movement_type or "").strip().lower()
    q = float(quantity or 0)
    if t == "pick":
        return -abs(q)
    if t in ("receive", "return"):
        return abs(q)
    if t == "move":
        return abs(q)
    if t == "adjust":
        return q
    return q


# Ledger rows already mirrored in wms_product_warehouse_operations — omit from product history UI.
_PRODUCT_HISTORY_HIDDEN_STOCK_OP_TYPES = frozenset(
    {
        STOCK_OP_PUTAWAY,
        STOCK_OP_RECEIPT,
        STOCK_OP_MOVE_OUT,
        STOCK_OP_MOVE_IN,
        STOCK_OP_ISSUE,
    }
)


def _wms_product_operation_ui_fields(
    w: WmsProductWarehouseOperation,
    db: Session,
) -> Tuple[str, Optional[dict], Optional[dict], Optional[int], float]:
    """Location label, from/to mini, location id for qty running total, signed delta."""
    mt = (w.movement_type or "").strip().upper()
    q = float(w.quantity or 0.0)
    lf = _location_mini(db, w.source_location_id)
    lt = _location_mini(db, w.target_location_id)

    if mt == "PUTAWAY":
        return (lt["name"] if lt else "—"), lf, lt, w.target_location_id, abs(q)
    if mt == "RECEIVING":
        return (lt["name"] if lt else "—"), lf, lt, w.target_location_id, abs(q)
    if mt == "PICKING":
        return (lf["name"] if lf else "—"), lf, lt, w.source_location_id, -abs(q)
    if mt == "RETURN":
        return (lt["name"] if lt else "—"), lf, lt, w.target_location_id, abs(q)

    a = lf["name"] if lf else "—"
    b = lt["name"] if lt else "—"
    loc_label = f"{a} → {b}" if (lf or lt) else "—"
    return loc_label, lf, lt, None, 0.0


def _location_mini(db: Session, loc_id: Optional[int]) -> Optional[dict]:
    if loc_id is None:
        return None
    loc = db.query(Location).filter(Location.id == loc_id).first()
    if not loc:
        return {"id": loc_id, "name": f"#{loc_id}", "storage_type": normalize_storage_type(None)}
    return {
        "id": loc.id,
        "name": (loc.name or "").strip() or f"#{loc.id}",
        "storage_type": normalize_storage_type(getattr(loc, "type", None)),
    }


@router.get("/{product_id}/movements")
def list_product_inventory_movements(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    Read-only product warehouse history: primarily `wms_product_warehouse_operations` (one row per
    physical WMS action). Ledger `stock_operations` for PUTAWAY/RECEIPT/pick/MM slices are hidden
    when mirrored in WMS audit. Quantities before/after are per target/source location where applicable.
    """
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if getattr(product, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Product not found")
    tid = product.tenant_id

    stock_rows = (
        db.query(StockMovement)
        .filter(StockMovement.product_id == product_id, StockMovement.tenant_id == tid)
        .all()
    )
    inv_rows = (
        db.query(InventoryMovement)
        .filter(InventoryMovement.product_id == product_id, InventoryMovement.tenant_id == tid)
        .all()
    )
    op_rows = (
        db.query(StockOperation)
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .filter(StockOperation.product_id == product_id, StockDocument.tenant_id == tid)
        .all()
    )
    wms_wh_ops = (
        db.query(WmsProductWarehouseOperation)
        .filter(
            WmsProductWarehouseOperation.product_id == product_id,
            WmsProductWarehouseOperation.tenant_id == tid,
        )
        .all()
    )
    op_doc_ids = sorted({int(op.document_id) for op in op_rows if getattr(op, "document_id", None) is not None})
    op_line_ids = sorted({int(op.document_line_id) for op in op_rows if getattr(op, "document_line_id", None) is not None})
    docs_by_id: dict[int, StockDocument] = {}
    if op_doc_ids:
        for d in db.query(StockDocument).filter(StockDocument.id.in_(op_doc_ids)).all():
            docs_by_id[int(d.id)] = d
    lines_by_id: dict[int, StockDocumentItem] = {}
    if op_line_ids:
        for li in db.query(StockDocumentItem).filter(StockDocumentItem.id.in_(op_line_ids)).all():
            lines_by_id[int(li.id)] = li
    combined: List[Tuple[Any, str, Any]] = []
    for m in stock_rows:
        # WMS PICKING audit rows are canonical; legacy StockMovement pick duplicates Kompletacja.
        if (getattr(m, "type", None) or "").strip().lower() == "pick":
            continue
        combined.append((m.created_at, "stock", m))
    for m in inv_rows:
        combined.append((m.created_at, "inventory", m))
    for op in op_rows:
        typ = (op.type or "").strip().upper()
        if typ in _PRODUCT_HISTORY_HIDDEN_STOCK_OP_TYPES:
            continue
        combined.append((op.created_at, "stock_operation", op))
    for w in wms_wh_ops:
        combined.append((w.created_at, "wms_product_operation", w))
    combined.sort(key=lambda x: ((x[0] or datetime.min), str(x[1]), int(getattr(x[2], "id", 0))))
    events: list[dict] = []
    running_qty = 0.0
    running_by_loc: dict[int, float] = defaultdict(float)
    for _ts, _src, m in combined:
        if _src == "wms_product_operation":
            w = m
            loc_label, lf, lt, track_loc_id, delta = _wms_product_operation_ui_fields(w, db)
            if track_loc_id is not None:
                lid = int(track_loc_id)
                qty_before = running_by_loc[lid]
                qty_after = qty_before + float(delta)
                running_by_loc[lid] = qty_after
            else:
                qty_before = running_qty
                qty_after = qty_before + float(delta)
                running_qty = qty_after
            login_u = (w.admin_login or "").strip()
            fn_u = (w.admin_first_name or "").strip()
            ln_u = (w.admin_last_name or "").strip()
            label_u = f"{fn_u} {ln_u}".strip() or login_u
            ref_doc_u = (w.reference_document or "").strip() or None
            doc_type_hint = None
            if ref_doc_u and "-" in ref_doc_u:
                doc_type_hint = ref_doc_u.split("-", 1)[0].strip().upper() or None
            w_batch = (getattr(w, "batch_number", None) or "").strip() or None
            w_exp = getattr(w, "expiry_date", None)
            w_exp_s = w_exp.isoformat() if w_exp is not None else None
            events.append(
                {
                    "id": w.id,
                    "source": "wms_product_operation",
                    "created_at": w.created_at.isoformat() + "Z" if w.created_at else None,
                    "type": str(w.movement_type or "").lower(),
                    "movement_type": w.movement_type,
                    "user": {
                        "id": int(w.admin_id),
                        "login": login_u,
                        "first_name": fn_u or None,
                        "last_name": ln_u or None,
                        "label": label_u,
                    },
                    "document_id": int(w.stock_document_id) if getattr(w, "stock_document_id", None) is not None else None,
                    "document_number": ref_doc_u,
                    "document_type": doc_type_hint or "WMS",
                    "location_label": loc_label,
                    "location_from": lf,
                    "location_to": lt,
                    "batch_number": w_batch,
                    "expiry_date": w_exp_s,
                    "quantity_before": qty_before,
                    "quantity_after": qty_after,
                    "delta": delta,
                    "quantity_raw": float(w.quantity or 0),
                    "unit_cost_net": None,
                    "unit_cost_gross": None,
                    "packaging_type": w.packaging_type,
                    "packaging_quantity": float(w.packaging_quantity) if w.packaging_quantity is not None else None,
                    "replenishment_task_id": int(w.replenishment_task_id)
                    if getattr(w, "replenishment_task_id", None) is not None
                    else None,
                    "wms_mode": w.wms_mode,
                    "pick_id": int(w.pick_id) if getattr(w, "pick_id", None) is not None else None,
                }
            )
            continue

        if _src == "stock_operation":
            op = m
            ui_type, delta = _stock_operation_ui_type_and_delta(op)
            loc_display = _location_mini(db, op.location_id)
            loc_label = str(loc_display["name"]) if loc_display else "—"
            doc = docs_by_id.get(int(op.document_id)) if getattr(op, "document_id", None) is not None else None
            line = lines_by_id.get(int(op.document_line_id)) if getattr(op, "document_line_id", None) is not None else None
            doc_type = (getattr(doc, "document_type", None) or "").strip().upper() or None
            unit_net = float(op.unit_price_net) if getattr(op, "unit_price_net", None) is not None else None
            vat_rate = float(getattr(line, "vat_rate", 23.0) or 23.0) if line is not None else 23.0
            unit_gross = (unit_net * (1.0 + vat_rate / 100.0)) if unit_net is not None else None
            qty_before = running_qty
            qty_after = qty_before + float(delta)
            running_qty = qty_after
            events.append(
                {
                    "id": op.id,
                    "source": "stock_operation",
                    "created_at": op.created_at.isoformat() + "Z" if op.created_at else None,
                    "type": ui_type,
                    "user": None,
                    "document_id": int(op.document_id) if getattr(op, "document_id", None) is not None else None,
                    "document_number": f"{doc_type}-{int(op.document_id)}"
                    if doc_type and getattr(op, "document_id", None) is not None
                    else None,
                    "document_type": doc_type,
                    "location_label": loc_label,
                    "location": loc_display,
                    "quantity_before": qty_before,
                    "quantity_after": qty_after,
                    "delta": delta,
                    "quantity_raw": float(op.qty or 0),
                    "unit_cost_net": unit_net,
                    "unit_cost_gross": unit_gross,
                }
            )
            continue

        lf = _location_mini(db, m.from_location_id)
        lt = _location_mini(db, m.to_location_id)
        t = (m.type or "").strip().lower()
        if t == "pick" and lf:
            loc_display = lf
            loc_label = lf["name"]
        elif t in ("receive", "return") and lt:
            loc_display = lt
            loc_label = lt["name"]
        elif t == "move" and (lf or lt):
            a = lf["name"] if lf else "—"
            b = lt["name"] if lt else "—"
            loc_label = f"{a} → {b}"
            loc_display = lt or lf
        elif lf:
            loc_display = lf
            loc_label = lf["name"]
        elif lt:
            loc_display = lt
            loc_label = lt["name"]
        else:
            loc_display = None
            loc_label = "—"

        delta = _movement_signed_delta(m.type, float(m.quantity or 0))
        qty_before = running_qty
        qty_after = qty_before + float(delta)
        running_qty = qty_after
        events.append(
            {
                "id": m.id,
                "source": "stock" if isinstance(m, StockMovement) else "inventory",
                "created_at": m.created_at.isoformat() + "Z" if m.created_at else None,
                "type": m.type,
                "user": None,
                "document_id": None,
                "document_number": None,
                "document_type": "LEGACY",
                "location_label": loc_label,
                "location": loc_display,
                "quantity_before": qty_before,
                "quantity_after": qty_after,
                "delta": delta,
                "quantity_raw": float(m.quantity or 0),
                "unit_cost_net": None,
                "unit_cost_gross": None,
            }
        )
    def _drop_zero_delta_ui_event(row: dict) -> bool:
        t = (row.get("type") or "").strip().lower()
        if abs(float(row.get("delta") or 0.0)) >= 1e-9:
            return False
        return t in ("putaway", "receive", "receiving")

    events = [row for row in events if not _drop_zero_delta_ui_event(row)]

    events.sort(
        key=lambda row: (
            row.get("created_at") or "",
            str(row.get("source") or ""),
            int(row.get("id") or 0),
        ),
        reverse=True,
    )
    total = len(events)
    items = events[offset : offset + limit]

    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{product_id}/delivery-history")
def list_product_delivery_history(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
    limit: int = Query(25, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product or getattr(product, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Product not found")
    tid = int(product.tenant_id)

    receipt_ops = (
        db.query(StockOperation)
        .join(StockDocument, StockDocument.id == StockOperation.document_id)
        .filter(
            StockOperation.product_id == product_id,
            StockOperation.type == STOCK_OP_RECEIPT,
            StockDocument.tenant_id == tid,
        )
        .all()
    )
    if not receipt_ops:
        receipt_ops = []

    doc_ids = sorted({int(op.document_id) for op in receipt_ops if getattr(op, "document_id", None) is not None})
    line_ids = sorted({int(op.document_line_id) for op in receipt_ops if getattr(op, "document_line_id", None) is not None})
    docs_by_id: dict[int, StockDocument] = {}
    if doc_ids:
        for d in db.query(StockDocument).filter(StockDocument.id.in_(doc_ids)).all():
            docs_by_id[int(d.id)] = d
    lines_by_id: dict[int, StockDocumentItem] = {}
    if line_ids:
        for li in db.query(StockDocumentItem).filter(StockDocumentItem.id.in_(line_ids)).all():
            lines_by_id[int(li.id)] = li
    supplier_ids = sorted({int(d.supplier_id) for d in docs_by_id.values() if getattr(d, "supplier_id", None) is not None})
    suppliers_by_id: dict[int, Supplier] = {}
    if supplier_ids:
        for s in db.query(Supplier).filter(Supplier.id.in_(supplier_ids)).all():
            suppliers_by_id[int(s.id)] = s

    grouped: dict[int, dict] = {}

    def _ensure_group_row(doc: StockDocument) -> dict:
        doc_id = int(doc.id)
        row_existing = grouped.get(doc_id)
        if row_existing is not None:
            return row_existing
        doc_type = (getattr(doc, "document_type", None) or "").strip().upper() or "PZ"
        sup = suppliers_by_id.get(int(doc.supplier_id)) if getattr(doc, "supplier_id", None) is not None else None
        row_new = {
            "document_id": doc_id,
            "document": f"{doc_type}-{doc_id}",
            "document_type": doc_type,
            "date": doc.created_at.isoformat() + "Z" if doc.created_at else None,
            "supplier": ((sup.name or "").strip() if sup and getattr(sup, "name", None) else "—"),
            "qty": 0.0,
            "total_net": 0.0,
            "total_gross": 0.0,
        }
        grouped[doc_id] = row_new
        return row_new
    for op in receipt_ops:
        doc_id = int(op.document_id)
        doc = docs_by_id.get(doc_id)
        if doc is None:
            continue
        line = lines_by_id.get(int(op.document_line_id)) if getattr(op, "document_line_id", None) is not None else None
        qty = float(op.qty or 0)
        if qty <= 1e-9:
            continue
        unit_net = float(op.unit_price_net) if getattr(op, "unit_price_net", None) is not None else None
        vat_rate = float(getattr(line, "vat_rate", 23.0) or 23.0)
        unit_gross = unit_net * (1.0 + vat_rate / 100.0) if unit_net is not None else None
        row = _ensure_group_row(doc)
        row["qty"] += qty
        if unit_net is not None:
            row["total_net"] += qty * unit_net
        if unit_gross is not None:
            row["total_gross"] += qty * unit_gross

    # Backfill for legacy PZ lines that have no RECEIPT ops.
    pz_lines = (
        db.query(StockDocumentItem)
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(
            StockDocument.tenant_id == tid,
            StockDocumentItem.product_id == product_id,
            StockDocument.document_type == "PZ",
            StockDocumentItem.received_quantity > 1e-9,
        )
        .all()
    )
    receipt_line_ids = {int(op.document_line_id) for op in receipt_ops if getattr(op, "document_line_id", None) is not None}
    for line in pz_lines:
        if int(line.id) in receipt_line_ids:
            continue
        doc = docs_by_id.get(int(line.document_id))
        if doc is None:
            doc = db.query(StockDocument).filter(StockDocument.id == line.document_id).first()
            if doc is None:
                continue
            docs_by_id[int(doc.id)] = doc
            sid = int(doc.supplier_id) if getattr(doc, "supplier_id", None) is not None else None
            if sid is not None and sid not in suppliers_by_id:
                sup = db.query(Supplier).filter(Supplier.id == sid).first()
                if sup is not None:
                    suppliers_by_id[sid] = sup
        row = _ensure_group_row(doc)
        qty = float(line.received_quantity or 0)
        if qty <= 1e-9:
            continue
        unit_net = float(line.purchase_price_net) if getattr(line, "purchase_price_net", None) is not None else None
        vat_rate = float(getattr(line, "vat_rate", 23.0) or 23.0)
        unit_gross = unit_net * (1.0 + vat_rate / 100.0) if unit_net is not None else None
        row["qty"] += qty
        if unit_net is not None:
            row["total_net"] += qty * unit_net
        if unit_gross is not None:
            row["total_gross"] += qty * unit_gross

    items = list(grouped.values())
    for row in items:
        qty = float(row["qty"] or 0.0)
        row["unit_net"] = (row["total_net"] / qty) if qty > 1e-9 else None
        row["unit_gross"] = (row["total_gross"] / qty) if qty > 1e-9 else None
    items.sort(key=lambda x: (x.get("date") or "", int(x.get("document_id") or 0)), reverse=True)
    total = len(items)
    page = items[offset : offset + limit]
    return {"items": page, "total": total, "limit": limit, "offset": offset}


@router.post("/{product_id}/duplicate", status_code=201)
def duplicate_product(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: int = Query(..., ge=1),
):
    """Clone product master data (WMS/logistics/settings) without stock or history."""
    from ..services.product_duplicate_service import duplicate_product_or_http

    product = duplicate_product_or_http(db, source_product_id=product_id, tenant_id=tenant_id)
    out = _product_to_dict(product)
    out["current_cost"] = calculate_product_margin(db, product.tenant_id, product.id)
    _enrich_product_manufacturer(db, out, product)
    _enrich_product_default_supplier(db, out, product)
    _enrich_product_last_supplier(db, out, product)
    _enrich_product_supplier_catalog_links(db, out, product)
    out["stock_quantity"] = 0
    out["locations"] = []
    out["inventory"] = []
    return out


@router.get("/{product_id}/")
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
    warehouse_id: Optional[int] = Query(None, ge=1),
):
    """Returns a single product by ID. tenant_id optional (when provided, scopes to that tenant)."""
    from ..services.product_detail_service import build_product_detail_payload

    return build_product_detail_payload(
        db,
        product_id=product_id,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
    )


class ProductInventoryTraceabilityBody(BaseModel):
    inventory_id: Optional[int] = Field(None, ge=1)
    inventory_serial_ids: List[int] = Field(default_factory=list)
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = None
    confirm_merge: bool = False


@router.patch("/{product_id}/inventory-traceability/")
def patch_product_inventory_traceability(
    product_id: int,
    body: ProductInventoryTraceabilityBody,
    db: Session = Depends(get_db),
    tenant_id: int = Query(..., ge=1),
):
    """Correct batch / expiry / serial on a stock row without silent identity merge."""
    if body.inventory_id is None and not body.inventory_serial_ids:
        raise HTTPException(status_code=400, detail="Podaj inventory_id lub inventory_serial_ids")
    try:
        update_inventory_traceability(
            db,
            tenant_id=int(tenant_id),
            product_id=int(product_id),
            inventory_id=body.inventory_id,
            inventory_serial_ids=body.inventory_serial_ids or None,
            batch_number=body.batch_number,
            expiry_date=body.expiry_date,
            serial_number=body.serial_number,
            confirm_merge=bool(body.confirm_merge),
        )
    except InventoryTraceabilityConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "IDENTITY_CONFLICT",
                "existing_inventory_id": exc.existing_inventory_id,
                "message": str(exc),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    _, inv_map = _inventory_payload_for_product_ids(db, [int(product_id)])
    return {"inventory": inv_map.get(int(product_id), [])}


@router.patch("/{product_id}/")
def patch_product(
    product_id: int,
    body: ProductBody,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Partial update; same rules as PUT for fields present in the body."""
    return update_product(product_id, body, db, tenant_id)


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
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if getattr(product, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Product not found")

    if body.assigned_locations is not None:
        logger.info(
            "product update includes assigned_locations",
            extra={
                "product_id": product.id,
                "tenant_id": product.tenant_id,
                "disable_assigned_locations_inventory_sync": pr_flags.disable_assigned_locations_inventory_sync,
                "disable_stock_quantity_inventory_write": pr_flags.disable_stock_quantity_inventory_write,
                "enable_legacy_bridge_apply_plan": pr_flags.enable_legacy_bridge_apply_plan,
            },
        )
    if body.stock_quantity is not None:
        logger.info(
            "product update includes stock_quantity",
            extra={
                "product_id": product.id,
                "tenant_id": product.tenant_id,
                "disable_assigned_locations_inventory_sync": pr_flags.disable_assigned_locations_inventory_sync,
                "disable_stock_quantity_inventory_write": pr_flags.disable_stock_quantity_inventory_write,
                "enable_legacy_bridge_apply_plan": pr_flags.enable_legacy_bridge_apply_plan,
            },
        )

    if pr_flags.disable_stock_quantity_inventory_write and body.stock_quantity is not None:
        logger.warning(
            "stock_quantity write blocked by flag",
            extra={
                "product_id": product.id,
                "tenant_id": product.tenant_id,
            },
        )
        raise HTTPException(
            status_code=400,
            detail={
                "detail": "stock_quantity is not accepted on product update; use the inventory API to change stock levels.",
                "flag": "DISABLE_STOCK_QUANTITY_INVENTORY_WRITE",
            },
        )

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
        _validate_assigned_locations_for_tenant(db, product.tenant_id, body.assigned_locations)
        product.assigned_locations = json.dumps(body.assigned_locations)
        if body.skip_inventory_sync is not True:
            if pr_flags.disable_assigned_locations_inventory_sync:
                logger.info(
                    "assigned_locations inventory sync skipped (flag)",
                    extra={
                        "product_id": product.id,
                        "tenant_id": product.tenant_id,
                        "disable_assigned_locations_inventory_sync": True,
                    },
                )
            else:
                _sync_inventory_from_assigned_locations(db, product, body.assigned_locations)
    if body.label_template_id is not None:
        product.label_template_id = body.label_template_id
    if body.sale_price is not None:
        product.sale_price = body.sale_price
    if body.purchase_price is not None:
        product.purchase_price = _round_float(body.purchase_price, 2)
    fields_set = getattr(body, "model_fields_set", set()) or set()
    if "extra_cost_packaging_net" in fields_set:
        product.extra_cost_packaging_net = _round_float(body.extra_cost_packaging_net, 2) if body.extra_cost_packaging_net is not None else 0.0
    if "extra_cost_commission_percent" in fields_set:
        product.extra_cost_commission_percent = (
            _round_float(body.extra_cost_commission_percent, 2) if body.extra_cost_commission_percent is not None else 0.0
        )
    if "extra_cost_other_net" in fields_set:
        product.extra_cost_other_net = _round_float(body.extra_cost_other_net, 2) if body.extra_cost_other_net is not None else 0.0
    if "manufacturer_id" in fields_set:
        if body.manufacturer_id is None:
            product.manufacturer_id = None
        else:
            mv = (
                db.query(Manufacturer)
                .filter(Manufacturer.id == body.manufacturer_id, Manufacturer.tenant_id == product.tenant_id)
                .first()
            )
            if not mv:
                raise HTTPException(status_code=400, detail="Invalid manufacturer_id")
            product.manufacturer_id = mv.id
            if body.manufacturer is None:
                product.manufacturer = mv.name
    if body.manufacturer is not None:
        product.manufacturer = (body.manufacturer or "").strip() or None
    if "default_supplier_id" in fields_set:
        if body.default_supplier_id is None:
            product.default_supplier_id = None
        else:
            sv = (
                db.query(Supplier)
                .filter(Supplier.id == body.default_supplier_id, Supplier.tenant_id == product.tenant_id)
                .first()
            )
            if not sv:
                raise HTTPException(status_code=400, detail="Invalid default_supplier_id")
            product.default_supplier_id = sv.id
            _ensure_supplier_product_link(db, product)
    if body.unit is not None:
        product.unit = (body.unit or "").strip() or None

    if "product_orientation_type" in fields_set or "orientation_type" in fields_set:
        v = body.product_orientation_type if "product_orientation_type" in fields_set else body.orientation_type
        product.orientation_type = (v or "").strip() or None if isinstance(v, str) else v
    if "product_shape_type" in fields_set or "shape_type" in fields_set:
        v = body.product_shape_type if "product_shape_type" in fields_set else body.shape_type
        product.shape_type = (v or "").strip() or None if isinstance(v, str) else v
    if "product_stack_compressible" in fields_set or "stack_compressible" in fields_set:
        product.stack_compressible = (
            body.product_stack_compressible if "product_stack_compressible" in fields_set else body.stack_compressible
        )
    if "product_compressed_height_cm" in fields_set or "compressed_height_cm" in fields_set:
        product.compressed_height_cm = (
            body.product_compressed_height_cm
            if "product_compressed_height_cm" in fields_set
            else body.compressed_height_cm
        )
    if "product_max_stack_weight" in fields_set or "max_stack_weight" in fields_set:
        product.max_stack_weight = (
            body.product_max_stack_weight if "product_max_stack_weight" in fields_set else body.max_stack_weight
        )
    if "product_stack_behavior" in fields_set or "stack_behavior" in fields_set:
        v = body.product_stack_behavior if "product_stack_behavior" in fields_set else body.stack_behavior
        product.stack_behavior = (v or "").strip() or None if isinstance(v, str) else v

    if "carton_orientation_type" in fields_set:
        v = body.carton_orientation_type
        product.carton_orientation_type = (v or "").strip() or None if isinstance(v, str) else v
    if "carton_shape_type" in fields_set:
        v = body.carton_shape_type
        product.carton_shape_type = (v or "").strip() or None if isinstance(v, str) else v
    if "carton_stack_compressible" in fields_set:
        product.carton_stack_compressible = body.carton_stack_compressible
    if "carton_compressed_height_cm" in fields_set:
        product.carton_compressed_height_cm = body.carton_compressed_height_cm
    if "carton_max_stack_weight" in fields_set:
        product.carton_max_stack_weight = body.carton_max_stack_weight
    if "carton_stack_behavior" in fields_set:
        v = body.carton_stack_behavior
        product.carton_stack_behavior = (v or "").strip() or None if isinstance(v, str) else v
    if body.metadata_json is not None:
        raw = (body.metadata_json or "").strip()
        product.metadata_json = raw or None
    if "min_pick_quantity" in fields_set:
        product.min_pick_quantity = (
            _round_float(body.min_pick_quantity, 2) if body.min_pick_quantity is not None else None
        )
    if "max_pick_quantity" in fields_set:
        product.max_pick_quantity = (
            _round_float(body.max_pick_quantity, 2) if body.max_pick_quantity is not None else None
        )
    if "min_reserve_quantity" in fields_set:
        product.min_reserve_quantity = (
            _round_float(body.min_reserve_quantity, 2) if body.min_reserve_quantity is not None else None
        )
    if "max_reserve_quantity" in fields_set:
        product.max_reserve_quantity = (
            _round_float(body.max_reserve_quantity, 2) if body.max_reserve_quantity is not None else None
        )

    if "enable_stock_alert" in fields_set:
        product.enable_stock_alert = bool(body.enable_stock_alert) if body.enable_stock_alert is not None else False
    if "min_total_stock" in fields_set:
        product.min_total_stock = (
            _round_float(body.min_total_stock, 2) if body.min_total_stock is not None else None
        )
    if "track_batch" in fields_set:
        product.track_batch = bool(body.track_batch)
    if "track_expiry" in fields_set:
        product.track_expiry = bool(body.track_expiry)
    if "track_serial" in fields_set:
        product.track_serial = bool(body.track_serial)
    for _rf in (
        "require_recv_height",
        "require_recv_width",
        "require_recv_length",
        "require_recv_weight",
        "require_recv_master_carton",
        "require_recv_master_carton_ean",
        "require_recv_master_carton_qty",
        "require_recv_master_carton_dims",
        "require_recv_master_carton_weight",
    ):
        if _rf in fields_set:
            setattr(product, _rf, bool(getattr(body, _rf)))

    if "bulk_ean" in fields_set:
        product.bulk_ean = (body.bulk_ean or "").strip() or None
    if "units_per_carton" in fields_set:
        product.units_per_carton = (
            _round_float(body.units_per_carton, 2) if body.units_per_carton is not None else None
        )
    if "carton_length_cm" in fields_set:
        product.carton_length_cm = (
            _round_float(body.carton_length_cm, 2) if body.carton_length_cm is not None else None
        )
    if "carton_width_cm" in fields_set:
        product.carton_width_cm = (
            _round_float(body.carton_width_cm, 2) if body.carton_width_cm is not None else None
        )
    if "carton_height_cm" in fields_set:
        product.carton_height_cm = (
            _round_float(body.carton_height_cm, 2) if body.carton_height_cm is not None else None
        )
    if "carton_weight_kg" in fields_set:
        product.carton_weight_kg = (
            _round_float(body.carton_weight_kg, 3) if body.carton_weight_kg is not None else None
        )
    if "carton_volume_dm3" in fields_set:
        product.carton_volume_dm3 = (
            _round_float(body.carton_volume_dm3, 2) if body.carton_volume_dm3 is not None else None
        )

    # Optional: update stock (first inventory row or create one)
    stock_qty_val = _parse_float(payload.get("stock_quantity"))
    if stock_qty_val is not None:
        first_inv = (
            db.query(Inventory)
            .filter(
                Inventory.product_id == product.id,
                Inventory.tenant_id == product.tenant_id,
                Inventory.stock_disposition == DEFAULT_STOCK_DISPOSITION,
            )
            .order_by(Inventory.id)
            .first()
        )
        if first_inv is None:
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
            # No inventory row: legacy path — domyślny magazyn 1 + strefa przyjęcia (nie „Import”).
            default_warehouse_id = 1
            from ..services.default_receiving_location import get_or_create_stock_location

            logger.warning(
                "product stock_quantity using legacy default warehouse_id=1 and default receiving location",
                extra={
                    "product_id": product.id,
                    "tenant_id": product.tenant_id,
                    "default_warehouse_id": default_warehouse_id,
                },
            )
            loc = get_or_create_stock_location(db, default_warehouse_id, None)
            inv = Inventory(
                tenant_id=product.tenant_id,
                product_id=product.id,
                warehouse_id=default_warehouse_id,
                location_id=loc.id,
                quantity=qty,
                stock_disposition=DEFAULT_STOCK_DISPOSITION,
            )
            db.add(inv)

    try:
        db.commit()
        db.refresh(product)
        out = _product_to_dict(product)
        out["current_cost"] = calculate_product_margin(db, product.tenant_id, product.id)
        _enrich_product_manufacturer(db, out, product)
        _enrich_product_default_supplier(db, out, product)
        _enrich_product_last_supplier(db, out, product)
        _enrich_product_supplier_catalog_links(db, out, product)
        out["stock_quantity"] = _visible_stock_quantity_for_product(db, product)
        loc_map, inv_map = _inventory_payload_for_product_ids(db, [product.id])
        out["locations"] = loc_map.get(product.id, [])
        out["inventory"] = inv_map.get(product.id, [])
        return out
    except Exception as e:
        db.rollback()
        logger.exception("Product update failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Product update failed: {e!s}") from e


@router.post("/{product_id}/apply-assigned-locations-to-inventory/")
def post_apply_assigned_locations_to_inventory(
    product_id: int,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """
    Explicit one-shot: apply product.assigned_locations to Inventory rows.
    Only active when ENABLE_LEGACY_BRIDGE_APPLY_PLAN is set; use when implicit PUT sync is disabled.
    """
    if not pr_flags.enable_legacy_bridge_apply_plan:
        raise HTTPException(
            status_code=403,
            detail={
                "detail": "Endpoint disabled. Set ENABLE_LEGACY_BRIDGE_APPLY_PLAN to enable explicit assigned_locations → inventory sync.",
                "flag": "ENABLE_LEGACY_BRIDGE_APPLY_PLAN",
            },
        )
    q = db.query(Product).filter(Product.id == product_id)
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == tenant_id)
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if getattr(product, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Product not found")
    assigned = _parse_assigned_locations(product.assigned_locations)
    _sync_inventory_from_assigned_locations(
        db, product, assigned, bypass_sync_disable=True
    )
    try:
        db.commit()
        db.refresh(product)
    except Exception as e:
        db.rollback()
        logger.exception("apply-assigned-locations-to-inventory failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Apply failed: {e!s}") from e
    location_count = len(assigned) if isinstance(assigned, list) else 0
    logger.info(
        "manual plan-to-inventory sync executed",
        extra={
            "product_id": product.id,
            "tenant_id": product.tenant_id,
            "location_count": location_count,
        },
    )
    out = _product_to_dict(product)
    out["current_cost"] = calculate_product_margin(db, product.tenant_id, product.id)
    _enrich_product_manufacturer(db, out, product)
    _enrich_product_default_supplier(db, out, product)
    _enrich_product_last_supplier(db, out, product)
    _enrich_product_supplier_catalog_links(db, out, product)
    out["stock_quantity"] = _visible_stock_quantity_for_product(db, product)
    loc_map, inv_map = _inventory_payload_for_product_ids(db, [product.id])
    out["locations"] = loc_map.get(product.id, [])
    out["inventory"] = inv_map.get(product.id, [])
    out["applied"] = True
    return out


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


@router.post("/bulk-update")
def product_bulk_update(
    body: ProductBulkUpdateExtendedBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Apply one bulk action to many products (tenant-scoped). Single action per request.
    """
    if body.selection_mode == "filtered_query":
        assert body.filters is not None
        pids = _resolve_bulk_product_ids(
            db,
            tenant_id,
            BulkProductsSelection(mode="filtered_query", filters=body.filters),
        )
    else:
        pids = list(dict.fromkeys(body.product_ids))
    n = _execute_product_bulk_update(db, tenant_id, pids, body.action, body.value)
    db.commit()
    return {"updated": n, "action": body.action.strip().lower()}


@router.post("/bulk-delete", response_model=EntityBulkDeleteResult)
def product_bulk_delete_by_selection(body: BulkProductsDeleteBody, db: Session = Depends(get_db)):
    """Usuwa lub archiwizuje produkty wg reguł FK (tenant)."""
    id_list = _resolve_bulk_product_ids(db, body.tenant_id, body.selection)
    if not id_list:
        return EntityBulkDeleteResult()
    result = delete_products_bulk(db, body.tenant_id, id_list)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.delete("/bulk/", response_model=EntityBulkDeleteResult)
def bulk_delete_products(
    ids: str,
    db: Session = Depends(get_db),
    tenant_id: Optional[int] = None,
):
    """Usuwa lub archiwizuje wiele produktów po ID (ids=1,2,3). tenant_id opcjonalnie zawęża do tenanta."""
    if not ids or not ids.strip():
        return EntityBulkDeleteResult()
    id_list = []
    for s in ids.split(","):
        s = s.strip()
        if s.isdigit():
            id_list.append(int(s))
    if not id_list:
        return EntityBulkDeleteResult()
    if tenant_id is None:
        raise HTTPException(status_code=400, detail="tenant_id jest wymagany do bezpiecznego usuwania produktów")
    scoped = (
        db.query(Product.id)
        .filter(Product.tenant_id == tenant_id, Product.id.in_(id_list))
        .all()
    )
    scoped_ids = [int(r[0]) for r in scoped]
    result = delete_products_bulk(db, tenant_id, scoped_ids)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)