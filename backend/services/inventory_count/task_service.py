"""WMS inventory counting tasks — operator queue."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import TASK_ACTIVE_STATUSES
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from .errors import InventoryTaskNotFoundError


def _task_to_dict(
    task: InventoryTask,
    location: Location | None = None,
    document: InventoryDocument | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": task.id,
        "inventory_document_id": task.inventory_document_id,
        "warehouse_id": task.warehouse_id,
        "location_id": task.location_id,
        "location_code": location.name if location else None,
        "location_name": location.name if location else None,
        "task_number": task.task_number,
        "status": task.status,
        "priority": task.priority,
        "assigned_user_id": task.assigned_user_id,
        "line_count": task.line_count,
        "counted_line_count": task.counted_line_count,
        "progress_percent": task.progress_percent,
        "sequence_no": task.sequence_no,
        "zone_code": task.zone_code,
        "aisle_code": task.aisle_code,
    }
    if document is not None:
        out["inventory_type"] = document.inventory_type
    return out


def list_open_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int | None = None,
    user_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = (
        db.query(InventoryTask, Location)
        .outerjoin(Location, Location.id == InventoryTask.location_id)
        .filter(
            InventoryTask.tenant_id == int(tenant_id),
            InventoryTask.warehouse_id == int(warehouse_id),
            InventoryTask.status.in_(TASK_ACTIVE_STATUSES),
        )
    )
    if document_id is not None:
        q = q.filter(InventoryTask.inventory_document_id == int(document_id))
    if user_id is not None:
        q = q.filter(
            (InventoryTask.assigned_user_id.is_(None)) | (InventoryTask.assigned_user_id == int(user_id))
        )
    rows = q.order_by(InventoryTask.priority.desc(), InventoryTask.sequence_no.asc()).limit(limit).all()
    return [_task_to_dict(task, loc) for task, loc in rows]


def get_task(db: Session, *, tenant_id: int, task_id: int) -> dict[str, Any]:
    row = (
        db.query(InventoryTask, Location, InventoryDocument)
        .outerjoin(Location, Location.id == InventoryTask.location_id)
        .join(InventoryDocument, InventoryDocument.id == InventoryTask.inventory_document_id)
        .filter(InventoryTask.id == int(task_id), InventoryTask.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise InventoryTaskNotFoundError(f"Inventory task {task_id} not found")
    task, loc, doc = row
    return _task_to_dict(task, loc, doc)
