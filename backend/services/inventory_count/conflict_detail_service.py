"""Operator conflict details — supervisor recount resolution panel."""

from __future__ import annotations

import logging
import math
from datetime import datetime
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

logger = logging.getLogger(__name__)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(out):
        return None
    return out


def _safe_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    try:
        return value.isoformat()
    except (TypeError, ValueError, AttributeError):
        return None


def _operator_name(user: AppUser | None) -> str:
    if user is None:
        return "Operator"
    parts = [str(getattr(user, "first_name", "") or "").strip(), str(getattr(user, "last_name", "") or "").strip()]
    name = " ".join(p for p in parts if p)
    return name or str(getattr(user, "login", "") or "") or f"#{getattr(user, 'id', '?')}"


def _batch_operator_counts(db: Session, line_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    """Last quantity per operator per line — keyed by line_id."""
    if not line_ids:
        return {}
    by_line: dict[int, dict[int, dict[str, Any]]] = {}
    entries = (
        db.query(InventoryCountEntry, AppUser)
        .outerjoin(AppUser, AppUser.id == InventoryCountEntry.user_id)
        .filter(InventoryCountEntry.inventory_document_line_id.in_(line_ids))
        .order_by(InventoryCountEntry.inventory_document_line_id.asc(), InventoryCountEntry.created_at.asc())
        .all()
    )
    for entry, user in entries:
        line_id = int(entry.inventory_document_line_id)
        uid = int(entry.user_id) if entry.user_id is not None else 0
        line_ops = by_line.setdefault(line_id, {})
        qty = _safe_float(entry.counted_quantity)
        if qty is None:
            qty = 0.0
        if uid not in line_ops:
            line_ops[uid] = {
                "count_id": int(entry.id),
                "user_id": uid or None,
                "operator_name": _operator_name(user),
                "quantity": qty,
                "counted_at": _safe_iso(entry.created_at),
            }
        else:
            line_ops[uid]["count_id"] = int(entry.id)
            line_ops[uid]["quantity"] = qty
            counted_at = _safe_iso(entry.created_at)
            if counted_at:
                line_ops[uid]["counted_at"] = counted_at
    return {line_id: list(ops.values()) for line_id, ops in by_line.items()}


def _merge_operator_counts(line_ids: list[int], by_line: dict[int, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    merged: dict[int, dict[str, Any]] = {}
    for line_id in line_ids:
        for op in by_line.get(int(line_id), []):
            uid = op.get("user_id")
            key = int(uid) if uid is not None else 0
            merged[key] = dict(op)
    return list(merged.values())


def _latest_recounts_by_line(db: Session, line_ids: list[int]) -> dict[int, InventoryRecount]:
    if not line_ids:
        return {}
    rows = (
        db.query(InventoryRecount)
        .filter(InventoryRecount.inventory_document_line_id.in_(line_ids))
        .order_by(InventoryRecount.inventory_document_line_id.asc(), InventoryRecount.id.desc())
        .all()
    )
    out: dict[int, InventoryRecount] = {}
    for row in rows:
        lid = int(row.inventory_document_line_id)
        if lid not in out:
            out[lid] = row
    return out


def _fmt_qty_label(value: float) -> str:
    rounded = round(float(value), 6)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return str(rounded).rstrip("0").rstrip(".")


def _operators_to_counts(operators: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: list[dict[str, Any]] = []
    for op in operators:
        count_id = op.get("count_id")
        if count_id is None:
            continue
        counts.append(
            {
                "count_id": int(count_id),
                "user_id": op.get("user_id"),
                "operator_name": str(op.get("operator_name") or "Operator"),
                "counted_qty": _safe_float(op.get("quantity")) or 0.0,
                "created_at": op.get("counted_at"),
            }
        )
    return counts


def _quantity_diff_label(operators: list[dict[str, Any]]) -> str | None:
    quantities = sorted({round(float(op.get("quantity") or 0), 6) for op in operators})
    if len(quantities) == 2:
        return f"{_fmt_qty_label(quantities[0])} ↔ {_fmt_qty_label(quantities[1])}"
    if len(quantities) > 2:
        return f"{len(quantities)} wyniki"
    return None


def _build_conflict_item(
    *,
    line: InventoryDocumentLine,
    line_id: int,
    line_ids: list[int],
    conflicts_map: dict[tuple[int, int], dict[str, Any]],
    products_by_id: dict[int, Product],
    locations_by_id: dict[int, Location],
    carriers_by_id: dict[int, WarehouseCarrier],
    recounts_by_line: dict[int, InventoryRecount],
    operators_by_line: dict[int, list[dict[str, Any]]],
    db: Session,
) -> dict[str, Any] | None:
    if line.product_id is None:
        return None
    product = products_by_id.get(int(line.product_id))
    loc = locations_by_id.get(int(line.location_id)) if line.location_id is not None else None
    carrier = carriers_by_id.get(int(line.carrier_id)) if line.carrier_id else None
    recount = recounts_by_line.get(int(line_id))
    recount_state = resolve_line_recount_state(db, line=line, document_conflicts=conflicts_map)
    operators = _merge_operator_counts(line_ids, operators_by_line)
    counts = _operators_to_counts(operators)

    return {
        "line_id": int(line_id),
        "location_id": int(line.location_id),
        "location_name": getattr(loc, "name", None) if loc else None,
        "product_id": int(line.product_id),
        "sku": getattr(product, "sku", None) if product else None,
        "product_name": getattr(product, "name", None) if product else None,
        "carrier_id": line.carrier_id,
        "carrier_code": getattr(carrier, "code", None) if carrier else None,
        "stock_source": "carrier" if line.carrier_id else "location",
        "expected_quantity": _safe_float(line.expected_quantity),
        "counted_quantity": _safe_float(line.counted_quantity),
        "operators": operators,
        "counts": counts,
        "conflict_status": recount_state,
        "quantity_diff_label": _quantity_diff_label(operators),
        "recount_state": recount_state,
        "recount_id": int(recount.id) if recount else None,
        "recount_status": str(recount.status) if recount else None,
    }


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
    if not conflicts_map:
        return {
            "document_id": int(doc.id),
            "total_conflicts": 0,
            "unresolved_conflicts": 0,
            "items": [],
        }

    all_line_ids: set[int] = set()
    for info in conflicts_map.values():
        all_line_ids.update(int(lid) for lid in info.get("line_ids") or [])
    line_ids_list = sorted(all_line_ids)

    lines = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id.in_(line_ids_list)).all()
    lines_by_id = {int(line.id): line for line in lines}

    product_ids = {int(line.product_id) for line in lines if line.product_id is not None}
    location_ids = {int(line.location_id) for line in lines if line.location_id is not None}
    carrier_ids = {int(line.carrier_id) for line in lines if line.carrier_id}

    products_by_id: dict[int, Product] = {}
    if product_ids:
        products_by_id = {int(p.id): p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}

    locations_by_id: dict[int, Location] = {}
    if location_ids:
        locations_by_id = {int(loc.id): loc for loc in db.query(Location).filter(Location.id.in_(location_ids)).all()}

    carriers_by_id: dict[int, WarehouseCarrier] = {}
    if carrier_ids:
        carriers_by_id = {
            int(c.id): c for c in db.query(WarehouseCarrier).filter(WarehouseCarrier.id.in_(carrier_ids)).all()
        }

    recounts_by_line = _latest_recounts_by_line(db, line_ids_list)
    operators_by_line = _batch_operator_counts(db, line_ids_list)

    items: list[dict[str, Any]] = []
    skipped = 0

    for info in conflicts_map.values():
        line_ids = [int(lid) for lid in info.get("line_ids") or [] if lid is not None]
        if not line_ids:
            continue
        line_id = min(line_ids)
        line = lines_by_id.get(line_id)
        if line is None:
            logger.warning(
                "INVENTORY_CONFLICT_SKIP missing_line document_id=%s tenant_id=%s line_id=%s",
                document_id,
                tenant_id,
                line_id,
            )
            skipped += 1
            continue
        if line.product_id is not None and int(line.product_id) not in products_by_id:
            logger.warning(
                "INVENTORY_CONFLICT_SKIP missing_product document_id=%s tenant_id=%s line_id=%s product_id=%s",
                document_id,
                tenant_id,
                line_id,
                line.product_id,
            )
            skipped += 1
            continue
        try:
            item = _build_conflict_item(
                line=line,
                line_id=line_id,
                line_ids=line_ids,
                conflicts_map=conflicts_map,
                products_by_id=products_by_id,
                locations_by_id=locations_by_id,
                carriers_by_id=carriers_by_id,
                recounts_by_line=recounts_by_line,
                operators_by_line=operators_by_line,
                db=db,
            )
        except Exception:
            logger.exception(
                "INVENTORY_CONFLICT_SERIALIZE_FAILED document_id=%s tenant_id=%s line_id=%s",
                document_id,
                tenant_id,
                line_id,
            )
            skipped += 1
            continue
        if item is None:
            skipped += 1
            continue
        items.append(item)

    if skipped:
        logger.warning(
            "INVENTORY_CONFLICTS_PARTIAL document_id=%s tenant_id=%s returned=%s skipped=%s",
            document_id,
            tenant_id,
            len(items),
            skipped,
        )

    unresolved = sum(1 for i in items if i.get("recount_state") == "required")
    return {
        "document_id": int(doc.id),
        "total_conflicts": len(items),
        "unresolved_conflicts": unresolved,
        "items": items,
    }
