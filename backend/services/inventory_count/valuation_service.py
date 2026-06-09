"""Snapshot-aware valuation for accounting-grade inventory posting."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product
from ...services.product_cost_service import get_product_current_cost


def _product_list_price_fallback(product: Product | None) -> float:
    if product is None:
        return 0.0
    for attr in ("purchase_price_net", "purchase_price"):
        raw = getattr(product, attr, None)
        if raw is not None:
            try:
                value = float(raw)
                if value >= 0:
                    return value
            except (TypeError, ValueError):
                continue
    return 0.0


def resolve_line_unit_cost_net(
    db: Session,
    *,
    document: InventoryDocument,
    line: InventoryDocumentLine | None,
    product: Product | None,
) -> float:
    """
    Valuation SSOT at post time:
    1) snapshot metadata on line if present
    2) product current cost (FIFO foundation via cost service)
    """
    if line is not None and line.metadata_json:
        try:
            import json

            meta = json.loads(line.metadata_json)
            snap_cost = meta.get("snapshot_unit_cost_net")
            if snap_cost is not None:
                return float(snap_cost)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    if product is None and line is not None and line.product_id is not None:
        product = db.query(Product).filter(Product.id == int(line.product_id)).first()
    if product is None:
        return 0.0
    product_id = int(line.product_id) if line is not None and line.product_id is not None else int(product.id)
    fallback = _product_list_price_fallback(product)
    try:
        cost_data = get_product_current_cost(db, int(document.tenant_id), product_id)
        net = float(cost_data.get("purchase_net") or 0)
        return net if net > 0 else fallback
    except Exception:
        return fallback
