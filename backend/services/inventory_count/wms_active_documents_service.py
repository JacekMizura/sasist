"""WMS operator view — active inventory documents (in_progress, awaiting_approval)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
)
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document import InventoryDocument
from .document_service import _doc_to_dict
from .line_materialization_service import parse_document_filters
from .recount_conflict_service import lines_with_unresolved_operator_conflicts


def _scope_summary(filters: dict[str, Any]) -> str:
    mode = str(filters.get("scope_mode") or "full").lower()
    if mode == "full":
        return "Cały magazyn"
    if mode == "locations":
        n = len(filters.get("location_ids") or [])
        return f"{n} lokalizacji" if n else "Lokalizacje (nie wybrano)"
    if mode == "products":
        n = len(filters.get("product_ids") or [])
        return f"{n} produktów" if n else "Produkty (nie wybrano)"
    if mode == "carriers":
        n = len(filters.get("carrier_ids") or [])
        return f"{n} nośników" if n else "Nośniki (nie wybrano)"
    if mode == "categories":
        n = len(filters.get("category_ids") or [])
        return f"{n} kategorii" if n else "Kategorie (nie wybrano)"
    if mode == "dynamic":
        parts: list[str] = ["Filtry dynamiczne"]
        dyn = filters.get("dynamic") if isinstance(filters.get("dynamic"), dict) else {}
        if dyn.get("missing_ean"):
            parts.append("bez EAN")
        if filters.get("abc_class"):
            parts.append(f"ABC {filters['abc_class']}")
        if dyn.get("stock_gt_zero"):
            parts.append("stan > 0")
        return " · ".join(parts)
    return mode


def list_wms_active_inventory_documents(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> list[dict[str, Any]]:
    rows = (
        db.query(InventoryDocument)
        .filter(
            InventoryDocument.tenant_id == int(tenant_id),
            InventoryDocument.warehouse_id == int(warehouse_id),
            InventoryDocument.status.in_((INV_STATUS_IN_PROGRESS, INV_STATUS_AWAITING_APPROVAL)),
        )
        .order_by(InventoryDocument.updated_at.desc())
        .limit(100)
        .all()
    )

    out: list[dict[str, Any]] = []
    for doc in rows:
        payload = _doc_to_dict(doc)
        filters = parse_document_filters(doc)
        operator_count = (
            db.query(InventoryCountEntry.user_id)
            .filter(
                InventoryCountEntry.inventory_document_id == int(doc.id),
                InventoryCountEntry.user_id.isnot(None),
            )
            .distinct()
            .count()
        )
        conflicts = len(lines_with_unresolved_operator_conflicts(db, document_id=int(doc.id)))
        out.append(
            {
                **payload,
                "scope_summary": _scope_summary(filters),
                "operator_count": int(operator_count),
                "conflict_count": int(conflicts),
                "last_activity_at": doc.updated_at.isoformat() if doc.updated_at else None,
                "can_count": str(doc.status) == INV_STATUS_IN_PROGRESS,
            }
        )
    return out
