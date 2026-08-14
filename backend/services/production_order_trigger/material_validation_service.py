"""Material validation + reservation sync for order-driven ProductionOrder (Phase 3).

Uses existing shortage analysis (``producible_now_qty``) and StockReservation SSOT.
Does not invent a parallel reservation store.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_ui_status import OrderUiStatus
from ...models.picking_config import PickingConfig
from ...models.product_composition import ProductComposition
from ...models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES,
    PRODUCTION_ORDER_SOURCE_ITEM_RESERVED,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderSourceItem,
)
from ..picking_config_service import order_priority_rank
from ..production_order_service import cancel_production_order
from ..production_shortages.analysis_service import analyze_composition_quantity
from ..reservations.reservation_service import (
    create_production_order_reservations,
    release_production_reservations,
)
from ..wms_audit_service import append_order_activity_for_wms

logger = logging.getLogger(__name__)

AGGREGABLE_MO_STATUSES = frozenset({"draft", "planned"})


def _qty_label(qty: float) -> int | float:
    return int(qty) if float(qty).is_integer() else qty


def _log_order(
    db: Session,
    *,
    order: Order,
    event_type: str,
    message: str,
    operator_user_id: Optional[int],
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    wid = int(getattr(order, "warehouse_id", 0) or 0)
    if wid <= 0:
        return
    try:
        nested = db.begin_nested()
        try:
            append_order_activity_for_wms(
                db,
                order_id=int(order.id),
                tenant_id=int(order.tenant_id),
                warehouse_id=wid,
                event_type=event_type,
                message=message,
                operator_user_id=operator_user_id,
                metadata=metadata,
            )
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        logger.exception(
            "material validation activity log failed order_id=%s", getattr(order, "id", None)
        )


def _status_name(db: Session, *, status_id: Optional[int]) -> str:
    if status_id is None:
        return "problemowy"
    row = db.query(OrderUiStatus).filter(OrderUiStatus.id == int(status_id)).first()
    if row is None:
        return "problemowy"
    return str(getattr(row, "name", None) or getattr(row, "label", None) or "problemowy")


def _move_order_to_shortage_status(db: Session, *, order: Order, pc: PickingConfig | None) -> Optional[int]:
    if pc is None:
        return None
    sid = getattr(pc, "status_on_component_shortage_id", None)
    if sid is None:
        return None
    order.order_ui_status_id = int(sid)
    try:
        db.expire(order, ["order_ui_status"])
    except Exception:
        pass
    db.add(order)
    return int(sid)


def _rescale_snapshots(order: ProductionOrder, planned_quantity: float) -> None:
    pq = float(planned_quantity)
    for snap in list(order.line_snapshots or []):
        snap.total_required_quantity = float(snap.quantity_per_unit or 0) * pq


def _component_totals_from_snapshots(order: ProductionOrder) -> dict[int, float]:
    totals: dict[int, float] = {}
    for snap in list(order.line_snapshots or []):
        pid = int(snap.component_product_id)
        qty = float(snap.total_required_quantity or 0)
        if qty <= 1e-9:
            continue
        totals[pid] = totals.get(pid, 0.0) + qty
    return totals


def _shortage_component_labels(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for c in analysis.get("components") or []:
        missing = float(c.get("missing_qty") or 0)
        if missing <= 1e-6:
            continue
        out.append(
            {
                "component_product_id": int(c.get("component_product_id") or 0),
                "product_name": c.get("product_name"),
                "product_sku": c.get("product_sku"),
                "required_qty": c.get("required_qty"),
                "available_qty": c.get("available_qty"),
                "missing_qty": missing,
            }
        )
    return out


def sort_source_items_for_material_allocation(
    sources: list[ProductionOrderSourceItem],
    orders_by_id: dict[int, Order],
) -> list[ProductionOrderSourceItem]:
    """Priority color → oldest → order_id → source id."""

    def _key(src: ProductionOrderSourceItem) -> tuple:
        order = orders_by_id.get(int(src.order_id))
        rank = order_priority_rank(order) if order is not None else 99
        dt = datetime.min
        if order is not None:
            dt = getattr(order, "order_date", None) or getattr(order, "created_at", None) or datetime.min
            if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
        return (rank, dt, int(src.order_id), int(src.id))

    return sorted(sources, key=_key)


def refresh_orders_mo_material_reservations(
    db: Session,
    *,
    mo: ProductionOrder,
    created_by_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Release + recreate production reservations for current snapshot totals."""
    tid = int(mo.tenant_id)
    oid = int(mo.id)
    if getattr(mo, "reservations_locked_at", None) is not None:
        return {"result": "SKIPPED_LOCKED", "production_order_id": oid}
    status = str(mo.status or "")
    if status not in AGGREGABLE_MO_STATUSES:
        return {"result": "SKIPPED_STATUS", "status": status, "production_order_id": oid}

    released = release_production_reservations(
        db,
        tenant_id=tid,
        production_order_id=oid,
        reason="orders_mo_material_refresh",
        performed_by_user_id=created_by_user_id,
    )
    planned = float(mo.planned_quantity or 0)
    if planned <= 1e-9:
        mo.materials_reserved = False
        db.add(mo)
        db.flush()
        return {"result": "RELEASED", "released": released, "created": 0, "production_order_id": oid}

    totals = _component_totals_from_snapshots(mo)
    if not totals:
        mo.materials_reserved = False
        db.add(mo)
        db.flush()
        return {"result": "NO_BOM_TOTALS", "released": released, "created": 0, "production_order_id": oid}

    try:
        rows = create_production_order_reservations(
            db,
            tenant_id=tid,
            order_id=oid,
            component_totals=totals,
            created_by_user_id=created_by_user_id,
        )
    except Exception:
        logger.exception("refresh reservations failed mo_id=%s", oid)
        mo.materials_reserved = False
        db.add(mo)
        db.flush()
        return {"result": "RESERVE_FAILED", "released": released, "created": 0, "production_order_id": oid}

    return {
        "result": "REFRESHED",
        "released": released,
        "created": len(rows),
        "production_order_id": oid,
        "component_totals": {str(k): v for k, v in totals.items()},
    }


def apply_material_validation_to_orders_mo(
    db: Session,
    *,
    mo: ProductionOrder,
    picking_config: PickingConfig | None = None,
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Rebalance ORDERS MO sources by net material availability and sync reservations.

    Whole source items only (no mid-line split): priority / oldest keep coverage;
    the rest become ``shortage`` and move to ``status_on_component_shortage_id``.
    """
    if str(getattr(mo, "source_type", "") or "") != PRODUCTION_ORDER_SOURCE_ORDERS:
        return {"result": "SKIPPED", "reason": "not_orders_mo"}

    status = str(mo.status or "")
    if status not in AGGREGABLE_MO_STATUSES:
        return {"result": "SKIPPED", "reason": "mo_not_aggregable", "status": status}

    if picking_config is None and getattr(mo, "picking_config_id", None):
        from ..production_config_query import get_production_config_by_id

        picking_config = get_production_config_by_id(
            db, int(mo.picking_config_id), require_active=False
        )

    composition: ProductComposition | None = None
    if getattr(mo, "composition_id", None):
        composition = (
            db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(ProductComposition.id == int(mo.composition_id))
            .first()
        )
    if composition is None:
        return {"result": "ERROR", "reason": "no_composition"}

    # Always reload sources from DB — relationship may be stale after attach/reactivate.
    sources = (
        db.query(ProductionOrderSourceItem)
        .filter(ProductionOrderSourceItem.production_order_id == int(mo.id))
        .order_by(ProductionOrderSourceItem.id.asc())
        .all()
    )
    try:
        db.expire(mo, ["order_sources", "line_snapshots"])
    except Exception:
        pass
    if getattr(mo, "line_snapshots", None) is None or not list(mo.line_snapshots or []):
        db.refresh(mo)

    candidates = [
        s
        for s in sources
        if str(s.status or "") in PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES
    ]
    if not candidates:
        # Only shortage/cancelled left — collapse MO if planned > 0 unexpectedly.
        if float(mo.planned_quantity or 0) > 1e-9:
            mo.planned_quantity = 0.0
            _rescale_snapshots(mo, 0.0)
            db.add(mo)
            refresh_orders_mo_material_reservations(db, mo=mo, created_by_user_id=operator_user_id)
        return {
            "result": "NO_CANDIDATES",
            "production_order_id": int(mo.id),
            "max_producible_quantity": 0.0,
            "reserved_source_ids": [],
            "shortage_source_ids": [],
        }

    order_ids = {int(s.order_id) for s in candidates}
    orders_by_id = {
        int(o.id): o
        for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
    } if order_ids else {}

    requested_total = sum(float(s.requested_quantity or 0) for s in candidates)
    analysis = analyze_composition_quantity(
        db,
        tenant_id=int(mo.tenant_id),
        warehouse_id=int(mo.warehouse_id),
        composition=composition,
        planned_quantity=float(requested_total),
        exclude_order_id=int(mo.id),
    )
    max_producible = float(analysis.get("producible_now_qty") or 0)
    shortage_meta = _shortage_component_labels(analysis)

    ordered = sort_source_items_for_material_allocation(candidates, orders_by_id)
    kept: list[ProductionOrderSourceItem] = []
    demoted: list[ProductionOrderSourceItem] = []
    remaining = max_producible
    for src in ordered:
        need = float(src.requested_quantity or 0)
        if need <= 1e-9:
            demoted.append(src)
            continue
        if remaining + 1e-9 >= need:
            kept.append(src)
            remaining -= need
        else:
            demoted.append(src)

    planned = sum(float(s.requested_quantity or 0) for s in kept)
    mo.planned_quantity = float(planned)
    mo.updated_at = datetime.utcnow()
    _rescale_snapshots(mo, float(planned))
    db.add(mo)

    now = datetime.utcnow()
    for src in kept:
        src.status = PRODUCTION_ORDER_SOURCE_ITEM_RESERVED
        src.updated_at = now
        db.add(src)

    shortage_status_id = getattr(picking_config, "status_on_component_shortage_id", None) if picking_config else None
    shortage_status_name = _status_name(db, status_id=shortage_status_id)

    for src in demoted:
        src.status = PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE
        src.updated_at = now
        db.add(src)
        order = orders_by_id.get(int(src.order_id))
        if order is None:
            continue
        moved_to = _move_order_to_shortage_status(db, order=order, pc=picking_config)
        missing_names = [
            str(c.get("product_name") or c.get("product_sku") or f"#{c.get('component_product_id')}")
            for c in shortage_meta[:5]
        ]
        missing_txt = (", ".join(missing_names) + ".") if missing_names else ""
        _log_order(
            db,
            order=order,
            event_type="PRODUCTION_COMPONENT_SHORTAGE",
            message=(
                f"Brak komponentów do produkcji. Zamówienie przeniesiono do statusu "
                f"„{shortage_status_name}”."
                + (f" Brakuje: {missing_txt}" if missing_txt else "")
            ),
            operator_user_id=operator_user_id,
            metadata={
                "reason": "COMPONENT_SHORTAGE",
                "production_order_id": int(mo.id),
                "production_order_number": str(mo.number),
                "requested_quantity": float(src.requested_quantity or 0),
                "max_producible_quantity": max_producible,
                "shortage_status_id": moved_to,
                "missing_components": shortage_meta,
            },
        )

    db.flush()

    if planned <= 1e-9:
        refresh_orders_mo_material_reservations(db, mo=mo, created_by_user_id=operator_user_id)
        try:
            # Collapse empty MO only — no availability event (would re-enter the same shortages).
            cancel_production_order(
                db,
                tenant_id=int(mo.tenant_id),
                order_id=int(mo.id),
                emit_availability=False,
            )
        except Exception:
            mo.status = "cancelled"
            db.add(mo)
            db.flush()
        return {
            "result": "ALL_SHORTAGE",
            "production_order_id": int(mo.id),
            "max_producible_quantity": max_producible,
            "planned_quantity": 0.0,
            "reserved_source_ids": [],
            "shortage_source_ids": [int(s.id) for s in demoted],
            "analysis": {
                "material_status": analysis.get("material_status"),
                "producible_now_qty": max_producible,
            },
        }

    reservation = refresh_orders_mo_material_reservations(
        db, mo=mo, created_by_user_id=operator_user_id
    )
    db.flush()

    return {
        "result": "OK" if not demoted else "PARTIAL",
        "production_order_id": int(mo.id),
        "max_producible_quantity": max_producible,
        "planned_quantity": float(planned),
        "requested_total": float(requested_total),
        "reserved_source_ids": [int(s.id) for s in kept],
        "shortage_source_ids": [int(s.id) for s in demoted],
        "reservation": reservation,
        "analysis": {
            "material_status": analysis.get("material_status"),
            "producible_now_qty": max_producible,
            "limiting_component": analysis.get("limiting_component"),
        },
    }


def _shortage_rows_for_components(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int],
    order_ids: Optional[list[int]],
    component_product_ids: Optional[list[int]],
) -> list[ProductionOrderSourceItem]:
    """Load shortage sources, optionally narrowed to MOs whose BOM uses given components."""
    q = (
        db.query(ProductionOrderSourceItem)
        .options(joinedload(ProductionOrderSourceItem.production_order))
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.status == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
        )
    )
    if production_order_id is not None:
        q = q.filter(ProductionOrderSourceItem.production_order_id == int(production_order_id))
    if order_ids:
        q = q.filter(ProductionOrderSourceItem.order_id.in_([int(x) for x in order_ids]))

    if component_product_ids:
        from ...models.production import ProductionOrderLineSnapshot

        pids = [int(x) for x in component_product_ids if int(x) > 0]
        if not pids:
            return []
        q = (
            q.join(
                ProductionOrder,
                ProductionOrder.id == ProductionOrderSourceItem.production_order_id,
            )
            .join(
                ProductionOrderLineSnapshot,
                ProductionOrderLineSnapshot.production_order_id == ProductionOrder.id,
            )
            .filter(
                ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS,
                ProductionOrderLineSnapshot.component_product_id.in_(tuple(pids)),
            )
            .distinct()
        )
        if warehouse_id is not None:
            q = q.filter(ProductionOrder.warehouse_id == int(warehouse_id))

    rows = q.all()
    if warehouse_id is not None and not component_product_ids:
        rows = [
            r
            for r in rows
            if r.production_order is not None
            and int(r.production_order.warehouse_id) == int(warehouse_id)
        ]
    return list(rows)


def retry_order_driven_production_shortages(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
    production_order_id: Optional[int] = None,
    order_ids: Optional[list[int]] = None,
    component_product_ids: Optional[list[int]] = None,
    operator_user_id: Optional[int] = None,
    trigger_reason: Optional[str] = None,
) -> dict[str, Any]:
    """
    Re-check shortage source items and restore them into production when materials allow.

    Shared core for manual retry and Phase-8 availability events.
    When ``component_product_ids`` is set, only shortages whose MO BOM uses those
    components are considered (priority / oldest ordering preserved).
    """
    from ..order_panel_ui_status_service import apply_order_panel_ui_status
    from .trigger_service import historical_fulfilled_production_qty

    rows = _shortage_rows_for_components(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        production_order_id=production_order_id,
        order_ids=order_ids,
        component_product_ids=component_product_ids,
    )

    # Priority sort across candidates (same key as material allocation).
    order_ids_set = {int(r.order_id) for r in rows}
    orders_by_id = {
        int(o.id): o
        for o in db.query(Order).filter(Order.id.in_(order_ids_set)).all()
    } if order_ids_set else {}
    rows = sort_source_items_for_material_allocation(rows, orders_by_id)

    results: list[dict[str, Any]] = []
    for src in rows:
        mo = src.production_order
        order = orders_by_id.get(int(src.order_id))
        if order is None:
            order = db.query(Order).filter(Order.id == int(src.order_id)).first()
        if order is None or mo is None:
            results.append({"source_item_id": int(src.id), "result": "SKIPPED", "reason": "missing"})
            continue

        # Negative / terminal guards
        o_status = str(getattr(order, "status", "") or "").upper()
        if o_status in ("CANCELLED", "CANCELED", "COMPLETED", "SHIPPED", "DELIVERED", "ARCHIVED"):
            results.append(
                {
                    "source_item_id": int(src.id),
                    "order_id": int(order.id),
                    "result": "SKIPPED",
                    "reason": "order_terminal",
                }
            )
            continue

        hist_ful = historical_fulfilled_production_qty(
            db, tenant_id=int(tenant_id), order_item_id=int(src.order_item_id)
        )
        need = max(0.0, float(src.requested_quantity or 0) - hist_ful)
        if need <= 1e-9 and hist_ful > 1e-9:
            results.append(
                {
                    "source_item_id": int(src.id),
                    "order_id": int(order.id),
                    "result": "SKIPPED",
                    "reason": "already_fulfilled",
                }
            )
            continue

        # Already covered by an active source (idempotent / prior restore).
        active_existing = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.tenant_id == int(tenant_id),
                ProductionOrderSourceItem.order_item_id == int(src.order_item_id),
                ProductionOrderSourceItem.status.in_(tuple(PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES)),
            )
            .first()
        )
        if active_existing is not None:
            results.append(
                {
                    "source_item_id": int(src.id),
                    "order_id": int(order.id),
                    "result": "SKIPPED",
                    "reason": "already_active",
                    "active_production_order_id": int(active_existing.production_order_id),
                }
            )
            continue

        # Re-read shortage status under concurrent retries.
        db.refresh(src)
        if str(src.status or "") != PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE:
            results.append(
                {
                    "source_item_id": int(src.id),
                    "order_id": int(order.id),
                    "result": "SKIPPED",
                    "reason": "no_longer_shortage",
                }
            )
            continue

        target_status = getattr(mo, "production_source_status_id", None)
        if target_status is None and getattr(mo, "picking_config_id", None):
            from ..production_config_query import get_production_config_by_id

            pc = get_production_config_by_id(db, int(mo.picking_config_id), require_active=False)
            target_status = getattr(pc, "source_status_id", None) if pc else None
        if target_status is None:
            results.append({"source_item_id": int(src.id), "result": "SKIPPED", "reason": "no_target_status"})
            continue

        # Move back to *this* MO's production entry status — SSOT trigger re-attaches / validates.
        apply_order_panel_ui_status(
            db,
            order=order,
            sub_status_id=int(target_status),
            operator_user_id=operator_user_id,
        )
        refreshed = (
            db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.id == int(src.id))
            .first()
        )
        active = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.tenant_id == int(tenant_id),
                ProductionOrderSourceItem.order_item_id == int(src.order_item_id),
                ProductionOrderSourceItem.status.in_(
                    tuple(PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES)
                ),
            )
            .first()
        )
        restored = active is not None
        if restored:
            _log_order(
                db,
                order=order,
                event_type="PRODUCTION_SHORTAGE_AUTO_RESUMED",
                message=(
                    "Wznowiono produkcję automatycznie — komponenty ponownie dostępne."
                    if trigger_reason
                    else "Wznowiono produkcję po ponownej analizie dostępności komponentów."
                ),
                operator_user_id=operator_user_id,
                metadata={
                    "source_item_id": int(src.id),
                    "production_order_id": int(active.production_order_id) if active else None,
                    "target_status_id": int(target_status),
                    "trigger_reason": trigger_reason,
                    "picking_config_id": getattr(mo, "picking_config_id", None),
                    "production_source_status_id": getattr(mo, "production_source_status_id", None),
                },
            )
        results.append(
            {
                "source_item_id": int(src.id),
                "order_id": int(order.id),
                "result": "RESTORED" if restored else "STILL_SHORTAGE",
                "active_source_status": (str(active.status) if active else None),
                "active_production_order_id": (
                    int(active.production_order_id) if active else None
                ),
                "legacy_status": (str(refreshed.status) if refreshed else None),
                "target_status_id": int(target_status),
            }
        )

    return {
        "result": "OK",
        "tenant_id": int(tenant_id),
        "warehouse_id": int(warehouse_id) if warehouse_id is not None else None,
        "trigger_reason": trigger_reason,
        "processed": len(results),
        "restored": sum(1 for r in results if r.get("result") == "RESTORED"),
        "items": results,
    }
