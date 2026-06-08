"""Location variance summary and audit queues for inventory execution."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.inventory_count.constants import COUNT_MODE_BLIND, LINE_STATUS_RECOUNT
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.inventory_count.unknown_product import InventoryUnknownProduct
from ...models.inventory_count.session import InventorySession


def _operator_display_name(user: AppUser | None) -> str | None:
    if user is None:
        return None
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or None


def _variance_severity(expected: float, counted: float) -> str:
    diff = abs(float(counted) - float(expected))
    if diff <= 0.01:
        return "none"
    pct = (diff / float(expected)) * 100 if float(expected) > 0 else 100.0
    if diff >= 10 or pct >= 25:
        return "critical"
    return "warning"


def get_location_execution_summary(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
) -> dict[str, Any]:
    from .task_service import get_task
    from .task_generation_service import get_task_lines

    task = get_task(db, tenant_id=tenant_id, task_id=task_id)
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(task["inventory_document_id"]), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    blind = doc is not None and doc.count_mode == COUNT_MODE_BLIND
    lines = get_task_lines(db, tenant_id=tenant_id, task_id=task_id, blind=blind)

    raw_lines = (
        db.query(InventoryDocumentLine)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task["inventory_document_id"]),
            InventoryDocumentLine.location_id == int(task["location_id"]),
        )
        .all()
    )
    variance_by_line = {
        int(ln.id): (float(ln.difference_quantity or 0), float(ln.expected_quantity or 0))
        for ln in raw_lines
        if ln.counted_quantity is not None and ln.difference_quantity not in (None, 0)
    }

    pending: list[dict] = []
    counted: list[dict] = []
    variance: list[dict] = []

    for ln in lines:
        cat = "pending"
        if ln.get("counted_quantity") is not None:
            cat = "counted"
        item = {
            "line_id": ln["id"],
            "product_id": ln["product_id"],
            "sku": ln.get("sku"),
            "ean": ln.get("ean"),
            "product_name": ln.get("product_name"),
            "counted_quantity": ln.get("counted_quantity"),
            "status": ln.get("status"),
            "category": cat,
        }
        if not blind and ln.get("expected_quantity") is not None and ln.get("counted_quantity") is not None:
            exp = float(ln["expected_quantity"])
            cnt = float(ln["counted_quantity"])
            sev = _variance_severity(exp, cnt)
            item["expected_quantity"] = exp
            item["difference_quantity"] = float(ln.get("difference_quantity") or (cnt - exp))
            item["variance_severity"] = sev
            if sev != "none":
                variance.append({**item, "category": "variance"})
                counted.append(item)
                continue
        elif blind and int(ln["id"]) in variance_by_line:
            diff_val, _exp = variance_by_line[int(ln["id"])]
            item["variance_severity"] = _variance_severity(_exp, float(ln.get("counted_quantity") or 0))
            item["variance_message"] = "Wykryto różnicę (tryb blind)"
            variance.append({**item, "category": "variance"})
            counted.append(item)
            continue

        if cat == "pending":
            pending.append(item)
        else:
            counted.append(item)

    unknown = (
        db.query(InventoryUnknownProduct)
        .filter(
            InventoryUnknownProduct.inventory_task_id == int(task_id),
            InventoryUnknownProduct.status == "draft",
        )
        .order_by(InventoryUnknownProduct.id.desc())
        .all()
    )
    unexpected = [
        {
            "unknown_id": int(u.id),
            "temporary_name": u.temporary_name,
            "barcode_value": u.barcode_value,
            "quantity": float(u.quantity or 0),
            "category": "unexpected",
        }
        for u in unknown
    ]

    return {
        "task_id": int(task_id),
        "location_id": int(task["location_id"]),
        "location_code": task.get("location_code"),
        "blind_mode": blind,
        "progress_percent": int(task.get("progress_percent") or 0),
        "line_count": int(task.get("line_count") or 0),
        "counted_line_count": int(task.get("counted_line_count") or 0),
        "pending": pending,
        "counted": counted,
        "variance": variance,
        "unexpected": unexpected,
    }


def get_audit_queues(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    limit = max(1, min(int(limit), 200))
    line_q = (
        db.query(InventoryDocumentLine, InventoryDocument, Product)
        .join(InventoryDocument, InventoryDocument.id == InventoryDocumentLine.inventory_document_id)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .filter(
            InventoryDocument.tenant_id == int(tenant_id),
            InventoryDocument.warehouse_id == int(warehouse_id),
            InventoryDocumentLine.difference_quantity.isnot(None),
            InventoryDocumentLine.difference_quantity != 0,
        )
    )
    if document_id is not None:
        line_q = line_q.filter(InventoryDocument.id == int(document_id))

    unresolved = [
        {
            "line_id": int(line.id),
            "document_id": int(doc.id),
            "document_number": doc.number,
            "location_id": int(line.location_id),
            "product_id": int(line.product_id),
            "sku": getattr(product, "sku", None) if product else None,
            "difference_quantity": float(line.difference_quantity or 0),
            "status": line.status,
        }
        for line, doc, product in line_q.filter(InventoryDocumentLine.status != "approved").limit(limit).all()
    ]

    suspicious = [
        row for row in unresolved if abs(float(row["difference_quantity"])) >= 5
    ][:limit]

    unknown_q = db.query(InventoryUnknownProduct).filter(
        InventoryUnknownProduct.tenant_id == int(tenant_id),
        InventoryUnknownProduct.warehouse_id == int(warehouse_id),
        InventoryUnknownProduct.status == "draft",
    )
    if document_id is not None:
        unknown_q = unknown_q.filter(InventoryUnknownProduct.inventory_document_id == int(document_id))
    unknown_products = [
        {
            "id": int(u.id),
            "document_id": int(u.inventory_document_id),
            "location_id": int(u.location_id),
            "temporary_name": u.temporary_name,
            "barcode_value": u.barcode_value,
            "quantity": float(u.quantity or 0),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in unknown_q.order_by(InventoryUnknownProduct.id.desc()).limit(limit).all()
    ]

    productivity = (
        db.query(
            InventorySession.user_id,
            func.count(InventorySession.id).label("sessions"),
            func.sum(InventorySession.lines_counted).label("lines_counted"),
            func.sum(InventorySession.scan_count).label("scan_count"),
        )
        .filter(
            InventorySession.warehouse_id == int(warehouse_id),
        )
        .group_by(InventorySession.user_id)
        .limit(20)
        .all()
    )
    user_ids = [int(r[0]) for r in productivity if r[0] is not None]
    users = {u.id: u for u in db.query(AppUser).filter(AppUser.id.in_(user_ids)).all()} if user_ids else {}
    operator_stats = [
        {
            "user_id": int(uid),
            "operator_name": _operator_display_name(users.get(uid)) if users.get(uid) else None,
            "sessions": int(sessions or 0),
            "lines_counted": int(lines or 0),
            "scan_count": int(scans or 0),
        }
        for uid, sessions, lines, scans in productivity
    ]

    recount_tasks = (
        db.query(InventoryTask)
        .filter(
            InventoryTask.tenant_id == int(tenant_id),
            InventoryTask.warehouse_id == int(warehouse_id),
        )
    )
    if document_id is not None:
        recount_tasks = recount_tasks.filter(InventoryTask.inventory_document_id == int(document_id))
    recount_count = (
        db.query(InventoryDocumentLine)
        .join(InventoryDocument, InventoryDocument.id == InventoryDocumentLine.inventory_document_id)
        .filter(
            InventoryDocument.tenant_id == int(tenant_id),
            InventoryDocument.warehouse_id == int(warehouse_id),
            InventoryDocumentLine.status == LINE_STATUS_RECOUNT,
        )
        .count()
    )

    return {
        "unresolved_anomalies": unresolved,
        "suspicious_variance": suspicious,
        "unknown_products": unknown_products,
        "operator_productivity": operator_stats,
        "recount_lines_count": recount_count,
    }
