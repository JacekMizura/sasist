"""Generate tasks from materialized document lines — one task per location."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import LINE_STATUS_COUNTED, TASK_STATUS_OPEN
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from .errors import InventoryDocumentNotFoundError


def generate_tasks_from_document_lines(
    db: Session,
    *,
    document: InventoryDocument,
) -> dict[str, Any]:
    lines = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(document.id))
        .all()
    )
    by_loc: dict[int, list[InventoryDocumentLine]] = defaultdict(list)
    for ln in lines:
        by_loc[int(ln.location_id)].append(ln)

    existing_locs = {
        int(t.location_id)
        for t in db.query(InventoryTask)
        .filter(InventoryTask.inventory_document_id == int(document.id))
        .all()
        if not (t.metadata_json and '"recount":true' in t.metadata_json)
    }

    created = 0
    seq = (
        db.query(InventoryTask)
        .filter(InventoryTask.inventory_document_id == int(document.id))
        .count()
    )
    for loc_id, loc_lines in sorted(by_loc.items()):
        if loc_id in existing_locs:
            continue
        loc = db.query(Location).filter(Location.id == loc_id).first()
        counted = sum(1 for ln in loc_lines if ln.status == LINE_STATUS_COUNTED or ln.counted_quantity is not None)
        seq += 1
        task = InventoryTask(
            inventory_document_id=int(document.id),
            tenant_id=int(document.tenant_id),
            warehouse_id=int(document.warehouse_id),
            location_id=loc_id,
            task_number=f"{document.number}-T{seq:04d}",
            status=TASK_STATUS_OPEN,
            sequence_no=seq,
            line_count=len(loc_lines),
            counted_line_count=counted,
            progress_percent=round((counted / len(loc_lines)) * 100) if loc_lines else 0,
            zone_code=getattr(loc, "operational_zone_type", None) if loc else None,
            aisle_code=getattr(loc, "rack_name", None) if loc else None,
        )
        db.add(task)
        created += 1
    return {"tasks_created": created}


def get_task_lines(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    blind: bool = True,
) -> list[dict[str, Any]]:
    from ...models.product import Product

    row = (
        db.query(InventoryTask, InventoryDocument)
        .join(InventoryDocument, InventoryDocument.id == InventoryTask.inventory_document_id)
        .filter(InventoryTask.id == int(task_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise InventoryDocumentNotFoundError(f"Task {task_id} not found")
    task, doc = row
    is_blind = blind or doc.count_mode == "blind"
    q = (
        db.query(InventoryDocumentLine, Product)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task.inventory_document_id),
            InventoryDocumentLine.location_id == int(task.location_id),
        )
        .order_by(InventoryDocumentLine.id.asc())
    )
    out: list[dict[str, Any]] = []
    for line, product in q.all():
        item = {
            "id": line.id,
            "product_id": line.product_id,
            "sku": getattr(product, "sku", None) if product else None,
            "ean": getattr(product, "ean", None) if product else None,
            "product_name": getattr(product, "name", None) if product else None,
            "counted_quantity": line.counted_quantity,
            "status": line.status,
            "batch_number": line.batch_number,
            "serial_number": line.serial_number,
        }
        if not is_blind:
            item["expected_quantity"] = line.expected_quantity
            item["difference_quantity"] = line.difference_quantity
        out.append(item)
    return out


def update_task_progress(db: Session, task: InventoryTask) -> None:
    lines = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task.inventory_document_id),
            InventoryDocumentLine.location_id == int(task.location_id),
        )
        .all()
    )
    task.line_count = len(lines)
    task.counted_line_count = sum(1 for ln in lines if ln.counted_quantity is not None)
    task.progress_percent = round((task.counted_line_count / task.line_count) * 100) if task.line_count else 0
    task.touch_updated()
