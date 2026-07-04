"""ERP interface production execution — same backend workflow as WMS, different UI."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ...schemas.production_batch import ProductionBatchRead
from ..production_batch_service import (
    ProductionBatchError,
    _init_collection_tasks,
    _load_batch_entity,
    serialize_batch,
)
from ..production_order_service import ProductionOrderError, serialize_order
from .execution_interface import ERP_INTERFACE, WMS_INTERFACE, is_wms_interface, normalized_execution_interface
from .order_execution_service import _init_order_collection_tasks, _load_order

logger = logging.getLogger(__name__)


def _assert_not_wms_locked(entity: ProductionBatch | ProductionOrder) -> None:
    if is_wms_interface(entity) or getattr(entity, "released_to_wms_at", None) is not None:
        raise ValueError("Produkcja została już wydana do terminalu WMS.")


def start_erp_execution_batch(
    db: Session,
    *,
    tenant_id: int,
    batch_id: int,
    started_by_user_id: int | None = None,
) -> ProductionBatchRead:
    batch = _load_batch_entity(db, tenant_id=tenant_id, batch_id=batch_id)
    if str(batch.status) in ("completed", "cancelled"):
        raise ProductionBatchError("Partia jest zamknięta.", code="terminal_status")
    try:
        _assert_not_wms_locked(batch)
    except ValueError as exc:
        raise ProductionBatchError(str(exc), code="wms_locked") from exc
    iface = normalized_execution_interface(batch)
    if iface == ERP_INTERFACE and str(batch.status) == "collecting":
        return serialize_batch(db, batch)
    if str(batch.status) not in ("draft", "planned"):
        raise ProductionBatchError(
            "Realizacja w ERP możliwa tylko dla partii zaplanowanych.",
            code="invalid_status",
        )
    batch.execution_interface = ERP_INTERFACE
    state = _init_collection_tasks(db, batch)
    batch.collection_state_json = json.dumps(state, ensure_ascii=False)
    batch.status = "collecting"
    batch.started_at = batch.started_at or datetime.utcnow()
    if started_by_user_id and not batch.created_by_user_id:
        batch.created_by_user_id = int(started_by_user_id)
    from ..reservations.reservation_service import lock_production_reservations

    lock_production_reservations(db, tenant_id=int(tenant_id), production_batch_id=int(batch.id))
    batch.updated_at = datetime.utcnow()
    db.flush()
    logger.info("[production.erp_start] batch_id=%s started_by=%s", batch.id, started_by_user_id)
    return serialize_batch(db, batch)


def start_erp_execution_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    started_by_user_id: int | None = None,
):
    order = _load_order(db, tenant_id=tenant_id, order_id=order_id)
    if str(order.status) in ("completed", "cancelled"):
        raise ProductionOrderError("Zlecenie jest zamknięte.", code="terminal_status")
    try:
        _assert_not_wms_locked(order)
    except ValueError as exc:
        raise ProductionOrderError(str(exc), code="wms_locked") from exc
    iface = normalized_execution_interface(order)
    if iface == ERP_INTERFACE and str(order.status) == "collecting":
        return serialize_order(db, order, with_availability=True)
    if str(order.status) not in ("draft", "planned"):
        raise ProductionOrderError(
            "Realizacja w ERP możliwa tylko dla zleceń zaplanowanych.",
            code="invalid_status",
        )
    order.execution_interface = ERP_INTERFACE
    state = _init_order_collection_tasks(db, order)
    order.collection_state_json = json.dumps(state, ensure_ascii=False)
    order.status = "collecting"
    order.started_at = order.started_at or datetime.utcnow()
    if started_by_user_id and not order.created_by_user_id:
        order.created_by_user_id = int(started_by_user_id)
    from ..reservations.reservation_service import lock_production_reservations

    lock_production_reservations(db, tenant_id=int(tenant_id), production_order_id=int(order.id))
    order.updated_at = datetime.utcnow()
    db.flush()
    logger.info("[production.erp_start] order_id=%s started_by=%s", order.id, started_by_user_id)
    return serialize_order(db, order, with_availability=True)


# Backward-compatible aliases (deprecated API paths)
start_paper_execution_batch = start_erp_execution_batch
start_paper_execution_order = start_erp_execution_order
