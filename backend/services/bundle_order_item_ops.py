"""Bundle order line eligibility — picking, packing, reservation (P4.13 / P0 SSOT)."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy import and_, or_

from ..models.order_item import OrderItem, order_item_is_replaced_line
from .bundle_operational_mode import STOCK_PRODUCTION, normalize_bundle_operational_mode


def _order_item_meta_dict(item: OrderItem) -> dict[str, Any]:
    raw = getattr(item, "metadata_json", None)
    if not raw or not str(raw).strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def bundle_fulfillment_mode_from_order_item(item: OrderItem) -> Optional[str]:
    meta = _order_item_meta_dict(item)
    raw = meta.get("bundle_fulfillment_mode")
    if raw is not None and str(raw).strip():
        return normalize_bundle_operational_mode(str(raw))
    return None


def order_item_is_stock_production_bundle_parent(item: OrderItem) -> bool:
    if not bool(getattr(item, "is_bundle_parent", False)):
        return False
    return bundle_fulfillment_mode_from_order_item(item) == STOCK_PRODUCTION


def order_item_is_operational_picking_line(item: OrderItem) -> bool:
    """Linie biorące udział w zbieraniu / rezerwacji magazynowej."""
    if order_item_is_replaced_line(item):
        return False
    if int(item.quantity or 0) <= 0:
        return False
    if getattr(item, "parent_bundle_order_item_id", None) is not None:
        return True
    if bool(getattr(item, "is_bundle_parent", False)):
        return order_item_is_stock_production_bundle_parent(item)
    return True


def order_item_skip_bundle_commercial_header_for_ops(item: OrderItem) -> bool:
    """Nagłówek ON_DEMAND — tylko komercja; STOCK_PRODUCTION — operacyjny."""
    return bool(getattr(item, "is_bundle_parent", False)) and not order_item_is_stock_production_bundle_parent(
        item
    )


def sqlalchemy_operational_picking_order_item_clause(order_item_cls: type = OrderItem):
    """
    Filtr SQL (P0 SSOT): linie operacyjne — komponenty ON_DEMAND + parent STOCK_PRODUCTION.

    Używać zamiast ``is_bundle_parent.is_(False)`` w falach, rezerwacjach, dashboardach, konsolidacji.
    """
    meta_stock = or_(
        order_item_cls.metadata_json.contains('"bundle_fulfillment_mode": "STOCK_PRODUCTION"'),
        order_item_cls.metadata_json.contains('"bundle_fulfillment_mode":"STOCK_PRODUCTION"'),
    )
    return or_(
        order_item_cls.is_bundle_parent.is_(False),
        and_(order_item_cls.is_bundle_parent.is_(True), meta_stock),
    )


def filter_operational_order_items(items: list[OrderItem]) -> list[OrderItem]:
    """In-memory filter — ten sam kontrakt co ``sqlalchemy_operational_picking_order_item_clause``."""
    return [it for it in items if order_item_is_operational_picking_line(it)]
