"""Pre-posting validation — reconcile counts, sanity checks, structured debug logs."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product
from .errors import InventoryInvalidTransitionError, InventoryPendingRecountsError, InventoryPostingFailedError
from .full_inventory_posting_service import (
    build_inventory_posting_plans,
    posting_plan_to_log_dict,
    requires_full_inventory_zeroing,
    sum_live_stock_for_dimension,
)
from .recount_conflict_service import (
    has_operator_count_conflict,
    lines_with_unresolved_operator_conflicts,
    operator_quantities_for_line,
)

logger = logging.getLogger(__name__)

ABS_MAX_PIECES = 1_000_000.0
# Flag lines where counted dwarfs expected but diff would explode RW/PW (carton-as-pieces corruption).
SUSPICIOUS_COUNT_FACTOR = 25.0
SUSPICIOUS_MIN_PIECES = 500.0


def _safe_pack(product: Product | None) -> int | None:
    if product is None:
        return None
    raw = getattr(product, "units_per_carton", None)
    if raw is None or float(raw) < 1:
        return None
    return max(1, int(float(raw)))


def _decompose_pieces(total: float, pack: int | None) -> dict[str, Any]:
    pieces = max(0.0, float(total or 0))
    if pack is None or pack < 2:
        return {
            "cartons": None,
            "carton_capacity": None,
            "pieces": int(round(pieces)),
            "computed_total": int(round(pieces)),
        }
    p = int(pack)
    whole = int(round(pieces))
    cartons = whole // p
    loose = whole % p
    return {
        "cartons": cartons,
        "carton_capacity": p,
        "pieces": loose,
        "computed_total": cartons * p + loose,
    }


def build_posting_line_snapshot(
    db: Session,
    *,
    line: InventoryDocumentLine,
    product: Product | None = None,
) -> dict[str, Any]:
    if product is None and line.product_id is not None:
        product = db.query(Product).filter(Product.id == int(line.product_id)).first()
    pack = _safe_pack(product)
    counted = float(line.counted_quantity) if line.counted_quantity is not None else None
    expected = float(line.expected_quantity or 0)
    diff = float(line.difference_quantity or 0) if line.difference_quantity is not None else None
    decomposed = _decompose_pieces(counted or 0, pack) if counted is not None else {}
    op_map = operator_quantities_for_line(db, int(line.id))
    return {
        "line_id": int(line.id),
        "product_id": int(line.product_id) if line.product_id is not None else None,
        "expected_qty": expected,
        "counted_total": counted,
        "delta_qty": diff,
        "operator_quantities": op_map,
        "operator_count_conflict": has_operator_count_conflict(op_map),
        **decomposed,
    }


def _log_posting_line_snapshot(phase: str, snapshot: dict[str, Any]) -> None:
    logger.info("[POST INVENTORY] %s | %s", phase, json.dumps(snapshot, ensure_ascii=False, default=str))


def reconcile_line_counted_from_operators(db: Session, line: InventoryDocumentLine) -> bool:
    """
    SSOT for posting: line.counted_quantity follows operator entries (never sum operators).
    Returns True when line quantity was adjusted.
    """
    op_map = operator_quantities_for_line(db, int(line.id))
    if not op_map:
        return False
    if has_operator_count_conflict(op_map):
        if line.counted_quantity is not None:
            line.counted_quantity = None
            line.recompute_difference()
            return True
        return False
    if len(op_map) == 1:
        authoritative = float(next(iter(op_map.values())))
        if line.counted_quantity is None or abs(float(line.counted_quantity) - authoritative) > 1e-9:
            line.counted_quantity = authoritative
            line.recompute_difference()
            return True
    return False


def _is_suspicious_quantity(*, expected: float, counted: float, pack: int | None) -> bool:
    if counted <= 0 or counted > ABS_MAX_PIECES:
        return counted > ABS_MAX_PIECES
    if expected <= 0:
        return counted >= SUSPICIOUS_MIN_PIECES
    if counted <= max(expected * SUSPICIOUS_COUNT_FACTOR, SUSPICIOUS_MIN_PIECES):
        return False
    if pack and pack >= 2:
        ratio = counted / float(pack)
        if abs(ratio - round(ratio)) < 1e-6 and ratio >= 10:
            return True
    return counted > expected * SUSPICIOUS_COUNT_FACTOR


def validate_and_prepare_document_for_posting(
    db: Session,
    *,
    doc: InventoryDocument,
) -> list[InventoryDocumentLine]:
    """Reconcile operator counts, log snapshots, block conflicts and absurd quantities."""
    unresolved = lines_with_unresolved_operator_conflicts(db, document_id=int(doc.id))
    if unresolved:
        sample = [
            {
                "line_id": row["line_id"],
                "operator_quantities": row.get("operator_quantities"),
            }
            for row in unresolved[:5]
        ]
        raise InventoryPendingRecountsError(
            "Unresolved operator count conflicts — resolve before posting (never sum operators)",
            details={"unresolved_conflicts": len(unresolved), "sample": sample},
        )

    lines = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(doc.id))
        .order_by(InventoryDocumentLine.id.asc())
        .all()
    )

    reconciled = 0
    suspicious: list[dict[str, Any]] = []

    for line in lines:
        if reconcile_line_counted_from_operators(db, line):
            reconciled += 1
        product = (
            db.query(Product).filter(Product.id == int(line.product_id)).first()
            if line.product_id is not None
            else None
        )
        snapshot = build_posting_line_snapshot(db, line=line, product=product)
        _log_posting_line_snapshot("line snapshot", snapshot)

        counted = snapshot.get("counted_total")
        if counted is None:
            continue
        expected = float(snapshot.get("expected_qty") or 0)
        pack = snapshot.get("carton_capacity")
        if _is_suspicious_quantity(expected=expected, counted=float(counted), pack=pack):
            suspicious.append(snapshot)

        diff = float(line.difference_quantity or 0)
        if abs(diff) > ABS_MAX_PIECES:
            suspicious.append({**snapshot, "reason": "difference_overflow"})

    posting_plans = build_inventory_posting_plans(db, doc=doc, lines=lines)
    for plan in posting_plans:
        if plan.difference_quantity >= -1e-9:
            continue
        need = abs(plan.difference_quantity)
        avail = sum_live_stock_for_dimension(
            db,
            tenant_id=int(doc.tenant_id),
            warehouse_id=int(doc.warehouse_id),
            location_id=int(plan.location_id),
            product_id=int(plan.product_id),
            carrier_id=plan.carrier_id,
            batch_number=plan.batch_number,
        )
        if avail + 1e-9 < need:
            snapshot = posting_plan_to_log_dict(plan)
            line_ref = plan.line
            raise InventoryPostingFailedError(
                f"Insufficient stock for RW on product {plan.product_id} @ location {plan.location_id}: "
                f"need {need}, available {round(avail, 4)}",
                details={
                    "line_id": int(line_ref.id) if line_ref else None,
                    "product_id": plan.product_id,
                    "location_id": plan.location_id,
                    "required_qty": need,
                    "available_qty": round(avail, 4),
                    "reason": plan.reason,
                    **snapshot,
                },
            )

    if requires_full_inventory_zeroing(doc):
        zero_plans = [p for p in posting_plans if p.reason in ("zero_uncounted", "zero_orphan_stock")]
        logger.info(
            "[POST INVENTORY] full zeroing validation | document_id=%s adjustments=%s zero_lines=%s",
            doc.id,
            len(posting_plans),
            len(zero_plans),
        )

    if suspicious:
        raise InventoryInvalidTransitionError(
            "Counted quantities look corrupted (possible carton/pieces multiplication). "
            "Re-count affected lines before posting.",
            details={
                "suspicious_lines": suspicious[:20],
                "hint": "Operators are never summed — pick one value per conflict or recount.",
                "reconciled_lines": reconciled,
            },
        )

    db.flush()
    logger.info(
        "[POST INVENTORY] validation ok | document_id=%s lines=%s reconciled=%s plans=%s",
        doc.id,
        len(lines),
        reconciled,
        len(posting_plans),
    )
    return lines
