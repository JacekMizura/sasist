"""Create production PW documents for standard WMS putaway (Rozlokowanie) queue."""

from __future__ import annotations

from datetime import date, datetime

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


def _new_pw_header(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
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
        pw_series = require_warehouse_series(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), subtype="PW"
        )
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
    return doc


def _append_pw_line_with_staging(
    db: Session,
    *,
    doc: StockDocument,
    product_id: int,
    quantity: float,
    unit_cost: float,
    performed_by_user_id: int | None,
    trace_snapshot: dict | None = None,
) -> StockDocumentItem:
    staging_loc = int(doc.location_id or 0)
    if staging_loc < 1:
        raise ValueError("Brak lokalizacji staging dla PW produkcyjnego.")
    batch_number = ""
    expiry_date = NO_EXPIRY_SENTINEL
    serials: list[str] = []
    if trace_snapshot is not None:
        from .production_fg_traceability import snapshot_lot_values

        batch_number, expiry_date = snapshot_lot_values(trace_snapshot)
        serials = list(trace_snapshot.get("serial_numbers") or [])
    line = StockDocumentItem(
        document_id=int(doc.id),
        product_id=int(product_id),
        ordered_quantity=float(quantity),
        received_quantity=float(quantity),
        quantity=float(quantity),
        purchase_price_net=float(unit_cost),
        batch_number=batch_number,
        expiry_date=expiry_date,
    )
    db.add(line)
    db.flush()
    upsert_dock_inventory_for_loose_receipt(
        db,
        tenant_id=int(doc.tenant_id),
        warehouse_id=int(doc.warehouse_id),
        location_id=staging_loc,
        product_id=int(product_id),
        add_qty=float(quantity),
        batch_number=batch_number,
        expiry_date=expiry_date,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    if serials:
        for serial in serials:
            append_receipt_operation(db, doc, line, 1.0, serial_number=serial)
        from ..inventory_serial_service import register_serial_on_hand

        for serial in serials:
            register_serial_on_hand(
                db,
                tenant_id=int(doc.tenant_id),
                product_id=int(product_id),
                serial_number=serial,
                batch_number=batch_number,
                expiry_date=expiry_date,
                warehouse_id=int(doc.warehouse_id),
                location_id=staging_loc,
                carrier_id=None,
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
                source_document_id=int(doc.id),
                document_line_id=int(line.id),
            )
    else:
        append_receipt_operation(db, doc, line, float(quantity))
    from .production_warehouse_audit import record_production_pw_receipt_audit

    record_production_pw_receipt_audit(
        db,
        pw_doc=doc,
        product_id=int(product_id),
        quantity=float(quantity),
        staging_location_id=staging_loc,
        performed_by_user_id=performed_by_user_id,
    )
    return line


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
    trace_snapshot: dict | None = None,
) -> StockDocument:
    """Single-product PW (MO / legacy). Batch multi-FG uses create_batch_pw_documents_for_putaway."""
    doc = _new_pw_header(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        created_by_user_id=created_by_user_id,
        production_batch_id=production_batch_id,
        production_batch_line_id=production_batch_line_id,
        production_order_id=production_order_id,
    )
    _append_pw_line_with_staging(
        db,
        doc=doc,
        product_id=product_id,
        quantity=quantity,
        unit_cost=unit_cost,
        performed_by_user_id=created_by_user_id,
        trace_snapshot=trace_snapshot,
    )
    from ..stock_document_service import recompute_putaway_status_for_document

    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc.id))
        .all()
    )
    recompute_putaway_status_for_document(doc, items, db=db)
    doc.updated_at = datetime.utcnow()
    db.flush()
    return doc


def create_batch_pw_documents_for_putaway(
    db: Session,
    *,
    batch: ProductionBatch,
    performed_by_user_id: int | None = None,
) -> list[int]:
    """Create exactly one multi-line PW for the whole ProductionBatch (idempotent).

    All batch lines share the same ``pw_stock_document_id``. Standard WMS putaway
    relocates each line independently; document/batch complete when the whole PW is DONE.
    """
    lines = list(batch.lines or [])
    if not lines:
        return []
    from .production_fg_traceability import (
        lock_fg_traceability_snapshot,
        read_fg_traceability_snapshot,
    )

    for bl in lines:
        if read_fg_traceability_snapshot(bl) is not None:
            continue
        product = db.query(Product).filter(Product.id == int(bl.product_id)).first()
        if product is None:
            raise ValueError("Produkt wyrobu gotowego nie istnieje.")
        lock_fg_traceability_snapshot(
            db,
            entity=bl,
            tenant_id=int(batch.tenant_id),
            warehouse_id=int(batch.warehouse_id),
            product=product,
        )

    existing_ids = [
        int(bl.pw_stock_document_id)
        for bl in lines
        if getattr(bl, "pw_stock_document_id", None)
    ]
    if existing_ids:
        unique = sorted(set(existing_ids))
        # Already linked (single or legacy multi) — do not create another PW.
        if len(unique) == 1 and len(existing_ids) == len(lines):
            return unique
        if len(unique) == 1:
            # Partial link — attach remaining lines to the same PW header without duplicating items.
            pw_id = unique[0]
            pw_doc = db.query(StockDocument).filter(StockDocument.id == pw_id).first()
            if pw_doc is None:
                raise ValueError("Istniejący dokument PW partii nie został znaleziony.")
            existing_pids = {
                int(it.product_id)
                for it in db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == pw_id)
                .all()
            }
            rw_doc = (
                db.query(StockDocument).filter(StockDocument.id == int(batch.rw_stock_document_id)).first()
                if batch.rw_stock_document_id
                else None
            )
            total_planned = sum(float(bl.planned_quantity) for bl in lines) or 1.0
            from .cost_service import compute_batch_line_unit_cost

            for bl in lines:
                if getattr(bl, "pw_stock_document_id", None):
                    continue
                produced = float(bl.completed_quantity or bl.planned_quantity)
                unit_cost = compute_batch_line_unit_cost(
                    rw_doc,
                    produced_quantity=produced,
                    total_planned_quantity=total_planned,
                )
                if int(bl.product_id) not in existing_pids:
                    from .production_fg_traceability import assert_fg_traceability_ready

                    trace_snapshot = assert_fg_traceability_ready(
                        bl, expected_quantity=produced
                    )
                    _append_pw_line_with_staging(
                        db,
                        doc=pw_doc,
                        product_id=int(bl.product_id),
                        quantity=produced,
                        unit_cost=unit_cost,
                        performed_by_user_id=performed_by_user_id,
                        trace_snapshot=trace_snapshot,
                    )
                    existing_pids.add(int(bl.product_id))
                bl.calculated_unit_cost = round(unit_cost, 4)
                bl.pw_stock_document_id = pw_id
                bl.status = "completed"
                prod = db.query(Product).filter(Product.id == int(bl.product_id)).first()
                if prod is not None and unit_cost > 0:
                    prod.purchase_price = float(unit_cost)
            items = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == pw_id)
                .all()
            )
            from ..stock_document_service import recompute_putaway_status_for_document

            recompute_putaway_status_for_document(pw_doc, items, db=db)
            pw_doc.updated_at = datetime.utcnow()
            db.flush()
            return [pw_id]
        # Legacy multi-PW already created for this batch — leave as-is (no migration).
        return unique

    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(batch.rw_stock_document_id)).first()
        if batch.rw_stock_document_id
        else None
    )
    total_planned = sum(float(bl.planned_quantity) for bl in lines) or 1.0
    from .cost_service import compute_batch_line_unit_cost

    pw_doc = _new_pw_header(
        db,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        created_by_user_id=performed_by_user_id,
        production_batch_id=int(batch.id),
        production_batch_line_id=None,
    )
    for bl in lines:
        produced = float(bl.completed_quantity or bl.planned_quantity)
        from .production_fg_traceability import assert_fg_traceability_ready

        trace_snapshot = assert_fg_traceability_ready(bl, expected_quantity=produced)
        unit_cost = compute_batch_line_unit_cost(
            rw_doc,
            produced_quantity=produced,
            total_planned_quantity=total_planned,
        )
        _append_pw_line_with_staging(
            db,
            doc=pw_doc,
            product_id=int(bl.product_id),
            quantity=produced,
            unit_cost=unit_cost,
            performed_by_user_id=performed_by_user_id,
            trace_snapshot=trace_snapshot,
        )
        bl.calculated_unit_cost = round(unit_cost, 4)
        bl.pw_stock_document_id = int(pw_doc.id)
        bl.status = "completed"
        prod = db.query(Product).filter(Product.id == int(bl.product_id)).first()
        if prod is not None and unit_cost > 0:
            prod.purchase_price = float(unit_cost)

    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pw_doc.id))
        .all()
    )
    from ..stock_document_service import recompute_putaway_status_for_document

    recompute_putaway_status_for_document(pw_doc, items, db=db)
    pw_doc.updated_at = datetime.utcnow()
    db.flush()
    return [int(pw_doc.id)]


def create_order_pw_document_for_putaway(
    db: Session,
    *,
    order: ProductionOrder,
    performed_by_user_id: int | None = None,
) -> int:
    from ...models.production import PRODUCTION_ORDER_SOURCE_ORDERS

    if str(getattr(order, "source_type", "") or "") == PRODUCTION_ORDER_SOURCE_ORDERS:
        from .orders_fg_fulfillment_service import receive_orders_mo_fg_to_buffer

        # ORDERS never enter standard putaway — buffer receipt path only.
        qty = float(order.produced_quantity or order.planned_quantity or 0)
        existing = float(0)
        if order.pw_stock_document_id:
            line = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == int(order.pw_stock_document_id))
                .order_by(StockDocumentItem.id.asc())
                .first()
            )
            existing = float(line.received_quantity or 0) if line else 0.0
        remaining = max(0.0, qty - existing)
        if remaining > 1e-9:
            receive_orders_mo_fg_to_buffer(
                db,
                mo=order,
                add_quantity=remaining,
                performed_by_user_id=performed_by_user_id,
            )
        if not order.pw_stock_document_id:
            raise ValueError("Nie utworzono PW buforowego dla zlecenia ORDERS.")
        return int(order.pw_stock_document_id)

    if order.pw_stock_document_id:
        return int(order.pw_stock_document_id)

    rw_doc = (
        db.query(StockDocument).filter(StockDocument.id == int(order.rw_stock_document_id)).first()
        if order.rw_stock_document_id
        else None
    )
    produced = float(order.produced_quantity or order.planned_quantity)
    from .cost_service import compute_order_unit_cost

    unit_cost = compute_order_unit_cost(rw_doc, produced_quantity=produced)
    from .production_fg_traceability import (
        assert_fg_traceability_ready,
        lock_fg_traceability_snapshot,
        read_fg_traceability_snapshot,
    )

    if read_fg_traceability_snapshot(order) is None:
        product = db.query(Product).filter(Product.id == int(order.product_id)).first()
        if product is None:
            raise ValueError("Produkt wyrobu gotowego nie istnieje.")
        lock_fg_traceability_snapshot(
            db,
            entity=order,
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            product=product,
        )
    trace_snapshot = assert_fg_traceability_ready(order, expected_quantity=produced)
    pw_doc = _create_pw_for_putaway(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        product_id=int(order.product_id),
        quantity=produced,
        unit_cost=unit_cost,
        created_by_user_id=performed_by_user_id,
        production_order_id=int(order.id),
        trace_snapshot=trace_snapshot,
    )
    order.calculated_unit_cost = round(unit_cost, 4)
    order.pw_stock_document_id = int(pw_doc.id)
    prod = db.query(Product).filter(Product.id == int(order.product_id)).first()
    if prod is not None and unit_cost > 0:
        prod.purchase_price = float(unit_cost)
        prod.updated_at = datetime.utcnow()
    return int(pw_doc.id)
