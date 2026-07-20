"""Putaway distribution planner — PLAN only, never mutates Inventory.

Deterministic heuristic:
1. Prefer same-SKU locations with free additional capacity (fill first).
2. Then empty/new locations ranked by putaway soft score (consolidate strategy).
3. Prefer fewer locations; avoid oversized bin for tiny remainder when smaller fit exists.
4. Never allocate more than additional_capacity.
5. Respect UNKNOWN confidence (skip or allocate 0 with warning).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.product import Product
from .capacity_presentation import product_location_capacity_dict
from .errors import ProductNotFoundError
from .location_capacity_solver import solve_location_capacity
from .putaway_strategy_service import suggest_putaway_locations
from .slotting_models import PACKAGING_UNIT, STRATEGY_CONSOLIDATE_SKU


@dataclass
class DistributionAllocation:
    location_id: int
    location_code: str
    current_quantity: float
    total_capacity: float
    additional_capacity: float
    allocated_quantity: float
    confidence: str
    reason: str
    limiting_factor: Optional[str] = None
    limiting_factor_label: Optional[str] = None
    same_sku_present: bool = False
    used_defaults: bool = False
    defaulted_fields: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PutawayDistributionPlan:
    product_id: int
    warehouse_id: int
    requested_quantity: float
    allocated_quantity: float
    remaining_quantity: float
    allocations: list[DistributionAllocation] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    method: str = "HEURISTIC_DISTRIBUTION"
    note: str = "PLAN only — does not mutate Inventory. Revalidate before each putaway execution."

    def to_dict(self) -> dict[str, Any]:
        return {
            "product_id": self.product_id,
            "warehouse_id": self.warehouse_id,
            "requested_quantity": self.requested_quantity,
            "allocated_quantity": self.allocated_quantity,
            "remaining_quantity": self.remaining_quantity,
            "method": self.method,
            "note": self.note,
            "warnings": list(self.warnings),
            "allocations": [a.to_dict() for a in self.allocations],
        }


def _pick_best_for_remainder(
    candidates: list[tuple[dict[str, Any], float, bool, float]],
    need: float,
) -> Optional[tuple[dict[str, Any], float, bool, float]]:
    """Avoid huge bin for tiny remainder when a tighter fit exists."""
    feasible = [c for c in candidates if c[0]["additional_capacity"] > 1e-9]
    if not feasible:
        return None
    if need <= 0:
        return None
    # Prefer capacity close to need (not hugely oversized), then higher soft score
    scored = []
    for card, soft, same, add in feasible:
        add_f = float(add)
        slack = max(0.0, add_f - need)
        # penalty for oversized relative to need
        oversize_pen = slack / max(need, 1.0)
        scored.append((oversize_pen, -soft, -1 if same else 0, card, soft, same, add_f))
    scored.sort(key=lambda t: (t[0], t[1], t[2], str(t[3].get("location_code") or "")))
    best = scored[0]
    return best[3], best[4], best[5], best[6]


def build_putaway_distribution_plan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
    exclude_location_ids: set[int] | None = None,
    limit_candidates: int = 40,
) -> PutawayDistributionPlan:
    qty = float(quantity or 0)
    if qty <= 0:
        return PutawayDistributionPlan(
            product_id=int(product_id),
            warehouse_id=int(warehouse_id),
            requested_quantity=0,
            allocated_quantity=0,
            remaining_quantity=0,
            warnings=["ZERO_QUANTITY"],
        )

    product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")

    from ..fit_engine.adapters import fit_item_from_product

    fit_item = fit_item_from_product(product, packaging_mode=packaging_mode)

    exclude = exclude_location_ids or set()
    ranked = suggest_putaway_locations(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        quantity=max(1.0, qty),
        packaging_mode=packaging_mode,
        strategy=STRATEGY_CONSOLIDATE_SKU,
        limit=max(10, min(int(limit_candidates), 80)),
        exclude_location_ids=exclude,
    )
    soft_by_id = {int(s.location_id): float(s.score) for s in ranked}
    same_by_id = {int(s.location_id): bool(s.same_sku_present) for s in ranked}

    loc_ids = [int(s.location_id) for s in ranked]
    locs = (
        db.query(Location).filter(Location.id.in_(loc_ids)).all()
        if loc_ids
        else []
    )
    loc_by_id = {int(l.id): l for l in locs}

    candidates: list[tuple[dict[str, Any], float, bool, float]] = []
    warnings: list[str] = []
    for lid in loc_ids:
        loc = loc_by_id.get(lid)
        if loc is None:
            continue
        solved = solve_location_capacity(db, location=loc, product=product, packaging_mode=packaging_mode)
        card = product_location_capacity_dict(solved, fit_item=fit_item)
        conf = str(card["confidence"]).upper()
        add = float(card["additional_capacity"] or 0)
        if conf == "UNKNOWN":
            warnings.append(f"UNKNOWN_CAPACITY:{card['location_code']}")
            continue
        if add <= 1e-9:
            continue
        candidates.append((card, soft_by_id.get(lid, 0.0), same_by_id.get(lid, False), add))

    if fit_item.used_defaults:
        warnings.append("TECHNICAL_LOGISTICS_DEFAULTS")
        warnings.append("Plan szacunkowy — produkt ma niepełne dane logistyczne.")

    # Phase 1: fill same-SKU first (descending soft score)
    same_sku = sorted(
        [c for c in candidates if c[2]],
        key=lambda t: (-t[1], str(t[0].get("location_code") or "")),
    )
    others = sorted(
        [c for c in candidates if not c[2]],
        key=lambda t: (-t[1], str(t[0].get("location_code") or "")),
    )

    remaining = qty
    allocations: list[DistributionAllocation] = []
    used: set[int] = set()

    def _alloc(card: dict[str, Any], take: float, reason: str, same: bool) -> None:
        nonlocal remaining
        take = min(float(take), remaining, float(card["additional_capacity"]))
        if take <= 1e-9:
            return
        allocations.append(
            DistributionAllocation(
                location_id=int(card["location_id"]),
                location_code=str(card["location_code"]),
                current_quantity=float(card["current_quantity"]),
                total_capacity=float(card["total_capacity"]),
                additional_capacity=float(card["additional_capacity"]),
                allocated_quantity=float(take),
                confidence=str(card["confidence"]),
                reason=reason,
                limiting_factor=card.get("limiting_factor"),
                limiting_factor_label=card.get("limiting_factor_label"),
                same_sku_present=same,
                used_defaults=bool(card.get("used_defaults")),
                defaulted_fields=list(card.get("defaulted_fields") or []),
            )
        )
        used.add(int(card["location_id"]))
        remaining = max(0.0, remaining - take)

    for card, _soft, same, add in same_sku:
        if remaining <= 1e-9:
            break
        _alloc(card, add, "SAME_SKU_FILL", same)

    pool = [c for c in others if int(c[0]["location_id"]) not in used]
    while remaining > 1e-9 and pool:
        pick = _pick_best_for_remainder(pool, remaining)
        if pick is None:
            break
        card, soft, same, add = pick
        reason = "NEW_LOCATION_BEST_FIT" if remaining >= add - 1e-9 else "NEW_LOCATION_REMAINDER"
        if soft >= 40 and same:
            reason = "SAME_SKU_FILL"
        _alloc(card, min(add, remaining), reason, same)
        pool = [c for c in pool if int(c[0]["location_id"]) not in used]

    allocated = qty - remaining
    if remaining > 1e-9:
        warnings.append("INSUFFICIENT_CAPACITY")

    return PutawayDistributionPlan(
        product_id=int(product_id),
        warehouse_id=int(warehouse_id),
        requested_quantity=qty,
        allocated_quantity=allocated,
        remaining_quantity=remaining,
        allocations=allocations,
        warnings=warnings,
    )


def revalidate_distribution_plan(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
    exclude_location_ids: set[int] | None = None,
) -> PutawayDistributionPlan:
    """Rebuild plan from current stock — call before each execution step."""
    return build_putaway_distribution_plan(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        quantity=quantity,
        packaging_mode=packaging_mode,
        exclude_location_ids=exclude_location_ids,
    )
