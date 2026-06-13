"""P5.7 — smart consolidation shelf allocation (free segment selection only)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order_consolidation_plan import OrderConsolidationPlan
from .constants import PLAN_STATUS_STAGING

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
) -> RackSegment | None:
    """
    Pick the best free RackSegment in the target warehouse.

    Priority: racks already used for STAGING → lowest level → packing proximity (if set)
    → lowest segment index → stable rack/segment id tie-break.
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

    def _sort_key(row: tuple[RackSegment, ConsolidationRackLevel, ConsolidationRack]) -> tuple:
        seg, level, rack = row
        same_rack = 0 if int(rack.id) in staging_racks else 1
        proximity = _packing_proximity_rank(rack)
        proximity_key = int(proximity) if proximity is not None else 999_999
        return (
            same_rack,
            int(level.level_index),
            proximity_key,
            int(seg.segment_index),
            int(rack.id),
            int(seg.id),
        )

    seg, _, _ = min(candidates, key=_sort_key)
    return seg
