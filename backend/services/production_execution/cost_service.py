"""Single production cost calculation engine (RW component cost → unit cost)."""

from __future__ import annotations

from ...models.stock_document import StockDocument


def compute_rw_component_total_cost(rw_doc: StockDocument | None) -> float:
    if rw_doc is None:
        return 0.0
    total = 0.0
    for item in rw_doc.items or []:
        total += float(item.purchase_price_net or 0) * float(item.quantity or 0)
    return round(total, 4)


def compute_production_unit_cost(
    *,
    total_component_cost: float,
    produced_quantity: float,
    line_share: float = 1.0,
) -> float:
    if produced_quantity <= 1e-9:
        return 0.0
    line_cost = float(total_component_cost) * float(line_share)
    return round(line_cost / float(produced_quantity), 4)


def compute_batch_line_unit_cost(
    rw_doc: StockDocument | None,
    *,
    produced_quantity: float,
    total_planned_quantity: float,
) -> float:
    total_component_cost = compute_rw_component_total_cost(rw_doc)
    planned = total_planned_quantity if total_planned_quantity > 1e-9 else 1.0
    line_share = float(produced_quantity) / planned
    return compute_production_unit_cost(
        total_component_cost=total_component_cost,
        produced_quantity=produced_quantity,
        line_share=line_share,
    )


def compute_order_unit_cost(rw_doc: StockDocument | None, *, produced_quantity: float) -> float:
    total_component_cost = compute_rw_component_total_cost(rw_doc)
    return compute_production_unit_cost(
        total_component_cost=total_component_cost,
        produced_quantity=produced_quantity,
    )


def compute_batch_display_unit_cost(lines: list) -> float | None:
    costs = [
        float(ln.calculated_unit_cost)
        for ln in lines
        if getattr(ln, "calculated_unit_cost", None) is not None
    ]
    if not costs:
        return None
    if len(costs) == 1:
        return round(costs[0], 4)
    return round(sum(costs) / len(costs), 4)
