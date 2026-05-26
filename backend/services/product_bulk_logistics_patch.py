"""Batch partial updates for product logistics / WMS fields (multi-action list)."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Set

from fastapi import HTTPException
from sqlalchemy import Column
from sqlalchemy.orm import Session

from ..models.product import Product

# API field name -> SQLAlchemy column on Product
_PATCH_COLUMN_MAP: Dict[str, Column] = {
    # WMS receiving requirements
    "require_recv_height": Product.require_recv_height,
    "require_recv_width": Product.require_recv_width,
    "require_recv_length": Product.require_recv_length,
    "require_recv_weight": Product.require_recv_weight,
    "require_recv_master_carton": Product.require_recv_master_carton,
    "require_recv_master_carton_ean": Product.require_recv_master_carton_ean,
    "require_recv_master_carton_qty": Product.require_recv_master_carton_qty,
    "require_recv_master_carton_dims": Product.require_recv_master_carton_dims,
    "require_recv_master_carton_weight": Product.require_recv_master_carton_weight,
    "track_batch": Product.track_batch,
    "track_expiry": Product.track_expiry,
    "track_serial": Product.track_serial,
    # Unit logistics
    "length": Product.length,
    "width": Product.width,
    "height": Product.height,
    "weight": Product.weight,
    "volume": Product.volume,
    # Master carton
    "bulk_ean": Product.bulk_ean,
    "units_per_carton": Product.units_per_carton,
    "carton_length_cm": Product.carton_length_cm,
    "carton_width_cm": Product.carton_width_cm,
    "carton_height_cm": Product.carton_height_cm,
    "carton_weight_kg": Product.carton_weight_kg,
    "carton_volume_dm3": Product.carton_volume_dm3,
    # Replenishment
    "min_pick_quantity": Product.min_pick_quantity,
    "max_pick_quantity": Product.max_pick_quantity,
    "min_reserve_quantity": Product.min_reserve_quantity,
    "max_reserve_quantity": Product.max_reserve_quantity,
    # Orientation / stacking (unit)
    "orientation_type": Product.orientation_type,
    "shape_type": Product.shape_type,
    "stack_behavior": Product.stack_behavior,
    "stack_compressible": Product.stack_compressible,
    "compressed_height_cm": Product.compressed_height_cm,
    "max_stack_weight": Product.max_stack_weight,
    # Carton orientation / stacking
    "carton_orientation_type": Product.carton_orientation_type,
    "carton_shape_type": Product.carton_shape_type,
    "carton_stack_behavior": Product.carton_stack_behavior,
    "carton_stack_compressible": Product.carton_stack_compressible,
    "carton_compressed_height_cm": Product.carton_compressed_height_cm,
    "carton_max_stack_weight": Product.carton_max_stack_weight,
}

# Aliases accepted in patch payload (same as single-product API)
_PATCH_ALIASES: Dict[str, str] = {
    "product_orientation_type": "orientation_type",
    "product_shape_type": "shape_type",
    "product_stack_behavior": "stack_behavior",
    "product_stack_compressible": "stack_compressible",
    "product_compressed_height_cm": "compressed_height_cm",
    "product_max_stack_weight": "max_stack_weight",
}

_CLEAR_LOGISTICS_UNIT_FIELDS: tuple[str, ...] = (
    "length",
    "width",
    "height",
    "weight",
    "volume",
    "bulk_ean",
    "units_per_carton",
    "carton_length_cm",
    "carton_width_cm",
    "carton_height_cm",
    "carton_weight_kg",
    "carton_volume_dm3",
)

_ORIENTATION_VALUES = frozenset({"any", "upright", "no_stack"})
_SHAPE_VALUES = frozenset({"box", "cylinder"})
_STACK_BEHAVIOR_VALUES = frozenset({"stackable", "no_stack"})

_BOOL_FIELDS = frozenset(
    {
        "require_recv_height",
        "require_recv_width",
        "require_recv_length",
        "require_recv_weight",
        "require_recv_master_carton",
        "require_recv_master_carton_ean",
        "require_recv_master_carton_qty",
        "require_recv_master_carton_dims",
        "require_recv_master_carton_weight",
        "track_batch",
        "track_expiry",
        "track_serial",
        "stack_compressible",
        "carton_stack_compressible",
    }
)


def _round_float(v: float, places: int) -> float:
    return round(float(v), places)


def _coerce_patch_value(field: str, raw: Any) -> Any:
    if raw is None:
        return None
    if field in _BOOL_FIELDS:
        return bool(raw)
    if field in ("orientation_type", "carton_orientation_type"):
        s = str(raw).strip().lower()
        if s not in _ORIENTATION_VALUES:
            raise HTTPException(status_code=400, detail=f"Invalid {field}: {s}")
        return s
    if field in ("shape_type", "carton_shape_type"):
        s = str(raw).strip().lower()
        if s not in _SHAPE_VALUES:
            raise HTTPException(status_code=400, detail=f"Invalid {field}: {s}")
        return s
    if field in ("stack_behavior", "carton_stack_behavior"):
        s = str(raw).strip().lower()
        if s not in _STACK_BEHAVIOR_VALUES:
            raise HTTPException(status_code=400, detail=f"Invalid {field}: {s}")
        return s
    if field == "bulk_ean":
        s = str(raw).strip()
        return s or None
    try:
        n = float(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number")
    if field in ("min_pick_quantity", "max_pick_quantity", "min_reserve_quantity", "max_reserve_quantity", "units_per_carton"):
        if n < 0:
            raise HTTPException(status_code=400, detail=f"{field} must be >= 0")
        return _round_float(n, 3)
    if field in ("length", "width", "height", "carton_length_cm", "carton_width_cm", "carton_height_cm"):
        if n <= 0:
            raise HTTPException(status_code=400, detail=f"{field} must be > 0")
        return _round_float(n, 2)
    if n < 0:
        raise HTTPException(status_code=400, detail=f"{field} must be >= 0")
    return _round_float(n, 3)


def _normalize_patch_keys(set_fields: Mapping[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, val in set_fields.items():
        k = _PATCH_ALIASES.get(key, key)
        if k == "require_dimensions":
            out["require_recv_height"] = bool(val)
            out["require_recv_width"] = bool(val)
            out["require_recv_length"] = bool(val)
            continue
        if k not in _PATCH_COLUMN_MAP:
            raise HTTPException(status_code=400, detail=f"Unknown patch field: {key}")
        out[k] = val
    return out


def _validate_replenishment_ranges(set_fields: Dict[str, Any]) -> None:
    pairs = (
        ("min_pick_quantity", "max_pick_quantity"),
        ("min_reserve_quantity", "max_reserve_quantity"),
    )
    for lo_key, hi_key in pairs:
        if lo_key in set_fields and hi_key in set_fields:
            lo = set_fields[lo_key]
            hi = set_fields[hi_key]
            if lo is not None and hi is not None and float(lo) > float(hi):
                raise HTTPException(status_code=400, detail=f"{lo_key} must be <= {hi_key}")


def _maybe_volume_from_dims(update: Dict[Column, Any], set_fields: Dict[str, Any]) -> None:
    if not all(k in set_fields for k in ("length", "width", "height")):
        return
    L, W, H = set_fields["length"], set_fields["width"], set_fields["height"]
    if L is None or W is None or H is None:
        return
    update[Product.volume] = _round_float((float(L) * float(W) * float(H)) / 1000.0, 2)


def _maybe_carton_volume_from_dims(update: Dict[Column, Any], set_fields: Dict[str, Any]) -> None:
    keys = ("carton_length_cm", "carton_width_cm", "carton_height_cm")
    if not all(k in set_fields for k in keys):
        return
    L, W, H = set_fields["carton_length_cm"], set_fields["carton_width_cm"], set_fields["carton_height_cm"]
    if L is None or W is None or H is None:
        return
    update[Product.carton_volume_dm3] = _round_float((float(L) * float(W) * float(H)) / 1000.0, 2)


def apply_product_logistics_patch(
    db: Session,
    filt,
    value: Any,
) -> int:
    """
    Partial update: only keys in ``set`` / ``clear`` are touched.

    ``value`` shape: ``{"set": {field: value}, "clear": [field, ...]}``
    """
    if not isinstance(value, dict):
        raise HTTPException(status_code=400, detail="value must be object with set and/or clear")

    raw_set = value.get("set") or {}
    raw_clear = value.get("clear") or []
    if not isinstance(raw_set, dict):
        raise HTTPException(status_code=400, detail="set must be an object")
    if not isinstance(raw_clear, list):
        raise HTTPException(status_code=400, detail="clear must be a list")

    set_fields = _normalize_patch_keys(raw_set)
    clear_keys: List[str] = []
    for key in raw_clear:
        k = _PATCH_ALIASES.get(str(key), str(key))
        if k == "require_dimensions":
            clear_keys.extend(["require_recv_height", "require_recv_width", "require_recv_length"])
            continue
        if k not in _PATCH_COLUMN_MAP:
            raise HTTPException(status_code=400, detail=f"Unknown clear field: {key}")
        clear_keys.append(k)

    _validate_replenishment_ranges(set_fields)

    update: Dict[Column, Any] = {}
    for field, raw in set_fields.items():
        update[_PATCH_COLUMN_MAP[field]] = _coerce_patch_value(field, raw)
    for field in clear_keys:
        update[_PATCH_COLUMN_MAP[field]] = None

    _maybe_volume_from_dims(update, set_fields)
    _maybe_carton_volume_from_dims(update, set_fields)

    if not update:
        raise HTTPException(status_code=400, detail="No fields to update — enable at least one field")

    return db.query(Product).filter(filt).update(update, synchronize_session=False)


def apply_clear_unit_logistics(db: Session, filt) -> int:
    update = {_PATCH_COLUMN_MAP[k]: None for k in _CLEAR_LOGISTICS_UNIT_FIELDS}
    return db.query(Product).filter(filt).update(update, synchronize_session=False)


def apply_toggle_master_carton_pack(db: Session, filt, value: Any) -> int:
    if not isinstance(value, dict) or "enabled" not in value:
        raise HTTPException(status_code=400, detail="value must be { enabled: boolean }")
    on = bool(value.get("enabled"))
    update = {
        Product.require_recv_master_carton: on,
        Product.require_recv_master_carton_ean: on,
        Product.require_recv_master_carton_qty: on,
        Product.require_recv_master_carton_dims: on,
        Product.require_recv_master_carton_weight: on,
    }
    return db.query(Product).filter(filt).update(update, synchronize_session=False)
