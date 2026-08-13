"""Idempotent stock replenishment (nadprodukcja) via existing PLANNING ProductionOrders.

Does not invent a new lifecycle or forecast engine — reuses planning recommendations
and ProductionOrder aggregation rules analogous to ORDERS (never mixed).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from ...models.product_composition import ProductComposition
from ...models.production import (
    PRODUCTION_ORDER_SOURCE_ORDERS,
    PRODUCTION_ORDER_SOURCE_PLANNING,
    ProductionOrder,
)
from ...schemas.production_planning import (
    ProductionStockReplenishmentActionRead,
    ProductionStockReplenishmentRunRead,
)
from ..composition_engine_service import effective_line_qty
from ..production_order_service import _next_order_number, _snapshot_composition_lines
from ..reservations.availability_service import warehouse_net_available
from ..reservations.reservation_service import (
    ReservationError,
    create_production_order_reservations,
    release_production_reservations,
)
from .constants import STOCK_REPLENISHMENT_COVERAGE_PRESETS
from .forecast_settings_service import load_forecast_settings
from .material_availability_service import cap_by_materials
from .planning_service import PlanningContext, build_planning_snapshot

logger = logging.getLogger(__name__)

AGGREGABLE_PLANNING_STATUSES = frozenset({"draft", "planned"})
OPEN_ORDERS_MO_STATUSES = frozenset({"draft", "planned", "collecting", "in_progress", "putaway"})


@dataclass
class _SoftHoldState:
    """Component qty earmarked for ORDERS before PLANNING may consume it."""

    by_component: dict[int, float]


def component_soft_hold_qty(*, outstanding_order_need: float, active_order_reserved: float) -> float:
    """
    Soft-hold protects only the unreserved slice of ORDERS component demand.

    soft_hold = max(0, outstanding_order_component_need − active_order_reservations)

    Must NOT double-count: when reservations already cover need, soft-hold is 0.
    """
    return max(0.0, float(outstanding_order_need or 0) - float(active_order_reserved or 0))


def _round_qty(v: float) -> float:
    return round(max(0.0, float(v)), 2)


def _rescale_snapshots(order: ProductionOrder, planned_quantity: float) -> None:
    pq = float(planned_quantity)
    for snap in list(order.line_snapshots or []):
        snap.total_required_quantity = float(snap.quantity_per_unit or 0) * pq


def ensure_orders_material_priority(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    performed_by_user_id: int | None = None,
) -> None:
    """Reserve materials for open ORDERS MOs before PLANNING may consume stock."""
    mos = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS,
            ProductionOrder.status.in_(tuple(AGGREGABLE_PLANNING_STATUSES | {"collecting", "in_progress"})),
        )
        .order_by(ProductionOrder.id.asc())
        .all()
    )
    for mo in mos:
        if getattr(mo, "materials_reserved", False):
            continue
        if getattr(mo, "reservations_locked_at", None):
            continue
        totals = {
            int(s.component_product_id): float(s.total_required_quantity or 0)
            for s in mo.line_snapshots or []
        }
        if not totals:
            continue
        try:
            create_production_order_reservations(
                db,
                tenant_id=int(tenant_id),
                order_id=int(mo.id),
                component_totals=totals,
                created_by_user_id=performed_by_user_id,
            )
        except ReservationError:
            logger.info(
                "ORDERS MO materials not fully reserved before replenishment mo_id=%s",
                mo.id,
            )


def soft_hold_components_for_orders(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> _SoftHoldState:
    """
    Per-component soft-hold for open ORDERS MOs.

    Priority remains: (1) real ORDERS StockReservation rows, (2) this soft-hold for the
    uncovered remainder, (3) PLANNING may consume what's left.

    Formula per component on each open ORDERS MO:
      soft_hold += max(0, snapshot_required − active_reservations_for_mo)

    Soft-hold is computational only (no durable reservation rows).
    """
    holds: dict[int, float] = defaultdict(float)
    mos = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_ORDERS,
            ProductionOrder.status.in_(tuple(OPEN_ORDERS_MO_STATUSES)),
        )
        .all()
    )
    for mo in mos:
        reserved_by_component: dict[int, float] = defaultdict(float)
        try:
            from ...models.stock_reservation import StockReservation

            rows = (
                db.query(StockReservation)
                .filter(
                    StockReservation.tenant_id == int(tenant_id),
                    StockReservation.production_order_id == int(mo.id),
                    StockReservation.status == "reserved",
                )
                .all()
            )
            for r in rows:
                reserved_by_component[int(r.product_id)] += float(r.quantity or 0)
        except Exception:
            logger.exception("soft_hold reservation lookup failed mo_id=%s", getattr(mo, "id", None))

        for snap in list(mo.line_snapshots or []):
            pid = int(snap.component_product_id)
            need = float(snap.total_required_quantity or 0)
            hold = component_soft_hold_qty(
                outstanding_order_need=need,
                active_order_reserved=float(reserved_by_component.get(pid, 0.0)),
            )
            if hold > 1e-9:
                holds[pid] += hold
    return _SoftHoldState(by_component=dict(holds))


def max_producible_after_orders_hold(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    soft_hold: _SoftHoldState,
) -> float:
    yld = float(composition.yield_quantity or 1) or 1.0
    limits: list[float] = []
    for ln in composition.lines or []:
        per = effective_line_qty(ln, yield_qty=yld)
        if per <= 1e-9:
            continue
        cid = int(ln.component_product_id)
        avail = warehouse_net_available(
            db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), product_id=cid
        )
        avail = max(0.0, avail - float(soft_hold.by_component.get(cid, 0.0)))
        limits.append(avail / per)
    if not limits:
        return 0.0
    return float(int(min(limits)))


def _find_aggregable_planning_mo(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    composition_id: int,
    for_update: bool = True,
) -> ProductionOrder | None:
    q = (
        db.query(ProductionOrder)
        .options(joinedload(ProductionOrder.line_snapshots))
        .filter(
            ProductionOrder.tenant_id == int(tenant_id),
            ProductionOrder.warehouse_id == int(warehouse_id),
            ProductionOrder.product_id == int(product_id),
            ProductionOrder.composition_id == int(composition_id),
            ProductionOrder.source_type == PRODUCTION_ORDER_SOURCE_PLANNING,
            ProductionOrder.status.in_(tuple(AGGREGABLE_PLANNING_STATUSES)),
        )
        .order_by(ProductionOrder.id.asc())
    )
    if for_update:
        try:
            q = q.with_for_update()
        except Exception:
            pass
    return q.first()


def _create_planning_mo(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    composition: ProductComposition,
    planned_quantity: float,
    created_by_user_id: int | None = None,
) -> ProductionOrder:
    """PLANNING MO — no order-driven FG buffer location."""
    legacy_recipe_id = int(composition.source_recipe_id) if composition.source_recipe_id else None
    order = ProductionOrder(
        tenant_id=int(tenant_id),
        number=_next_order_number(db, tenant_id=tenant_id),
        recipe_id=legacy_recipe_id,
        composition_id=int(composition.id),
        product_id=int(composition.product_id),
        warehouse_id=int(warehouse_id),
        location_id=None,
        planned_quantity=float(planned_quantity),
        produced_quantity=0.0,
        status="planned",
        source_type=PRODUCTION_ORDER_SOURCE_PLANNING,
        created_by_user_id=int(created_by_user_id) if created_by_user_id else None,
    )
    db.add(order)
    db.flush()
    _snapshot_composition_lines(db, order, composition, planned_quantity=float(planned_quantity))
    db.flush()
    return order


def _reserve_planning_materials(
    db: Session,
    *,
    tenant_id: int,
    order: ProductionOrder,
    created_by_user_id: int | None,
) -> None:
    if getattr(order, "reservations_locked_at", None):
        return
    try:
        release_production_reservations(
            db,
            tenant_id=int(tenant_id),
            production_order_id=int(order.id),
            reason="planning_qty_sync",
            performed_by_user_id=created_by_user_id,
        )
    except Exception:
        logger.exception("release planning reservations failed order_id=%s", order.id)
    totals = {
        int(s.component_product_id): float(s.total_required_quantity or 0)
        for s in order.line_snapshots or []
    }
    try:
        create_production_order_reservations(
            db,
            tenant_id=int(tenant_id),
            order_id=int(order.id),
            component_totals=totals,
            created_by_user_id=created_by_user_id,
        )
    except ReservationError as exc:
        # Partial materials — MO still created; operator sees shortage in normal lifecycle.
        logger.info(
            "planning replenishment reservation incomplete order_id=%s code=%s msg=%s",
            order.id,
            getattr(exc, "code", None),
            exc,
        )


def _consume_soft_hold_for_qty(
    soft_hold: _SoftHoldState,
    composition: ProductComposition,
    qty: float,
) -> None:
    """
    After a PLANNING MO is reserved, subsequent products see lower ``warehouse_net_available``
    via real StockReservation rows — ORDERS soft-hold map must stay unchanged.

    Soft-hold is ORDERS-only protection; PLANNING must not "eat" the ORDERS hold pool.
    This hook remains for call-site clarity / future diagnostics (intentionally no-op on map).
    """
    if qty <= 1e-9:
        return
    # Touch args so callers/tests keep a stable signature without mutating ORDERS hold.
    _ = (soft_hold, composition, qty)


def run_production_stock_replenishment(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    performed_by_user_id: int | None = None,
    force: bool = False,
) -> ProductionStockReplenishmentRunRead:
    """
    Create / aggregate PLANNING ProductionOrders for stock coverage gaps.

    Idempotent: pipeline already counted in recommendations; re-run with full coverage
    yields no extra qty. Never aggregates with ORDERS MOs.
    """
    settings = load_forecast_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    enabled = bool(settings.auto_stock_replenishment)
    coverage_days = settings.normalized_replenishment_coverage_days()
    if coverage_days not in STOCK_REPLENISHMENT_COVERAGE_PRESETS:
        coverage_days = 7

    actions: list[ProductionStockReplenishmentActionRead] = []
    created_count = 0
    aggregated_count = 0
    skipped_count = 0
    total_qty = 0.0

    if not enabled and not force:
        return ProductionStockReplenishmentRunRead(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            enabled=False,
            coverage_days=coverage_days,
            created_count=0,
            aggregated_count=0,
            skipped_count=0,
            total_quantity=0.0,
            actions=[
                ProductionStockReplenishmentActionRead(
                    product_id=0,
                    action="skipped",
                    reason="auto_stock_replenishment_disabled",
                )
            ],
        )

    snap = build_planning_snapshot(
        db,
        PlanningContext(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            coverage_days=int(coverage_days),
        ),
    )

    # Priority: ORDERS shortage / critical first, then HIGH → LOW (already sorted in snapshot).
    candidates = [
        p
        for p in snap.products
        if float(p.stock_replenishment_needed or 0) > 1e-6 and p.composition_id is not None
    ]

    # ORDERS first: attempt real reservations, then soft-hold any remaining unmet need.
    ensure_orders_material_priority(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        performed_by_user_id=performed_by_user_id,
    )
    soft_hold = soft_hold_components_for_orders(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id)
    )

    composition_ids = [int(p.composition_id) for p in candidates if p.composition_id]
    compositions: dict[int, ProductComposition] = {}
    if composition_ids:
        compositions = {
            int(c.id): c
            for c in db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(
                ProductComposition.id.in_(tuple(composition_ids)),
                ProductComposition.tenant_id == int(tenant_id),
            )
            .all()
        }

    for row in candidates:
        cid = int(row.composition_id or 0)
        composition = compositions.get(cid)
        if composition is None:
            skipped_count += 1
            actions.append(
                ProductionStockReplenishmentActionRead(
                    product_id=int(row.product_id),
                    product_name=str(row.product_name or ""),
                    composition_id=cid or None,
                    action="skipped",
                    reason="composition_not_found",
                )
            )
            continue

        desired = float(row.stock_replenishment_needed or 0)
        max_prod = max_producible_after_orders_hold(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            composition=composition,
            soft_hold=soft_hold,
        )
        qty = _round_qty(cap_by_materials(desired, max_prod))

        if qty <= 1e-9:
            skipped_count += 1
            actions.append(
                ProductionStockReplenishmentActionRead(
                    product_id=int(row.product_id),
                    product_name=str(row.product_name or ""),
                    composition_id=cid,
                    quantity=0.0,
                    action="capped" if desired > 1e-9 else "skipped",
                    reason="no_components" if max_prod <= 1e-9 else "qty_zero_after_cap",
                )
            )
            continue

        mo = _find_aggregable_planning_mo(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(row.product_id),
            composition_id=cid,
            for_update=True,
        )

        if mo is not None:
            # Existing unfinished PLANNING — increase quantity (never mix with ORDERS).
            mo.planned_quantity = float(mo.planned_quantity or 0) + float(qty)
            mo.updated_at = datetime.utcnow()
            _rescale_snapshots(mo, float(mo.planned_quantity))
            db.add(mo)
            db.flush()
            _reserve_planning_materials(
                db,
                tenant_id=int(tenant_id),
                order=mo,
                created_by_user_id=performed_by_user_id,
            )
            aggregated_count += 1
            total_qty += qty
            actions.append(
                ProductionStockReplenishmentActionRead(
                    product_id=int(row.product_id),
                    product_name=str(row.product_name or ""),
                    composition_id=cid,
                    quantity=_round_qty(qty),
                    production_order_id=int(mo.id),
                    production_order_number=str(mo.number),
                    action="aggregated",
                )
            )
        else:
            mo = _create_planning_mo(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                composition=composition,
                planned_quantity=float(qty),
                created_by_user_id=performed_by_user_id,
            )
            _reserve_planning_materials(
                db,
                tenant_id=int(tenant_id),
                order=mo,
                created_by_user_id=performed_by_user_id,
            )
            created_count += 1
            total_qty += qty
            actions.append(
                ProductionStockReplenishmentActionRead(
                    product_id=int(row.product_id),
                    product_name=str(row.product_name or ""),
                    composition_id=cid,
                    quantity=_round_qty(qty),
                    production_order_id=int(mo.id),
                    production_order_number=str(mo.number),
                    action="created",
                )
            )

        _consume_soft_hold_for_qty(soft_hold, composition, qty)

    return ProductionStockReplenishmentRunRead(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        enabled=True,
        coverage_days=int(coverage_days),
        created_count=created_count,
        aggregated_count=aggregated_count,
        skipped_count=skipped_count,
        total_quantity=_round_qty(total_qty),
        actions=actions,
    )


def compute_stock_replenishment_target(
    *,
    daily_rate: float,
    coverage_days: int,
    min_stock: float | None = None,
    max_stock: float | None = None,
) -> float:
    """Public helper for tests — target_stock = daily_rate × coverage (min/max bounds)."""
    from .production_recommendation_service import forecast_target_stock

    return forecast_target_stock(
        daily_rate=daily_rate,
        coverage_days=coverage_days,
        min_stock=min_stock,
        max_stock=max_stock,
    )
