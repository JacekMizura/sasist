"""
Delivery work queue SSOT — open inbound PZ that need operator action.

Uses existing PZ warehouse workflow (P2.5A) — does not invent a parallel status machine.
Operator queue_sort / queue_priority are independent of status and persist on stock_documents.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

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
from .receiving_workflow_status_service import (
    WH_CLOSED,
    WH_COUNTED,
    WH_COUNTING,
    WH_NEW,
    WH_PUTAWAY_COMPLETED,
    WH_PUTAWAY_IN_PROGRESS,
    derive_warehouse_workflow_status,
    normalize_warehouse_workflow_status,
)
from .stock_document_service import is_stock_document_cancelled

INBOUND_DOC_TYPES = ("PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT")

# In queue (need operator work)
QUEUE_WORKFLOW_STATUSES = frozenset(
    {
        WH_NEW,
        WH_COUNTING,
        WH_COUNTED,
        WH_PUTAWAY_IN_PROGRESS,
    }
)

# Leave queue
EXIT_WORKFLOW_STATUSES = frozenset({WH_PUTAWAY_COMPLETED, WH_CLOSED})

PRIORITY_VALUES = frozenset({"urgent", "first", "next", "later"})

STATUS_LABEL_PL = {
    WH_NEW: "Nowe",
    WH_COUNTING: "W trakcie przyjęcia",
    WH_COUNTED: "Oczekuje na rozlokowanie",
    WH_PUTAWAY_IN_PROGRESS: "Rozlokowanie",
    WH_PUTAWAY_COMPLETED: "Rozlokowane",
    WH_CLOSED: "Zamknięte",
}


class DeliveryWorkQueueError(ValueError):
    pass


def _norm(raw: object | None) -> str:
    return str(raw or "").strip().upper().replace("-", "_")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def resolve_operational_workflow(
    doc: StockDocument,
    lines: Iterable[StockDocumentItem] | None = None,
    db: Session | None = None,
) -> str:
    """
    Real operational PZ state via existing derive_warehouse_workflow_status (P2.5A).
    Does not invent a queue-specific status machine.
    """
    rows = list(lines) if lines is not None else []
    return normalize_warehouse_workflow_status(
        derive_warehouse_workflow_status(doc, rows, db)
    )


def pz_needs_operator_work(
    doc: StockDocument,
    lines: Iterable[StockDocumentItem] | None = None,
    db: Session | None = None,
) -> bool:
    """True when warehouse operator still has receiving or putaway work."""
    dt = _norm(getattr(doc, "document_type", None))
    if dt not in INBOUND_DOC_TYPES:
        return False
    if is_stock_document_cancelled(doc):
        return False
    wf = resolve_operational_workflow(doc, lines, db)
    if wf in EXIT_WORKFLOW_STATUSES:
        return False
    return wf in QUEUE_WORKFLOW_STATUSES


def work_phase_for(
    doc: StockDocument,
    lines: Iterable[StockDocumentItem] | None = None,
    db: Session | None = None,
) -> WorkPhase:
    wf = resolve_operational_workflow(doc, lines, db)
    if wf in {WH_COUNTED, WH_PUTAWAY_IN_PROGRESS}:
        return "putaway"
    return "receiving"


def cta_for_workflow(doc: StockDocument, wf: str) -> tuple[str, str, bool]:
    """
    Returns (label, path, started).

    Transitions (existing PZ flow):
    - NEW → Rozpocznij przyjęcie
    - COUNTING → Kontynuuj przyjęcie
    - COUNTED → Rozpocznij rozlokowanie
    - PUTAWAY_IN_PROGRESS → Kontynuuj rozlokowanie
    """
    pz_id = int(doc.id)
    key = normalize_warehouse_workflow_status(wf)
    if key == WH_PUTAWAY_IN_PROGRESS:
        return "Kontynuuj rozlokowanie", f"/wms/putaway/{pz_id}", True
    if key == WH_COUNTED:
        return "Rozpocznij rozlokowanie", f"/wms/putaway/{pz_id}", False
    if key == WH_COUNTING:
        return "Kontynuuj przyjęcie", f"/wms/receiving/pz/{pz_id}", True
    # NEW (and any unexpected open state → start receiving)
    return "Rozpocznij przyjęcie", f"/wms/receiving/pz/{pz_id}", False


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
    doc_ids_all = [int(d.id) for d in docs]
    lines_by_doc: dict[int, list[StockDocumentItem]] = {i: [] for i in doc_ids_all}
    if doc_ids_all:
        for ln in (
            db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id.in_(doc_ids_all))
            .order_by(StockDocumentItem.id.asc())
            .all()
        ):
            lines_by_doc.setdefault(int(ln.document_id), []).append(ln)

    open_docs: list[tuple[StockDocument, str, list[StockDocumentItem]]] = []
    for d in docs:
        lines = lines_by_doc.get(int(d.id), [])
        wf = resolve_operational_workflow(d, lines, db)
        if not pz_needs_operator_work(d, lines, db):
            continue
        open_docs.append((d, wf, lines))

    # Operator order only — priority is a badge/filter, not a sort key.
    open_docs.sort(
        key=lambda row: (
            int(row[0].delivery_queue_sort)
            if getattr(row[0], "delivery_queue_sort", None) is not None
            else 10_000_000,
            getattr(row[0], "created_at", None) or datetime.min,
            int(row[0].id),
        )
    )

    delivery_ids = {int(d.delivery_id) for d, _, _ in open_docs if d.delivery_id}
    deliveries = (
        {
            int(x.id): x
            for x in db.query(InboundDelivery).filter(InboundDelivery.id.in_(list(delivery_ids))).all()
        }
        if delivery_ids
        else {}
    )
    supplier_ids = {int(d.supplier_id) for d, _, _ in open_docs if d.supplier_id}
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
    for idx, (doc, wf, lines) in enumerate(open_docs, start=1):
        phase = work_phase_for(doc, lines, db)
        ordered = sum(float(x.ordered_quantity or 0) for x in lines)
        received = sum(float(x.received_quantity or 0) for x in lines)
        delivery = deliveries.get(int(doc.delivery_id)) if doc.delivery_id else None
        supplier_name = None
        if doc.supplier_id:
            supplier_name = suppliers.get(int(doc.supplier_id))
        if not supplier_name and delivery is not None and delivery.supplier_id:
            supplier_name = suppliers.get(int(delivery.supplier_id))
        cta_label, cta_path, started = cta_for_workflow(doc, wf)
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
                line_count=len(lines),
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

    lines_by_doc: dict[int, list[StockDocumentItem]] = {i: [] for i in ids}
    for ln in (
        db.query(StockDocumentItem).filter(StockDocumentItem.document_id.in_(ids)).all()
    ):
        lines_by_doc.setdefault(int(ln.document_id), []).append(ln)

    for sort_idx, pz_id in enumerate(ids, start=1):
        doc = by_id[pz_id]
        if not pz_needs_operator_work(doc, lines_by_doc.get(pz_id, []), db):
            raise DeliveryWorkQueueError(
                f"Dokument {_display_number(doc)} nie wymaga już pracy w kolejce."
            )
        doc.delivery_queue_sort = sort_idx
        doc.updated_at = _utcnow()
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
    if str(priority or "").strip().lower() not in PRIORITY_VALUES:
        raise DeliveryWorkQueueError("Nieprawidłowy priorytet (urgent|first|next|later).")
    p = _normalize_priority(priority)
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
    lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .all()
    )
    if not pz_needs_operator_work(doc, lines, db):
        raise DeliveryWorkQueueError("Dokument nie wymaga już pracy w kolejce.")
    # Priority is independent of status — only updates the band field.
    doc.delivery_queue_priority = p
    doc.updated_at = _utcnow()
    db.flush()
    queue = list_delivery_work_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    for item in queue.items:
        if item.pz_id == int(pz_id):
            return item
    raise DeliveryWorkQueueError("Dokument zniknął z kolejki po aktualizacji.")
