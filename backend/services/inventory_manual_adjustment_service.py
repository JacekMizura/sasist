"""Audited manual stock correction via RK warehouse document (HYBRID only)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse import Warehouse
from .document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from .inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number, storage_expiry_date
from .inventory_management_policy_service import assert_manual_adjust_stock_allowed
from .order_item_pick_allocation_service import consume_inventory_fifo_slices
from .stock_disposition import STOCK_DISPOSITION_SALEABLE, normalize_stock_disposition
from .stock_document_factory import create_stock_document
from .stock_operation_issue_service import append_issue_operation
from .stock_operation_receipt_service import append_receipt_operation


def apply_manual_stock_correction(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    quantity_delta: float,
    reason: str,
    stock_disposition: str | None = None,
    batch_number: str | None = None,
    expiration_date: date | None = None,
    user_id: int | None = None,
) -> dict[str, Any]:
    """
    Apply quantity_delta at location with RK stock document + stock operations.

    Positive delta → RECEIPT; negative → FIFO ISSUE slices.
    """
    assert_manual_adjust_stock_allowed(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    delta = float(quantity_delta or 0)
    if abs(delta) < 1e-9:
        raise ValueError("quantity_delta must be non-zero")

    reason_clean = (reason or "").strip()
    if len(reason_clean) < 3:
        raise ValueError("reason is required (min. 3 characters)")

    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if product is None:
        raise ValueError(f"Product {product_id} not found for tenant {tenant_id}")

    location = (
        db.query(Location)
        .filter(Location.id == int(location_id), Location.warehouse_id == int(warehouse_id))
        .first()
    )
    if location is None:
        raise ValueError(f"Location {location_id} not found in warehouse {warehouse_id}")

    sd = normalize_stock_disposition(stock_disposition or STOCK_DISPOSITION_SALEABLE)
    lot_bn = normalize_batch_number(batch_number)
    lot_ed = storage_expiry_date(bool(expiration_date), expiration_date)

    unit_cost = float(getattr(product, "purchase_price", None) or 0.0)

    try:
        series = require_warehouse_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            subtype="RK",
        )
    except Exception:
        series = None

    rk_doc = create_stock_document(
        db,
        context="manual_stock_correction_rk",
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        location_id=int(location_id),
        document_type="RK",
        creation_source="PANEL",
        status="completed",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=user_id,
    )
    if series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        wh_code = str(getattr(wh, "code", None) or "").strip() or None
        assign_series_number_to_stock_document(db, rk_doc, series, warehouse_code=wh_code)

    qty = abs(delta)
    sd_line = StockDocumentItem(
        document_id=int(rk_doc.id),
        product_id=int(product_id),
        ordered_quantity=qty,
        received_quantity=qty,
        quantity=qty,
        purchase_price_net=unit_cost,
        batch_number=lot_bn,
        expiry_date=lot_ed if lot_ed < NO_EXPIRY_SENTINEL else date(9999, 12, 31),
        stock_disposition=sd,
    )
    db.add(sd_line)
    db.flush()

    audit_meta = {
        "manual_correction": True,
        "reason": reason_clean,
        "quantity_delta": delta,
        "stock_disposition": sd,
    }

    if delta > 0:
        upsert_dock_inventory_for_loose_receipt(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            location_id=int(location_id),
            product_id=int(product_id),
            add_qty=float(qty),
            batch_number=lot_bn,
            expiry_date=lot_ed,
            stock_disposition=sd,
        )
        append_receipt_operation(db, rk_doc, sd_line, float(qty))
    else:
        slices = consume_inventory_fifo_slices(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            location_id=int(location_id),
            quantity=float(qty),
            stock_disposition=sd,
        )
        for sl in slices:
            append_issue_operation(
                db,
                rk_doc,
                sd_line,
                float(sl.quantity),
                from_location_id=int(location_id),
                batch_number=sl.batch_number or "",
                expiry_date=sl.expiry_date if sl.expiry_date < NO_EXPIRY_SENTINEL else None,
                operator_admin_id=user_id,
                metadata={
                    "source_document_type": "RK",
                    "manual_correction_reason": reason_clean,
                    **audit_meta,
                },
            )

    db.flush()
    return {
        "stock_document_id": int(rk_doc.id),
        "document_type": str(rk_doc.document_type),
        "document_number": getattr(rk_doc, "document_number", None),
        "quantity_delta": delta,
        "product_id": int(product_id),
        "location_id": int(location_id),
        "stock_disposition": sd,
        "reason": reason_clean,
    }
