"""Project batch / MO entities to ProductionExecutionJobRead."""

from __future__ import annotations

from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ...schemas.production_execution import ProductionExecutionJobRead
from .constants import execution_phase_for_status
from ..production_batch_service import serialize_batch
from ..production_order_service import serialize_order


def project_batch_job(db, batch: ProductionBatch) -> ProductionExecutionJobRead:
    full = serialize_batch(db, batch)
    status = str(batch.status or "draft")
    lines = batch.lines or []
    labels = []
    for ln in lines:
        name = None
        for fl in full.lines:
            if int(fl.id) == int(ln.id):
                name = fl.product_name
                break
        labels.append(name or str(ln.product_id))
    product_label = ", ".join(labels[:3]) if labels else f"{full.products_count or 0} prod."
    if len(labels) > 3:
        product_label += f" (+{len(labels) - 3})"
    first_image = None
    for fl in full.lines:
        if fl.product_image_url:
            first_image = fl.product_image_url
            break
    phase = execution_phase_for_status(status)
    if status in ("completed", "cancelled"):
        phase = None
    return ProductionExecutionJobRead(
        kind="batch",
        id=int(batch.id),
        number=str(batch.number or ""),
        warehouse_id=int(batch.warehouse_id),
        status=status,  # type: ignore[arg-type]
        phase=phase,
        product_label=product_label,
        product_image_url=first_image,
        planned_quantity=float(full.total_planned_units or 0),
        completed_quantity=float(full.total_completed_units or 0),
        progress_percent=float(full.progress_percent or 0),
        has_shortages=bool(full.has_shortages),
        is_released_to_wms=bool(getattr(batch, "released_to_wms_at", None)),
        released_to_wms_at=getattr(batch, "released_to_wms_at", None),
        operator_name=full.operator_name,
        created_at=batch.created_at,
    )


def project_order_job(db, order: ProductionOrder) -> ProductionExecutionJobRead:
    full = serialize_order(db, order, with_availability=False)
    status = str(order.status or "draft")
    phase = execution_phase_for_status(status)
    if status in ("completed", "cancelled"):
        phase = None
    product_label = str(full.product_name or f"Produkt #{order.product_id}")
    progress = float(full.progress_percent or 0)
    if status == "collecting":
        progress = float(full.collection_progress_percent or 0)
    return ProductionExecutionJobRead(
        kind="order",
        id=int(order.id),
        number=str(order.number or ""),
        warehouse_id=int(order.warehouse_id),
        status=status,  # type: ignore[arg-type]
        phase=phase,
        product_label=product_label,
        product_image_url=full.product_image_url,
        planned_quantity=float(order.planned_quantity or 0),
        completed_quantity=float(order.produced_quantity or 0),
        progress_percent=progress,
        has_shortages=bool(full.has_shortages),
        is_released_to_wms=bool(getattr(order, "released_to_wms_at", None)),
        released_to_wms_at=getattr(order, "released_to_wms_at", None),
        operator_name=full.operator_name,
        created_at=order.created_at,
    )
