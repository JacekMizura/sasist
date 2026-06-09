"""Full inventory posting — zero uncounted scope stock when result_policy updates stock."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.inventory_count.constants import INV_TYPE_FULL
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.location import Location
from ...models.product import Product
from .line_materialization_service import line_matches_inventory_filters, parse_document_filters
from .recount_conflict_service import has_operator_count_conflict, operator_quantities_for_line
from .strategy_service import result_policy_updates_stock

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PostingAdjustmentPlan:
    """One RW/PW movement target derived from inventory count outcome."""

    line: InventoryDocumentLine | None
    product_id: int
    location_id: int
    carrier_id: int | None
    batch_number: str | None
    target_quantity: float
    current_quantity: float
    difference_quantity: float
    reason: str  # counted | zero_uncounted | zero_orphan_stock


def requires_full_inventory_zeroing(doc: InventoryDocument) -> bool:
    inv_type = str(doc.inventory_type or INV_TYPE_FULL).strip().upper()
    if inv_type != INV_TYPE_FULL:
        return False
    return result_policy_updates_stock(doc)


def _norm_batch(value: str | None) -> str:
    return str(value or "").strip()


def stock_dimension_key(
    *,
    location_id: int,
    product_id: int,
    carrier_id: int | None,
    batch_number: str | None,
) -> tuple[int, int, int | None, str]:
    carrier = int(carrier_id) if carrier_id is not None else None
    return (int(location_id), int(product_id), carrier, _norm_batch(batch_number))


def line_dimension_key(line: InventoryDocumentLine) -> tuple[int, int, int | None, str]:
    return stock_dimension_key(
        location_id=int(line.location_id),
        product_id=int(line.product_id),
        carrier_id=int(line.carrier_id) if line.carrier_id is not None else None,
        batch_number=line.batch_number,
    )


def _inventory_dimension_key(inv: Inventory) -> tuple[int, int, int | None, str]:
    return stock_dimension_key(
        location_id=int(inv.location_id),
        product_id=int(inv.product_id),
        carrier_id=int(inv.carrier_id) if inv.carrier_id is not None else None,
        batch_number=getattr(inv, "batch_number", None),
    )


def sum_live_stock_for_dimension(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
    carrier_id: int | None,
    batch_number: str | None,
) -> float:
    query = db.query(Inventory.quantity).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.warehouse_id == int(warehouse_id),
        Inventory.location_id == int(location_id),
        Inventory.product_id == int(product_id),
        Inventory.quantity > 0,
    )
    if carrier_id is not None:
        query = query.filter(Inventory.carrier_id == int(carrier_id))
    else:
        query = query.filter(Inventory.carrier_id.is_(None))
    batch = _norm_batch(batch_number)
    if batch:
        query = query.filter(Inventory.batch_number == batch)
    return sum(float(row[0] or 0) for row in query.all())


def _scoped_live_inventory_totals(db: Session, *, doc: InventoryDocument) -> dict[tuple[int, int, int | None, str], float]:
    filters = parse_document_filters(doc)
    loc_cache: dict[int, Location | None] = {}
    prod_cache: dict[int, Product | None] = {}
    totals: dict[tuple[int, int, int | None, str], float] = {}

    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(doc.tenant_id),
            Inventory.warehouse_id == int(doc.warehouse_id),
            Inventory.quantity > 0,
        )
        .all()
    )
    for inv in rows:
        loc_id = int(inv.location_id)
        prod_id = int(inv.product_id)
        if loc_id not in loc_cache:
            loc_cache[loc_id] = db.query(Location).filter(Location.id == loc_id).first()
        if prod_id not in prod_cache:
            prod_cache[prod_id] = db.query(Product).filter(Product.id == prod_id).first()
        qty = float(inv.quantity or 0)
        if not line_matches_inventory_filters(
            filters=filters,
            location_id=loc_id,
            product_id=prod_id,
            carrier_id=int(inv.carrier_id) if inv.carrier_id is not None else None,
            qty=qty,
            loc=loc_cache[loc_id],
            product=prod_cache[prod_id],
        ):
            continue
        key = _inventory_dimension_key(inv)
        totals[key] = totals.get(key, 0.0) + qty
    return totals


def _line_target_quantity(db: Session, line: InventoryDocumentLine) -> tuple[float | None, str | None]:
    """Return (target, reason) or (None, None) when line must be skipped (operator conflict)."""
    op_map = operator_quantities_for_line(db, int(line.id))
    if has_operator_count_conflict(op_map):
        return None, None
    if line.counted_quantity is not None:
        return float(line.counted_quantity), "counted"
    return 0.0, "zero_uncounted"


def prepare_full_inventory_lines_for_posting(db: Session, lines: list[InventoryDocumentLine]) -> int:
    """Persist counted_quantity=0 on uncounted lines — audit trail matches posting outcome."""
    updated = 0
    for line in lines:
        if line.counted_quantity is not None:
            continue
        if has_operator_count_conflict(operator_quantities_for_line(db, int(line.id))):
            continue
        line.counted_quantity = 0.0
        line.recompute_difference()
        updated += 1
    if updated:
        db.flush()
    return updated


def build_full_inventory_zeroing_plans(
    db: Session,
    *,
    doc: InventoryDocument,
    lines: list[InventoryDocumentLine],
) -> list[PostingAdjustmentPlan]:
    """
    FULL + update_stock: final stock = counted qty per line, 0 for uncounted / orphan scope stock.
    Adjustment = target − live stock (not counted − snapshot expected).
    """
    prepare_full_inventory_lines_for_posting(db, lines)
    inventory_totals = _scoped_live_inventory_totals(db, doc=doc)
    line_by_key: dict[tuple[int, int, int | None, str], InventoryDocumentLine] = {}
    targets: dict[tuple[int, int, int | None, str], tuple[float, str, InventoryDocumentLine | None]] = {}

    for line in lines:
        key = line_dimension_key(line)
        line_by_key[key] = line
        target, reason = _line_target_quantity(db, line)
        if target is None or reason is None:
            continue
        targets[key] = (target, reason, line)

    all_keys = set(inventory_totals.keys()) | set(targets.keys())
    plans: list[PostingAdjustmentPlan] = []

    for key in sorted(all_keys):
        loc_id, prod_id, carrier_id, batch = key
        current = float(inventory_totals.get(key, 0.0))
        if key in targets:
            target, reason, line = targets[key]
        else:
            target, reason, line = 0.0, "zero_orphan_stock", None
        diff = float(target) - current
        if abs(diff) < 1e-9:
            continue
        plans.append(
            PostingAdjustmentPlan(
                line=line,
                product_id=prod_id,
                location_id=loc_id,
                carrier_id=carrier_id,
                batch_number=batch or None,
                target_quantity=float(target),
                current_quantity=current,
                difference_quantity=diff,
                reason=reason,
            )
        )

    logger.info(
        "[POST INVENTORY] full zeroing plans | document_id=%s plans=%s scoped_stock_keys=%s line_targets=%s",
        doc.id,
        len(plans),
        len(inventory_totals),
        len(targets),
    )
    return plans


def build_partial_inventory_posting_plans(lines: list[InventoryDocumentLine]) -> list[PostingAdjustmentPlan]:
    """PARTIAL / CYCLE / CONTROL — only counted lines, snapshot-based difference."""
    plans: list[PostingAdjustmentPlan] = []
    for line in lines:
        if line.counted_quantity is None:
            continue
        diff = float(line.difference_quantity or 0)
        if abs(diff) < 1e-9:
            continue
        plans.append(
            PostingAdjustmentPlan(
                line=line,
                product_id=int(line.product_id),
                location_id=int(line.location_id),
                carrier_id=int(line.carrier_id) if line.carrier_id is not None else None,
                batch_number=line.batch_number,
                target_quantity=float(line.counted_quantity),
                current_quantity=float(line.counted_quantity) - diff,
                difference_quantity=diff,
                reason="counted",
            )
        )
    return plans


def build_inventory_posting_plans(
    db: Session,
    *,
    doc: InventoryDocument,
    lines: list[InventoryDocumentLine],
) -> list[PostingAdjustmentPlan]:
    if requires_full_inventory_zeroing(doc):
        return build_full_inventory_zeroing_plans(db, doc=doc, lines=lines)
    return build_partial_inventory_posting_plans(lines)


def posting_plan_to_log_dict(plan: PostingAdjustmentPlan) -> dict[str, Any]:
    return {
        "line_id": int(plan.line.id) if plan.line else None,
        "product_id": plan.product_id,
        "location_id": plan.location_id,
        "carrier_id": plan.carrier_id,
        "batch_number": plan.batch_number,
        "target_quantity": plan.target_quantity,
        "current_quantity": plan.current_quantity,
        "difference_quantity": plan.difference_quantity,
        "reason": plan.reason,
    }
