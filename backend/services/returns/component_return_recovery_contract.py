"""Neutral service-layer contract for component return recovery → Z-PZ.

Not an ORM model. Bundle and manufacturing adapters map into this shape;
stock emission uses only ``accepted_qty > 0``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

SOURCE_BUNDLE = "BUNDLE"
SOURCE_MANUFACTURING = "MANUFACTURING"
ComponentRecoverySourceType = Literal["BUNDLE", "MANUFACTURING"]


@dataclass(frozen=True)
class ComponentReturnRecoveryLine:
    """Normalized recovery row for Z-PZ emission (accepted → stock)."""

    component_product_id: int
    expected_qty: float
    accepted_qty: float
    scrap_qty: float
    source_type: ComponentRecoverySourceType
    #: Bundle: order_line_bundle_component_id; Manufacturing: composition_line_id
    source_snapshot_id: Optional[int] = None
    #: ORM row id (ReturnLineBundleComponent.id or RmzLineComponentRecovery.id)
    source_row_id: Optional[int] = None
    disposition: str = "SALEABLE"
    return_decision: str = "ACCEPTED"
    purchase_price_net: Optional[float] = None
    vat_rate: float = 23.0
    order_item_id: Optional[int] = None
    rmz_damage_entry_id: Optional[str] = None
    #: Manufacturing DEFAULT_LOCATION only; bundle leaves None (STANDARD putaway)
    target_location_id: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def has_stock_qty(self) -> bool:
        return float(self.accepted_qty or 0) > 1e-9
