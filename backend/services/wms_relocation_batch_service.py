"""Dokument ZWK (batch) vs sesja rozlokowania — rozdzielone operacje."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.product import Product
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.wms_operational_task import ACTIVE_STATUSES, TASK_RELOCATION, WmsOperationalTask
from .relocation_reason import infer_relocation_reason, relocation_reason_is_actionable
from .relocation_document_series_service import (
    RELOCATION_DOCUMENT_SERIES_MISSING_MSG,
    assert_relocation_document_series_configured,
)
from .wms_mm_internal_placeholder import get_or_create_mm_placeholder_fks
from .wms_operational_task_service import (
    _allocation_row_status,
    _json_loads,
    _normalize_relocation_allocation_row,
)
from .wms_relocation_workflow import find_relocation_task_for_order

logger = logging.getLogger(__name__)

ZWK_DOCUMENT_TYPE = "ZWK"


def zwk_document_label(doc: StockDocument) -> str:
    year = getattr(doc, "created_at", None)
    y = int(year.year) if year is not None else datetime.utcnow().year
    return f"ZWK-{y}-{int(doc.id):05d}"


def _assert_warehouse_for_tenant(db: Session, tenant_id: int, warehouse_id: int) -> None:
    from .tenant_default_warehouse import list_tenant_warehouse_ids

    allowed = set(list_tenant_warehouse_ids(db, tenant_id))
    if int(warehouse_id) not in allowed:
        raise ValueError("Magazyn nie jest przypisany do tenanta.")


def get_or_create_zwk_draft_document(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> StockDocument:
    _assert_warehouse_for_tenant(db, tenant_id, warehouse_id)
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == ZWK_DOCUMENT_TYPE,
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc())
        .first()
    )
    if doc is not None:
        return doc
    assert_relocation_document_series_configured(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    sid, did = get_or_create_mm_placeholder_fks(db, tenant_id)
    now = datetime.utcnow()
    doc = StockDocument(
        tenant_id=int(tenant_id),
        document_type=ZWK_DOCUMENT_TYPE,
        supplier_id=sid,
        delivery_id=did,
        warehouse_id=int(warehouse_id),
        location_id=None,
        status="draft",
        receiving_status="DONE",
        putaway_status="NOT_STARTED",
        relocation_status="OPEN",
        creation_source="WMS",
        created_at=now,
        updated_at=now,
    )
    try:
        db.add(doc)
        db.flush()
    except SQLAlchemyError as exc:
        logger.exception(
            "[wms.relocation.zwk.create] tenant_id=%s warehouse_id=%s failed",
            tenant_id,
            warehouse_id,
        )
        raise ValueError(RELOCATION_DOCUMENT_SERIES_MISSING_MSG) from exc
    return doc


def _zwk_line_batch_key(order_item_id: int) -> str:
    return f"OI:{int(order_item_id)}"


def _collect_pending_relocation_rows_for_order(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_ids: set[int] | None = None,
    sync_from_resolver: bool = True,
) -> list[dict[str, Any]]:
    """Aktywne alokacje RELOCATION (pending/partial) dla zamówienia."""
    oid = int(order_id)
    if sync_from_resolver:
        order = db.query(Order).filter(Order.id == oid).first()
        if order is not None:
            from .recovery_workflow_service import ensure_relocation_tasks_synced_for_order

            ensure_relocation_tasks_synced_for_order(
                db,
                order,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                source_event_id=f"relocation_ui_sync:{oid}",
            )
    rows: list[dict[str, Any]] = []
    tasks = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.warehouse_id == int(warehouse_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
            WmsOperationalTask.status.in_(list(ACTIVE_STATUSES)),
        )
        .order_by(WmsOperationalTask.updated_at.desc())
        .limit(200)
        .all()
    )
    for task in tasks:
        payload = _json_loads(getattr(task, "payload_json", None), {})
        if not isinstance(payload, dict):
            continue
        for raw in payload.get("allocations") or []:
            if not isinstance(raw, dict) or int(raw.get("order_id") or 0) != oid:
                continue
            row = _normalize_relocation_allocation_row(raw)
            reason = infer_relocation_reason(row)
            if not relocation_reason_is_actionable(reason):
                continue
            qty = float(row.get("qty") or 0)
            if qty <= 1e-9:
                continue
            st = _allocation_row_status(row)
            if st not in ("pending", "partial"):
                continue
            oiid = int(row.get("order_item_id") or 0)
            if oiid < 1:
                continue
            if order_item_ids is not None and oiid not in order_item_ids:
                continue
            rows.append(
                {
                    "task_id": int(task.id),
                    "order_item_id": oiid,
                    "product_id": int(getattr(task, "product_id", 0) or 0),
                    "qty": qty,
                    "relocated_qty": float(row.get("relocated_qty") or 0),
                    "picked_from": (payload.get("picked_from_location") or "").strip() or None,
                    "relocation_reason": reason,
                }
            )
    return rows


def get_relocation_batch_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
) -> dict[str, Any]:
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == ZWK_DOCUMENT_TYPE,
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc())
        .first()
    )
    pending = _collect_pending_relocation_rows_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    task = find_relocation_task_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
    )
    return {
        "order_id": int(order_id),
        "warehouse_id": int(warehouse_id),
        "document_id": int(doc.id) if doc is not None else None,
        "document_label": zwk_document_label(doc) if doc is not None else None,
        "relocation_task_id": int(task.id) if task is not None else None,
        "pending_lines": len(pending),
        "has_active_document": doc is not None,
    }


def add_relocation_items_to_document(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    order_item_ids: list[int] | None = None,
    operator_user_id: int | None = None,
) -> dict[str, Any]:
    """
    Dopisz pozycje do draftu ZWK bez uruchamiania sesji rozlokowania.
    Operacyjne zadania RELOCATION pozostają źródłem prawdy dla przydziału nośników.
    """
    oid = int(order_id)
    o = db.query(Order).filter(Order.id == oid, Order.tenant_id == int(tenant_id)).first()
    if o is None:
        raise ValueError("Zamówienie nie znalezione.")
    if int(getattr(o, "warehouse_id", 0) or 0) != int(warehouse_id):
        raise ValueError("Zamówienie należy do innego magazynu.")

    filter_ids = {int(x) for x in (order_item_ids or []) if int(x) > 0} or None
    pending_rows = _collect_pending_relocation_rows_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
        order_item_ids=filter_ids,
    )
    if not pending_rows:
        raise ValueError("Brak pozycji wymagających rozlokowania dla tego zamówienia.")

    doc = get_or_create_zwk_draft_document(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    if operator_user_id is not None and getattr(doc, "created_by_user_id", None) is None:
        doc.created_by_user_id = int(operator_user_id)

    existing_keys = {
        (str(it.batch_number or "").strip())
        for it in db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc.id))
        .all()
    }

    lines_added = 0
    lines_skipped = 0
    task_id: int | None = None
    for row in pending_rows:
        oiid = int(row["order_item_id"])
        key = _zwk_line_batch_key(oiid)
        if key in existing_keys:
            lines_skipped += 1
            continue
        oi = db.query(OrderItem).filter(OrderItem.id == oiid, OrderItem.order_id == oid).first()
        if oi is None:
            lines_skipped += 1
            continue
        pid = int(oi.product_id or row.get("product_id") or 0)
        if pid < 1:
            lines_skipped += 1
            continue
        qty = max(0.0, float(row["qty"]) - float(row.get("relocated_qty") or 0))
        if qty <= 1e-9:
            lines_skipped += 1
            continue
        db.add(
            StockDocumentItem(
                document_id=int(doc.id),
                product_id=pid,
                ordered_quantity=round(qty, 6),
                received_quantity=0.0,
                quantity=0.0,
                batch_number=key,
                putaway_last_location_name=(row.get("picked_from") or "")[:256] or None,
            )
        )
        existing_keys.add(key)
        lines_added += 1
        task_id = int(row["task_id"])
        logger.info(
            "[wms.relocation.document.add] order_id=%s order_item_id=%s "
            "relocation_document_id=%s relocation_task_id=%s operator_id=%s qty=%s",
            oid,
            oiid,
            int(doc.id),
            int(row["task_id"]),
            operator_user_id,
            qty,
        )

    doc.updated_at = datetime.utcnow()
    db.flush()

    if lines_added < 1 and lines_skipped > 0:
        raise ValueError("Pozycje są już na aktywnym dokumencie ZWK.")

    rel_task = find_relocation_task_for_order(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
    )
    return {
        "ok": True,
        "order_id": oid,
        "document_id": int(doc.id),
        "document_label": zwk_document_label(doc),
        "lines_added": lines_added,
        "lines_skipped": lines_skipped,
        "relocation_task_id": int(rel_task.id) if rel_task is not None else task_id,
        "redirect_to_relocation": False,
    }


def start_relocation_session(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int,
    operator_name: str,
    order_id: int | None = None,
    task_id: int | None = None,
    takeover: bool = False,
) -> dict[str, Any]:
    """Opcjonalnie przejmij sesję RELOCATION — bez dopisywania do ZWK."""
    from .wms_relocation_workflow import acquire_relocation_session

    tid = int(task_id) if task_id is not None and int(task_id) > 0 else None
    if tid is None:
        if order_id is None or int(order_id) < 1:
            raise ValueError("Wymagane order_id lub task_id.")
        hit = find_relocation_task_for_order(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order_id=int(order_id),
        )
        if hit is None:
            raise ValueError("Brak aktywnego zadania rozlokowania dla tego zamówienia.")
        tid = int(hit.id)

    task = (
        db.query(WmsOperationalTask)
        .filter(
            WmsOperationalTask.id == int(tid),
            WmsOperationalTask.tenant_id == int(tenant_id),
            WmsOperationalTask.task_type == TASK_RELOCATION,
        )
        .first()
    )
    if task is None:
        raise ValueError("Zadanie rozlokowania nie znalezione.")
    if str(getattr(task, "status", "") or "").lower() == "done":
        raise ValueError("Rozlokowanie dla tego zadania jest już zakończone.")

    acquire_relocation_session(
        db,
        int(tid),
        tenant_id=int(tenant_id),
        operator_id=int(operator_user_id),
        operator_name=str(operator_name),
        takeover=bool(takeover),
    )

    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == ZWK_DOCUMENT_TYPE,
            StockDocument.status == "draft",
            StockDocument.relocation_status != "DONE",
        )
        .order_by(StockDocument.updated_at.desc())
        .first()
    )

    logger.info(
        "[wms.relocation.session.start] order_id=%s order_item_id=%s "
        "relocation_document_id=%s relocation_task_id=%s operator_id=%s redirect_to_relocation=true",
        order_id,
        None,
        int(doc.id) if doc is not None else None,
        int(tid),
        operator_user_id,
    )

    return {
        "ok": True,
        "task_id": int(tid),
        "document_id": int(doc.id) if doc is not None else None,
        "document_label": zwk_document_label(doc) if doc is not None else None,
        "session_started": True,
    }
