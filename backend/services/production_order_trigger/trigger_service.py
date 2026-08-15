"""Order-driven production trigger — STATUS → ProductionOrderSourceItem → MO.

Phase 2: create / aggregate / withdraw demand when panel status changes.
Does not change RW/PW/collecting lifecycle or material reservations.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ...models.picking_config import (
    PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT,
    PickingConfig,
)
from ...models.product_composition import ProductComposition
from ...models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES,
    PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES,
    PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED,
    PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED,
    PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
    PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderSourceItem,
)
from ..production_config_query import get_production_config_by_source_status
from ..production_manufacturing_composition import get_active_manufacturing_composition
from ..production_order_service import (
    _next_order_number,
    _snapshot_composition_lines,
    cancel_production_order,
)
from ..wms_audit_service import append_order_activity_for_wms
from .material_validation_service import (
    apply_material_validation_to_orders_mo,
    refresh_orders_mo_material_reservations,
)

logger = logging.getLogger(__name__)

AGGREGABLE_MO_STATUSES = frozenset({"draft", "planned"})
ACTIVE_SOURCE_STATUSES = PRODUCTION_ORDER_SOURCE_ITEM_ACTIVE_STATUSES
RECONCILABLE_DEMAND_STATUSES = PRODUCTION_ORDER_SOURCE_ITEM_RECONCILABLE_DEMAND_STATUSES


RESULT_SKIPPED = "SKIPPED"
RESULT_IDEMPOTENT = "IDEMPOTENT"
RESULT_CREATED = "CREATED"
RESULT_AGGREGATED = "AGGREGATED"
RESULT_REACTIVATED = "REACTIVATED"
RESULT_WITHDRAWN = "WITHDRAWN"
RESULT_WITHDRAWAL_BLOCKED = "WITHDRAWAL_BLOCKED"
RESULT_UNSUPPORTED_MULTI_ITEM = "UNSUPPORTED_MULTI_ITEM"
RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION = "NO_ACTIVE_MANUFACTURING_COMPOSITION"
RESULT_COMPONENT_SHORTAGE = "COMPONENT_SHORTAGE"
RESULT_ALREADY_FULFILLED = "ALREADY_FULFILLED"
RESULT_NO_WAREHOUSE = "NO_WAREHOUSE"
RESULT_ERROR = "ERROR"


def _active_order_items(db: Session, order: Order) -> list[OrderItem]:
    items = list(getattr(order, "items", None) or [])
    if not items and getattr(order, "id", None) is not None:
        items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == int(order.id))
            .order_by(OrderItem.id.asc())
            .all()
        )
    return [it for it in items if not order_item_is_replaced_line(it)]


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
    # Capture scalars before nested work — after flush failure getattr(order, ...) can
    # raise PendingRollbackError while logging the original IntegrityError.
    order_id = getattr(order, "id", None)
    wid = int(getattr(order, "warehouse_id", 0) or 0)
    if wid <= 0:
        return
    tid = int(getattr(order, "tenant_id", 0) or 0)
    try:
        nested = db.begin_nested()
        try:
            append_order_activity_for_wms(
                db,
                order_id=int(order_id),
                tenant_id=tid,
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
            "production trigger activity log failed order_id=%s event_type=%s",
            order_id,
            event_type,
        )


def _move_order_to_shortage_status(db: Session, *, order: Order, pc: PickingConfig) -> None:
    sid = getattr(pc, "status_on_component_shortage_id", None)
    if sid is None:
        return
    # Any UPDATE of orders re-validates shipping_method_id FK on Postgres.
    try:
        from ..order_shipping_fk_service import sanitize_order_orphan_shipping_method_id

        sanitize_order_orphan_shipping_method_id(db, order)
    except Exception:
        logger.exception(
            "production trigger orphan shipping sanitize failed order_id=%s",
            getattr(order, "id", None),
        )
    order.order_ui_status_id = int(sid)
    try:
        db.expire(order, ["order_ui_status"])
    except Exception:
        pass
    db.add(order)


def _rescale_snapshots(order: ProductionOrder, planned_quantity: float) -> None:
    pq = float(planned_quantity)
    for snap in list(order.line_snapshots or []):
        snap.total_required_quantity = float(snap.quantity_per_unit or 0) * pq


def _find_active_source_for_item(
    db: Session, *, tenant_id: int, order_item_id: int
) -> ProductionOrderSourceItem | None:
    return (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.order_item_id == int(order_item_id),
            ProductionOrderSourceItem.status.in_(tuple(ACTIVE_SOURCE_STATUSES)),
        )
        .first()
    )


def _find_reconcilable_demand_source_for_item(
    db: Session, *, tenant_id: int, order_item_id: int
) -> ProductionOrderSourceItem | None:
    """
    Outstanding production demand for FG reconciliation (Phase 3 / qty sync).

    Includes ``shortage`` — still a live demand blocked by components, not historical.
    Does **not** replace ``_find_active_source_for_item`` for trigger idempotency /
    material allocation uniqueness.
    """
    return (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.order_item_id == int(order_item_id),
            ProductionOrderSourceItem.status.in_(tuple(RECONCILABLE_DEMAND_STATUSES)),
        )
        .first()
    )


def historical_fulfilled_production_qty(
    db: Session, *, tenant_id: int, order_item_id: int
) -> float:
    """
    Sum of production already delivered for this order line across all source rows.

    Explicit historical check — ``fulfilled`` is intentionally NOT in ACTIVE_SOURCE_STATUSES
    (withdrawal / shortage retry must keep working). Re-entry uses this helper instead.
    """
    rows = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.order_item_id == int(order_item_id),
        )
        .all()
    )
    return sum(float(s.fulfilled_quantity or 0) for s in rows)


def outstanding_production_need_qty(
    *,
    order_item_quantity: float,
    historical_fulfilled_qty: float,
) -> float:
    """
    Remaining FG still needed for this order line after historical production fulfillment.

    Supports a later OrderItem.quantity increase (extra demand = delta only).
    When qty cannot grow after fulfillment, historical == order qty → need 0 → ALREADY_FULFILLED.
    """
    return max(0.0, float(order_item_quantity or 0) - float(historical_fulfilled_qty or 0))



def _advisory_lock(db: Session, *, key: int) -> None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return
    k = int(key) & 0x7FFFFFFF
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": k})
    except Exception:
        logger.exception("pg_advisory_xact_lock failed key=%s", k)


def _aggregation_lock_key(
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    composition_id: int,
    picking_config_id: int,
) -> int:
    from ..pg_advisory_lock import stable_advisory_lock_key

    return stable_advisory_lock_key(
        "prod_orders_agg",
        int(tenant_id),
        int(warehouse_id),
        int(product_id),
        int(composition_id),
        int(picking_config_id),
    )


def _find_aggregable_mo(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    composition_id: int,
    picking_config_id: int,
    for_update: bool = True,
) -> ProductionOrder | None:
    """
    Find draft/planned ORDERS MO for aggregation.

    IMPORTANT: never ``joinedload`` + ``with_for_update()`` — PostgreSQL rejects
    FOR UPDATE on the nullable side of a LEFT OUTER JOIN. Lock the MO row first,
    then ``selectinload`` collections in a separate SELECT.
    """
    q = (
        db.query(ProductionOrder)
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.product_id == int(product_id),
            ProductionOrder.composition_id == int(composition_id),
            ProductionOrder.picking_config_id == int(picking_config_id),
            ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS,
            ProductionOrder.status.in_(tuple(AGGREGABLE_MO_STATUSES)),
        )
        .order_by(ProductionOrder.id.asc())
    )
    if for_update:
        try:
            q = q.with_for_update()
        except Exception:
            pass
    mo = q.first()
    if mo is None:
        return None
    # Separate SELECT — keeps FOR UPDATE free of outer joins.
    return (
        db.query(ProductionOrder)
        .options(
            selectinload(ProductionOrder.line_snapshots),
            selectinload(ProductionOrder.order_sources),
        )
        .filter(ProductionOrder.id == int(mo.id))
        .first()
    )


def _create_orders_mo(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    planned_quantity: float,
    picking_config: PickingConfig,
) -> ProductionOrder:
    legacy_recipe_id = int(composition.source_recipe_id) if composition.source_recipe_id else None
    buffer_loc = getattr(picking_config, "finished_goods_buffer_location_id", None)
    order = ProductionOrder(
        tenant_id=int(tenant_id),
        number=_next_order_number(db, tenant_id=tenant_id),
        recipe_id=legacy_recipe_id,
        composition_id=int(composition.id),
        product_id=int(composition.product_id),
        warehouse_id=int(warehouse_id),
        location_id=int(buffer_loc) if buffer_loc else None,
        planned_quantity=float(planned_quantity),
        produced_quantity=0.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_ORDERS,
        picking_config_id=int(picking_config.id),
        production_source_status_id=int(picking_config.source_status_id),
    )
    db.add(order)
    db.flush()
    _snapshot_composition_lines(db, order, composition, planned_quantity=float(planned_quantity))
    db.flush()
    return order


def _attach_or_reactivate_source(
    db: Session,
    *,
    tenant_id: int,
    mo: ProductionOrder,
    order: Order,
    item: OrderItem,
    requested_quantity: float,
) -> tuple[ProductionOrderSourceItem, str]:
    """Returns (row, action) where action is active|created|reactivated|already_fulfilled."""
    existing = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.production_order_id == int(mo.id),
            ProductionOrderSourceItem.order_item_id == int(item.id),
        )
        .first()
    )
    if existing is not None:
        if str(existing.status or "") in ACTIVE_SOURCE_STATUSES:
            return existing, "active"
        if str(existing.status or "") == PRODUCTION_ORDER_SOURCE_ITEM_FULFILLED:
            already = float(existing.fulfilled_quantity or 0)
            # requested_quantity is outstanding need from enter; reopen only for true delta.
            if float(requested_quantity) <= 1e-9:
                return existing, "already_fulfilled"
            existing.status = PRODUCTION_ORDER_SOURCE_ITEM_OPEN
            existing.requested_quantity = already + float(requested_quantity)
            existing.fulfilled_quantity = already
            existing.updated_at = datetime.utcnow()
            db.add(existing)
            db.flush()
            return existing, "reactivated"
        # cancelled / shortage — clean reopen for remaining need
        existing.status = PRODUCTION_ORDER_SOURCE_ITEM_OPEN
        existing.requested_quantity = float(requested_quantity)
        existing.fulfilled_quantity = float(existing.fulfilled_quantity or 0)
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        db.flush()
        return existing, "reactivated"

    row = ProductionOrderSourceItem(
        tenant_id=int(tenant_id),
        production_order_id=int(mo.id),
        order_id=int(order.id),
        order_item_id=int(item.id),
        product_id=int(item.product_id),
        requested_quantity=float(requested_quantity),
        fulfilled_quantity=0.0,
        status=PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
    )
    db.add(row)
    db.flush()
    return row, "created"


def _enter_production(
    db: Session,
    *,
    order: Order,
    pc: PickingConfig,
    operator_user_id: Optional[int],
) -> dict[str, Any]:
    tid = int(order.tenant_id)
    wid = int(getattr(order, "warehouse_id", 0) or 0)
    if wid <= 0:
        return {"result": RESULT_NO_WAREHOUSE}

    scope = (
        getattr(pc, "production_order_trigger_scope", None)
        or PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT
    ).strip()
    items = _active_order_items(db, order)
    if scope == PRODUCTION_ORDER_TRIGGER_SCOPE_SINGLE_ELEMENT and len(items) != 1:
        logger.info(
            "production trigger UNSUPPORTED_MULTI_ITEM order_id=%s lines=%s config_id=%s",
            order.id,
            len(items),
            pc.id,
        )
        _move_order_to_shortage_status(db, order=order, pc=pc)
        _log_order(
            db,
            order=order,
            event_type="PRODUCTION_TRIGGER_UNSUPPORTED_MULTI",
            message=(
                "Zamówienie wieloelementowe nie może zostać automatycznie przekazane do produkcji "
                "(obsługiwane są tylko zamówienia jednoelementowe)."
            ),
            operator_user_id=operator_user_id,
            metadata={"reason": RESULT_UNSUPPORTED_MULTI_ITEM, "line_count": len(items)},
        )
        return {"result": RESULT_UNSUPPORTED_MULTI_ITEM, "line_count": len(items)}

    if not items:
        return {"result": RESULT_SKIPPED, "reason": "no_items"}

    item = items[0]
    qty = float(item.quantity or 0)
    if qty <= 0:
        return {"result": RESULT_SKIPPED, "reason": "zero_qty"}

    active = _find_active_source_for_item(db, tenant_id=tid, order_item_id=int(item.id))
    if active is not None:
        return {
            "result": RESULT_IDEMPOTENT,
            "production_order_id": int(active.production_order_id),
            "source_item_id": int(active.id),
        }

    # Historical fulfillment gate (fulfilled ∉ ACTIVE — separate from idempotent active path).
    hist_fulfilled = historical_fulfilled_production_qty(
        db, tenant_id=tid, order_item_id=int(item.id)
    )
    outstanding = outstanding_production_need_qty(
        order_item_quantity=qty, historical_fulfilled_qty=hist_fulfilled
    )
    if outstanding <= 1e-9:
        return {
            "result": RESULT_ALREADY_FULFILLED,
            "order_item_id": int(item.id),
            "order_item_quantity": qty,
            "historical_fulfilled_quantity": hist_fulfilled,
        }
    # Only request the unfulfilled delta (supports OrderItem.quantity increase after fulfillment).
    qty = outstanding

    composition = get_active_manufacturing_composition(
        db, tenant_id=tid, product_id=int(item.product_id)
    )
    if composition is None:
        logger.info(
            "production trigger NO_ACTIVE_MANUFACTURING_COMPOSITION order_id=%s product_id=%s",
            order.id,
            item.product_id,
        )
        _move_order_to_shortage_status(db, order=order, pc=pc)
        _log_order(
            db,
            order=order,
            event_type="PRODUCTION_TRIGGER_NO_BOM",
            message=(
                "Brak aktywnej receptury produkcyjnej dla produktu — "
                "zamówienie nie zostało przekazane do produkcji."
            ),
            operator_user_id=operator_user_id,
            metadata={
                "reason": RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION,
                "product_id": int(item.product_id),
            },
        )
        return {
            "result": RESULT_NO_ACTIVE_MANUFACTURING_COMPOSITION,
            "product_id": int(item.product_id),
        }

    _advisory_lock(
        db,
        key=_aggregation_lock_key(
            tenant_id=tid,
            warehouse_id=wid,
            product_id=int(item.product_id),
            composition_id=int(composition.id),
            picking_config_id=int(pc.id),
        ),
    )

    created_new_mo = False
    mo = _find_aggregable_mo(
        db,
        tenant_id=tid,
        warehouse_id=wid,
        product_id=int(item.product_id),
        composition_id=int(composition.id),
        picking_config_id=int(pc.id),
        for_update=True,
    )

    if mo is None:
        try:
            nested = db.begin_nested()
            try:
                mo = _create_orders_mo(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    composition=composition,
                    planned_quantity=qty,
                    picking_config=pc,
                )
                nested.commit()
                created_new_mo = True
            except IntegrityError:
                nested.rollback()
                mo = _find_aggregable_mo(
                    db,
                    tenant_id=tid,
                    warehouse_id=wid,
                    product_id=int(item.product_id),
                    composition_id=int(composition.id),
                    picking_config_id=int(pc.id),
                    for_update=True,
                )
                if mo is None:
                    raise
        except IntegrityError:
            mo = _find_aggregable_mo(
                db,
                tenant_id=tid,
                warehouse_id=wid,
                product_id=int(item.product_id),
                composition_id=int(composition.id),
                picking_config_id=int(pc.id),
                for_update=True,
            )
            if mo is None:
                logger.exception(
                    "production trigger failed to create/find MO order_id=%s", order.id
                )
                return {"result": RESULT_ERROR, "reason": "mo_create_race"}

    assert mo is not None

    if int(mo.composition_id or 0) != int(composition.id):
        mo = _create_orders_mo(
            db,
            tenant_id=tid,
            warehouse_id=wid,
            composition=composition,
            planned_quantity=qty,
            picking_config=pc,
        )
        created_new_mo = True

    try:
        source, action = _attach_or_reactivate_source(
            db,
            tenant_id=tid,
            mo=mo,
            order=order,
            item=item,
            requested_quantity=qty,
        )
    except IntegrityError:
        # Concurrent attach of same order_item — treat as idempotent.
        active2 = _find_active_source_for_item(db, tenant_id=tid, order_item_id=int(item.id))
        if active2 is not None:
            return {
                "result": RESULT_IDEMPOTENT,
                "production_order_id": int(active2.production_order_id),
                "source_item_id": int(active2.id),
            }
        raise

    if action == "active":
        return {
            "result": RESULT_IDEMPOTENT,
            "production_order_id": int(mo.id),
            "source_item_id": int(source.id),
        }

    if action == "already_fulfilled":
        return {
            "result": RESULT_ALREADY_FULFILLED,
            "production_order_id": int(mo.id),
            "source_item_id": int(source.id),
            "order_item_id": int(item.id),
            "historical_fulfilled_quantity": float(source.fulfilled_quantity or 0),
        }

    if not created_new_mo:
        mo.planned_quantity = float(mo.planned_quantity or 0) + float(qty)
        mo.updated_at = datetime.utcnow()
        _rescale_snapshots(mo, float(mo.planned_quantity))
        db.add(mo)
        db.flush()

    material = apply_material_validation_to_orders_mo(
        db,
        mo=mo,
        picking_config=pc,
        operator_user_id=operator_user_id,
    )
    try:
        db.refresh(source)
    except Exception:
        source = (
            db.query(ProductionOrderSourceItem)
            .filter(ProductionOrderSourceItem.id == int(source.id))
            .first()
        )
    if source is not None and str(source.status or "") == PRODUCTION_ORDER_SOURCE_ITEM_SHORTAGE:
        return {
            "result": RESULT_COMPONENT_SHORTAGE,
            "production_order_id": int(mo.id),
            "production_order_number": str(mo.number),
            "source_item_id": int(source.id),
            "requested_quantity": qty,
            "material": material,
        }

    if created_new_mo:
        result_code = RESULT_CREATED
        msg = (
            f"Zamówienie przekazano do produkcji. Zlecenie: {mo.number}, "
            f"ilość: {_qty_label(qty)} szt."
        )
    elif action == "reactivated":
        result_code = RESULT_REACTIVATED
        msg = (
            f"Zapotrzebowanie produkcyjne przywrócono w zleceniu {mo.number} "
            f"(+{_qty_label(qty)} szt.)."
        )
    else:
        result_code = RESULT_AGGREGATED
        msg = (
            f"Zapotrzebowanie produkcyjne dodano do zlecenia {mo.number} "
            f"(+{_qty_label(qty)} szt.)."
        )

    _log_order(
        db,
        order=order,
        event_type="PRODUCTION_ORDER_LINKED",
        message=msg,
        operator_user_id=operator_user_id,
        metadata={
            "production_order_id": int(mo.id),
            "production_order_number": str(mo.number),
            "requested_quantity": qty,
            "result": result_code,
            "source_status": str(source.status or ""),
            "planned_quantity": float(mo.planned_quantity or 0),
            "max_producible_quantity": material.get("max_producible_quantity"),
        },
    )
    return {
        "result": result_code,
        "production_order_id": int(mo.id),
        "production_order_number": str(mo.number),
        "planned_quantity": float(mo.planned_quantity),
        "source_item_id": int(source.id),
        "requested_quantity": qty,
        "material": material,
    }


def _withdraw_production(
    db: Session,
    *,
    order: Order,
    previous_pc: PickingConfig,
    operator_user_id: Optional[int],
) -> dict[str, Any]:
    tid = int(order.tenant_id)
    items = _active_order_items(db, order)
    if not items:
        sources = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.tenant_id == tid,
                ProductionOrderSourceItem.order_id == int(order.id),
                ProductionOrderSourceItem.status.in_(tuple(ACTIVE_SOURCE_STATUSES)),
            )
            .all()
        )
    else:
        item_ids = [int(it.id) for it in items]
        sources = (
            db.query(ProductionOrderSourceItem)
            .filter(
                ProductionOrderSourceItem.tenant_id == tid,
                ProductionOrderSourceItem.order_item_id.in_(item_ids),
                ProductionOrderSourceItem.status.in_(tuple(ACTIVE_SOURCE_STATUSES)),
            )
            .all()
        )

    if not sources:
        return {"result": RESULT_SKIPPED, "reason": "no_active_sources"}

    results: list[dict[str, Any]] = []
    for src in sources:
        # Lock MO row alone — joinedload + FOR UPDATE breaks on PostgreSQL.
        mo = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == int(src.production_order_id))
            .with_for_update()
            .first()
        )
        if mo is None:
            continue
        mo = (
            db.query(ProductionOrder)
            .options(selectinload(ProductionOrder.line_snapshots))
            .filter(ProductionOrder.id == int(mo.id))
            .first()
        )
        if mo is None:
            continue
        if (
            getattr(mo, "picking_config_id", None) is not None
            and int(mo.picking_config_id) != int(previous_pc.id)
        ):
            continue

        status = str(mo.status or "")
        if status in AGGREGABLE_MO_STATUSES:
            qty = max(0.0, float(src.requested_quantity or 0) - float(src.fulfilled_quantity or 0))
            src.status = PRODUCTION_ORDER_SOURCE_ITEM_CANCELLED
            src.updated_at = datetime.utcnow()
            db.add(src)
            mo.planned_quantity = max(0.0, float(mo.planned_quantity or 0) - qty)
            mo.updated_at = datetime.utcnow()
            if mo.planned_quantity <= 1e-9:
                mo.planned_quantity = 0.0
                _rescale_snapshots(mo, 0.0)
                db.add(mo)
                db.flush()
                try:
                    cancel_production_order(db, tenant_id=tid, order_id=int(mo.id))
                except Exception:
                    mo.status = "cancelled"
                    db.add(mo)
                    db.flush()
                    try:
                        refresh_orders_mo_material_reservations(
                            db, mo=mo, created_by_user_id=operator_user_id
                        )
                    except Exception:
                        logger.exception(
                            "release reservations on cancel fallback mo_id=%s", mo.id
                        )
                _log_order(
                    db,
                    order=order,
                    event_type="PRODUCTION_ORDER_WITHDRAWN",
                    message=(
                        f"Zamówienie wycofano z produkcji. Zlecenie {mo.number} anulowano "
                        "(brak pozostałego zapotrzebowania)."
                    ),
                    operator_user_id=operator_user_id,
                    metadata={"production_order_id": int(mo.id), "result": RESULT_WITHDRAWN},
                )
                results.append(
                    {
                        "result": RESULT_WITHDRAWN,
                        "production_order_id": int(mo.id),
                        "cancelled_mo": True,
                    }
                )
            else:
                _rescale_snapshots(mo, float(mo.planned_quantity))
                db.add(mo)
                db.flush()
                refresh_orders_mo_material_reservations(
                    db, mo=mo, created_by_user_id=operator_user_id
                )
                _log_order(
                    db,
                    order=order,
                    event_type="PRODUCTION_ORDER_WITHDRAWN",
                    message=(
                        f"Zamówienie wycofano z produkcji. Zapotrzebowanie usunięto ze zlecenia "
                        f"{mo.number} (−{_qty_label(qty)} szt.)."
                    ),
                    operator_user_id=operator_user_id,
                    metadata={
                        "production_order_id": int(mo.id),
                        "result": RESULT_WITHDRAWN,
                        "reduced_qty": qty,
                    },
                )
                results.append(
                    {
                        "result": RESULT_WITHDRAWN,
                        "production_order_id": int(mo.id),
                        "reduced_qty": qty,
                    }
                )
        else:
            _log_order(
                db,
                order=order,
                event_type="PRODUCTION_ORDER_WITHDRAWAL_BLOCKED",
                message=(
                    f"Zamówienie opuściło status produkcji, ale zlecenie {mo.number} jest już w toku "
                    f"({status}) — ilości produkcji nie zostały zmienione."
                ),
                operator_user_id=operator_user_id,
                metadata={
                    "production_order_id": int(mo.id),
                    "mo_status": status,
                    "result": RESULT_WITHDRAWAL_BLOCKED,
                },
            )
            results.append(
                {
                    "result": RESULT_WITHDRAWAL_BLOCKED,
                    "production_order_id": int(mo.id),
                    "mo_status": status,
                }
            )

    if not results:
        return {"result": RESULT_SKIPPED}
    return {"result": results[0]["result"], "details": results}


def on_order_panel_status_changed_production(
    db: Session,
    *,
    order: Order,
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Hook after panel status mutation (same outer transaction).

    Unexpected exceptions are logged and re-raised so the status-service SAVEPOINT
    can roll back only trigger side-effects (soft-fail at ``_run_production_status_hook``).
    Controlled domain outcomes return result codes without raising.
    """
    order_id = getattr(order, "id", None)
    try:
        prev = int(previous_status_id) if previous_status_id is not None else None
        new = int(new_status_id) if new_status_id is not None else None
        if prev == new:
            return {"result": RESULT_SKIPPED, "reason": "unchanged"}

        wid = int(getattr(order, "warehouse_id", 0) or 0)
        tid = int(order.tenant_id)
        if wid <= 0:
            return {"result": RESULT_NO_WAREHOUSE}

        prev_pc = (
            get_production_config_by_source_status(db, tid, wid, prev, require_active=False)
            if prev is not None
            else None
        )
        new_pc = (
            get_production_config_by_source_status(db, tid, wid, new, require_active=True)
            if new is not None
            else None
        )

        prev_prod = prev_pc is not None
        new_prod = new_pc is not None

        out: dict[str, Any] = {"previous_production": prev_prod, "new_production": new_prod}

        if prev_prod and not new_prod and prev_pc is not None:
            out["withdraw"] = _withdraw_production(
                db, order=order, previous_pc=prev_pc, operator_user_id=operator_user_id
            )

        if new_prod and new_pc is not None:
            out["enter"] = _enter_production(
                db, order=order, pc=new_pc, operator_user_id=operator_user_id
            )

        if not prev_prod and not new_prod:
            out["result"] = RESULT_SKIPPED
        return out
    except Exception:
        logger.exception(
            "production trigger failed order_id=%s prev=%s new=%s",
            order_id,
            previous_status_id,
            new_status_id,
        )
        raise
