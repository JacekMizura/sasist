"""WMS production queue — unified projection of batches and MO."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductionBatch, ProductionBatchLine
from ...models.production import ProductionOrder
from ...schemas.production_execution import ProductionExecutionJobRead, ProductionExecutionPhase
from .constants import TERMINAL_EXECUTION_STATUSES, execution_phase_for_status
from .execution_interface import ERP_INTERFACE
from .job_projection_service import project_batch_job, project_order_job


def _phase_statuses(phase: ProductionExecutionPhase) -> tuple[set[str], bool | None]:
    """Return (statuses, wms_released filter for planned rows)."""
    if phase == "collecting":
        return {"collecting", "planned"}, True
    if phase == "execute":
        return {"in_progress"}, None
    return set(), None


def list_wms_execution_queue(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    phase: ProductionExecutionPhase,
) -> list[ProductionExecutionJobRead]:
    statuses, wms_released = _phase_statuses(phase)
    jobs: list[ProductionExecutionJobRead] = []

    bq = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines).joinedload(ProductionBatchLine.composition))
        .filter(
            ProductionBatch.tenant_id == int(tenant_id),
            ProductionBatch.warehouse_id == int(warehouse_id),
            ProductionBatch.status.in_(sorted(statuses)),
        )
    )
    if wms_released is True:
        bq = bq.filter(ProductionBatch.released_to_wms_at.isnot(None))
    bq = bq.filter(
        (ProductionBatch.execution_interface.is_(None)) | (ProductionBatch.execution_interface != ERP_INTERFACE)
    )
    for batch in bq.order_by(ProductionBatch.updated_at.desc()).all():
        jobs.append(project_batch_job(db, batch))

    oq = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.status.in_(sorted(statuses)),
        )
    )
    if wms_released is True:
        oq = oq.filter(ProductionOrder.released_to_wms_at.isnot(None))
    oq = oq.filter(
        (ProductionOrder.execution_interface.is_(None)) | (ProductionOrder.execution_interface != ERP_INTERFACE)
    )
    for order in oq.order_by(ProductionOrder.updated_at.desc()).all():
        jobs.append(project_order_job(db, order))

    jobs.sort(key=lambda j: (j.created_at is not None, j.created_at), reverse=True)
    return jobs


def list_all_active_execution_jobs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[ProductionExecutionJobRead]:
    """All non-terminal jobs across phases — for dashboards / diagnostics."""
    jobs: list[ProductionExecutionJobRead] = []
    bq = (
        db.query(ProductionBatch)
        .options(joinedload(ProductionBatch.lines))
        .filter(
            ProductionBatch.tenant_id == int(tenant_id),
            ProductionBatch.status.notin_(sorted(TERMINAL_EXECUTION_STATUSES)),
        )
    )
    oq = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.status.notin_(sorted(TERMINAL_EXECUTION_STATUSES)),
        )
    )
    if warehouse_id:
        bq = bq.filter(ProductionBatch.warehouse_id == int(warehouse_id))
        oq = oq.filter(ProductionOrder.warehouse_id == int(warehouse_id))
    for batch in bq.all():
        jobs.append(project_batch_job(db, batch))
    for order in oq.all():
        jobs.append(project_order_job(db, order))
    return jobs
