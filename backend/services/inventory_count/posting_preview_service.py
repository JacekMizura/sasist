"""Posting / approval preview — RW/PW impact for warehouse supervisors."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.location import Location
from ...models.product import Product
from .difference_service import analyze_document_differences
from .errors import InventoryDocumentNotFoundError
from .full_inventory_posting_service import build_inventory_posting_plans, requires_full_inventory_zeroing
from .strategy_service import get_result_policy, result_policy_updates_stock
from .unknown_product_service import list_unknown_products
from .valuation_service import resolve_line_unit_cost_net

logger = logging.getLogger(__name__)


def build_posting_preview(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    analysis = analyze_document_differences(db, document=doc)
    result_policy = get_result_policy(doc)
    updates_stock = result_policy_updates_stock(doc)

    lines = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(doc.id))
        .all()
    )

    rw_lines: list[dict[str, Any]] = []
    pw_lines: list[dict[str, Any]] = []
    location_ids: set[int] = set()

    if updates_stock and requires_full_inventory_zeroing(doc):
        posting_plans = build_inventory_posting_plans(db, doc=doc, lines=lines)
        preview_rows = [
            {
                "line_id": int(p.line.id) if p.line else None,
                "product_id": p.product_id,
                "location_id": p.location_id,
                "difference_quantity": p.difference_quantity,
                "reason": p.reason,
            }
            for p in posting_plans
        ]
    else:
        preview_rows = list(analysis.get("lines") or [])

    for row in preview_rows:
        diff = float(row.get("difference_quantity") or 0)
        if abs(diff) < 1e-9:
            continue
        lid = int(row.get("location_id") or 0)
        if lid:
            location_ids.add(lid)
        line = None
        if row.get("line_id"):
            line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == int(row["line_id"])).first()
        product = db.query(Product).filter(Product.id == int(row.get("product_id") or 0)).first() if row.get("product_id") else None
        unit_cost = resolve_line_unit_cost_net(db, document=doc, line=line, product=product)
        loc = db.query(Location).filter(Location.id == lid).first() if lid else None
        carrier_code = None
        if line and line.carrier_id:
            from ...models.warehouse_carrier import WarehouseCarrier

            car = db.query(WarehouseCarrier).filter(WarehouseCarrier.id == int(line.carrier_id)).first()
            carrier_code = getattr(car, "code", None)

        item = {
            "line_id": row.get("line_id"),
            "product_id": row.get("product_id"),
            "sku": row.get("sku") or (getattr(product, "sku", None) if product else None),
            "location_id": lid,
            "location_name": loc.name if loc else None,
            "carrier_code": carrier_code,
            "quantity": abs(diff),
            "unit_cost_net": round(unit_cost, 4),
            "value_net": round(abs(diff) * unit_cost, 2),
            "stock_source": "carrier" if carrier_code else "location",
        }
        if diff < 0:
            rw_lines.append(item)
        else:
            pw_lines.append(item)

    unknown = list_unknown_products(db, tenant_id=int(tenant_id), document_id=int(doc.id), status="draft")

    from ...models.inventory_count.count_entry import InventoryCountEntry

    operator_count = (
        db.query(InventoryCountEntry.user_id)
        .filter(
            InventoryCountEntry.inventory_document_id == int(doc.id),
            InventoryCountEntry.user_id.isnot(None),
        )
        .distinct()
        .count()
    )

    from .conflict_detail_service import list_document_conflicts

    unresolved_conflicts = 0
    try:
        conflict_data = list_document_conflicts(db, tenant_id=int(tenant_id), document_id=int(doc.id))
        unresolved_conflicts = int(conflict_data.get("unresolved_conflicts") or 0)
    except Exception:
        logger.exception(
            "INVENTORY_POSTING_PREVIEW_CONFLICTS_FAILED document_id=%s tenant_id=%s",
            document_id,
            tenant_id,
        )

    return {
        "document_id": int(doc.id),
        "document_number": doc.number,
        "result_policy": result_policy,
        "updates_stock": updates_stock,
        "valuation_method": "snapshot_unit_cost_net_or_purchase_net",
        "valuation_label": "Cena zakupu netto (migawka lub bieżący koszt FIFO z kartoteki)",
        "shortage_lines": len(rw_lines),
        "surplus_lines": len(pw_lines),
        "unknown_products_count": len(unknown),
        "affected_locations_count": len(location_ids),
        "total_shortage_value_net": round(sum(x["value_net"] for x in rw_lines), 2),
        "total_surplus_value_net": round(sum(x["value_net"] for x in pw_lines), 2),
        "net_correction_value": round(
            sum(x["value_net"] for x in pw_lines) - sum(x["value_net"] for x in rw_lines),
            2,
        ),
        "rw_preview": rw_lines[:50],
        "pw_preview": pw_lines[:50],
        "operator_count": int(operator_count),
        "unresolved_conflicts": unresolved_conflicts,
        "summary": analysis.get("summary") or {},
    }
