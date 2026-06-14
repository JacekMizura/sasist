"""P5.2 — analyze whether order can be fulfilled from one warehouse or needs consolidation."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Sequence

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem, order_item_is_replaced_line
from ..bundle_order_item_ops import (
    order_item_is_operational_picking_line,
    sqlalchemy_operational_picking_order_item_clause,
)
from ...models.tenant_warehouse import TenantWarehouse
from ...models.warehouse import Warehouse
from ..commercial_availability_service import commercially_sellable_qty
from ..fulfillment_assignment.fulfillment_assignment_resolver import resolve_initial_fulfillment_warehouse
from ..fulfillment_configuration_service import get_or_create_fulfillment_configuration


@dataclass(frozen=True)
class OrderLineDemand:
    product_id: int
    quantity: float


@dataclass(frozen=True)
class WarehouseFeasibilityRow:
    warehouse_id: int
    warehouse_name: str
    total_lines: int
    available_lines: int
    missing_units: float
    skus_to_pull: int


@dataclass
class ConsolidationFeasibilityResult:
    order_id: int
    tenant_id: int
    warehouses: List[WarehouseFeasibilityRow] = field(default_factory=list)
    best_consolidation_candidate: int | None = None
    best_consolidation_candidate_name: str | None = None
    single_warehouse_fulfillment_id: int | None = None
    single_warehouse_fulfillment_name: str | None = None
    manual_review_required: bool = False
    message: str | None = None


class OrderConsolidationFeasibilityError(ValueError):
    """Invalid order or tenant for consolidation analysis."""


def _eligible_warehouses(db: Session, tenant_id: int) -> List[TenantWarehouse]:
    return (
        db.query(TenantWarehouse)
        .filter(
            TenantWarehouse.tenant_id == int(tenant_id),
            TenantWarehouse.fulfillment_eligible.is_(True),
        )
        .order_by(TenantWarehouse.fulfillment_priority.asc(), TenantWarehouse.warehouse_id.asc())
        .all()
    )


def _order_line_demands(db: Session, order_id: int) -> List[OrderLineDemand]:
    rows = (
        db.query(OrderItem)
        .filter(
            OrderItem.order_id == int(order_id),
            sqlalchemy_operational_picking_order_item_clause(OrderItem),
        )
        .all()
    )
    out: List[OrderLineDemand] = []
    for row in rows:
        if order_item_is_replaced_line(row):
            continue
        qty = float(row.quantity or 0)
        if qty <= 0:
            continue
        out.append(OrderLineDemand(product_id=int(row.product_id), quantity=qty))
    return out


def _warehouse_name_map(db: Session, warehouse_ids: Sequence[int]) -> Dict[int, str]:
    if not warehouse_ids:
        return {}
    rows = db.query(Warehouse).filter(Warehouse.id.in_(tuple(int(x) for x in warehouse_ids))).all()
    return {int(w.id): str(w.name or f"#{w.id}") for w in rows}


def _avail_at(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    cache: Dict[tuple[int, int, int], float],
) -> float:
    key = (int(tenant_id), int(warehouse_id), int(product_id))
    if key not in cache:
        cache[key] = float(
            commercially_sellable_qty(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(product_id),
            )
        )
    return cache[key]


def _can_fulfill_all_from_warehouse(
    db: Session,
    tenant_id: int,
    warehouse_id: int,
    lines: Sequence[OrderLineDemand],
    cache: Dict[tuple[int, int, int], float],
) -> bool:
    for line in lines:
        if _avail_at(db, tenant_id, warehouse_id, line.product_id, cache) + 1e-9 < line.quantity:
            return False
    return True


def _network_has_stock(
    db: Session,
    tenant_id: int,
    warehouse_ids: Sequence[int],
    product_id: int,
    needed: float,
    cache: Dict[tuple[int, int, int], float],
) -> bool:
    total = 0.0
    for wid in warehouse_ids:
        total += _avail_at(db, tenant_id, int(wid), product_id, cache)
        if total + 1e-9 >= needed:
            return True
    return False


def _score_target_warehouse(
    db: Session,
    tenant_id: int,
    target_id: int,
    lines: Sequence[OrderLineDemand],
    warehouse_ids: Sequence[int],
    cache: Dict[tuple[int, int, int], float],
) -> tuple[int, float, int, bool]:
    """Returns (available_lines, missing_units, skus_to_pull, consolidation_feasible)."""
    available_lines = 0
    missing_units = 0.0
    skus_to_pull = 0
    feasible = True
    for line in lines:
        avail = _avail_at(db, tenant_id, target_id, line.product_id, cache)
        if avail + 1e-9 >= line.quantity:
            available_lines += 1
            continue
        short = line.quantity - avail
        missing_units += short
        skus_to_pull += 1
        others = [wid for wid in warehouse_ids if int(wid) != int(target_id)]
        pull_pool = sum(_avail_at(db, tenant_id, int(wid), line.product_id, cache) for wid in others)
        if pull_pool + 1e-9 < short:
            feasible = False
    return available_lines, missing_units, skus_to_pull, feasible


def resolve_preferred_consolidation_target_id(db: Session, order: Order) -> int | None:
    """P5.1 — tenant consolidation WH or resolver fallback (no plan mutation)."""
    tid = int(order.tenant_id)
    cfg = get_or_create_fulfillment_configuration(db, tid)
    if cfg.consolidation_warehouse_id is not None and int(cfg.consolidation_warehouse_id) > 0:
        return int(cfg.consolidation_warehouse_id)
    if order.warehouse_id is not None and int(order.warehouse_id) > 0:
        return int(order.warehouse_id)
    resolution = resolve_initial_fulfillment_warehouse(db, tenant_id=tid, order=order)
    if resolution.warehouse_id is not None and int(resolution.warehouse_id) > 0:
        return int(resolution.warehouse_id)
    return None


def analyze_order_consolidation_feasibility(db: Session, order_id: int) -> ConsolidationFeasibilityResult:
    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        raise OrderConsolidationFeasibilityError("Zamówienie nie istnieje.")

    tid = int(order.tenant_id)
    lines = _order_line_demands(db, int(order.id))
    if not lines:
        return ConsolidationFeasibilityResult(
            order_id=int(order.id),
            tenant_id=tid,
            message="Brak pozycji do analizy.",
        )

    eligible = _eligible_warehouses(db, tid)
    if not eligible:
        return ConsolidationFeasibilityResult(
            order_id=int(order.id),
            tenant_id=tid,
            manual_review_required=True,
            message="Brak magazynów fulfillment_eligible — wymagana ręczna weryfikacja.",
        )

    wh_ids = [int(tw.warehouse_id) for tw in eligible]
    names = _warehouse_name_map(db, wh_ids)
    cache: Dict[tuple[int, int, int], float] = {}

    rows: List[WarehouseFeasibilityRow] = []
    single_candidates: List[int] = []
    for tw in eligible:
        wid = int(tw.warehouse_id)
        available_lines, missing_units, skus_to_pull, _feasible = _score_target_warehouse(
            db, tid, wid, lines, wh_ids, cache
        )
        rows.append(
            WarehouseFeasibilityRow(
                warehouse_id=wid,
                warehouse_name=names.get(wid, f"#{wid}"),
                total_lines=len(lines),
                available_lines=available_lines,
                missing_units=round(missing_units, 4),
                skus_to_pull=skus_to_pull,
            )
        )
        if _can_fulfill_all_from_warehouse(db, tid, wid, lines, cache):
            single_candidates.append(wid)

    result = ConsolidationFeasibilityResult(
        order_id=int(order.id),
        tenant_id=tid,
        warehouses=rows,
    )

    if single_candidates:
        best_single = single_candidates[0]
        for tw in eligible:
            if int(tw.warehouse_id) in single_candidates:
                best_single = int(tw.warehouse_id)
                break
        result.single_warehouse_fulfillment_id = best_single
        result.single_warehouse_fulfillment_name = names.get(best_single)
        return result

    for line in lines:
        if not _network_has_stock(db, tid, wh_ids, line.product_id, line.quantity, cache):
            result.manual_review_required = True
            result.message = (
                "Niewystarczający stan w sieci magazynów — wymagana ręczna weryfikacja (MANUAL_REVIEW_REQUIRED)."
            )
            return result

    preferred = resolve_preferred_consolidation_target_id(db, order)
    candidate_scores: List[tuple[int, int, float, int]] = []
    for tw in eligible:
        wid = int(tw.warehouse_id)
        available_lines, missing_units, skus_to_pull, feasible = _score_target_warehouse(
            db, tid, wid, lines, wh_ids, cache
        )
        if not feasible:
            continue
        priority_bonus = 0 if preferred is not None and wid == int(preferred) else 1
        candidate_scores.append((priority_bonus, -available_lines, missing_units, wid))

    if not candidate_scores:
        result.manual_review_required = True
        result.message = "Nie można skonsolidować zamówienia do jednego magazynu — MANUAL_REVIEW_REQUIRED."
        return result

    candidate_scores.sort()
    best_id = candidate_scores[0][3]
    result.best_consolidation_candidate = best_id
    result.best_consolidation_candidate_name = names.get(best_id)
    return result
