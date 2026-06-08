"""WMS count entry recording — scans and quantity changes."""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_QTY_CHANGED,
    AUDIT_SCAN,
    COUNT_MODE_BLIND,
    ENTRY_SOURCE_SCANNER,
    LINE_STATUS_COUNTED,
    LINE_STATUS_IN_PROGRESS,
)
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product
from .audit_service import log_inventory_audit
from .errors import (
    InventoryBarcodeAmbiguousError,
    InventoryBarcodeLineNotFoundError,
    InventoryBarcodeNotFoundError,
    InventoryBlindCountViolationError,
    InventoryDocumentNotFoundError,
    InventoryLocationMismatchError,
)

logger = logging.getLogger(__name__)


def record_count_scan(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    line_id: int,
    quantity: float,
    user_id: int | None = None,
    session_id: int | None = None,
    barcode_value: str | None = None,
    source: str = ENTRY_SOURCE_SCANNER,
    delta: float | None = None,
    expected_line_version: int | None = None,
    device_id: str | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")

    line = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.id == int(line_id),
            InventoryDocumentLine.inventory_document_id == int(document_id),
        )
        .first()
    )
    if line is None:
        raise InventoryDocumentNotFoundError(f"Inventory line {line_id} not found")

    from .concurrency_service import acquire_line_count_lock, assert_line_version, touch_session_heartbeat
    from ...models.inventory_count.session import InventorySession

    assert_line_version(line, expected_line_version)
    acquire_line_count_lock(db, line=line, session_id=session_id, user_id=user_id)
    if session_id is not None:
        session = db.query(InventorySession).filter(InventorySession.id == int(session_id)).first()
        if session is not None:
            touch_session_heartbeat(db, session)

    prev_qty = float(line.counted_quantity or 0)
    if delta is not None:
        new_qty = prev_qty + float(delta)
    else:
        new_qty = float(quantity)

    entry = InventoryCountEntry(
        inventory_document_line_id=line.id,
        inventory_document_id=doc.id,
        user_id=user_id,
        scanner_session_id=session_id,
        counted_quantity=new_qty,
        delta_quantity=new_qty - prev_qty if prev_qty else new_qty,
        source=source,
        barcode_value=barcode_value,
    )
    db.add(entry)

    line.counted_quantity = new_qty
    line.status = LINE_STATUS_IN_PROGRESS if new_qty != float(line.expected_quantity or 0) else LINE_STATUS_COUNTED
    line.last_counted_at = datetime.utcnow()
    line.last_counted_by_user_id = user_id
    line.recompute_difference()
    line.touch_updated()

    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=doc.id,
        inventory_document_line_id=line.id,
        user_id=user_id,
        session_id=session_id,
        device_id=device_id,
        action=AUDIT_SCAN,
        previous_state={"counted_quantity": prev_qty},
        next_state={"counted_quantity": new_qty},
        detail={"quantity": new_qty, "barcode": barcode_value},
    )
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=doc.id,
        inventory_document_line_id=line.id,
        user_id=user_id,
        session_id=session_id,
        device_id=device_id,
        action=AUDIT_QTY_CHANGED,
        previous_state={"counted_quantity": prev_qty},
        next_state={"counted_quantity": new_qty},
        detail={"from": prev_qty, "to": new_qty},
    )
    from .kpi_service import recompute_document_kpis
    from .task_generation_service import update_task_progress
    from ...models.inventory_count.task import InventoryTask

    recompute_document_kpis(db, doc)
    tasks = (
        db.query(InventoryTask)
        .filter(
            InventoryTask.inventory_document_id == int(doc.id),
            InventoryTask.location_id == int(line.location_id),
        )
        .all()
    )
    for task in tasks:
        update_task_progress(db, task)
    db.commit()
    db.refresh(line)
    return {
        "line_id": line.id,
        "counted_quantity": line.counted_quantity,
        "difference_quantity": line.difference_quantity,
        "status": line.status,
        "version": line.version,
        "blind_mode": doc.count_mode == COUNT_MODE_BLIND,
    }


def get_line_for_operator(
    db: Session,
    *,
    tenant_id: int,
    line_id: int,
    include_expected: bool = False,
) -> dict[str, Any]:
    row = (
        db.query(InventoryDocumentLine, InventoryDocument)
        .join(InventoryDocument, InventoryDocument.id == InventoryDocumentLine.inventory_document_id)
        .filter(
            InventoryDocumentLine.id == int(line_id),
            InventoryDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if row is None:
        raise InventoryDocumentNotFoundError(f"Line {line_id} not found")
    line, doc = row
    blind = doc.count_mode == COUNT_MODE_BLIND
    if blind and include_expected:
        raise InventoryBlindCountViolationError("Expected quantity hidden in blind count mode")

    payload: dict[str, Any] = {
        "id": line.id,
        "inventory_document_id": line.inventory_document_id,
        "location_id": line.location_id,
        "product_id": line.product_id,
        "counted_quantity": line.counted_quantity,
        "difference_quantity": None if blind else line.difference_quantity,
        "status": line.status,
        "batch_number": line.batch_number,
        "serial_number": line.serial_number,
    }
    if not blind or include_expected:
        payload["expected_quantity"] = line.expected_quantity
    return payload


def confirm_location_scan(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    location_id: int,
    scanned_code: str,
) -> dict[str, Any]:
    from .task_service import get_task

    task = get_task(db, tenant_id=tenant_id, task_id=task_id)
    if int(task["location_id"]) != int(location_id):
        raise InventoryLocationMismatchError("Scanned location does not match task")
    return {"ok": True, "location_id": location_id, "scanned_code": scanned_code}


def _product_match_clauses(code: str):
    clauses = [
        Product.ean == code,
        Product.sku == code,
        Product.symbol == code,
    ]
    if hasattr(Product, "barcode"):
        clauses.append(Product.barcode == code)
    if hasattr(Product, "catalog_number"):
        clauses.append(Product.catalog_number == code)
    return or_(*clauses)


def resolve_barcode_to_line(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    barcode_value: str,
) -> dict[str, Any]:
    """Resolve EAN/SKU/barcode to document line within task location."""
    from .task_service import get_task

    code = str(barcode_value or "").strip()
    logger.info(
        "[inventory_count.resolve_barcode] start tenant_id=%s task_id=%s barcode=%s",
        tenant_id,
        task_id,
        code[:64],
    )
    if not code:
        raise InventoryBarcodeNotFoundError("Empty barcode", barcode=code)

    task = get_task(db, tenant_id=tenant_id, task_id=task_id)

    products = (
        db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), _product_match_clauses(code))
        .order_by(Product.id.asc())
        .all()
    )
    if not products:
        logger.info(
            "[inventory_count.resolve_barcode] barcode_not_found tenant_id=%s task_id=%s barcode=%s",
            tenant_id,
            task_id,
            code,
        )
        raise InventoryBarcodeNotFoundError(f"Product not found for barcode: {code}", barcode=code)
    if len(products) > 1:
        product_ids = [int(p.id) for p in products]
        logger.warning(
            "[inventory_count.resolve_barcode] ambiguous barcode=%s product_ids=%s",
            code,
            product_ids,
        )
        raise InventoryBarcodeAmbiguousError(
            f"Barcode matches multiple products: {product_ids}",
            barcode=code,
            product_ids=product_ids,
        )

    product = products[0]
    line = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task["inventory_document_id"]),
            InventoryDocumentLine.location_id == int(task["location_id"]),
            InventoryDocumentLine.product_id == int(product.id),
        )
        .first()
    )
    if line is None:
        logger.info(
            "[inventory_count.resolve_barcode] line_not_found task_id=%s product_id=%s location_id=%s barcode=%s",
            task_id,
            product.id,
            task["location_id"],
            code,
        )
        raise InventoryBarcodeLineNotFoundError(
            "No inventory line for product at this location",
            barcode=code,
            product_id=int(product.id),
            task_id=int(task_id),
        )

    logger.info(
        "[inventory_count.resolve_barcode] matched task_id=%s line_id=%s product_id=%s sku=%s barcode=%s",
        task_id,
        line.id,
        product.id,
        product.sku,
        code,
    )
    return {
        "line_id": int(line.id),
        "product_id": int(product.id),
        "product_name": product.name,
        "sku": product.sku,
        "ean": product.ean,
        "barcode": code,
    }
