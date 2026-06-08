"""ERP document line listing and supervisor views."""

from __future__ import annotations

from typing import Any

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, aliased

from ...models.app_user import AppUser
from ...models.inventory_count.constants import (
    LINE_STATUS_OPEN,
    LINE_STATUS_RECOUNT,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.location import Location
from ...models.product import Product
from ...models.warehouse_carrier import WarehouseCarrier
from .difference_service import classify_line_difference, _thresholds
from .recount_conflict_service import build_document_count_conflicts, resolve_line_recount_state
from .errors import InventoryDocumentNotFoundError


def _operator_name(user: AppUser | None) -> str | None:
    if user is None:
        return None
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or None


def _apply_focus_filter(q, focus: str):
    focus = str(focus or "operational").strip().lower()
    if focus == "all":
        return q
    if focus == "uncounted":
        return q.filter(InventoryDocumentLine.counted_quantity.is_(None))
    if focus == "differences":
        return q.filter(
            or_(
                InventoryDocumentLine.status == LINE_STATUS_RECOUNT,
                and_(
                    InventoryDocumentLine.difference_quantity.isnot(None),
                    InventoryDocumentLine.difference_quantity != 0,
                ),
            )
        )
    # operational — counted, anomalies, recounts; hide untouched expected rows
    return q.filter(
        or_(
            InventoryDocumentLine.counted_quantity.isnot(None),
            InventoryDocumentLine.status != LINE_STATUS_OPEN,
            InventoryDocumentLine.recount_count > 0,
            and_(
                InventoryDocumentLine.difference_quantity.isnot(None),
                InventoryDocumentLine.difference_quantity != 0,
            ),
        )
    )


def list_document_lines(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    include_supervisor_fields: bool = True,
    focus: str = "operational",
    offset: int = 0,
    limit: int = 500,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    blind = doc.count_mode == "blind" and not include_supervisor_fields
    thresholds = _thresholds(doc)
    document_conflicts = build_document_count_conflicts(db, document_id=int(document_id))
    Counter = aliased(AppUser)

    base_q = (
        db.query(InventoryDocumentLine, Product, Location, WarehouseCarrier, Counter)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .outerjoin(Location, Location.id == InventoryDocumentLine.location_id)
        .outerjoin(WarehouseCarrier, WarehouseCarrier.id == InventoryDocumentLine.carrier_id)
        .outerjoin(Counter, Counter.id == InventoryDocumentLine.last_counted_by_user_id)
        .filter(InventoryDocumentLine.inventory_document_id == int(document_id))
    )
    base_q = _apply_focus_filter(base_q, focus)
    total = base_q.count()
    rows = (
        base_q        .order_by(
            InventoryDocumentLine.last_counted_at.desc(),
            Location.name.asc(),
            Product.sku.asc(),
        )
        .offset(max(0, int(offset)))
        .limit(min(int(limit), 2000))
        .all()
    )
    out: list[dict[str, Any]] = []
    for line, product, loc, carrier, counter in rows:
        diff_class = classify_line_difference(
            expected=float(line.expected_quantity or 0),
            counted=line.counted_quantity,
            thresholds=thresholds,
        )
        item: dict[str, Any] = {
            "id": line.id,
            "location_id": line.location_id,
            "location_name": loc.name if loc else None,
            "product_id": line.product_id,
            "sku": getattr(product, "sku", None) if product else None,
            "ean": getattr(product, "ean", None) if product else None,
            "product_name": getattr(product, "name", None) if product else None,
            "product_image_url": getattr(product, "image_url", None) if product else None,
            "counted_quantity": line.counted_quantity,
            "status": line.status,
            "batch_number": line.batch_number,
            "serial_number": line.serial_number,
            "recount_count": line.recount_count,
            "confidence_score": line.confidence_score,
            "version": line.version,
            "difference_class": diff_class,
            "recount_state": resolve_line_recount_state(
                db, line=line, document_conflicts=document_conflicts
            ),
            "carrier_id": line.carrier_id,
            "carrier_code": getattr(carrier, "code", None) if carrier else None,
            "last_counted_at": line.last_counted_at.isoformat() if line.last_counted_at else None,
            "last_counted_by_user_id": line.last_counted_by_user_id,
            "last_counted_by_name": _operator_name(counter),
        }
        if not blind or include_supervisor_fields:
            item["expected_quantity"] = line.expected_quantity
            item["difference_quantity"] = line.difference_quantity
        out.append(item)
    return {"items": out, "total": total, "offset": offset, "limit": limit, "focus": focus}


def get_document_difference_analysis(
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
    from .difference_service import analyze_document_differences

    return analyze_document_differences(db, document=doc)
