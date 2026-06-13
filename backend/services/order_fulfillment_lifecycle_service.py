"""P3 — SSOT: fulfillment warehouse assignment lifecycle on Order."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_fulfillment_assignment_audit import OrderFulfillmentAssignmentAudit
from ..models.tenant_warehouse import TenantWarehouse
from ..models.warehouse import Warehouse
from .fulfillment_assignment.fulfillment_assignment_resolver import resolve_initial_fulfillment_warehouse
from .fulfillment_assignment.phase_constants import (
    DEFAULT_FULFILLMENT_ASSIGNMENT_PHASE,
    PHASE_CONSOLIDATION_REQUIRED,
    PHASE_CONSOLIDATING,
    PHASE_FULFILLMENT_ASSIGNED,
    PHASE_PACKING,
    PHASE_PICKING,
    PHASE_SHIPPED,
    PHASE_UNASSIGNED,
    PHASE_WAVE_CREATED,
    is_import_warehouse_locked,
    is_warehouse_change_locked,
    normalize_fulfillment_assignment_phase,
    phase_rank,
)
from .tenant_default_warehouse import resolve_tenant_default_warehouse_id


class FulfillmentWarehouseAssignmentError(ValueError):
    """Invalid or blocked fulfillment warehouse assignment."""


def record_fulfillment_assignment_audit(
    db: Session,
    *,
    order_id: int,
    assigned_warehouse_id: int,
    strategy: str,
    assigned_by_user_id: int | None = None,
    reason: str | None = None,
) -> OrderFulfillmentAssignmentAudit:
    row = OrderFulfillmentAssignmentAudit(
        order_id=int(order_id),
        assigned_warehouse_id=int(assigned_warehouse_id),
        strategy=str(strategy or "UNKNOWN").strip().upper()[:32],
        assigned_by_user_id=int(assigned_by_user_id) if assigned_by_user_id else None,
        reason=(reason or "").strip() or None,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def advance_fulfillment_assignment_phase(order: Order, target_phase: str) -> bool:
    """Monotonic advance — returns True if phase changed."""
    target = normalize_fulfillment_assignment_phase(target_phase)
    current = normalize_fulfillment_assignment_phase(getattr(order, "fulfillment_assignment_phase", None))
    if phase_rank(target) <= phase_rank(current):
        return False
    order.fulfillment_assignment_phase = target
    return True


def apply_initial_fulfillment_assignment(
    db: Session,
    order: Order,
    *,
    assigned_by_user_id: int | None = None,
    reason: str | None = None,
) -> None:
    """Resolve policy (P2.5) and set warehouse_id + phase on new order."""
    tid = int(order.tenant_id)
    resolution = resolve_initial_fulfillment_warehouse(db, tenant_id=tid, order=order)

    wid = resolution.warehouse_id
    if wid is None or int(wid) <= 0:
        provisional = getattr(order, "warehouse_id", None)
        if provisional is not None and int(provisional) > 0:
            wid = int(provisional)
        else:
            try:
                wid = resolve_tenant_default_warehouse_id(db, tid)
            except ValueError as exc:
                raise FulfillmentWarehouseAssignmentError(
                    "Nie można ustalić magazynu realizacji dla zamówienia."
                ) from exc

    order.warehouse_id = int(wid)
    if resolution.requires_operator_decision:
        order.fulfillment_assignment_phase = PHASE_UNASSIGNED
    else:
        order.fulfillment_assignment_phase = PHASE_FULFILLMENT_ASSIGNED

    audit_reason = reason or resolution.message
    record_fulfillment_assignment_audit(
        db,
        order_id=int(order.id),
        assigned_warehouse_id=int(wid),
        strategy=resolution.strategy,
        assigned_by_user_id=assigned_by_user_id,
        reason=audit_reason,
    )


def assert_can_assign_fulfillment_warehouse(order: Order) -> None:
    phase = normalize_fulfillment_assignment_phase(getattr(order, "fulfillment_assignment_phase", None))
    if phase in {
        PHASE_CONSOLIDATION_REQUIRED,
        PHASE_CONSOLIDATING,
        PHASE_WAVE_CREATED,
        PHASE_PICKING,
        PHASE_PACKING,
        PHASE_SHIPPED,
    }:
        raise FulfillmentWarehouseAssignmentError(
            f"Nie można zmienić magazynu realizacji — faza {phase}."
        )


def _assert_warehouse_fulfillment_eligible(db: Session, tenant_id: int, warehouse_id: int) -> None:
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    if wh is None:
        raise FulfillmentWarehouseAssignmentError("Magazyn nie istnieje.")
    tw = (
        db.query(TenantWarehouse)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.warehouse_id == int(warehouse_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .first()
    )
    if tw is None:
        raise FulfillmentWarehouseAssignmentError(
            "Magazyn nie należy do tenanta lub nie może realizować zamówień (fulfillment_eligible)."
        )


def assign_order_fulfillment_warehouse(
    db: Session,
    order: Order,
    *,
    warehouse_id: int,
    reason: str,
    assigned_by_user_id: int | None,
    strategy: str = "MANUAL",
) -> Order:
    assert_can_assign_fulfillment_warehouse(order)
    _assert_warehouse_fulfillment_eligible(db, int(order.tenant_id), int(warehouse_id))

    wid = int(warehouse_id)
    order.warehouse_id = wid
    order.fulfillment_assignment_phase = PHASE_FULFILLMENT_ASSIGNED

    record_fulfillment_assignment_audit(
        db,
        order_id=int(order.id),
        assigned_warehouse_id=wid,
        strategy=strategy,
        assigned_by_user_id=assigned_by_user_id,
        reason=reason,
    )
    db.add(order)
    return order


def maybe_apply_import_warehouse_fields(
    order: Order,
    *,
    import_warehouse_id: int | None,
) -> None:
    """P3.7 — import may not overwrite WH / phase when locked."""
    phase = normalize_fulfillment_assignment_phase(getattr(order, "fulfillment_assignment_phase", None))
    if is_import_warehouse_locked(phase):
        return
    if import_warehouse_id is not None and int(import_warehouse_id) > 0:
        order.warehouse_id = int(import_warehouse_id)


def on_wave_created_for_orders(orders: list[Order]) -> None:
    for order in orders:
        advance_fulfillment_assignment_phase(order, PHASE_WAVE_CREATED)


def on_picking_started(order: Order) -> None:
    advance_fulfillment_assignment_phase(order, PHASE_PICKING)


def on_packing_started(order: Order) -> None:
    advance_fulfillment_assignment_phase(order, PHASE_PACKING)


def on_order_shipped(order: Order) -> None:
    advance_fulfillment_assignment_phase(order, PHASE_SHIPPED)


def maybe_advance_shipped_from_status(order: Order) -> None:
    st = (getattr(order, "status", None) or "").strip().upper()
    if st in ("SHIPPED", "COMPLETED"):
        on_order_shipped(order)


def warehouse_display_name(db: Session, warehouse_id: int | None) -> str | None:
    if warehouse_id is None or int(warehouse_id) <= 0:
        return None
    row = db.query(Warehouse.name).filter(Warehouse.id == int(warehouse_id)).first()
    return (row[0] or "").strip() if row and row[0] else None


def latest_fulfillment_assignment_audit(
    db: Session,
    order_id: int,
) -> OrderFulfillmentAssignmentAudit | None:
    return (
        db.query(OrderFulfillmentAssignmentAudit)
        .filter(OrderFulfillmentAssignmentAudit.order_id == int(order_id))
        .order_by(OrderFulfillmentAssignmentAudit.created_at.desc(), OrderFulfillmentAssignmentAudit.id.desc())
        .first()
    )


def list_fulfillment_assignment_audits(
    db: Session,
    order_id: int,
) -> list[dict[str, Any]]:
    rows = (
        db.query(OrderFulfillmentAssignmentAudit)
        .filter(OrderFulfillmentAssignmentAudit.order_id == int(order_id))
        .order_by(OrderFulfillmentAssignmentAudit.created_at.asc(), OrderFulfillmentAssignmentAudit.id.asc())
        .all()
    )
    if not rows:
        return []

    user_ids = {int(r.assigned_by_user_id) for r in rows if r.assigned_by_user_id}
    user_names: dict[int, str] = {}
    if user_ids:
        from ..models.app_user import AppUser
        from ..services.document_creator_service import app_user_full_name

        for u in db.query(AppUser).filter(AppUser.id.in_(user_ids)).all():
            user_names[int(u.id)] = app_user_full_name(u) or f"Użytkownik #{u.id}"

    wh_ids = {int(r.assigned_warehouse_id) for r in rows}
    wh_names: dict[int, str] = {}
    if wh_ids:
        for wid, name in db.query(Warehouse.id, Warehouse.name).filter(Warehouse.id.in_(wh_ids)).all():
            wh_names[int(wid)] = (name or "").strip() or f"Magazyn #{wid}"

    out: list[dict[str, Any]] = []
    for r in rows:
        uid = int(r.assigned_by_user_id) if r.assigned_by_user_id else None
        out.append(
            {
                "id": int(r.id),
                "order_id": int(r.order_id),
                "assigned_warehouse_id": int(r.assigned_warehouse_id),
                "assigned_warehouse_name": wh_names.get(int(r.assigned_warehouse_id), ""),
                "strategy": str(r.strategy or "").strip().upper(),
                "assigned_by_user_id": uid,
                "assigned_by_label": user_names.get(uid, "AUTO") if uid else "AUTO",
                "reason": (r.reason or "").strip() or None,
                "created_at": r.created_at,
            }
        )
    return out
