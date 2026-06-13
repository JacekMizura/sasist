"""P5.1 — shared consolidation plan progress projection."""

from __future__ import annotations

from typing import Any, Iterable, Sequence

from ...models.order_consolidation_plan import OrderConsolidationPlanItem
from .constants import ITEM_STATUS_RECEIVED


def is_cross_warehouse_transfer(item: OrderConsolidationPlanItem) -> bool:
    return int(item.source_warehouse_id) != int(item.target_warehouse_id)


def transfer_items(items: Sequence[OrderConsolidationPlanItem]) -> list[OrderConsolidationPlanItem]:
    return [it for it in items if is_cross_warehouse_transfer(it)]


def compute_transfer_progress(items: Sequence[OrderConsolidationPlanItem]) -> tuple[int, int]:
    transfers = transfer_items(items)
    total = len(transfers)
    received = sum(1 for it in transfers if str(it.status).upper() == ITEM_STATUS_RECEIVED)
    return received, total


def pending_source_warehouse_names(
    items: Sequence[OrderConsolidationPlanItem],
    names: dict[int, str],
) -> list[str]:
    out: list[str] = []
    seen: set[int] = set()
    for it in transfer_items(items):
        if str(it.status).upper() == ITEM_STATUS_RECEIVED:
            continue
        wid = int(it.source_warehouse_id)
        if wid in seen:
            continue
        seen.add(wid)
        out.append(names.get(wid, f"#{wid}"))
    return out


def progress_fields_for_items(
    items: Sequence[OrderConsolidationPlanItem],
    names: dict[int, str],
) -> dict[str, Any]:
    received, total = compute_transfer_progress(items)
    pending = pending_source_warehouse_names(items, names)
    return {
        "transfers_received": received,
        "transfers_total": total,
        "progress_label": f"{received} / {total} transferów odebranych" if total > 0 else "—",
        "pending_source_warehouses": pending,
    }
