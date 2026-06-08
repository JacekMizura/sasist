"""Inventory document lifecycle — ERP planning, wizard, status transitions."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    AUDIT_DOC_CREATED,
    AUDIT_DOC_STATUS,
    AUDIT_SNAPSHOT,
    AUDIT_TASK_GENERATED,
    INV_STATUS_DRAFT,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_PLANNED,
    INV_STATUS_POSTED,
    INV_STATUS_CANCELLED,
    INV_STATUS_ARCHIVED,
    INV_TYPE_FULL,
    TASK_STATUS_OPEN,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.task import InventoryTask
from .audit_service import log_inventory_audit
from .errors import (
    InventoryCountError,
    InventoryDocumentNotFoundError,
    InventoryInvalidTransitionError,
    InventoryScopeMaterializationError,
    InventoryScopeNotReadyError,
    InventoryStartFailedError,
)
from .kpi_service import recompute_document_kpis
from .line_materialization_service import (
    materialize_document_lines_from_snapshot,
    parse_document_filters,
    scope_mode_from_filters,
)
from .location_lock_service import apply_location_locks_for_document
from .movement_policy_service import normalize_movement_policy
from .snapshot_service import capture_inventory_snapshots
from .strategy_service import build_operator_strategy, get_result_policy, parse_strategy
from .task_generation_service import generate_tasks_from_document_lines


def _generate_document_number(tenant_id: int) -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:6].upper()
    return f"INV-{tenant_id}-{stamp}-{suffix}"


def _serialize_json(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _doc_title(doc: InventoryDocument) -> str | None:
    meta = _parse_metadata(doc)
    t = meta.get("title")
    return str(t).strip() if t else None


def _parse_metadata(doc: InventoryDocument) -> dict[str, Any]:
    if not doc.metadata_json:
        return {}
    try:
        data = json.loads(doc.metadata_json)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _doc_to_dict(doc: InventoryDocument) -> dict[str, Any]:
    strategy = parse_strategy(doc)
    metadata = _parse_metadata(doc)
    movement = normalize_movement_policy(doc.lock_mode)
    return {
        "id": doc.id,
        "tenant_id": doc.tenant_id,
        "warehouse_id": doc.warehouse_id,
        "number": doc.number,
        "title": metadata.get("title") or None,
        "inventory_type": doc.inventory_type,
        "status": doc.status,
        "count_mode": doc.count_mode,
        "lock_mode": movement,
        "movement_policy": movement,
        "result_policy": get_result_policy(doc),
        "recount_required": bool(doc.recount_required),
        "scan_mode": doc.scan_mode,
        "filters": json.loads(doc.filters_json) if doc.filters_json else {},
        "strategy": json.loads(doc.strategy_json) if doc.strategy_json else {},
        "metadata": metadata,
        "notes": doc.notes,
        "planned_start_at": doc.planned_start_at.isoformat() if doc.planned_start_at else None,
        "planned_end_at": doc.planned_end_at.isoformat() if doc.planned_end_at else None,
        "snapshot_created_at": doc.snapshot_created_at.isoformat() if doc.snapshot_created_at else None,
        "approved_at": doc.approved_at.isoformat() if doc.approved_at else None,
        "posted_at": doc.posted_at.isoformat() if doc.posted_at else None,
        "started_at": doc.started_at.isoformat() if doc.started_at else None,
        "completed_at": doc.completed_at.isoformat() if doc.completed_at else None,
        "total_lines": doc.total_lines,
        "counted_lines": doc.counted_lines,
        "difference_lines": doc.difference_lines,
        "coverage_percent": doc.coverage_percent,
        "created_by_user_id": doc.created_by_user_id,
        "approved_by_user_id": doc.approved_by_user_id,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


def list_inventory_documents(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    q = db.query(InventoryDocument).filter(InventoryDocument.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(InventoryDocument.warehouse_id == int(warehouse_id))
    if status:
        q = q.filter(InventoryDocument.status == str(status).strip().lower())
    rows = q.order_by(InventoryDocument.updated_at.desc()).limit(max(1, min(limit, 200))).all()
    return [_doc_to_dict(r) for r in rows]


def get_inventory_document(db: Session, *, tenant_id: int, document_id: int) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")
    return _doc_to_dict(doc)


def create_inventory_document(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    inventory_type: str = INV_TYPE_FULL,
    user_id: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    doc = InventoryDocument(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        number=_generate_document_number(int(tenant_id)),
        inventory_type=str(inventory_type or INV_TYPE_FULL).upper(),
        status=INV_STATUS_DRAFT,
        created_by_user_id=user_id,
        notes=notes,
    )
    db.add(doc)
    db.flush()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=doc.id,
        user_id=user_id,
        action=AUDIT_DOC_CREATED,
        entity_type="inventory_document",
        entity_id=doc.id,
        detail={"number": doc.number, "inventory_type": doc.inventory_type},
    )
    db.commit()
    db.refresh(doc)
    return _doc_to_dict(doc)


def update_inventory_document_wizard(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    inventory_type: str | None = None,
    title: str | None = None,
    filters: dict[str, Any] | None = None,
    count_mode: str | None = None,
    lock_mode: str | None = None,
    recount_required: bool | None = None,
    scan_mode: str | None = None,
    strategy: dict[str, Any] | None = None,
    notes: str | None = None,
    planned_start_at: datetime | None = None,
    planned_end_at: datetime | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")

    meta_only = (title is not None or notes is not None) and not any(
        [
            inventory_type,
            filters is not None,
            count_mode,
            lock_mode,
            recount_required is not None,
            scan_mode,
            strategy is not None,
            planned_start_at is not None,
            planned_end_at is not None,
        ]
    )
    if doc.status not in (INV_STATUS_DRAFT, INV_STATUS_PLANNED) and not meta_only:
        raise InventoryInvalidTransitionError("Document can only be edited in draft or planned status")
    if doc.status in (INV_STATUS_POSTED, INV_STATUS_CANCELLED, INV_STATUS_ARCHIVED):
        raise InventoryInvalidTransitionError("Document cannot be edited in this status")

    if inventory_type:
        doc.inventory_type = str(inventory_type).upper()
    if title is not None:
        meta = _parse_metadata(doc)
        trimmed = str(title).strip()
        if trimmed:
            meta["title"] = trimmed
        else:
            meta.pop("title", None)
        doc.metadata_json = _serialize_json(meta)
    if filters is not None:
        doc.filters_json = _serialize_json(filters)
    if count_mode:
        doc.count_mode = str(count_mode)
    if lock_mode:
        doc.lock_mode = normalize_movement_policy(str(lock_mode))
    if recount_required is not None:
        doc.recount_required = 1 if recount_required else 0
    if scan_mode:
        doc.scan_mode = str(scan_mode)
    if strategy is not None:
        merged = {**parse_strategy(doc), **strategy}
        movement = merged.pop("movement_policy", None) or merged.pop("lock_mode", None)
        if movement:
            doc.lock_mode = normalize_movement_policy(str(movement))
        result = str(merged.get("result_policy") or get_result_policy(doc))
        doc.strategy_json = _serialize_json(
            build_operator_strategy(
                count_mode=str(doc.count_mode),
                movement_policy=normalize_movement_policy(doc.lock_mode),
                result_policy=result,
            )
        )
    elif lock_mode or count_mode:
        doc.strategy_json = _serialize_json(
            build_operator_strategy(
                count_mode=str(doc.count_mode),
                movement_policy=normalize_movement_policy(doc.lock_mode),
                result_policy=get_result_policy(doc),
            )
        )
    if notes is not None:
        doc.notes = notes
    if planned_start_at is not None:
        doc.planned_start_at = planned_start_at
    if planned_end_at is not None:
        doc.planned_end_at = planned_end_at
    doc.touch_updated()
    db.commit()
    db.refresh(doc)
    return _doc_to_dict(doc)


def plan_inventory_document(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    return _transition_status(
        db,
        tenant_id=tenant_id,
        document_id=document_id,
        from_statuses=(INV_STATUS_DRAFT,),
        to_status=INV_STATUS_PLANNED,
        user_id=user_id,
    )


def start_inventory_document(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    import logging

    logger = logging.getLogger(__name__)

    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")
    if doc.status not in (INV_STATUS_PLANNED, INV_STATUS_DRAFT):
        raise InventoryInvalidTransitionError(
            f"Cannot start inventory from status {doc.status}",
            details={"document_status": doc.status},
        )

    filters = parse_document_filters(doc)
    scope_mode = scope_mode_from_filters(filters)
    _validate_scope_config(scope_mode, filters)

    try:
        snap_result = capture_inventory_snapshots(db, document=doc, user_id=user_id)
        mat_result = materialize_document_lines_from_snapshot(db, document=doc, user_id=user_id)

        if mat_result.get("error") == "no_stock_snapshot":
            raise InventoryScopeMaterializationError(
                "Brak migawki stanów — nie można utworzyć pozycji inwentaryzacji.",
                details={"document_id": int(doc.id), "scope_mode": scope_mode, **snap_result},
            )

        lines_created = int(mat_result.get("lines_created") or 0)
        if lines_created < 1:
            raise InventoryScopeMaterializationError(
                "Zakres inwentaryzacji nie wygenerował żadnych pozycji — sprawdź filtry i stany magazynowe.",
                details={
                    "document_id": int(doc.id),
                    "scope_mode": scope_mode,
                    "filters": filters,
                    "snapshot_stock_rows": snap_result.get("stock_rows"),
                    "materialization": mat_result,
                },
            )

        apply_location_locks_for_document(db, document=doc, user_id=user_id)
        recompute_document_kpis(db, doc)
        task_result = generate_tasks_from_document_lines(db, document=doc)
        doc.status = INV_STATUS_IN_PROGRESS
        doc.started_at = datetime.utcnow()
        doc.snapshot_created_at = datetime.utcnow()
        doc.touch_updated()
        log_inventory_audit(
            db,
            tenant_id=int(tenant_id),
            inventory_document_id=doc.id,
            user_id=user_id,
            action=AUDIT_SNAPSHOT,
            detail={"snapshot_created_at": doc.snapshot_created_at.isoformat(), **snap_result},
        )
        log_inventory_audit(
            db,
            tenant_id=int(tenant_id),
            inventory_document_id=doc.id,
            user_id=user_id,
            action=AUDIT_DOC_STATUS,
            detail={"from": INV_STATUS_PLANNED, "to": INV_STATUS_IN_PROGRESS, "tasks": task_result},
        )
        db.commit()
        db.refresh(doc)
        return _doc_to_dict(doc)
    except InventoryCountError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception(
            "inventory_start_failed document_id=%s tenant_id=%s scope=%s",
            document_id,
            tenant_id,
            scope_mode,
        )
        raise InventoryStartFailedError(
            str(exc) or "Start inwentaryzacji nie powiódł się.",
            details={
                "document_id": int(document_id),
                "scope_mode": scope_mode,
                "error_type": type(exc).__name__,
            },
        ) from exc


def _validate_scope_config(scope_mode: str, filters: dict[str, Any]) -> None:
    if scope_mode == "locations" and not (filters.get("location_ids") or []):
        raise InventoryScopeNotReadyError(
            "Wybierz co najmniej jedną lokalizację przed uruchomieniem.",
            details={"scope_mode": scope_mode, "missing": "location_ids"},
        )
    if scope_mode == "products" and not (filters.get("product_ids") or []):
        raise InventoryScopeNotReadyError(
            "Wybierz co najmniej jeden produkt przed uruchomieniem.",
            details={"scope_mode": scope_mode, "missing": "product_ids"},
        )
    if scope_mode == "carriers" and not (filters.get("carrier_ids") or []):
        raise InventoryScopeNotReadyError(
            "Wybierz co najmniej jeden nośnik przed uruchomieniem.",
            details={"scope_mode": scope_mode, "missing": "carrier_ids"},
        )
    if scope_mode == "categories" and not (filters.get("category_ids") or filters.get("category_id")):
        raise InventoryScopeNotReadyError(
            "Wybierz kategorię produktów przed uruchomieniem.",
            details={"scope_mode": scope_mode, "missing": "category_ids"},
        )
    if scope_mode == "zones":
        raise InventoryScopeNotReadyError(
            "Strefy magazynowe nie są jeszcze dostępne — wybierz lokalizacje lub produkty.",
            details={"scope_mode": scope_mode, "feature": "zones_not_implemented"},
        )


def generate_inventory_tasks(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    location_ids: list[int] | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")
    if doc.status not in (INV_STATUS_PLANNED, INV_STATUS_DRAFT, INV_STATUS_IN_PROGRESS):
        raise InventoryInvalidTransitionError("Tasks can only be generated for draft/planned/in-progress documents")

    locs = location_ids or []
    if not locs:
        result = generate_tasks_from_document_lines(db, document=doc)
        created = int(result.get("tasks_created") or 0)
    else:
        created = 0
        for seq, loc_id in enumerate(locs, start=1):
            task = InventoryTask(
                inventory_document_id=doc.id,
                tenant_id=doc.tenant_id,
                warehouse_id=doc.warehouse_id,
                location_id=int(loc_id),
                task_number=f"{doc.number}-T{seq:04d}",
                status=TASK_STATUS_OPEN,
                sequence_no=seq,
            )
            db.add(task)
            created += 1

    if doc.status == INV_STATUS_DRAFT:
        doc.status = INV_STATUS_PLANNED
    recompute_document_kpis(db, doc)
    doc.touch_updated()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=doc.id,
        user_id=user_id,
        action=AUDIT_TASK_GENERATED,
        detail={"tasks_created": created},
    )
    db.commit()
    db.refresh(doc)
    return {"document": _doc_to_dict(doc), "tasks_created": created}


def _transition_status(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    from_statuses: tuple[str, ...],
    to_status: str,
    user_id: int | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")
    if doc.status not in from_statuses:
        raise InventoryInvalidTransitionError(f"Cannot transition from {doc.status} to {to_status}")
    prev = doc.status
    doc.status = to_status
    doc.touch_updated()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=doc.id,
        user_id=user_id,
        action=AUDIT_DOC_STATUS,
        detail={"from": prev, "to": to_status},
    )
    db.commit()
    db.refresh(doc)
    return _doc_to_dict(doc)
