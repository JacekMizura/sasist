"""Computed commercial pricing for product bundles (materials from components)."""

from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.bundle import Bundle, BundleItem
from .bundle_operational_mode import is_stock_production, normalize_bundle_operational_mode
from .product_cost_service import get_products_current_costs


def _safe_float(v: object) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _bundle_vat_percent(bundle: Bundle) -> float:
    raw = getattr(bundle, "metadata_json", None)
    if not raw:
        return 23.0
    try:
        obj = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return 23.0
    if not isinstance(obj, dict):
        return 23.0
    ui = obj.get("bundle_ui")
    if isinstance(ui, dict):
        v = _safe_float(ui.get("vat_rate"))
        if v is not None and v >= 0:
            return v
    return 23.0


def compute_bundle_pricing(
    db: Session,
    tenant_id: int,
    bundle: Bundle,
    *,
    component_costs: Optional[Dict[int, Dict[str, Any]]] = None,
) -> Dict[str, Optional[float]]:
    """Return canonical bundle pricing DTO fields."""
    items: List[BundleItem] = list(bundle.items or [])
    product_ids = [int(it.product_id) for it in items if it.product_id is not None]
    costs = component_costs if component_costs is not None else get_products_current_costs(db, tenant_id, product_ids)

    materials_cost = 0.0
    has_component = False
    for it in items:
        pid = int(it.product_id)
        qty = max(1, int(it.quantity or 1))
        has_component = True
        pc = costs.get(pid, {})
        purchase_net = _safe_float(pc.get("purchase_net"))
        if purchase_net is not None and purchase_net >= 0:
            materials_cost += qty * purchase_net

    materials_cost = round(materials_cost, 2) if has_component else None

    packaging_cost = round(_safe_float(getattr(bundle, "extra_cost_packaging_net", None)) or 0.0, 2)
    mode = normalize_bundle_operational_mode(
        getattr(bundle, "bundle_fulfillment_mode", None),
        stock_mode=getattr(bundle, "stock_mode", None),
        fulfillment_mode=getattr(bundle, "fulfillment_mode", None),
    )
    production_raw = _safe_float(getattr(bundle, "production_cost_net", None)) or 0.0
    production_cost = round(production_raw, 2) if is_stock_production(mode) else 0.0

    if materials_cost is None:
        total_cost = None
    else:
        total_cost = round(materials_cost + packaging_cost + production_cost, 2)

    sale_net = _safe_float(getattr(bundle, "sale_price", None))
    vat_percent = _bundle_vat_percent(bundle)
    sale_gross = round(sale_net * (1.0 + vat_percent / 100.0), 2) if sale_net is not None else None
    sale_net_rounded = round(sale_net, 2) if sale_net is not None else None

    margin_value: Optional[float] = None
    margin_percent: Optional[float] = None
    if sale_net_rounded is not None and total_cost is not None:
        margin_value = round(sale_net_rounded - total_cost, 2)
        if sale_net_rounded > 1e-9:
            margin_percent = round((margin_value / sale_net_rounded) * 100.0, 2)

    purchase_cost = materials_cost

    return {
        "purchase_cost": purchase_cost,
        "materials_cost": materials_cost,
        "packaging_cost": packaging_cost,
        "production_cost": production_cost,
        "total_cost": total_cost,
        "selling_price_net": sale_net_rounded,
        "selling_price_gross": sale_gross,
        "margin_value": margin_value,
        "margin_percent": margin_percent,
    }


def component_purchase_prices(
    db: Session,
    tenant_id: int,
    product_ids: List[int],
    *,
    costs: Optional[Dict[int, Dict[str, Any]]] = None,
) -> Dict[int, Optional[float]]:
    """Map product_id → purchase_net for bundle line display."""
    cost_map = costs if costs is not None else get_products_current_costs(db, tenant_id, product_ids)
    out: Dict[int, Optional[float]] = {}
    for pid in product_ids:
        pc = cost_map.get(int(pid), {})
        out[int(pid)] = _safe_float(pc.get("purchase_net"))
    return out
