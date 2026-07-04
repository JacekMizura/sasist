"""In-pipeline finished-goods qty — batch/MO + production PW putaway (no double count)."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import ProductionOrder
from ...models.stock_document import StockDocument, StockDocumentItem
from .constants import PIPELINE_BATCH_MO_STATUSES

_OPEN_PUTAWAY = frozenset({"NOT_STARTED", "IN_PROGRESS"})


def _line_pipeline_qty(*, planned: float, completed: float, entity_status: str) -> float:
    st = str(entity_status or "").strip().lower()
    if st == "putaway":
        return max(0.0, float(completed))
    if st in PIPELINE_BATCH_MO_STATUSES:
        return max(0.0, float(planned) - float(completed))
    return 0.0


def pipeline_qty_from_batches_and_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """
    Sum remaining finished-goods qty on active batches and MOs.

    putaway status → completed qty awaiting relocation (not yet on shelf).
    collecting/in_progress/planned → planned − completed.
    """
    acc: dict[int, float] = defaultdict(float)

    batch_q = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines))
        .filter(
            ProductionBatch.tenant_id == int(tenant_id),
            ProductionBatch.warehouse_id == int(warehouse_id),
            ProductionBatch.status.in_(tuple(PIPELINE_BATCH_MO_STATUSES)),
        )
    )
    for batch in batch_q.all():
        for line in batch.lines or []:
            pid = int(line.product_id)
            if product_ids and pid not in product_ids:
                continue
            acc[pid] += _line_pipeline_qty(
                planned=float(line.planned_quantity or 0),
                completed=float(line.completed_quantity or 0),
                entity_status=str(batch.status),
            )

    mo_q = db.query(ProductionOrder).filter(
        ProductionOrder.tenant_id == int(tenant_id),
        ProductionOrder.warehouse_id == int(warehouse_id),
        ProductionOrder.status.in_(tuple(PIPELINE_BATCH_MO_STATUSES)),
    )
    if product_ids:
        mo_q = mo_q.filter(ProductionOrder.product_id.in_(tuple(int(x) for x in product_ids)))
    for order in mo_q.all():
        pid = int(order.product_id)
        acc[pid] += _line_pipeline_qty(
            planned=float(order.planned_quantity or 0),
            completed=float(order.produced_quantity or 0),
            entity_status=str(order.status),
        )

    return dict(acc)


def pipeline_qty_from_production_pw_putaway(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """
    PW from production with open putaway — counted only when batch/MO already completed
    (avoids double count with active batch putaway phase).
    """
    acc: dict[int, float] = defaultdict(float)
    rows = (
        db.query(StockDocumentItem, StockDocument)
        .join(StockDocument, StockDocument.id == StockDocumentItem.document_id)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.warehouse_id == int(warehouse_id),
            StockDocument.document_type == "PW",
            StockDocument.creation_source == "PRODUCTION",
            StockDocument.putaway_status.in_(tuple(_OPEN_PUTAWAY)),
        )
        .all()
    )
    for item, doc in rows:
        pid = int(item.product_id)
        if product_ids and pid not in product_ids:
            continue
        received = float(item.received_quantity or item.quantity or 0)
        putaway = float(item.quantity_putaway or 0)
        acc[pid] += max(0.0, received - putaway)
    return dict(acc)


def total_pipeline_qty_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    batch_mo = pipeline_qty_from_batches_and_orders(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    pw = pipeline_qty_from_production_pw_putaway(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    acc: dict[int, float] = defaultdict(float)
    for pid, qty in batch_mo.items():
        acc[pid] += qty
    for pid, qty in pw.items():
        # PW putaway only adds when no active batch/MO still carries this product in putaway phase
        if batch_mo.get(pid, 0.0) <= 1e-9:
            acc[pid] += qty
    return dict(acc)
