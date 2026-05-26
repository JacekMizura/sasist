"""Clone a product as a new draft-like row (no stock, history, or WMS tasks)."""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.product import Product
from ..models.supplier_product import SupplierProduct

logger = logging.getLogger(__name__)


def _ensure_supplier_product_link(db: Session, product: Product) -> None:
    sid = getattr(product, "default_supplier_id", None)
    if sid is None or product.id is None:
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
    db.add(
        SupplierProduct(
            tenant_id=product.tenant_id,
            supplier_id=int(sid),
            product_id=product.id,
            purchase_price=getattr(product, "purchase_price", None),
            lead_time_days=None,
            min_order_qty=None,
        )
    )
    db.flush()


class ProductDuplicateError(Exception):
    """Raised when duplication fails at a known step (mapped to HTTP 4xx/5xx)."""

    def __init__(self, step: str, message: str, *, product_id: Optional[int] = None, cause: Optional[Exception] = None):
        self.step = step
        self.message = message
        self.product_id = product_id
        self.cause = cause
        super().__init__(message)


def _copy_name(source_name: Optional[str], source_id: int) -> str:
    base = (source_name or "").strip() or f"Produkt #{source_id}"
    prefix = "KOPIA - "
    out = f"{prefix}{base}"
    return out[:512] if len(out) > 512 else out


def _copy_symbol(source_symbol: Optional[str], source_sku: Optional[str]) -> Optional[str]:
    sym = (source_symbol or source_sku or "").strip()
    if not sym:
        return None
    suffix = "-COPY"
    max_len = 120
    if len(sym) + len(suffix) > max_len:
        return f"{sym[: max_len - len(suffix)]}{suffix}"
    return f"{sym}{suffix}"


def duplicate_product_session(
    db: Session,
    *,
    source_product_id: int,
    tenant_id: int,
) -> Product:
    """
    Create a new product copied from ``source_product_id`` within ``tenant_id``.

  - Clears EAN and assigned locations (no stock plan).
  - Copies WMS / logistics / replenishment / master-carton settings.
  - Copies ``image_url`` reference and ``metadata_json``.
  - Does not copy inventory, picks, purchase history snapshots, or extra EAN rows.
    """
    step = "load_source"
    src = (
        db.query(Product)
        .filter(
            Product.id == int(source_product_id),
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
        )
        .first()
    )
    if src is None:
        logger.warning(
            "duplicate_product: source not found product_id=%s tenant_id=%s",
            source_product_id,
            tenant_id,
        )
        raise ProductDuplicateError(step, "Product not found", product_id=source_product_id)

    logger.info(
        "duplicate_product: start source_id=%s tenant_id=%s name=%r",
        src.id,
        tenant_id,
        src.name,
    )

    try:
        step = "build_row"
        row = Product(
            tenant_id=int(tenant_id),
            name=_copy_name(src.name, int(src.id)),
            ean=None,
            symbol=_copy_symbol(getattr(src, "symbol", None), getattr(src, "sku", None)),
            sku=None,
            length=src.length,
            width=src.width,
            height=src.height,
            weight=src.weight,
            volume=src.volume,
            location=None,
            image_url=(src.image_url or "").strip() or None,
            assigned_locations=json.dumps([]),
            label_template_id=getattr(src, "label_template_id", None),
            sale_price=getattr(src, "sale_price", None),
            purchase_price=getattr(src, "purchase_price", None),
            extra_cost_packaging_net=getattr(src, "extra_cost_packaging_net", 0) or 0,
            extra_cost_commission_percent=getattr(src, "extra_cost_commission_percent", 0) or 0,
            extra_cost_other_net=getattr(src, "extra_cost_other_net", 0) or 0,
            previous_purchase_price=None,
            purchase_price_original=None,
            purchase_currency=None,
            last_purchased_at=None,
            last_purchase_date=None,
            last_supplier_id=None,
            last_purchase_currency=None,
            manufacturer_id=getattr(src, "manufacturer_id", None),
            manufacturer=getattr(src, "manufacturer", None),
            default_supplier_id=getattr(src, "default_supplier_id", None),
            unit=getattr(src, "unit", None),
            catalog_number=getattr(src, "catalog_number", None),
            metadata_json=getattr(src, "metadata_json", None),
            orientation_type=getattr(src, "orientation_type", None),
            shape_type=getattr(src, "shape_type", None),
            stack_compressible=getattr(src, "stack_compressible", None),
            compressed_height_cm=getattr(src, "compressed_height_cm", None),
            max_stack_weight=getattr(src, "max_stack_weight", None),
            stack_behavior=getattr(src, "stack_behavior", None),
            min_pick_quantity=getattr(src, "min_pick_quantity", None),
            max_pick_quantity=getattr(src, "max_pick_quantity", None),
            min_reserve_quantity=getattr(src, "min_reserve_quantity", None),
            max_reserve_quantity=getattr(src, "max_reserve_quantity", None),
            enable_stock_alert=getattr(src, "enable_stock_alert", None),
            min_total_stock=getattr(src, "min_total_stock", None),
            track_batch=bool(getattr(src, "track_batch", False)),
            track_expiry=bool(getattr(src, "track_expiry", False)),
            track_serial=bool(getattr(src, "track_serial", False)),
            require_recv_height=bool(getattr(src, "require_recv_height", False)),
            require_recv_width=bool(getattr(src, "require_recv_width", False)),
            require_recv_length=bool(getattr(src, "require_recv_length", False)),
            require_recv_weight=bool(getattr(src, "require_recv_weight", False)),
            require_recv_master_carton=bool(getattr(src, "require_recv_master_carton", False)),
            require_recv_master_carton_ean=bool(getattr(src, "require_recv_master_carton_ean", False)),
            require_recv_master_carton_qty=bool(getattr(src, "require_recv_master_carton_qty", False)),
            require_recv_master_carton_dims=bool(getattr(src, "require_recv_master_carton_dims", False)),
            require_recv_master_carton_weight=bool(getattr(src, "require_recv_master_carton_weight", False)),
            bulk_ean=(getattr(src, "bulk_ean", None) or "").strip() or None,
            units_per_carton=getattr(src, "units_per_carton", None),
            carton_length_cm=getattr(src, "carton_length_cm", None),
            carton_width_cm=getattr(src, "carton_width_cm", None),
            carton_height_cm=getattr(src, "carton_height_cm", None),
            carton_weight_kg=getattr(src, "carton_weight_kg", None),
            carton_volume_dm3=getattr(src, "carton_volume_dm3", None),
            carton_orientation_type=getattr(src, "carton_orientation_type", None),
            carton_shape_type=getattr(src, "carton_shape_type", None),
            carton_stack_behavior=getattr(src, "carton_stack_behavior", None),
            carton_stack_compressible=getattr(src, "carton_stack_compressible", None),
            carton_compressed_height_cm=getattr(src, "carton_compressed_height_cm", None),
            carton_max_stack_weight=getattr(src, "carton_max_stack_weight", None),
            deleted_at=None,
        )

        step = "insert"
        db.add(row)
        db.flush()

        step = "assign_barcode"
        from .barcode_generation import next_product_barcode

        row.barcode = next_product_barcode(db, int(tenant_id))

        step = "supplier_link"
        _ensure_supplier_product_link(db, row)

        step = "commit"
        db.commit()
        db.refresh(row)
        logger.info(
            "duplicate_product: success source_id=%s new_id=%s tenant_id=%s",
            source_product_id,
            row.id,
            tenant_id,
        )
        return row

    except IntegrityError as exc:
        db.rollback()
        logger.exception(
            "duplicate_product: integrity error step=%s source_id=%s tenant_id=%s",
            step,
            source_product_id,
            tenant_id,
        )
        detail = "Duplicate product failed: unique constraint (EAN, barcode, or catalog code)."
        orig = getattr(exc, "orig", None)
        if orig is not None:
            detail = f"{detail} ({orig})"
        raise ProductDuplicateError(
            step,
            detail,
            product_id=source_product_id,
            cause=exc,
        ) from exc
    except ProductDuplicateError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "duplicate_product: unexpected error step=%s source_id=%s tenant_id=%s",
            step,
            source_product_id,
            tenant_id,
        )
        raise ProductDuplicateError(
            step,
            f"Duplicate product failed at {step}: {exc}",
            product_id=source_product_id,
            cause=exc,
        ) from exc


def duplicate_product_or_http(
    db: Session,
    *,
    source_product_id: int,
    tenant_id: int,
) -> Product:
    try:
        return duplicate_product_session(db, source_product_id=source_product_id, tenant_id=tenant_id)
    except ProductDuplicateError as err:
        status = 409 if err.step == "insert" or "integrity" in err.message.lower() else 400
        if err.step == "load_source":
            status = 404
        raise HTTPException(
            status_code=status,
            detail={"message": err.message, "step": err.step, "product_id": err.product_id},
        ) from err
