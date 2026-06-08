"""Operator conflict details — supervisor recount resolution panel."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.app_user import AppUser
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount
from ...models.location import Location
from ...models.product import Product
from ...models.warehouse_carrier import WarehouseCarrier
from .errors import InventoryDocumentNotFoundError
from .recount_conflict_service import (
    build_document_count_conflicts,
    resolve_line_recount_state,
)


def _operator_name(user: AppUser | None) -> str:
    if user is None:
        return "Operator"
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or f"#{getattr(user, 'id', '?')}"


def _operator_counts_for_lines(db: Session, line_ids: list[int]) -> list[dict[str, Any]]:
    by_user: dict[int, dict[str, Any]] = {}
    entries = (
        db.query(InventoryCountEntry, AppUser)
        .outerjoin(AppUser, AppUser.id == InventoryCountEntry.user_id)
        .filter(InventoryCountEntry.inventory_document_line_id.in_(line_ids))
        .order_by(InventoryCountEntry.created_at.asc())
        .all()
    )
    for entry, user in entries:
        uid = int(entry.user_id) if entry.user_id is not None else 0
        if uid not in by_user:
            by_user[uid] = {
                "user_id": uid or None,
                "operator_name": _operator_name(user),
                "quantity": float(entry.counted_quantity or 0),
                "counted_at": entry.created_at.isoformat() if entry.created_at else None,
            }
        else:
            by_user[uid]["quantity"] = float(entry.counted_quantity or 0)
            if entry.created_at:
                by_user[uid]["counted_at"] = entry.created_at.isoformat()
    return list(by_user.values())


def list_document_conflicts(
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

    conflicts_map = build_document_count_conflicts(db, document_id=int(doc.id))
    items: list[dict[str, Any]] = []

    for info in conflicts_map.values():
        line_id = min(info["line_ids"])
        line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == int(line_id)).first()
        if line is None:
            continue
        product = db.query(Product).filter(Product.id == int(line.product_id)).first()
        loc = db.query(Location).filter(Location.id == int(line.location_id)).first()
        carrier = None
        if line.carrier_id:
            carrier = db.query(WarehouseCarrier).filter(WarehouseCarrier.id == int(line.carrier_id)).first()

        recount = (
            db.query(InventoryRecount)
            .filter(InventoryRecount.inventory_document_line_id == int(line_id))
            .order_by(InventoryRecount.id.desc())
            .first()
        )
        recount_state = resolve_line_recount_state(db, line=line, document_conflicts=conflicts_map)
        operators = _operator_counts_for_lines(db, info["line_ids"])

        items.append(
            {
                "line_id": int(line_id),
                "location_id": int(line.location_id),
                "location_name": loc.name if loc else None,
                "product_id": int(line.product_id),
                "sku": getattr(product, "sku", None),
                "product_name": getattr(product, "name", None),
                "carrier_id": line.carrier_id,
                "carrier_code": getattr(carrier, "code", None) if carrier else None,
                "stock_source": "carrier" if line.carrier_id else "location",
                "expected_quantity": line.expected_quantity,
                "counted_quantity": line.counted_quantity,
                "operators": operators,
                "recount_state": recount_state,
                "recount_id": int(recount.id) if recount else None,
                "recount_status": str(recount.status) if recount else None,
            }
        )

    unresolved = sum(1 for i in items if i["recount_state"] == "required")
    return {
        "document_id": int(doc.id),
        "total_conflicts": len(items),
        "unresolved_conflicts": unresolved,
        "items": items,
    }
