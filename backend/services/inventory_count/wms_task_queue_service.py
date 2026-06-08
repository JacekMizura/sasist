"""Scalable WMS inventory task queue — paginated, filterable, compact DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, aliased

from ...models.app_user import AppUser
from ...models.inventory_count.constants import LINE_STATUS_RECOUNT, TASK_STATUS_DONE, TASK_ACTIVE_STATUSES
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from ...models.product import Product


def _operator_display_name(user: AppUser | None) -> str | None:
    if user is None:
        return None
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or None


def _task_row_to_compact(
    task: InventoryTask,
    loc: Location | None,
    operator: AppUser | None,
    *,
    last_activity_at: datetime | None,
    variance_lines: int,
    recount_lines: int,
    pending_lines: int,
) -> dict[str, Any]:
    has_variance = int(variance_lines or 0) > 0
    recount_flag = int(recount_lines or 0) > 0
    unresolved = int(pending_lines or 0) > 0 and task.status != TASK_STATUS_DONE
    return {
        "id": int(task.id),
        "inventory_document_id": int(task.inventory_document_id),
        "warehouse_id": int(task.warehouse_id),
        "location_id": int(task.location_id),
        "location_code": (loc.name if loc else None) or None,
        "location_name": (loc.name if loc else None) or None,
        "task_number": task.task_number,
        "status": task.status,
        "priority": int(task.priority or 0),
        "assigned_user_id": task.assigned_user_id,
        "assigned_operator_name": _operator_display_name(operator) if operator else None,
        "line_count": int(task.line_count or 0),
        "counted_line_count": int(task.counted_line_count or 0),
        "progress_percent": int(task.progress_percent or 0),
        "sequence_no": int(task.sequence_no or 0),
        "zone_code": task.zone_code,
        "aisle_code": task.aisle_code,
        "has_variance": has_variance,
        "recount_flag": recount_flag,
        "unresolved": unresolved,
        "last_activity_at": last_activity_at.isoformat() if last_activity_at else None,
    }


def list_tasks_paginated(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int | None = None,
    user_id: int | None = None,
    zone: str | None = None,
    assigned_user_id: int | None = None,
    status: str | None = None,
    recount_only: bool = False,
    unresolved_only: bool = False,
    variance_only: bool = False,
    completed_only: bool = False,
    search: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> dict[str, Any]:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    agg = (
        db.query(
            InventoryDocumentLine.inventory_document_id.label("document_id"),
            InventoryDocumentLine.location_id.label("location_id"),
            func.max(InventoryDocumentLine.last_counted_at).label("last_counted_at"),
            func.sum(
                case(
                    (
                        and_(
                            InventoryDocumentLine.difference_quantity.isnot(None),
                            InventoryDocumentLine.difference_quantity != 0,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("variance_lines"),
            func.sum(case((InventoryDocumentLine.status == LINE_STATUS_RECOUNT, 1), else_=0)).label("recount_lines"),
            func.sum(case((InventoryDocumentLine.counted_quantity.is_(None), 1), else_=0)).label("pending_lines"),
        )
        .group_by(InventoryDocumentLine.inventory_document_id, InventoryDocumentLine.location_id)
        .subquery()
    )

    q = (
        db.query(InventoryTask, Location, AppUser, agg)
        .outerjoin(Location, Location.id == InventoryTask.location_id)
        .outerjoin(AppUser, AppUser.id == InventoryTask.assigned_user_id)
        .outerjoin(
            agg,
            and_(
                agg.c.document_id == InventoryTask.inventory_document_id,
                agg.c.location_id == InventoryTask.location_id,
            ),
        )
        .filter(
            InventoryTask.tenant_id == int(tenant_id),
            InventoryTask.warehouse_id == int(warehouse_id),
        )
    )

    if completed_only:
        q = q.filter(InventoryTask.status == TASK_STATUS_DONE)
    else:
        q = q.filter(InventoryTask.status.in_(TASK_ACTIVE_STATUSES))

    if document_id is not None:
        q = q.filter(InventoryTask.inventory_document_id == int(document_id))
    if user_id is not None:
        q = q.filter(
            (InventoryTask.assigned_user_id.is_(None)) | (InventoryTask.assigned_user_id == int(user_id))
        )
    if zone:
        q = q.filter(InventoryTask.zone_code == str(zone))
    if assigned_user_id is not None:
        q = q.filter(InventoryTask.assigned_user_id == int(assigned_user_id))
    if status:
        q = q.filter(InventoryTask.status == str(status))

    if recount_only:
        q = q.filter(func.coalesce(agg.c.recount_lines, 0) > 0)
    if variance_only:
        q = q.filter(func.coalesce(agg.c.variance_lines, 0) > 0)
    if unresolved_only:
        q = q.filter(and_(func.coalesce(agg.c.pending_lines, 0) > 0, InventoryTask.status != TASK_STATUS_DONE))

    if search:
        term = f"%{str(search).strip()}%"
        product_subq = (
            db.query(InventoryDocumentLine.location_id, InventoryDocumentLine.inventory_document_id)
            .join(Product, Product.id == InventoryDocumentLine.product_id)
            .filter(
                Product.tenant_id == int(tenant_id),
                or_(
                    Product.ean.ilike(term),
                    Product.sku.ilike(term),
                    Product.symbol.ilike(term),
                    Product.name.ilike(term),
                    Product.catalog_number.ilike(term),
                ),
            )
            .subquery()
        )
        ps = aliased(product_subq)
        q = q.outerjoin(
            ps,
            and_(ps.c.inventory_document_id == InventoryTask.inventory_document_id, ps.c.location_id == InventoryTask.location_id),
        ).filter(
            or_(
                Location.name.ilike(term),
                InventoryTask.task_number.ilike(term),
                ps.c.location_id.isnot(None),
            )
        )

    total = q.count()
    rows = (
        q.order_by(InventoryTask.priority.desc(), InventoryTask.sequence_no.asc(), InventoryTask.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for task, loc, operator, agg_row in rows:
        last_at = getattr(agg_row, "last_counted_at", None) if agg_row is not None else None
        var_lines = int(getattr(agg_row, "variance_lines", 0) or 0) if agg_row is not None else 0
        rec_lines = int(getattr(agg_row, "recount_lines", 0) or 0) if agg_row is not None else 0
        pend_lines = int(getattr(agg_row, "pending_lines", 0) or 0) if agg_row is not None else 0
        items.append(
            _task_row_to_compact(
                task,
                loc,
                operator,
                last_activity_at=last_at or task.updated_at,
                variance_lines=var_lines,
                recount_lines=rec_lines,
                pending_lines=pend_lines,
            )
        )

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + limit < total,
    }
