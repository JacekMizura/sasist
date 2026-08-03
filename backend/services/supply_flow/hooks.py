"""Legacy notify_* wrappers → Event Pipeline publish (no direct Engine calls)."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import text

from .events import (
    EVENT_DELIVERY_PHASE_CHANGED,
    EVENT_ETA_CHANGED,
    EVENT_EXECUTION_CANCELLED,
    EVENT_EXECUTION_FAILED,
    EVENT_NEW_DELIVERY,
    EVENT_PUTAWAY_FINISHED,
    EVENT_PUTAWAY_STARTED,
    EVENT_UNLOAD_FINISHED,
    EVENT_UNLOAD_STARTED,
    publish_supply_flow_event,
)

logger = logging.getLogger(__name__)


def _pz_context(
    db: Session, *, tenant_id: int, pz_id: int
) -> tuple[int | None, int | None]:
    row = db.execute(
        text(
            """
            SELECT warehouse_id, delivery_id
            FROM stock_documents
            WHERE id = :pz_id AND tenant_id = :tenant_id
            """
        ),
        {"pz_id": int(pz_id), "tenant_id": int(tenant_id)},
    ).mappings().first()
    if row is None:
        return None, None
    wh = int(row["warehouse_id"]) if row["warehouse_id"] is not None else None
    delivery_id = int(row["delivery_id"]) if row["delivery_id"] is not None else None
    return wh, delivery_id


def notify_new_delivery(
    db: Session, *, tenant_id: int, warehouse_id: int, delivery_id: int
) -> None:
    publish_supply_flow_event(
        db,
        event_type=EVENT_NEW_DELIVERY,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        delivery_id=delivery_id,
        source="delivery_api",
    )


def notify_delivery_eta_or_status_changed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    delivery_id: int,
    eta_changed: bool = False,
) -> None:
    publish_supply_flow_event(
        db,
        event_type=EVENT_ETA_CHANGED if eta_changed else EVENT_DELIVERY_PHASE_CHANGED,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        delivery_id=delivery_id,
        source="delivery_api",
    )


def notify_unload_finished(
    db: Session, *, tenant_id: int, pz_id: int
) -> dict[str, Any]:
    wh, delivery_id = _pz_context(db, tenant_id=tenant_id, pz_id=pz_id)
    if wh is None:
        return {"ok": False, "advanced": [], "plan_version": None}
    publish_supply_flow_event(
        db,
        event_type=EVENT_UNLOAD_FINISHED,
        tenant_id=tenant_id,
        warehouse_id=wh,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="receiving",
    )
    # Compatibility shape for older tests — read last plan version if present.
    from ...models.supply_flow import SupplyFlowPlan

    plan = (
        db.query(SupplyFlowPlan)
        .filter(
            SupplyFlowPlan.tenant_id == int(tenant_id),
            SupplyFlowPlan.warehouse_id == int(wh),
        )
        .first()
    )
    return {
        "ok": True,
        "advanced": [],
        "plan_version": int(plan.plan_version) if plan else None,
        "warehouse_id": wh,
        "delivery_id": delivery_id,
    }


def notify_putaway_finished(
    db: Session, *, tenant_id: int, pz_id: int
) -> dict[str, Any]:
    wh, delivery_id = _pz_context(db, tenant_id=tenant_id, pz_id=pz_id)
    if wh is None:
        return {"ok": False, "advanced": [], "plan_version": None}
    publish_supply_flow_event(
        db,
        event_type=EVENT_PUTAWAY_FINISHED,
        tenant_id=tenant_id,
        warehouse_id=wh,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="putaway",
    )
    return {"ok": True, "warehouse_id": wh, "delivery_id": delivery_id}


def notify_unload_started(
    db: Session, *, tenant_id: int, pz_id: int
) -> dict[str, Any]:
    """WMS → ExecutionMonitor only (no Engine recompute)."""
    wh, delivery_id = _pz_context(db, tenant_id=tenant_id, pz_id=pz_id)
    if wh is None:
        return {"ok": False}
    publish_supply_flow_event(
        db,
        event_type=EVENT_UNLOAD_STARTED,
        tenant_id=tenant_id,
        warehouse_id=wh,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="receiving",
    )
    return {"ok": True, "warehouse_id": wh, "delivery_id": delivery_id}


def notify_putaway_started(
    db: Session, *, tenant_id: int, pz_id: int
) -> dict[str, Any]:
    """WMS → ExecutionMonitor only (no Engine recompute)."""
    wh, delivery_id = _pz_context(db, tenant_id=tenant_id, pz_id=pz_id)
    if wh is None:
        return {"ok": False}
    publish_supply_flow_event(
        db,
        event_type=EVENT_PUTAWAY_STARTED,
        tenant_id=tenant_id,
        warehouse_id=wh,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="putaway",
    )
    return {"ok": True, "warehouse_id": wh, "delivery_id": delivery_id}


def notify_execution_cancelled(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    delivery_id: int | None = None,
    pz_id: int | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    publish_supply_flow_event(
        db,
        event_type=EVENT_EXECUTION_CANCELLED,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="wms",
        payload={"note": note} if note else None,
    )
    return {"ok": True}


def notify_execution_failed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    delivery_id: int | None = None,
    pz_id: int | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    publish_supply_flow_event(
        db,
        event_type=EVENT_EXECUTION_FAILED,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        delivery_id=delivery_id,
        pz_id=pz_id,
        source="wms",
        payload={"note": note} if note else None,
    )
    return {"ok": True}


def notify_phase_changed_recompute(
    db: Session, *, tenant_id: int, warehouse_id: int, delivery_id: int
) -> None:
    publish_supply_flow_event(
        db,
        event_type=EVENT_DELIVERY_PHASE_CHANGED,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        delivery_id=delivery_id,
        source="lifecycle",
    )
