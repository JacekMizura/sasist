"""Operator conflict detection — recount only when different operators disagree on quantity."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    RECOUNT_STATE_NONE,
    RECOUNT_STATE_REQUIRED,
    RECOUNT_STATE_RESOLVED,
    RECOUNT_STATUS_DONE,
)
from ...models.inventory_count.count_entry import InventoryCountEntry
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.recount import InventoryRecount


def _qty_key(value: float | None) -> float:
    return round(float(value or 0), 6)


def operator_quantities_for_line(db: Session, line_id: int) -> dict[int, float]:
    """Last recorded quantity per operator on a line (from count entries)."""
    entries = (
        db.query(InventoryCountEntry)
        .filter(
            InventoryCountEntry.inventory_document_line_id == int(line_id),
            InventoryCountEntry.user_id.isnot(None),
        )
        .order_by(InventoryCountEntry.created_at.asc(), InventoryCountEntry.id.asc())
        .all()
    )
    by_user: dict[int, float] = {}
    for entry in entries:
        by_user[int(entry.user_id)] = float(entry.counted_quantity)
    return by_user


def latest_operator_quantity_for_line(db: Session, line_id: int, user_id: int | None) -> float | None:
    """Most recent absolute quantity recorded by one operator on a line."""
    if user_id is None:
        return None
    entry = (
        db.query(InventoryCountEntry)
        .filter(
            InventoryCountEntry.inventory_document_line_id == int(line_id),
            InventoryCountEntry.user_id == int(user_id),
        )
        .order_by(InventoryCountEntry.created_at.desc(), InventoryCountEntry.id.desc())
        .first()
    )
    if entry is None:
        return None
    return float(entry.counted_quantity)


def has_operator_count_conflict(user_quantities: dict[int, float]) -> bool:
    if len(user_quantities) < 2:
        return False
    keys = {_qty_key(q) for q in user_quantities.values()}
    return len(keys) > 1


def _location_product_key(line: InventoryDocumentLine) -> tuple[int, int]:
    return (int(line.location_id), int(line.product_id))


def build_document_count_conflicts(
    db: Session,
    *,
    document_id: int,
) -> dict[tuple[int, int], dict[str, Any]]:
    """Map (location_id, product_id) → conflict info when operators disagree."""
    lines = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(document_id))
        .all()
    )
    line_ids_by_key: dict[tuple[int, int], list[int]] = defaultdict(list)
    for line in lines:
        if line.product_id is None:
            continue
        line_ids_by_key[_location_product_key(line)].append(int(line.id))

    conflicts: dict[tuple[int, int], dict[str, Any]] = {}
    for key, line_ids in line_ids_by_key.items():
        merged: dict[int, float] = {}
        for lid in line_ids:
            for uid, qty in operator_quantities_for_line(db, lid).items():
                merged[uid] = qty
        if has_operator_count_conflict(merged):
            conflicts[key] = {
                "location_id": key[0],
                "product_id": key[1],
                "line_ids": line_ids,
                "operator_quantities": merged,
            }
    return conflicts


def _recount_for_line(db: Session, line_id: int) -> InventoryRecount | None:
    return (
        db.query(InventoryRecount)
        .filter(InventoryRecount.inventory_document_line_id == int(line_id))
        .order_by(InventoryRecount.id.desc())
        .first()
    )


def resolve_line_recount_state(
    db: Session,
    *,
    line: InventoryDocumentLine,
    document_conflicts: dict[tuple[int, int], dict[str, Any]] | None = None,
) -> str:
    """Canonical recount state: none | required | resolved — NOT derived from expected vs counted."""
    recount = _recount_for_line(db, int(line.id))
    if recount is not None:
        if str(recount.status) == RECOUNT_STATUS_DONE:
            return RECOUNT_STATE_RESOLVED
        return RECOUNT_STATE_REQUIRED

    if document_conflicts is None:
        document_conflicts = build_document_count_conflicts(
            db, document_id=int(line.inventory_document_id)
        )
    key = _location_product_key(line)
    if key in document_conflicts:
        return RECOUNT_STATE_REQUIRED
    return RECOUNT_STATE_NONE


def lines_with_unresolved_operator_conflicts(
    db: Session,
    *,
    document_id: int,
) -> list[dict[str, Any]]:
    """Lines needing recount workflow — operator disagreement, not inventory variance."""
    conflicts = build_document_count_conflicts(db, document_id=int(document_id))
    out: list[dict[str, Any]] = []
    seen_line_ids: set[int] = set()

    for info in conflicts.values():
        primary_line_id = min(info["line_ids"])
        if primary_line_id in seen_line_ids:
            continue
        recount = _recount_for_line(db, primary_line_id)
        if recount is not None and str(recount.status) == RECOUNT_STATUS_DONE:
            continue
        line = db.query(InventoryDocumentLine).filter(InventoryDocumentLine.id == primary_line_id).first()
        if line is None:
            continue
        seen_line_ids.add(primary_line_id)
        out.append(
            {
                "line_id": primary_line_id,
                "location_id": info["location_id"],
                "product_id": info["product_id"],
                "operator_quantities": info["operator_quantities"],
                "reason": "operator_conflict",
                "line": line,
            }
        )
    return out


def document_has_unresolved_recount_conflicts(db: Session, *, document_id: int) -> bool:
    return len(lines_with_unresolved_operator_conflicts(db, document_id=document_id)) > 0
