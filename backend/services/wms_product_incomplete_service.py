"""List products with incomplete required receiving master data (one row per product)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.product import Product
from ..schemas.wms_product_incomplete import (
    WmsProductIncompleteListOut,
    WmsProductIncompleteRow,
    WmsProductIncompleteScanResolve,
)
from .product_receiving_requirements import (
    product_has_active_receiving_requirements,
    product_to_receiving_data_dict,
    validate_required_product_data,
)
from .product_validation_policy import load_wms_settings_for_product
from .wms_packing_service import _primary_location_for_product

logger = logging.getLogger(__name__)

EFFECTIVE_UNSEQUENCED = 2_000_000_000


@dataclass(frozen=True)
class _PrimaryLocCtx:
    label: Optional[str]
    location_id: Optional[int]
    zone: Optional[str]
    sort_key: Tuple[Any, ...]


def _scalar_query_first(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return value[0]
    except (TypeError, IndexError):
        return value


def _warehouse_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> float:
    try:
        raw = (
            db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.warehouse_id == int(warehouse_id),
                Inventory.product_id == int(product_id),
                Inventory.quantity > 1e-9,
            )
            .scalar()
        )
        return float(raw or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _effective_pick_sequence(pick_sequence: int | None) -> int:
    return int(pick_sequence) if pick_sequence is not None else EFFECTIVE_UNSEQUENCED


def _location_route_sort_key(loc: Location | None, *, fallback_code: str = "") -> Tuple[Any, ...]:
    """Sort like picking route: sequenced locations first, then code."""
    if loc is None:
        code = (fallback_code or "").strip().lower()
        return (1, EFFECTIVE_UNSEQUENCED, code, 0)
    code = (loc.name or "").strip().lower()
    return (0, _effective_pick_sequence(getattr(loc, "pick_sequence", None)), code, int(loc.id))


def _zone_label_for_location(loc: Location | None, *, fallback_code: str = "") -> Optional[str]:
    if loc is None:
        return None
    rack = (getattr(loc, "rack_name", None) or "").strip()
    if rack:
        return rack
    code = (loc.name or fallback_code or "").strip()
    return code or None


def _batch_primary_location_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: List[int],
) -> Dict[int, _PrimaryLocCtx]:
    if not product_ids:
        return {}

    rows = (
        db.query(
            Inventory.product_id,
            Location.id,
            Location.name,
            Location.pick_sequence,
            Location.rack_name,
            Inventory.quantity,
        )
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id.in_([int(p) for p in product_ids]),
            Location.warehouse_id == int(warehouse_id),
            Inventory.quantity > 1e-9,
        )
        .all()
    )

    best: Dict[int, Tuple[float, int, str, Any, Any]] = {}
    for pid, loc_id, name, pick_seq, rack_name, qty in rows:
        pid_i = int(pid)
        q = float(qty or 0)
        prev = best.get(pid_i)
        if prev is None or q > prev[0]:
            best[pid_i] = (q, int(loc_id), str(name or ""), pick_seq, rack_name)

    out: Dict[int, _PrimaryLocCtx] = {}
    for pid_i, (_q, loc_id, name, pick_seq, rack_name) in best.items():
        label = name.strip() or None
        code = label or ""
        rack_s = (rack_name or "").strip() if rack_name is not None else ""
        zone = rack_s or code or None
        sort_key = (
            0,
            _effective_pick_sequence(int(pick_seq) if pick_seq is not None else None),
            code.lower(),
            int(loc_id),
        )
        out[pid_i] = _PrimaryLocCtx(
            label=label,
            location_id=int(loc_id),
            zone=zone,
            sort_key=sort_key,
        )
    return out


def _primary_loc_ctx_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product_id: int,
    batch: Dict[int, _PrimaryLocCtx],
) -> _PrimaryLocCtx:
    if warehouse_id is not None:
        hit = batch.get(int(product_id))
        if hit is not None:
            return hit
        label, _qty, _hint = _primary_location_for_product(
            db, int(tenant_id), int(warehouse_id), int(product_id)
        )
        label_s = (label or "").strip() or None
        if not label_s:
            return _PrimaryLocCtx(label=None, location_id=None, zone=None, sort_key=_location_route_sort_key(None))
        loc_row = (
            db.query(Location)
            .filter(
                Location.warehouse_id == int(warehouse_id),
                Location.name == label_s,
            )
            .first()
        )
        return _PrimaryLocCtx(
            label=label_s,
            location_id=int(loc_row.id) if loc_row else None,
            zone=_zone_label_for_location(loc_row, fallback_code=label_s),
            sort_key=_location_route_sort_key(loc_row, fallback_code=label_s),
        )
    return _PrimaryLocCtx(label=None, location_id=None, zone=None, sort_key=_location_route_sort_key(None))


def _missing_field_labels_from_validation(product: Product, wms_settings=None) -> Tuple[List[str], List[str]]:
    v = validate_required_product_data(product, wms_settings)
    keys = [m.key for m in v.missing]
    labels = [f"Brak {m.label.lower()}" for m in v.missing]
    return keys, labels


def _row_from_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    product: Product,
    loc_ctx: _PrimaryLocCtx,
    wms_settings=None,
) -> WmsProductIncompleteRow:
    recv = product_to_receiving_data_dict(product, wms_settings)
    missing_fields, missing_field_labels = _missing_field_labels_from_validation(product, wms_settings)
    wh_qty = 0.0
    if warehouse_id is not None:
        wh_qty = _warehouse_qty(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product.id),
        )
    sku = (getattr(product, "sku", None) or getattr(product, "symbol", None) or "")
    sku_s = str(sku).strip() or None
    name = (product.name or "").strip() or f"Produkt #{product.id}"
    img_raw = getattr(product, "image_url", None)
    img_s = str(img_raw).strip() if img_raw is not None else ""
    ean_s = (product.ean or "").strip() or None

    return WmsProductIncompleteRow(
        product_id=int(product.id),
        sku=sku_s,
        ean=ean_s,
        name=name,
        image_url=img_s or None,
        location_label=loc_ctx.label,
        location_zone=loc_ctx.zone,
        stock=wh_qty,
        missing_fields=missing_fields,
        missing_field_labels=missing_field_labels,
        required_rules=dict(recv.get("requirements") or {}),
        editable_values=dict(recv.get("values") or {}),
        force_wms_completion=bool(recv.get("force_wms_completion")),
        product_name=name,
        product_ean=ean_s,
        product_sku=sku_s,
        warehouse_qty=wh_qty,
        missing_labels=list(recv.get("badge_labels") or []),
    )


def list_incomplete_receiving_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
    limit: int = 200,
) -> WmsProductIncompleteListOut:
    rows = (
        db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), Product.deleted_at.is_(None))
        .order_by(Product.id.desc())
        .limit(5000)
        .all()
    )
    wh_id = int(warehouse_id) if warehouse_id is not None else None
    wms_settings = load_wms_settings_for_product(db, tenant_id=int(tenant_id), warehouse_id=wh_id)
    candidates: List[Product] = []
    skipped = 0

    for p in rows:
        try:
            if not product_has_active_receiving_requirements(p, wms_settings):
                continue
            v = validate_required_product_data(p, wms_settings)
            if not v.missing:
                continue
            candidates.append(p)
        except Exception:
            skipped += 1
            logger.warning(
                "incomplete-receiving-data: skip product_id=%s tenant_id=%s",
                getattr(p, "id", None),
                tenant_id,
                exc_info=True,
            )

    if skipped:
        logger.info(
            "incomplete-receiving-data: skipped %s product(s) due to errors (tenant_id=%s)",
            skipped,
            tenant_id,
        )

    batch_loc: Dict[int, _PrimaryLocCtx] = {}
    if wh_id is not None and candidates:
        batch_loc = _batch_primary_location_context(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=wh_id,
            product_ids=[int(p.id) for p in candidates],
        )

    built: List[Tuple[Tuple[Any, ...], WmsProductIncompleteRow]] = []
    without_location = 0
    for p in candidates:
        try:
            loc_ctx = _primary_loc_ctx_for_product(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=wh_id,
                product_id=int(p.id),
                batch=batch_loc,
            )
            if not loc_ctx.label:
                without_location += 1
            row = _row_from_product(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=wh_id,
                product=p,
                loc_ctx=loc_ctx,
                wms_settings=wms_settings,
            )
            built.append((loc_ctx.sort_key, row))
        except Exception:
            logger.warning(
                "incomplete-receiving-data: skip build product_id=%s",
                getattr(p, "id", None),
                exc_info=True,
            )

    built.sort(key=lambda x: x[0])
    out = [r for _k, r in built]
    total = len(out)
    cap = max(1, min(500, int(limit)))
    return WmsProductIncompleteListOut(
        items=out[:cap],
        total=total,
        without_location_count=without_location,
    )


def _normalize_scan_code(code: str) -> str:
    return "".join(str(code or "").strip().upper().split())


def resolve_incomplete_product_scan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    code: str,
) -> Optional[WmsProductIncompleteScanResolve]:
    norm = _normalize_scan_code(code)
    if len(norm) < 2:
        return None
    listing = list_incomplete_receiving_products(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        limit=500,
    )
    for row in listing.items:
        ean = _normalize_scan_code(row.ean or "")
        sku = _normalize_scan_code(row.sku or "")
        if norm == ean or norm == sku:
            return WmsProductIncompleteScanResolve(
                product_id=int(row.product_id),
                location_label=row.location_label,
            )
    return None
