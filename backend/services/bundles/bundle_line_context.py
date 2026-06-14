"""Immutable bundle line context — SSOT input for all projections (P4.14)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from ...models.order_item import OrderItem

BundleFulfillmentMode = Literal["ON_DEMAND_ASSEMBLY", "STOCK_PRODUCTION"]


@dataclass(frozen=True)
class BundleComponentSnapshotView:
    """Read-only view of persisted snapshot row."""

    snapshot_id: int
    order_id: int
    order_line_id: int
    bundle_id: Optional[int]
    component_product_id: int
    component_name: str
    sku: Optional[str]
    ean: Optional[str]
    required_qty_per_bundle: int
    required_qty_total: int
    unit_cost_snapshot: Optional[float]
    unit_price_snapshot: Optional[float]


@dataclass(frozen=True)
class BundlePricingContext:
    commercial_unit_price_net: float
    commercial_line_total_net: float
    list_price_net: Optional[float]
    vat_percent: Optional[float]


@dataclass(frozen=True)
class BundleLineContext:
    """
    Pełny kontekst linii zestawu w zamówieniu.

    Źródło prawdy: nagłówek ``order_items`` + ``order_line_bundle_components`` (snapshot).
    Nigdy nie czyta żywej receptury ``bundle_items`` po utworzeniu zamówienia.
    """

    order_id: int
    order_line_id: int
    parent_order_item: OrderItem
    bundle_id: int
    bundle_name: str
    fulfillment_mode: BundleFulfillmentMode
    bundle_qty: int
    pricing: BundlePricingContext
    components: tuple[BundleComponentSnapshotView, ...]
    linked_product_id: Optional[int]
    #: Linie operacyjne ON_DEMAND (składniki) — puste dla STOCK_PRODUCTION.
    component_order_items: tuple[OrderItem, ...]
