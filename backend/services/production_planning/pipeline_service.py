"""In-pipeline finished-goods qty — batch/MO + production PW putaway (no double count).

Semantic split:
- **order-driven pipeline** (`ORDERS`) — FG already allocated to customers; does NOT cover free-stock targets.
- **free-stock pipeline** (`PLANNING` + `MANUAL` + production batches) — increases warehouse stock.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import (
    PRODUCTION_ORDER_SOURCE_MANUAL,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    PRODUCTION_ORDER_SOURCE_PLANNING,
    ProductionOrder,
)
from ...models.stock_document import StockDocument, StockDocumentItem
from .constants import PIPELINE_BATCH_MO_STATUSES

_OPEN_PUTAWAY = frozenset({"NOT_STARTED", "IN_PROGRESS"})


def is_order_driven_mo_pipeline(source_type: str | None) -> bool:
    """MO whose output is earmarked for sales orders (not free warehouse stock)."""
    return str(source_type or "").strip().upper() == PRODUCTION_ORDER_SOURCE_ORDERS


def is_free_stock_mo_pipeline(source_type: str | None) -> bool:
    """
    MO / batch output that increases general warehouse availability.

    PLANNING = nadprodukcja / forecast stock.
    MANUAL = planner-created stock build.
    Batches have no source_type — treated as free stock.
    """
    st = str(source_type or "").strip().upper()
    if not st:
        return True
    if st == PRODUCTION_ORDER_SOURCE_ORDERS:
        return False
    return st in (PRODUCTION_ORDER_SOURCE_PLANNING, PRODUCTION_ORDER_SOURCE_MANUAL)


def _line_pipeline_qty(*, planned: float, completed: float, entity_status: str) -> float:
    st = str(entity_status or "").strip().lower()
    if st == "putaway":
        return max(0.0, float(completed))
    if st in PIPELINE_BATCH_MO_STATUSES:
        return max(0.0, float(planned) - float(completed))
    return 0.0


@dataclass(frozen=True)
class PipelineQtyBreakdown:
    """Per-product pipeline split for planning vs free-stock replenishment."""

    order_driven: dict[int, float]
    free_stock: dict[int, float]

    def total(self) -> dict[int, float]:
        acc: dict[int, float] = defaultdict(float)
        for pid, qty in self.order_driven.items():
            acc[pid] += qty
        for pid, qty in self.free_stock.items():
            acc[pid] += qty
        return dict(acc)


def pipeline_qty_from_batches_and_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """
    Combined remaining FG qty on active batches and MOs (all source types).

    Prefer ``pipeline_qty_breakdown_from_batches_and_orders`` when free-stock
    vs order-driven semantics matter (e.g. stock replenishment).
    """
    return pipeline_qty_breakdown_from_batches_and_orders(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    ).total()


def pipeline_qty_breakdown_from_batches_and_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> PipelineQtyBreakdown:
    """
    Sum remaining finished-goods qty on active batches and MOs, split by semantics.

    putaway status → completed qty awaiting relocation (not yet on shelf).
    collecting/in_progress/planned → planned − completed.
    """
    order_driven: dict[int, float] = defaultdict(float)
    free_stock: dict[int, float] = defaultdict(float)

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
            qty = _line_pipeline_qty(
                planned=float(line.planned_quantity or 0),
                completed=float(line.completed_quantity or 0),
                entity_status=str(batch.status),
            )
            if qty > 1e-12:
                # Batches have no ORDERS/PLANNING source — free warehouse pipeline.
                free_stock[pid] += qty

    mo_q = db.query(ProductionOrder).filter(
        ProductionOrder.tenant_id == int(tenant_id),
        ProductionOrder.warehouse_id == int(warehouse_id),
        ProductionOrder.status.in_(tuple(PIPELINE_BATCH_MO_STATUSES)),
    )
    if product_ids:
        mo_q = mo_q.filter(ProductionOrder.product_id.in_(tuple(int(x) for x in product_ids)))
    for order in mo_q.all():
        pid = int(order.product_id)
        qty = _line_pipeline_qty(
            planned=float(order.planned_quantity or 0),
            completed=float(order.produced_quantity or 0),
            entity_status=str(order.status),
        )
        if qty <= 1e-12:
            continue
        if is_order_driven_mo_pipeline(getattr(order, "source_type", None)):
            order_driven[pid] += qty
        elif is_free_stock_mo_pipeline(getattr(order, "source_type", None)):
            free_stock[pid] += qty

    return PipelineQtyBreakdown(order_driven=dict(order_driven), free_stock=dict(free_stock))


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

    Open putaway PW is free-stock pipeline (ORDERS PW is typically already DONE on buffer).
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
    """Combined pipeline (order-driven + free-stock + open PW) — used by general planning demand."""
    breakdown = pipeline_qty_breakdown_from_batches_and_orders(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    batch_mo = breakdown.total()
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


def free_stock_pipeline_qty_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """
    Pipeline that will increase *free* warehouse stock.

    Excludes ORDERS MOs — those units are already committed to customers and must not
    cover stock-replenishment / nadprodukcja targets.
    """
    breakdown = pipeline_qty_breakdown_from_batches_and_orders(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    free = dict(breakdown.free_stock)
    pw = pipeline_qty_from_production_pw_putaway(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    # Avoid double-count with active free-stock putaway phase on batch/MO.
    active_free = breakdown.free_stock
    for pid, qty in pw.items():
        if active_free.get(pid, 0.0) <= 1e-9:
            free[pid] = float(free.get(pid, 0.0)) + qty
    return free


def order_driven_pipeline_qty_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """ORDERS MO pipeline only — customer-committed FG in production."""
    return pipeline_qty_breakdown_from_batches_and_orders(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    ).order_driven
