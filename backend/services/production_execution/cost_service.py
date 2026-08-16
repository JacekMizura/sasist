"""Single production cost calculation engine (RW component cost → unit cost)."""

from __future__ import annotations

import json
from typing import Any

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
    """Blended FG unit cost: total RW material / batch planned (shared across lines, no double count)."""
    total_component_cost = compute_rw_component_total_cost(rw_doc)
    planned = total_planned_quantity if total_planned_quantity > 1e-9 else 1.0
    # Materials consumed once at RW for full planned BOM; unit = material / planned FG.
    # ``produced_quantity`` kept for call-site compatibility.
    _ = produced_quantity
    return compute_production_unit_cost(
        total_component_cost=total_component_cost,
        produced_quantity=planned,
        line_share=1.0,
    )


def compute_order_unit_cost(
    rw_doc: StockDocument | None,
    *,
    produced_quantity: float,
    planned_quantity: float | None = None,
) -> float:
    total_component_cost = compute_rw_component_total_cost(rw_doc)
    # Materials are fully consumed at RW; use planned qty until real output exists to avoid
    # inflated mid-partial unit cost (total_rw / 40 when 40 of 100 produced).
    planned = float(planned_quantity or 0)
    if produced_quantity > 1e-9 and planned > 1e-9 and produced_quantity + 1e-6 < planned:
        denom = planned
    else:
        denom = produced_quantity if produced_quantity > 1e-9 else (planned if planned > 1e-9 else 0.0)
    return compute_production_unit_cost(
        total_component_cost=total_component_cost,
        produced_quantity=denom,
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


def parse_material_cost_json(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return None
    return obj if isinstance(obj, dict) else None


def freeze_material_cost_on_entity(entity: Any, breakdown: dict[str, Any]) -> None:
    """Persist auditable actual material cost snapshot (RECEIPT / PRODUCT_FALLBACK slices)."""
    payload = dict(breakdown or {})
    payload.setdefault("version", 1)
    entity.material_cost_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def material_cost_read_fields(entity: Any) -> dict[str, Any]:
    data = parse_material_cost_json(getattr(entity, "material_cost_json", None))
    if not data:
        return {
            "actual_material_cost": None,
            "has_product_fallback": False,
            "material_cost_slices": None,
        }
    return {
        "actual_material_cost": data.get("actual_material_cost"),
        "has_product_fallback": bool(data.get("has_product_fallback")),
        "material_cost_slices": data.get("slices"),
    }
