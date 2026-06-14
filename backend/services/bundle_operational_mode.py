"""Canonical bundle operational mode — user-facing fulfillment type (P4.11)."""

from __future__ import annotations

from typing import Literal, Optional, Tuple

BundleOperationalMode = Literal["ON_DEMAND_ASSEMBLY", "STOCK_PRODUCTION"]

ON_DEMAND_ASSEMBLY: BundleOperationalMode = "ON_DEMAND_ASSEMBLY"
STOCK_PRODUCTION: BundleOperationalMode = "STOCK_PRODUCTION"


def normalize_bundle_operational_mode(
    raw: Optional[str],
    *,
    stock_mode: Optional[str] = None,
    fulfillment_mode: Optional[str] = None,
) -> BundleOperationalMode:
    """Resolve mode from new column or legacy stock_mode."""
    s = (raw or "").strip().upper().replace("-", "_")
    if s in ("ON_DEMAND_ASSEMBLY", "ON_DEMAND", "ASSEMBLY_ON_DEMAND"):
        return ON_DEMAND_ASSEMBLY
    if s in ("STOCK_PRODUCTION", "STOCK", "PRODUCTION", "MANUFACTURING"):
        return STOCK_PRODUCTION

    sm = (stock_mode or "").strip().lower()
    if sm == "physical":
        return STOCK_PRODUCTION
    if sm == "virtual":
        return ON_DEMAND_ASSEMBLY

    fm = (fulfillment_mode or "").strip().lower()
    if fm == "manufacturing":
        return STOCK_PRODUCTION
    return ON_DEMAND_ASSEMBLY


def legacy_fields_for_mode(mode: BundleOperationalMode) -> Tuple[str, str]:
    """Map operational mode → (stock_mode, fulfillment_mode) for legacy columns."""
    if mode == STOCK_PRODUCTION:
        return "physical", "manufacturing"
    return "virtual", "assembly"


def is_stock_production(mode: BundleOperationalMode) -> bool:
    return mode == STOCK_PRODUCTION
