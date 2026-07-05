"""Create production PW documents for standard WMS putaway (Rozlokowanie) queue."""

from __future__ import annotations

from datetime import date, datetime
from typing import Iterable

from sqlalchemy.orm import Session

from ...models.product import Product
from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import ProductionOrder
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.warehouse import Warehouse
from ..stock_document_service import (
    NO_EXPIRY_SENTINEL,
    ensure_default_pz_receiving_location_if_missing,
)
from ..stock_operation_receipt_service import append_receipt_operation
from ..document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from ..inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from ..stock_disposition import STOCK_DISPOSITION_SALEABLE


def _create_pw_for_putaway(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    unit_cost: float,
    created_by_user_id: int | None,
    production_batch_id: int | None = None,
    production_batch_line_id: int | None = None,
    production_order_id: int | None = None,
) -> StockDocument:
    doc = StockDocument(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        location_id=None,
        document_type="PW",
        creation_source="PRODUCTION",
        production_batch_id=production_batch_id,
        production_batch_line_id=production_batch_line_id,
        production_order_id=production_order_id,
        # Same WMS gate as PZ after finish_wms_receiving_pz: draft + receiving DONE → Rozlokowanie queue.
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        created_by_user_id=created_by_user_id,
    )
    db.add(doc)
    db.flush()
    ensure_default_pz_receiving_location_if_missing(db, doc)
    try:
        pw_series = require_warehouse_series(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), subtype="PW")
    except Exception:
        pw_series = None
    if pw_series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        assign_series_number_to_stock_document(
            db, doc, pw_series, warehouse_code=str(getattr(wh, "code", None) or "") or None
        )
    staging_loc = int(doc.location_id or 0)
    if staging_loc < 1:
        raise ValueError("Brak lokalizacji staging dla PW produkcyjnego.")
    line = StockDocumentItem(
        document_id=int(doc.id),
        product_id=int(product_id),
        ordered_quantity=float(quantity),
        received_quantity=float(quantity),
        quantity=float(quantity),
        purchase_price_net=float(unit_cost),
        batch_number="",
        expiry_date=date(9999, 12, 31),
    )
    db.add(line)
    db.flush()
    upsert_dock_inventory_for_loose_receipt(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        location_id=staging_loc,
        product_id=int(product_id),
        add_qty=float(quantity),
        batch_number="",
        expiry_date=NO_EXPIRY_SENTINEL,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    append_receipt_operation(db, doc, line, float(quantity))
    from ..stock_document_service import recompute_putaway_status_for_document

    recompute_putaway_status_for_document(doc, [line], db=db)
    doc.updated_at = datetime.utcnow()
    db.flush()
    return doc


def create_batch_pw_documents_for_putaway(
    db: Session,
    *,
    batch: ProductionBatch,
    performed_by_user_id: int | None = None,
) -> list[int]:
    """Create one PW per batch line; inventory at receiving staging — Rozlokowanie handles bins."""
    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(batch.rw_stock_document_id)).first()
        if batch.rw_stock_document_id
        else None
    )
    total_component_cost = 0.0
    if rw_doc is not None:
        for item in rw_doc.items or []:
            total_component_cost += float(item.purchase_price_net or 0) * float(item.quantity or 0)
    total_planned = sum(float(bl.planned_quantity) for bl in batch.lines or []) or 1.0
    pw_ids: list[int] = []
    for bl in batch.lines or []:
        produced = float(bl.completed_quantity or bl.planned_quantity)
        line_share = produced / total_planned
        line_comp_cost = total_component_cost * line_share
        unit_cost = line_comp_cost / produced if produced > 1e-9 else 0.0
        pw_doc = _create_pw_for_putaway(
            db,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product_id=int(bl.product_id),
            quantity=produced,
            unit_cost=unit_cost,
            created_by_user_id=performed_by_user_id,
            production_batch_id=int(batch.id),
            production_batch_line_id=int(bl.id),
        )
        bl.calculated_unit_cost = round(unit_cost, 4)
        bl.pw_stock_document_id = int(pw_doc.id)
        bl.status = "completed"
        prod = db.query(Product).filter(Product.id == int(bl.product_id)).first()
        if prod is not None and unit_cost > 0:
            prod.purchase_price = float(unit_cost)
        pw_ids.append(int(pw_doc.id))
    return pw_ids


def create_order_pw_document_for_putaway(
    db: Session,
    *,
    order: ProductionOrder,
    performed_by_user_id: int | None = None,
) -> int:
    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(order.rw_stock_document_id)).first()
        if order.rw_stock_document_id
        else None
    )
    total_component_cost = 0.0
    if rw_doc is not None:
        for item in rw_doc.items or []:
            total_component_cost += float(item.purchase_price_net or 0) * float(item.quantity or 0)
    produced = float(order.produced_quantity or order.planned_quantity)
    unit_cost = total_component_cost / produced if produced > 1e-9 else 0.0
    pw_doc = _create_pw_for_putaway(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        product_id=int(order.product_id),
        quantity=produced,
        unit_cost=unit_cost,
        created_by_user_id=performed_by_user_id,
        production_order_id=int(order.id),
    )
    order.calculated_unit_cost = round(unit_cost, 4)
    order.pw_stock_document_id = int(pw_doc.id)
    prod = db.query(Product).filter(Product.id == int(order.product_id)).first()
    if prod is not None and unit_cost > 0:
        prod.purchase_price = float(unit_cost)
        prod.updated_at = datetime.utcnow()
    return int(pw_doc.id)
