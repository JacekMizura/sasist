"""P5.7 + P5.8C — consolidation shelf allocation (P5.7 ranking + soft capacity scoring)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order_consolidation_plan import OrderConsolidationPlan
from .capacity_scoring_service import (
    any_candidate_has_capacity,
    capacity_allocation_sort_key,
)
from .constants import PLAN_STATUS_STAGING
from .order_footprint_service import calculate_order_footprint

NO_FREE_CONSOLIDATION_SHELF = "NO_FREE_CONSOLIDATION_SHELF"


def _packing_proximity_rank(rack: ConsolidationRack) -> int | None:
    """Optional rack metadata for packing-zone proximity (lower = closer)."""
    rank = getattr(rack, "packing_proximity_rank", None)
    if rank is not None:
        return int(rank)
    sort_order = getattr(rack, "sort_order", None)
    if sort_order is not None:
        return int(sort_order)
    return None


def _racks_with_active_staging(db: Session, *, tenant_id: int, warehouse_id: int) -> set[int]:
    rows = (
        db.query(ConsolidationRack.id)
        .join(ConsolidationRackLevel, ConsolidationRackLevel.rack_id == ConsolidationRack.id)
        .join(RackSegment, RackSegment.level_id == ConsolidationRackLevel.id)
        .join(OrderConsolidationPlan, OrderConsolidationPlan.order_id == RackSegment.order_id)
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
            RackSegment.order_id.isnot(None),
            OrderConsolidationPlan.status == PLAN_STATUS_STAGING,
        )
        .distinct()
        .all()
    )
    return {int(row[0]) for row in rows}


def allocate_consolidation_shelf(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int | None = None,
) -> RackSegment | None:
    """
    Pick the best free RackSegment in the target warehouse.

    P5.8C soft capacity scoring (when order_id + segment dimensions known):
    free segments → capacity score → P5.7 ranking → tie-break.

    P5.7 unchanged when scoring cannot be applied (no segment capacities).
    Never rejects segments due to capacity — NO_FREE only when no free slots.
    """
    candidates = (
        db.query(RackSegment, ConsolidationRackLevel, ConsolidationRack)
        .join(ConsolidationRackLevel, ConsolidationRackLevel.id == RackSegment.level_id)
        .join(ConsolidationRack, ConsolidationRack.id == ConsolidationRackLevel.rack_id)
        .filter(
            ConsolidationRack.tenant_id == int(tenant_id),
            ConsolidationRack.warehouse_id == int(warehouse_id),
            RackSegment.order_id.is_(None),
        )
        .all()
    )
    if not candidates:
        return None

    staging_racks = _racks_with_active_staging(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))

    order_volume: float | None = None
    scoring_active = False
    if order_id is not None:
        footprint = calculate_order_footprint(db, int(order_id))
        order_volume = footprint.volume_dm3 if footprint.volume_dm3 > 0 else None
        scoring_active = bool(order_volume and any_candidate_has_capacity(candidates))

    def _sort_key(row: tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack]) -> tuple:
        seg, level, rack = row
        cap_key = capacity_allocation_sort_key(
            order_volume,
            seg,
            scoring_active=scoring_active,
        )
        same_rack = 0 if int(rack.id) in staging_racks else 1
        proximity = _packing_proximity_rank(rack)
        proximity_key = int(proximity) if proximity is not None else 999_999
        return (
            cap_key,
            same_rack,
            int(level.level_index),
            proximity_key,
            int(seg.segment_index),
            int(rack.id),
            int(seg.id),
        )

    seg, _, _ = min(candidates, key=_sort_key)
    return seg
