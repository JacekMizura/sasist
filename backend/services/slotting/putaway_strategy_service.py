"""Intelligent putaway location suggestions — heuristic scoring."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from .capacity_service import calculate_location_capacity, product_footprint_from_orm
from .errors import ProductNotFoundError
from .slotting_models import (
    PACKAGING_CARTON,
    PACKAGING_UNIT,
    STRATEGY_BALANCED_UTILIZATION,
    STRATEGY_CONSOLIDATE_SKU,
    STRATEGY_MAX_FREE_SPACE,
    STRATEGY_NEAREST_AVAILABLE,
    STRATEGY_PICKING_PRIORITY,
    PutawaySuggestion,
)


def _score_location(
    *,
    capacity_fits: bool,
    max_fit: float,
    remaining_pct: float,
    same_sku: bool,
    pick_sequence: int | None,
    picking_priority: int,
    strategy: str,
    zone_match: bool,
    capacity_numeric_trusted: bool = True,
) -> tuple[float, list[str]]:
    tags: list[str] = []
    if not capacity_fits:
        return 0.0, ["capacity_exceeded"]

    score = 10.0
    if same_sku:
        score += 40.0
        tags.append("same_sku_present")
    # Never let synthetic fallback geometry (e.g. 160000) dominate ranking.
    if capacity_fits and max_fit > 0 and capacity_numeric_trusted:
        tags.append("fits")
        score += min(25.0, max_fit * 0.5)
    elif capacity_fits and not capacity_numeric_trusted:
        tags.append("fits_unknown_capacity")
        score += 5.0

    remaining = max(0.0, 100.0 - remaining_pct)
    if capacity_numeric_trusted:
        score += remaining * 0.15
        if remaining_pct < 40:
            tags.append("low_utilization")
    else:
        # Prefer empty locations without using fake utilization from fallback fill.
        if remaining_pct <= 1e-9:
            score += 8.0
            tags.append("empty_location")

    if zone_match:
        score += 10.0
        tags.append("zone_match")

    strat = str(strategy or STRATEGY_CONSOLIDATE_SKU).upper()
    if strat == STRATEGY_CONSOLIDATE_SKU and same_sku:
        score += 20.0
    elif strat == STRATEGY_MAX_FREE_SPACE and capacity_numeric_trusted:
        score += remaining * 0.35
        tags.append("max_free_space")
    elif strat == STRATEGY_PICKING_PRIORITY:
        score += max(0.0, 120 - float(picking_priority))
        tags.append("picking_priority")
    elif strat == STRATEGY_NEAREST_AVAILABLE:
        if pick_sequence is not None:
            score += max(0.0, 500.0 - float(pick_sequence))
        tags.append("nearest")
    elif strat == STRATEGY_BALANCED_UTILIZATION and capacity_numeric_trusted:
        ideal = abs(remaining_pct - 50.0)
        score += max(0.0, 30.0 - ideal * 0.5)
        tags.append("balanced")

    if capacity_fits:
        tags.append("recommended")
    return score, tags


def suggest_putaway_locations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
    preferred_zone: str | None = None,
    strategy: str = STRATEGY_CONSOLIDATE_SKU,
    limit: int = 15,
    exclude_location_ids: set[int] | None = None,
) -> list[PutawaySuggestion]:
    product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")

    from ..fit_engine.adapters import fit_item_from_product
    from .capacity_trust import resolve_trusted_capacity
    from .structural_weight import resolve_structural_weight_budget

    fit_item = fit_item_from_product(product, packaging_mode=packaging_mode)
    footprint = product_footprint_from_orm(product, packaging_mode=packaging_mode)
    exclude = exclude_location_ids or set()

    sku_locs = {
        int(r[0])
        for r in db.query(Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .distinct()
        .all()
        if r[0] is not None
    }

    locs = (
        db.query(Location)
        .filter(Location.warehouse_id == int(warehouse_id), Location.is_active.is_(True))
        .order_by(Location.pick_sequence.is_(None), Location.pick_sequence.asc(), Location.id.asc())
        .all()
    )

    suggestions: list[PutawaySuggestion] = []
    for loc in locs:
        lid = int(loc.id)
        if lid in exclude:
            continue
        same_sku = lid in sku_locs
        zone_match = bool(
            preferred_zone
            and str(getattr(loc, "operational_zone_type", "") or "").upper() == str(preferred_zone).upper()
        )
        fit = calculate_location_capacity(loc, footprint, quantity, packaging_mode)
        budget = resolve_structural_weight_budget(db, loc)
        trust = resolve_trusted_capacity(
            geometric_additional=float(fit.max_units or 0),
            geometric_total=float(fit.max_units or 0),
            current_qty=0.0,
            defaulted_fields=list(fit_item.defaulted_fields or []),
            unit_weight_kg=float(fit_item.weight_kg or 0),
            weight_remaining_kg=budget.effective_remaining_kg,
        )
        numeric_trusted = bool(trust["capacity_numeric_trusted"])
        remaining_pct = float(getattr(loc, "capacity_utilization_percent", 0) or 0)
        if fit.fits and numeric_trusted and trust["geometry_source"] == "REAL_DATA":
            remaining_pct = max(0.0, 100.0 - fit.volume_utilization_percent)

        trusted_add = trust["additional_capacity"]
        # Never score on synthetic fallback geometry (e.g. 160000); weight-only bounds OK.
        max_fit_for_score = float(trusted_add) if numeric_trusted and trusted_add is not None else 0.0
        capacity_fits = bool(fit.fits) if trust["geometry_source"] == "REAL_DATA" else True
        if numeric_trusted and trusted_add is not None:
            req = float(quantity or 0)
            if req > 0 and req > float(trusted_add) + 1e-6:
                capacity_fits = False
        elif not numeric_trusted:
            capacity_fits = True

        score, tags = _score_location(
            capacity_fits=capacity_fits,
            max_fit=max_fit_for_score,
            remaining_pct=remaining_pct if numeric_trusted else float(getattr(loc, "capacity_utilization_percent", 0) or 0),
            same_sku=same_sku,
            pick_sequence=getattr(loc, "pick_sequence", None),
            picking_priority=int(getattr(loc, "picking_priority", 100) or 100),
            strategy=strategy,
            zone_match=zone_match,
            capacity_numeric_trusted=numeric_trusted,
        )
        if score <= 0:
            continue
        suggestions.append(
            PutawaySuggestion(
                location_id=lid,
                location_code=str(loc.name or ""),
                score=score,
                max_fit_quantity=max_fit_for_score if numeric_trusted else None,
                remaining_capacity_percent=remaining_pct,
                same_sku_present=same_sku,
                reason_tags=tags,
                capacity_result=fit,
            )
        )

    suggestions.sort(key=lambda s: (-s.score, s.location_code))
    return suggestions[: max(1, min(limit, 50))]


def validate_putaway_assignment(
    db: Session,
    *,
    tenant_id: int,
    location_id: int,
    product_id: int,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
) -> dict[str, Any]:
    """Validate before stock assignment — raises nothing, returns warnings."""
    product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        from .errors import LocationNotFoundError

        raise LocationNotFoundError(f"Location {location_id} not found")

    fit = calculate_location_capacity(loc, product, quantity, packaging_mode)
    warnings: list[str] = []
    if not fit.fits and fit.failure_reason:
        warnings.append(fit.failure_reason)
    if fit.limiting_factor == "orientation":
        warnings.append("Orientation incompatible")
    if fit.limiting_factor == "stacking":
        warnings.append("Stacking restrictions apply")
    return {"fits": fit.fits, "warnings": warnings, "capacity": fit.to_dict()}
