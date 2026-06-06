"""GET /products/{id} payload builder — staged logging, null-safe enrichment, degraded fallback."""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..database import engine
from ..models.product import Product

logger = logging.getLogger(__name__)

_PRODUCT_DETAIL_SCHEMA_READY = False


def _log_detail_stage(
    *,
    product_id: int,
    tenant_id: Optional[int],
    serializer_stage: str,
    success: bool,
    warehouse_id: Optional[int] = None,
) -> None:
    logger.info(
        "[product.detail] %s",
        json.dumps(
            {
                "product_id": product_id,
                "tenant_id": tenant_id,
                "warehouse_id": warehouse_id,
                "serializer_stage": serializer_stage,
                "success": success,
            },
            ensure_ascii=False,
        ),
    )


def _log_detail_error(
    *,
    product_id: int,
    tenant_id: Optional[int],
    serializer_stage: str,
    exc: BaseException,
) -> None:
    logger.exception(
        "[product.detail.error] product_id=%s tenant_id=%s serializer_stage=%s error=%s: %s",
        product_id,
        tenant_id,
        serializer_stage,
        type(exc).__name__,
        exc,
    )


def ensure_product_detail_read_schema() -> None:
    global _PRODUCT_DETAIL_SCHEMA_READY
    if _PRODUCT_DETAIL_SCHEMA_READY:
        return
    from ..db.schema_upgrade import ensure_products_detail_read_schema

    try:
        ensure_products_detail_read_schema(engine)
    except Exception as exc:
        _log_detail_error(
            product_id=0,
            tenant_id=None,
            serializer_stage="schema_sync",
            exc=exc,
        )
    _PRODUCT_DETAIL_SCHEMA_READY = True


def _safe_optional_float(value: object) -> Optional[float]:
    if value is None:
        return None
    try:
        if isinstance(value, Decimal):
            return float(value)
        return float(value)
    except (TypeError, ValueError):
        return None


def minimal_product_detail_payload(product: Product, *, degraded_reason: Optional[str] = None) -> dict[str, Any]:
    """Minimal safe payload when extended serialization fails."""
    symbol = getattr(product, "symbol", None) or getattr(product, "sku", None)
    return {
        "id": int(product.id),
        "tenant_id": int(product.tenant_id),
        "name": (product.name or "").strip() or None,
        "ean": (product.ean or "").strip() or None,
        "symbol": (symbol or "").strip() or None,
        "image_url": getattr(product, "image_url", None),
        "unit": getattr(product, "unit", None),
        "manufacturer": getattr(product, "manufacturer", None),
        "manufacturer_id": getattr(product, "manufacturer_id", None),
        "manufacturer_brief": None,
        "default_supplier_id": getattr(product, "default_supplier_id", None),
        "default_supplier_brief": None,
        "last_supplier_id": getattr(product, "last_supplier_id", None),
        "last_supplier_brief": None,
        "sale_price": _safe_optional_float(getattr(product, "sale_price", None)),
        "purchase_price": _safe_optional_float(getattr(product, "purchase_price", None)),
        "stock_quantity": 0,
        "locations": [],
        "inventory": [],
        "assigned_locations": [],
        "supplier_catalog_links": [],
        "current_cost": None,
        "metadata_json": None,
        "gpsr_responsible_name": None,
        "gpsr_responsible_email": None,
        "detail_degraded": True,
        "detail_degraded_reason": degraded_reason,
    }


def _run_detail_stage(
    *,
    product_id: int,
    tenant_id: int,
    stage: str,
    fn: Callable[[], None],
) -> bool:
    try:
        fn()
        _log_detail_stage(product_id=product_id, tenant_id=tenant_id, serializer_stage=stage, success=True)
        return True
    except Exception as exc:
        _log_detail_error(product_id=product_id, tenant_id=tenant_id, serializer_stage=stage, exc=exc)
        _log_detail_stage(product_id=product_id, tenant_id=tenant_id, serializer_stage=stage, success=False)
        return False


def build_product_detail_payload(
    db: Session,
    *,
    product_id: int,
    tenant_id: Optional[int],
    warehouse_id: Optional[int] = None,
) -> dict[str, Any]:
    ensure_product_detail_read_schema()

    q = db.query(Product).filter(Product.id == int(product_id))
    if tenant_id is not None:
        q = q.filter(Product.tenant_id == int(tenant_id))
    product = q.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if getattr(product, "deleted_at", None) is not None:
        raise HTTPException(status_code=404, detail="Product not found")

    tid = int(product.tenant_id)
    pid = int(product.id)

    from ..api.product import (
        _enrich_product_default_supplier,
        _enrich_product_last_supplier,
        _enrich_product_manufacturer,
        _enrich_product_supplier_catalog_links,
        _product_to_dict,
    )
    from ..services.product_cost_service import calculate_product_margin
    from ..services.product_inventory_display_service import apply_inventory_display_to_dict

    try:
        out = _product_to_dict(product)
        _log_detail_stage(product_id=pid, tenant_id=tid, serializer_stage="base_dict", success=True)
    except Exception as exc:
        _log_detail_error(product_id=pid, tenant_id=tid, serializer_stage="base_dict", exc=exc)
        return minimal_product_detail_payload(product, degraded_reason="base_dict")

    degraded_reason: Optional[str] = None

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="current_cost",
        fn=lambda: out.update({"current_cost": calculate_product_margin(db, tid, pid)}),
    ):
        out["current_cost"] = None
        degraded_reason = degraded_reason or "current_cost"

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="manufacturer",
        fn=lambda: _enrich_product_manufacturer(db, out, product),
    ):
        out.setdefault("manufacturer_brief", None)
        out.setdefault("gpsr_responsible_name", None)
        out.setdefault("gpsr_responsible_email", None)
        degraded_reason = degraded_reason or "manufacturer"

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="default_supplier",
        fn=lambda: _enrich_product_default_supplier(db, out, product),
    ):
        out.setdefault("default_supplier_brief", None)
        degraded_reason = degraded_reason or "default_supplier"

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="last_supplier",
        fn=lambda: _enrich_product_last_supplier(db, out, product),
    ):
        out.setdefault("last_supplier_brief", None)
        degraded_reason = degraded_reason or "last_supplier"

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="supplier_catalog",
        fn=lambda: _enrich_product_supplier_catalog_links(db, out, product),
    ):
        out["supplier_catalog_links"] = []
        degraded_reason = degraded_reason or "supplier_catalog"

    def _attach_inventory_display() -> None:
        apply_inventory_display_to_dict(
            db,
            out,
            product,
            warehouse_id=warehouse_id,
            log_tag="product.detail.stock",
            locations_data_failed=False,
        )

    if not _run_detail_stage(
        product_id=pid,
        tenant_id=tid,
        stage="inventory_display",
        fn=_attach_inventory_display,
    ):
        out["stock_quantity"] = 0
        out["location_allocated_quantity"] = 0
        out["unallocated_quantity"] = 0
        out["reserved_quantity"] = 0
        out["available_quantity"] = 0
        out["locations"] = []
        out["inventory"] = []
        out["locations_load_incomplete"] = True
        degraded_reason = degraded_reason or "inventory_display"

    if degraded_reason:
        out["detail_degraded"] = True
        out["detail_degraded_reason"] = degraded_reason

    _log_detail_stage(
        product_id=pid,
        tenant_id=tid,
        serializer_stage="complete",
        success=True,
        warehouse_id=warehouse_id,
    )
    return out
