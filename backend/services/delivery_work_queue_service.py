"""
Delivery work queue SSOT — open inbound PZ that need operator action.

Unlike Supply Flow living plan (InboundDelivery + computed phases), this queue is
built from stock_documents the warehouse already works with (receiving / putaway).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inbound_delivery import InboundDelivery
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.supplier import Supplier
from ..schemas.delivery_work_queue import (
    DeliveryWorkQueueItemOut,
    DeliveryWorkQueueOut,
    QueuePriority,
    WorkPhase,
)

INBOUND_DOC_TYPES = ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT")
DONE_WORKFLOW = frozenset({"PUTAWAY_COMPLETED", "CLOSED"})
CANCELLED_DOC_STATUS = frozenset({"cancelled", "canceled", "void", "anulowane"})
PRIORITY_VALUES = frozenset({"urgent", "first", "next", "later"})
PRIORITY_RANK = {"urgent": 0, "first": 1, "next": 2, "later": 3}

STATUS_LABEL_PL = {
    "NEW": "Nowe",
    "COUNTING": "W trakcie przyjęcia",
    "COUNTED": "Oczekuje na rozlokowanie",
    "PUTAWAY_IN_PROGRESS": "Rozlokowanie",
    "PUTAWAY_COMPLETED": "Rozlokowane",
    "CLOSED": "Zamknięte",
}


class DeliveryWorkQueueError(ValueError):
    pass


def _norm(raw: object | None) -> str:
    return str(raw or "").strip().upper().replace("-", "_")


def resolve_warehouse_workflow(doc: StockDocument) -> str:
    direct = _norm(getattr(doc, "warehouse_workflow_status", None))
    if direct in {
        "NEW",
        "COUNTING",
        "COUNTED",
        "PUTAWAY_IN_PROGRESS",
        "PUTAWAY_COMPLETED",
        "CLOSED",
    }:
        return direct
    st = _norm(getattr(doc, "status", None))
    if st in {"ZAKONCZONE", "POSTED", "CLOSED"}:
        return "CLOSED"
    rs = _norm(getattr(doc, "receiving_status", None))
    ps = _norm(getattr(doc, "putaway_status", None))
    rls = _norm(getattr(doc, "relocation_status", None))
    if rls == "DONE" or ps == "DONE":
        return "PUTAWAY_COMPLETED"
    if ps == "IN_PROGRESS":
        return "PUTAWAY_IN_PROGRESS"
    if rs == "DONE":
        return "COUNTED"
    if rs == "IN_PROGRESS":
        return "COUNTING"
    return "NEW"


def pz_needs_operator_work(doc: StockDocument) -> bool:
    """True when warehouse operator still has work on this inbound document."""
    dt = _norm(getattr(doc, "document_type", None))
    if dt not in INBOUND_DOC_TYPES:
        return False
    if str(getattr(doc, "status", "") or "").strip().lower() in CANCELLED_DOC_STATUS:
        return False
    wf = resolve_warehouse_workflow(doc)
    if wf in DONE_WORKFLOW:
        return False
    rs = _norm(getattr(doc, "receiving_status", None))
    ps = _norm(getattr(doc, "putaway_status", None))
    if rs == "DONE" and ps == "DONE":
        return False
    return True


def work_phase_for(doc: StockDocument) -> WorkPhase:
    wf = resolve_warehouse_workflow(doc)
    if wf in {"COUNTED", "PUTAWAY_IN_PROGRESS"}:
        return "putaway"
    rs = _norm(getattr(doc, "receiving_status", None))
    if rs == "DONE":
        return "putaway"
    return "receiving"


def _normalize_priority(raw: object | None) -> QueuePriority:
    p = str(raw or "later").strip().lower()
    if p in PRIORITY_VALUES:
        return p  # type: ignore[return-value]
    return "later"


def _display_number(doc: StockDocument) -> str:
    stored = str(getattr(doc, "document_number", None) or "").strip()
    if stored:
        return stored
    dt = _norm(getattr(doc, "document_type", None)) or "PZ"
    return f"{dt} #{int(doc.id)}"


def _cta_for(doc: StockDocument, phase: WorkPhase) -> tuple[str, str]:
    pz_id = int(doc.id)
    if phase == "putaway":
        return "Rozpocznij rozlokowanie", f"/wms/putaway/{pz_id}"
    started = _norm(getattr(doc, "receiving_status", None)) == "IN_PROGRESS"
    label = "Kontynuuj przyjęcie" if started else "Rozpocznij przyjęcie"
    return label, f"/wms/receiving/pz/{pz_id}"


def list_delivery_work_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> DeliveryWorkQueueOut:
    docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type.in_(list(INBOUND_DOC_TYPES)),
        )
        .order_by(StockDocument.created_at.asc(), StockDocument.id.asc())
        .limit(500)
        .all()
    )
    open_docs = [d for d in docs if pz_needs_operator_work(d)]

    # Stable operator order: explicit sort first, then priority band, then created_at.
    open_docs.sort(
        key=lambda d: (
            int(d.delivery_queue_sort)
            if getattr(d, "delivery_queue_sort", None) is not None
            else 10_000_000,
            PRIORITY_RANK.get(_normalize_priority(getattr(d, "delivery_queue_priority", None)), 3),
            getattr(d, "created_at", None) or datetime.min,
            int(d.id),
        )
    )

    doc_ids = [int(d.id) for d in open_docs]
    item_rows = (
        db.query(
            StockDocumentItem.document_id,
            func.count(StockDocumentItem.id),
            func.coalesce(func.sum(StockDocumentItem.ordered_quantity), 0),
            func.coalesce(func.sum(StockDocumentItem.received_quantity), 0),
        )
        .filter(StockDocumentItem.document_id.in_(doc_ids))
        .group_by(StockDocumentItem.document_id)
        .all()
        if doc_ids
        else []
    )
    item_map = {
        int(did): (int(cnt or 0), float(ord_q or 0), float(rec_q or 0))
        for did, cnt, ord_q, rec_q in item_rows
    }

    delivery_ids = {int(d.delivery_id) for d in open_docs if d.delivery_id}
    deliveries = (
        {
            int(x.id): x
            for x in db.query(InboundDelivery).filter(InboundDelivery.id.in_(list(delivery_ids))).all()
        }
        if delivery_ids
        else {}
    )
    supplier_ids = {int(d.supplier_id) for d in open_docs if d.supplier_id}
    supplier_ids.update(int(x.supplier_id) for x in deliveries.values() if x.supplier_id)
    suppliers = (
        {
            int(s.id): str(s.name or "").strip() or f"#{s.id}"
            for s in db.query(Supplier).filter(Supplier.id.in_(list(supplier_ids))).all()
        }
        if supplier_ids
        else {}
    )

    items: list[DeliveryWorkQueueItemOut] = []
    for idx, doc in enumerate(open_docs, start=1):
        phase = work_phase_for(doc)
        wf = resolve_warehouse_workflow(doc)
        lines, ordered, received = item_map.get(int(doc.id), (0, 0.0, 0.0))
        delivery = deliveries.get(int(doc.delivery_id)) if doc.delivery_id else None
        supplier_name = None
        if doc.supplier_id:
            supplier_name = suppliers.get(int(doc.supplier_id))
        if not supplier_name and delivery is not None and delivery.supplier_id:
            supplier_name = suppliers.get(int(delivery.supplier_id))
        cta_label, cta_path = _cta_for(doc, phase)
        started = phase == "receiving" and _norm(doc.receiving_status) == "IN_PROGRESS"
        if phase == "putaway" and _norm(doc.putaway_status) == "IN_PROGRESS":
            started = True
        sort_val = (
            int(doc.delivery_queue_sort)
            if getattr(doc, "delivery_queue_sort", None) is not None
            else idx
        )
        items.append(
            DeliveryWorkQueueItemOut(
                pz_id=int(doc.id),
                document_number=_display_number(doc),
                document_type=_norm(doc.document_type) or "PZ",
                supplier_name=supplier_name,
                delivery_id=int(doc.delivery_id) if doc.delivery_id else None,
                delivery_name=(str(delivery.name).strip() if delivery and delivery.name else None),
                status_label=STATUS_LABEL_PL.get(wf, wf),
                warehouse_workflow_status=wf,
                receiving_status=_norm(doc.receiving_status) or "NEW",
                putaway_status=_norm(doc.putaway_status) or "NOT_STARTED",
                line_count=lines,
                quantity_ordered=ordered,
                quantity_received=received,
                expected_date=getattr(delivery, "expected_date", None) if delivery else None,
                created_at=getattr(doc, "created_at", None),
                queue_sort=sort_val,
                priority=_normalize_priority(getattr(doc, "delivery_queue_priority", None)),
                work_phase=phase,
                started=started,
                cta_label=cta_label,
                cta_path=cta_path,
            )
        )

    return DeliveryWorkQueueOut(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        items=items,
        total=len(items),
    )


def reorder_delivery_work_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    ordered_pz_ids: list[int],
) -> DeliveryWorkQueueOut:
    ids = [int(x) for x in ordered_pz_ids if int(x) > 0]
    if not ids:
        raise DeliveryWorkQueueError("Brak dokumentów do ustawienia kolejności.")
    docs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.id.in_(ids),
        )
        .all()
    )
    by_id = {int(d.id): d for d in docs}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise DeliveryWorkQueueError(f"Nie znaleziono PZ: {', '.join(str(x) for x in missing)}")
    for sort_idx, pz_id in enumerate(ids, start=1):
        doc = by_id[pz_id]
        if not pz_needs_operator_work(doc):
            raise DeliveryWorkQueueError(
                f"Dokument {_display_number(doc)} nie wymaga już pracy w kolejce."
            )
        doc.delivery_queue_sort = sort_idx
        doc.updated_at = datetime.utcnow()
    db.flush()
    return list_delivery_work_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


def set_delivery_work_queue_priority(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    pz_id: int,
    priority: str,
) -> DeliveryWorkQueueItemOut:
    p = _normalize_priority(priority)
    if str(priority or "").strip().lower() not in PRIORITY_VALUES:
        raise DeliveryWorkQueueError("Nieprawidłowy priorytet (urgent|first|next|later).")
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.id == int(pz_id),
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if doc is None:
        raise DeliveryWorkQueueError("Nie znaleziono dokumentu PZ.")
    if not pz_needs_operator_work(doc):
        raise DeliveryWorkQueueError("Dokument nie wymaga już pracy w kolejce.")
    doc.delivery_queue_priority = p
    doc.updated_at = datetime.utcnow()
    db.flush()
    queue = list_delivery_work_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    for item in queue.items:
        if item.pz_id == int(pz_id):
            return item
    raise DeliveryWorkQueueError("Dokument zniknął z kolejki po aktualizacji.")
