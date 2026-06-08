"""Snapshot-aware valuation for accounting-grade inventory posting."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product
from ...services.product_cost_service import get_product_current_cost


def resolve_line_unit_cost_net(
    db: Session,
    *,
    document: InventoryDocument,
    line: InventoryDocumentLine,
    product: Product | None,
) -> float:
    """
    Valuation SSOT at post time:
    1) snapshot metadata on line if present
    2) product current cost (FIFO foundation via cost service)
    """
    if line.metadata_json:
        try:
            import json

            meta = json.loads(line.metadata_json)
            snap_cost = meta.get("snapshot_unit_cost_net")
            if snap_cost is not None:
                return float(snap_cost)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
    if product is None:
        return 0.0
    cost_data = get_product_current_cost(db, int(document.tenant_id), int(line.product_id))
    return float(cost_data.get("purchase_net") or 0)
