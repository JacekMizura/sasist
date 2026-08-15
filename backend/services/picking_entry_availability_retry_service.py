"""
Phase 3 — FG availability increase → revalidate awaiting orders → return to picking.

Reuses Phase 8 ``notify_component_availability_increased`` coalescing / entry point.
Does not rebuild the Phase 2 readiness gate — calls evaluate + reserve + demand reduce,
then ``apply_order_panel_ui_status`` to ``return_picking_status_id`` when READY.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from ..models.order import Order
from ..models.order_item import OrderItem, order_item_is_replaced_line
from ..models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES,
    ProductionOrderSourceItem,
)
from .activity_log.domain_activity import record_domain_activity
from .activity_log.domain_event_codes import (
    PICKING_ENTRY_AVAILABILITY_DEMAND_CANCELLED,
    PICKING_ENTRY_AVAILABILITY_DEMAND_REDUCED,
    PICKING_ENTRY_AVAILABILITY_RETURNED_TO_PICKING,
    PICKING_ENTRY_AVAILABILITY_SOURCE_DETACHED_STARTED_MO,
)
from .bundle_order_item_ops import order_item_skip_bundle_commercial_header_for_ops
from .picking_config_service import order_priority_rank
from .picking_entry_gate_service import (
    META_LAST_BLOCKER_FINGERPRINT,
    META_READINESS_SNAPSHOT,
    META_RETURN_PICKING_STATUS_ID,
    MODE_ACTIVE,
    _compute_line_plan,
    _order_meta,
    _picked_qty,
    _product_labels,
    _reclassify_with_config,
    _save_order_meta,
    picking_entry_readiness_mode,
    reduce_missing_production_demand,
    resolve_gate_production_config,
)
from .picking_entry_readiness_service import (
    ORDER_READY_FOR_PICKING,
    evaluate_order_picking_entry_readiness,
)
from .production_config_query import list_production_configs
from .production_order_trigger.trigger_service import (
    _find_reconcilable_demand_source_for_item,
)
from .sales_order_fg_reservation_service import (
    SalesOrderReservationError,
    reserve_sales_order_fg,
    reserved_qty_for_order_product,
)
from .wms_picking_atp import pickable_available_qty

logger = logging.getLogger(__name__)

_in_fg_availability_retry: ContextVar[bool] = ContextVar(
    "picking_entry_fg_av_retry", default=False
)


def is_in_picking_entry_fg_availability_retry() -> bool:
    return bool(_in_fg_availability_retry.get())


@contextmanager
def _fg_retry_guard():
    if _in_fg_availability_retry.get():
        yield False
        return
    token = _in_fg_availability_retry.set(True)
    try:
        yield True
    finally:
        _in_fg_availability_retry.reset(token)


def _advisory_lock_fg_retry(db: Session, *, tenant_id: int, warehouse_id: int) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return
    from .pg_advisory_lock import stable_advisory_lock_key

    key = stable_advisory_lock_key(
        "picking_entry_fg_av_retry", int(tenant_id), int(warehouse_id)
    )
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
    except Exception:
        logger.exception(
            "pg_advisory_xact_lock fg retry failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )


def _awaiting_status_ids(db: Session, *, tenant_id: int, warehouse_id: int) -> set[int]:
    rows = list_production_configs(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), include_inactive=False
    )
    out: set[int] = set()
    for r in rows:
        aid = getattr(r, "status_awaiting_production_id", None)
        if aid is not None and int(aid) > 0:
            out.add(int(aid))
    return out


def _order_sort_key(order: Order) -> tuple:
    rank = order_priority_rank(order)
    dt = getattr(order, "order_date", None) or getattr(order, "created_at", None) or datetime.min
    if hasattr(dt, "tzinfo") and dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return (rank, dt, int(order.id))


def find_awaiting_orders_for_fg_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Iterable[int],
) -> list[Order]:
    """Awaiting-production orders blocked on / sourcing any of ``product_ids``."""
    pids = sorted({int(x) for x in product_ids if x is not None and int(x) > 0})
    if not pids:
        return []
    awaiting = _awaiting_status_ids(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if not awaiting:
        return []

    tid = int(tenant_id)
    wid = int(warehouse_id)

    by_item = {
        int(oid)
        for (oid,) in (
            db.query(Order.id)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .filter(
                Order.tenant_id == tid,
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(tuple(awaiting)),
                OrderItem.product_id.in_(pids),
            )
            .distinct()
            .all()
        )
    }
    by_source = {
        int(oid)
        for (oid,) in (
            db.query(ProductionOrderSourceItem.order_id)
            .filter(
                ProductionOrderSourceItem.tenant_id == tid,
                ProductionOrderSourceItem.product_id.in_(pids),
                ProductionOrderSourceItem.status.in_(
                    tuple(PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES)
                ),
            )
            .join(Order, Order.id == ProductionOrderSourceItem.order_id)
            .filter(
                Order.warehouse_id == wid,
                Order.deleted_at.is_(None),
                Order.order_ui_status_id.in_(tuple(awaiting)),
            )
            .distinct()
            .all()
        )
    }
    order_ids = sorted(by_item | by_source)
    if not order_ids:
        return []

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id.in_(order_ids))
        .all()
    )
    return sorted(orders, key=_order_sort_key)


def _qty_label(v: Any) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "0"
    if abs(f - round(f)) < 1e-9:
        return str(int(round(f)))
    return f"{f:.4f}".rstrip("0").rstrip(".")


def _emit_demand_activity(
    db: Session,
    *,
    order: Order,
    event_type: str,
    description: str,
    correlation_id: str,
    metadata: dict[str, Any],
) -> None:
    record_domain_activity(
        db,
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id),
        order_id=int(order.id),
        production_order_id=metadata.get("mo_id"),
        event_type=event_type,
        description=description,
        severity="INFO",
        category="system",
        correlation_id=correlation_id[:128],
        metadata=metadata,
        actor_user_id=None,
        production_label=metadata.get("mo_number"),
    )


def revalidate_awaiting_order_after_fg_increase(
    db: Session,
    *,
    order: Order,
    trigger_product_ids: Iterable[int] | None = None,
    operator_user_id: int | None = None,
    reason: str = "fg_availability_increased",
) -> dict[str, Any]:
    """
    Full-order re-gate for one awaiting order: reserve FG, shrink/cancel draft demand,
    return to ``return_picking_status_id`` only when READY_FOR_PICKING.
    """
    if picking_entry_readiness_mode() != MODE_ACTIVE:
        return {"result": "SKIPPED", "reason": "mode_not_active", "order_id": int(order.id)}

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    oid = int(order.id)
    trigger_pids = sorted(
        {int(x) for x in (trigger_product_ids or []) if x is not None and int(x) > 0}
    )

    awaiting_ids = _awaiting_status_ids(db, tenant_id=tid, warehouse_id=wid)
    cur_status = (
        int(order.order_ui_status_id) if getattr(order, "order_ui_status_id", None) else None
    )
    if cur_status is None or cur_status not in awaiting_ids:
        return {"result": "SKIPPED", "reason": "not_awaiting", "order_id": oid}

    if not getattr(order, "items", None):
        order = (
            db.query(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.product))
            .filter(Order.id == oid)
            .first()
            or order
        )

    # Serialize per-order while holding warehouse advisory (caller) — lock order row.
    (
        db.query(Order)
        .filter(Order.id == oid)
        .with_for_update()
        .first()
    )

    prod_cfg = resolve_gate_production_config(db, tenant_id=tid, warehouse_id=wid)
    readiness = evaluate_order_picking_entry_readiness(db, order=order, dry_run=False)
    readiness = _reclassify_with_config(db, readiness=readiness, production_config=prod_cfg)

    by_oi = {int(ln.order_item_id): ln for ln in readiness.lines}
    reserved_delta: list[dict[str, Any]] = []
    demand_changes: list[dict[str, Any]] = []

    for oi in order.items or []:
        if order_item_is_replaced_line(oi):
            continue
        if order_item_skip_bundle_commercial_header_for_ops(oi):
            continue
        base = by_oi.get(int(oi.id))
        if base is None:
            continue
        plan = _compute_line_plan(db, order=order, oi=oi, base=base)

        # 1) Reserve additional free FG (ATP SSOT; advisory inside reserve)
        if plan.to_reserve > 1e-9:
            try:
                rows = reserve_sales_order_fg(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    order_id=oid,
                    product_id=int(plan.readiness.product_id),
                    quantity=plan.to_reserve,
                )
                reserved_delta.append(
                    {
                        "product_id": int(plan.readiness.product_id),
                        "qty": plan.to_reserve,
                        "rows": len(rows),
                    }
                )
            except SalesOrderReservationError as exc:
                logger.info(
                    "fg retry reserve shortfall order_id=%s product_id=%s: %s",
                    oid,
                    plan.readiness.product_id,
                    exc,
                )
                # Recompute plan with whatever ATP remains
                readiness = evaluate_order_picking_entry_readiness(
                    db, order=order, dry_run=False
                )
                readiness = _reclassify_with_config(
                    db, readiness=readiness, production_config=prod_cfg
                )
                base = next(
                    (ln for ln in readiness.lines if int(ln.order_item_id) == int(oi.id)),
                    base,
                )
                plan = _compute_line_plan(db, order=order, oi=oi, base=base)

        # Recompute stock cover after reserve for demand shrink.
        need = max(0.0, float(oi.quantity or 0) - _picked_qty(oi))
        own_res = reserved_qty_for_order_product(
            db, tenant_id=tid, order_id=oid, product_id=int(oi.product_id)
        )
        atp = pickable_available_qty(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            product_id=int(oi.product_id),
            exclude_order_id=oid,
        )
        free = max(0.0, atp - own_res)
        stock_cover = min(need, own_res + free)
        # Remaining FG still owed by production (picked already excluded from need).
        desired_out = max(0.0, round(need - stock_cover, 6))

        active = _find_reconcilable_demand_source_for_item(
            db, tenant_id=tid, order_item_id=int(oi.id)
        )
        if active is not None:
            before_out = max(
                0.0, float(active.requested_quantity or 0) - float(active.fulfilled_quantity or 0)
            )
            if before_out > desired_out + 1e-9:
                red = reduce_missing_production_demand(
                    db,
                    order=order,
                    order_item=oi,
                    desired_outstanding=desired_out,
                    operator_user_id=operator_user_id,
                )
                reduced = float(red.get("reduced") or 0)
                if reduced > 1e-9 or red.get("cancelled_source"):
                    pname, sku = _product_labels(db, int(oi.product_id))
                    mo_number = red.get("mo_number")
                    meta = {
                        "product_id": int(oi.product_id),
                        "product_name": pname,
                        "sku": sku,
                        "was_outstanding": before_out,
                        "warehouse_gain": reduced,
                        "remaining_outstanding": desired_out,
                        "mo_id": red.get("production_order_id"),
                        "mo_number": mo_number,
                        "reason": reason,
                        "trigger_product_ids": trigger_pids,
                    }
                    demand_changes.append({**red, **meta})
                    if red.get("result") == "SOURCE_DETACHED_STARTED_MO" or red.get(
                        "source_detached"
                    ):
                        _emit_demand_activity(
                            db,
                            order=order,
                            event_type=PICKING_ENTRY_AVAILABILITY_SOURCE_DETACHED_STARTED_MO,
                            description=(
                                "Zamówienie zostało pokryte z dostępnego magazynu. "
                                "Rozpoczęta produkcja będzie kontynuowana jako uzupełnienie zapasu."
                            ),
                            correlation_id=(
                                f"peg-av-detach-{oid}-{oi.product_id}-"
                                f"{_qty_label(before_out)}-{red.get('production_order_id')}"
                            ),
                            metadata={
                                **meta,
                                "external_fg_allocated": round(before_out, 6),
                                "source_detached": True,
                                "mo_planned_unchanged": True,
                                "severity": "info",
                            },
                        )
                    elif desired_out <= 1e-9 or red.get("cancelled_source"):
                        _emit_demand_activity(
                            db,
                            order=order,
                            event_type=PICKING_ENTRY_AVAILABILITY_DEMAND_CANCELLED,
                            description=(
                                "Produkt jest już dostępny na magazynie — anulowano "
                                "nierozpoczęte zapotrzebowanie produkcyjne."
                            ),
                            correlation_id=(
                                f"peg-av-cancel-{oid}-{oi.product_id}-"
                                f"{_qty_label(before_out)}-{_qty_label(desired_out)}"
                            ),
                            metadata=meta,
                        )
                    else:
                        _emit_demand_activity(
                            db,
                            order=order,
                            event_type=PICKING_ENTRY_AVAILABILITY_DEMAND_REDUCED,
                            description=(
                                "Dostępność produktu wzrosła — zmniejszono "
                                "zapotrzebowanie produkcyjne."
                            ),
                            correlation_id=(
                                f"peg-av-reduce-{oid}-{oi.product_id}-"
                                f"{_qty_label(before_out)}-{_qty_label(desired_out)}"
                            ),
                            metadata={
                                **meta,
                                "lines": [
                                    {
                                        "product_id": int(oi.product_id),
                                        "product_name": pname,
                                        "sku": sku,
                                        "was_production": before_out,
                                        "warehouse_gain": reduced,
                                        "remaining_production": desired_out,
                                        "mo_number": mo_number,
                                    }
                                ],
                            },
                        )

    # Final full-order readiness after mutations
    readiness_final = evaluate_order_picking_entry_readiness(db, order=order, dry_run=False)
    readiness_final = _reclassify_with_config(
        db, readiness=readiness_final, production_config=prod_cfg
    )

    returned = False
    return_status_id = None
    if readiness_final.code == ORDER_READY_FOR_PICKING:
        meta = _order_meta(order)
        ret = meta.get(META_RETURN_PICKING_STATUS_ID)
        if ret is not None and int(ret) > 0:
            return_status_id = int(ret)
            from .order_panel_ui_status_service import apply_order_panel_ui_status

            apply_order_panel_ui_status(
                db,
                order=order,
                sub_status_id=return_status_id,
                operator_user_id=operator_user_id,
            )
            returned = True
            # Clear awaiting snapshot so unrelated FG events do not no-op-spam retry
            meta = _order_meta(order)
            meta.pop(META_READINESS_SNAPSHOT, None)
            meta.pop(META_LAST_BLOCKER_FINGERPRINT, None)
            # Keep return_* for audit until next await cycle overwrites
            _save_order_meta(db, order, meta)
            _emit_demand_activity(
                db,
                order=order,
                event_type=PICKING_ENTRY_AVAILABILITY_RETURNED_TO_PICKING,
                description=(
                    "Brakujące produkty są dostępne — zamówienie ponownie "
                    "przekazano do zbierania."
                ),
                correlation_id=f"peg-av-ready-{oid}-{return_status_id}",
                metadata={
                    "return_picking_status_id": return_status_id,
                    "reason": reason,
                    "trigger_product_ids": trigger_pids,
                    "readiness": readiness_final.code,
                },
            )
        else:
            logger.warning(
                "fg retry READY but missing return_picking_status_id order_id=%s", oid
            )

    changed = bool(reserved_delta or demand_changes or returned)
    return {
        "result": "RETURNED" if returned else ("CHANGED" if changed else "NOOP"),
        "order_id": oid,
        "readiness": readiness_final.code,
        "reserved": reserved_delta,
        "demand_changes": demand_changes,
        "returned_to_picking": returned,
        "return_picking_status_id": return_status_id,
    }


def on_fg_availability_increased(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: Iterable[int],
    reason: str = "fg_availability_increased",
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """Process awaiting orders affected by FG product availability increase."""
    empty = {
        "result": "SKIPPED",
        "reason": "empty_or_inactive",
        "tenant_id": int(tenant_id),
        "warehouse_id": int(warehouse_id),
        "product_ids": [],
        "processed": 0,
        "returned": 0,
        "changed": 0,
        "items": [],
    }
    if picking_entry_readiness_mode() != MODE_ACTIVE:
        return {**empty, "reason": "mode_not_active"}

    pids = sorted({int(x) for x in product_ids if x is not None and int(x) > 0})
    if not pids:
        return empty

    with _fg_retry_guard() as entered:
        if not entered:
            return {**empty, "reason": "reentrant"}

        _advisory_lock_fg_retry(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
        orders = find_awaiting_orders_for_fg_products(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_ids=pids,
        )
        items: list[dict[str, Any]] = []
        returned = 0
        changed = 0
        for order in orders:
            try:
                out = revalidate_awaiting_order_after_fg_increase(
                    db,
                    order=order,
                    trigger_product_ids=pids,
                    operator_user_id=operator_user_id,
                    reason=reason,
                )
            except Exception:
                logger.exception(
                    "revalidate_awaiting_order failed order_id=%s reason=%s",
                    getattr(order, "id", None),
                    reason,
                )
                continue
            items.append(out)
            if out.get("returned_to_picking"):
                returned += 1
            if out.get("result") in ("RETURNED", "CHANGED"):
                changed += 1

        logger.info(
            "PICKING_ENTRY_FG_RETRY reason=%s tenant_id=%s warehouse_id=%s "
            "product_ids=%s candidates=%s changed=%s returned=%s",
            reason,
            tenant_id,
            warehouse_id,
            pids,
            len(orders),
            changed,
            returned,
        )
        return {
            "result": "OK",
            "reason": reason,
            "tenant_id": int(tenant_id),
            "warehouse_id": int(warehouse_id),
            "product_ids": pids,
            "processed": len(orders),
            "returned": returned,
            "changed": changed,
            "items": items,
        }
