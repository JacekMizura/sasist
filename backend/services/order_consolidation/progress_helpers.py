"""P5.1 / P5.3 — shared consolidation plan progress projection."""

from __future__ import annotations

from typing import Any, Sequence

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ...models.order_consolidation_plan import OrderConsolidationPlanItem
from .constants import ITEM_STATUS_RECEIVED, ITEM_STATUS_PICKED, ITEM_STATUS_STAGED, ITEM_STATUS_EXCEPTION


def is_cross_warehouse_transfer(item: OrderConsolidationPlanItem) -> bool:
    return int(item.source_warehouse_id) != int(item.target_warehouse_id)


def transfer_items(items: Sequence[OrderConsolidationPlanItem]) -> list[OrderConsolidationPlanItem]:
    return [it for it in items if is_cross_warehouse_transfer(it)]


def compute_transfer_progress(items: Sequence[OrderConsolidationPlanItem]) -> tuple[int, int]:
    transfers = transfer_items(items)
    total = len(transfers)
    received = sum(
        1
        for it in transfers
        if str(it.status).upper() in (ITEM_STATUS_RECEIVED, ITEM_STATUS_PICKED)
        and str(it.status).upper() not in ITEM_STATUS_EXCEPTION
    )
    return received, total


def compute_staging_progress(items: Sequence[OrderConsolidationPlanItem]) -> tuple[int, int]:
    active = [it for it in items if str(it.status).upper() not in ("CANCELLED",)]
    total = len(active)
    staged = sum(1 for it in active if str(it.status).upper() == ITEM_STATUS_STAGED)
    return staged, total


def pending_source_warehouse_names(
    items: Sequence[OrderConsolidationPlanItem],
    names: dict[int, str],
) -> list[str]:
    out: list[str] = []
    seen: set[int] = set()
    for it in transfer_items(items):
        if str(it.status).upper() in (ITEM_STATUS_RECEIVED, ITEM_STATUS_PICKED, ITEM_STATUS_STAGED):
            continue
        wid = int(it.source_warehouse_id)
        if wid in seen:
            continue
        seen.add(wid)
        out.append(names.get(wid, f"#{wid}"))
    return out


def default_segment_slot_label(level: ConsolidationRackLevel, segment: RackSegment) -> str:
    """Default slot name (A1, B2…) when operator has not set a custom label."""
    level_part = (level.name or "").strip()
    if not level_part:
        level_part = chr(ord("A") + int(level.level_index))
    if level.is_segmented or int(segment.segment_index) > 0:
        return f"{level_part}{int(segment.segment_index) + 1}"
    return level_part


def segment_slot_label(level: ConsolidationRackLevel, segment: RackSegment) -> str:
    custom = (getattr(segment, "slot_label", None) or "").strip()
    if custom:
        return custom
    return default_segment_slot_label(level, segment)


def format_segment_label(rack_name: str, level: ConsolidationRackLevel, segment: RackSegment) -> str:
    return f"{rack_name}/{segment_slot_label(level, segment)}"


def segment_label_for_row(segment: RackSegment, level: ConsolidationRackLevel, rack: ConsolidationRack) -> str:
    return format_segment_label(str(rack.name), level, segment)


def progress_fields_for_items(
    items: Sequence[OrderConsolidationPlanItem],
    names: dict[int, str],
) -> dict[str, Any]:
    received, total = compute_transfer_progress(items)
    staged, stage_total = compute_staging_progress(items)
    pending = pending_source_warehouse_names(items, names)
    return {
        "transfers_received": received,
        "transfers_total": total,
        "progress_label": f"{received} / {total} transferów odebranych" if total > 0 else "—",
        "pending_source_warehouses": pending,
        "staged_count": staged,
        "staging_total": stage_total,
        "staging_label": f"{staged} / {stage_total} na półce" if stage_total > 0 else "—",
    }
