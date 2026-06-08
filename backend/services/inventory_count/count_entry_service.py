"""WMS count entry recording — scans and quantity changes."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_QTY_CHANGED,
    AUDIT_SCAN,
    COUNT_MODE_BLIND,
    DISC_EXPECTED,
    DISC_EXTRA_PRODUCT,
    DISC_UNPLANNED_PRODUCT,
    DISC_WRONG_LOCATION,
    ENTRY_SOURCE_SCANNER,
    LINE_STATUS_COUNTED,
    LINE_STATUS_IN_PROGRESS,
    LINE_STATUS_OPEN,
)
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.product import Product
from ...models.warehouse_carrier import WarehouseCarrier
from ...utils.carrier_barcode import infer_prefix_from_barcode
from .audit_service import log_inventory_audit
from .errors import (
    InventoryBarcodeAmbiguousError,
    InventoryBarcodeNotFoundError,
    InventoryBlindCountViolationError,
    InventoryDocumentNotFoundError,
    InventoryLocationMismatchError,
)

logger = logging.getLogger(__name__)

_DISCREPANCY_LABELS = {
    DISC_EXPECTED: "Zgodnie z planem",
    DISC_EXTRA_PRODUCT: "Nadwyżka / produkt spoza snapshotu",
    DISC_UNPLANNED_PRODUCT: "Produkt spoza planowanej inwentaryzacji",
    DISC_WRONG_LOCATION: "Produkt przypisany do innej lokalizacji",
}


def _carrier_id_key(carrier_id: int | None) -> int | None:
    return int(carrier_id) if carrier_id is not None else None


def _filter_line_by_carrier(q, carrier_id: int | None):
    cid = _carrier_id_key(carrier_id)
    if cid is not None:
        return q.filter(InventoryDocumentLine.carrier_id == cid)
    return q.filter(InventoryDocumentLine.carrier_id.is_(None))


def resolve_carrier_by_code(
    db: Session,
    *,
    tenant_id: int,
    code: str,
) -> dict[str, Any]:
    """Resolve warehouse carrier barcode/code for WMS counting context."""
    raw = str(code or "").strip()
    if not raw:
        raise InventoryBarcodeNotFoundError("Empty carrier code", barcode=raw)

    normalized = raw.upper()
    clauses = [
        func.lower(WarehouseCarrier.code) == normalized.lower(),
        func.lower(WarehouseCarrier.barcode) == normalized.lower(),
    ]
    if infer_prefix_from_barcode(normalized):
        clauses.append(WarehouseCarrier.barcode.ilike(normalized))

    row = (
        db.query(WarehouseCarrier)
        .filter(WarehouseCarrier.tenant_id == int(tenant_id), or_(*clauses))
        .order_by(WarehouseCarrier.id.asc())
        .first()
    )
    if row is None:
        raise InventoryBarcodeNotFoundError(f"Carrier not found: {raw}", barcode=raw)

    display = str(getattr(row, "code", None) or row.barcode or raw).strip()
    return {
        "carrier_id": int(row.id),
        "code": display,
        "barcode": getattr(row, "barcode", None),
        "name": getattr(row, "name", None),
        "current_location_id": int(row.current_location_id) if row.current_location_id else None,
    }


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
    carrier_id: int | None = None,
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

    if carrier_id is not None and line.carrier_id is None:
        line.carrier_id = int(carrier_id)
    elif carrier_id is not None and int(line.carrier_id) != int(carrier_id):
        raise InventoryLocationMismatchError("Line carrier does not match active carrier context")

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
        "carrier_id": line.carrier_id,
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


def _is_operator_created_line(line: InventoryDocumentLine) -> bool:
    raw = getattr(line, "metadata_json", None)
    if not raw:
        return False
    try:
        meta = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return False
    return bool(meta.get("operator_scan") or meta.get("unplanned"))


def _find_products_by_barcode(db: Session, *, tenant_id: int, code: str) -> list[Product]:
    return (
        db.query(Product)
        .filter(Product.tenant_id == int(tenant_id), _product_match_clauses(code))
        .order_by(Product.id.asc())
        .all()
    )


def _pick_product_for_task(
    db: Session,
    *,
    products: list[Product],
    document_id: int,
    location_id: int,
    barcode: str,
    carrier_id: int | None = None,
) -> Product:
    if len(products) == 1:
        return products[0]

    product_ids = [int(p.id) for p in products]
    line_q = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(document_id),
            InventoryDocumentLine.location_id == int(location_id),
            InventoryDocumentLine.product_id.in_(product_ids),
        )
    )
    line_q = _filter_line_by_carrier(line_q, carrier_id)
    lines = line_q.all()
    planned_at_loc = {
        int(ln.product_id)
        for ln in lines
        if float(ln.expected_quantity or 0) > 1e-9 and not _is_operator_created_line(ln)
    }
    if len(planned_at_loc) == 1:
        pid = next(iter(planned_at_loc))
        return next(p for p in products if int(p.id) == pid)

    any_at_loc = {int(ln.product_id) for ln in lines}
    if len(any_at_loc) == 1:
        pid = next(iter(any_at_loc))
        return next(p for p in products if int(p.id) == pid)

    logger.warning(
        "[inventory_count.resolve_barcode] ambiguous barcode=%s product_ids=%s",
        barcode,
        product_ids,
    )
    raise InventoryBarcodeAmbiguousError(
        f"Barcode matches multiple products: {product_ids}",
        barcode=barcode,
        product_ids=product_ids,
    )


def _ensure_count_line_at_location(
    db: Session,
    *,
    document_id: int,
    location_id: int,
    product_id: int,
    carrier_id: int | None = None,
) -> tuple[InventoryDocumentLine, bool]:
    line_q = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(document_id),
            InventoryDocumentLine.location_id == int(location_id),
            InventoryDocumentLine.product_id == int(product_id),
        )
    )
    line_q = _filter_line_by_carrier(line_q, carrier_id)
    line = line_q.first()
    if line is not None:
        return line, False

    line = InventoryDocumentLine(
        inventory_document_id=int(document_id),
        location_id=int(location_id),
        product_id=int(product_id),
        carrier_id=_carrier_id_key(carrier_id),
        expected_quantity=0.0,
        status=LINE_STATUS_OPEN,
        metadata_json=json.dumps({"operator_scan": True, "unplanned": True}),
    )
    line.recompute_difference()
    db.add(line)
    db.flush()
    return line, True


def _classify_discrepancy(
    db: Session,
    *,
    document_id: int,
    task_location_id: int,
    product_id: int,
    line: InventoryDocumentLine,
    line_created: bool,
) -> str:
    planned_lines = [
        ln
        for ln in db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(document_id),
            InventoryDocumentLine.product_id == int(product_id),
        )
        .all()
        if float(ln.expected_quantity or 0) > 1e-9 and not _is_operator_created_line(ln)
    ]

    if not planned_lines:
        return DISC_UNPLANNED_PRODUCT

    at_this_location = [ln for ln in planned_lines if int(ln.location_id) == int(task_location_id)]
    if at_this_location and not line_created:
        return DISC_EXPECTED

    at_other_locations = [ln for ln in planned_lines if int(ln.location_id) != int(task_location_id)]
    if at_other_locations:
        return DISC_WRONG_LOCATION

    return DISC_EXTRA_PRODUCT


def resolve_barcode_to_line(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    barcode_value: str,
    carrier_id: int | None = None,
) -> dict[str, Any]:
    """Resolve barcode globally, ensure a count line exists, classify discrepancy."""
    from .task_generation_service import update_task_progress
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
    document_id = int(task["inventory_document_id"])
    location_id = int(task["location_id"])

    products = _find_products_by_barcode(db, tenant_id=tenant_id, code=code)
    if not products:
        logger.info(
            "[inventory_count.resolve_barcode] barcode_not_found tenant_id=%s task_id=%s barcode=%s",
            tenant_id,
            task_id,
            code,
        )
        raise InventoryBarcodeNotFoundError(f"Product not found for barcode: {code}", barcode=code)

    product = _pick_product_for_task(
        db,
        products=products,
        document_id=document_id,
        location_id=location_id,
        barcode=code,
        carrier_id=carrier_id,
    )

    line, line_created = _ensure_count_line_at_location(
        db,
        document_id=document_id,
        location_id=location_id,
        product_id=int(product.id),
        carrier_id=carrier_id,
    )
    discrepancy_class = _classify_discrepancy(
        db,
        document_id=document_id,
        task_location_id=location_id,
        product_id=int(product.id),
        line=line,
        line_created=line_created,
    )

    if line_created:
        task_row = db.query(InventoryTask).filter(InventoryTask.id == int(task_id)).first()
        if task_row is not None:
            update_task_progress(db, task_row)
        doc = db.query(InventoryDocument).filter(InventoryDocument.id == document_id).first()
        if doc is not None:
            doc.total_lines = (
                db.query(InventoryDocumentLine)
                .filter(InventoryDocumentLine.inventory_document_id == document_id)
                .count()
            )
        db.commit()
        db.refresh(line)

    expected_qty = float(line.expected_quantity or 0)
    counted_qty = float(line.counted_quantity or 0)
    diff_qty = float(line.difference_quantity or 0) if line.counted_quantity is not None else None

    logger.info(
        "[inventory_count.resolve_barcode] matched task_id=%s line_id=%s product_id=%s sku=%s "
        "barcode=%s discrepancy=%s line_created=%s",
        task_id,
        line.id,
        product.id,
        product.sku,
        code,
        discrepancy_class,
        line_created,
    )

    return {
        "line_id": int(line.id),
        "product_id": int(product.id),
        "product_name": product.name,
        "sku": product.sku,
        "ean": product.ean,
        "barcode": code,
        "image_url": getattr(product, "image_url", None),
        "expected_quantity": expected_qty,
        "counted_quantity": counted_qty,
        "difference_quantity": diff_qty,
        "discrepancy_class": discrepancy_class,
        "discrepancy_label": _DISCREPANCY_LABELS.get(discrepancy_class, discrepancy_class),
        "location_id": location_id,
        "location_code": task.get("location_code") or task.get("location_name"),
        "carrier_id": line.carrier_id,
        "line_created": line_created,
    }
