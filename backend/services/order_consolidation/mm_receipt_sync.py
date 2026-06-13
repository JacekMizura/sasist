"""P5.2 — sync consolidation plan items from MM receiving outcomes."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ...models.stock_document import StockDocument, StockDocumentItem
from ..stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    stock_disposition_for_document_line,
)
from .alert_service import create_consolidation_alert, recompute_plan_exception_status
from .constants import (
    ALERT_CODE_DAMAGED_ITEM,
    ALERT_CODE_SHORTAGE,
    ALERT_SEVERITY_WARNING,
    ITEM_STATUS_DAMAGED,
    ITEM_STATUS_IN_TRANSIT,
    ITEM_STATUS_MM_CREATED,
    ITEM_STATUS_RECEIVED,
    ITEM_STATUS_SHORTAGE,
    ITEM_STATUS_WAITING,
)


def _lines_for_item(db: Session, it: OrderConsolidationPlanItem) -> list[StockDocumentItem]:
    if it.stock_document_id is None:
        return []
    return (
        db.query(StockDocumentItem)
        .filter(
            StockDocumentItem.document_id == int(it.stock_document_id),
            StockDocumentItem.product_id == int(it.product_id),
        )
        .all()
    )


def received_qty_for_plan_item(db: Session, it: OrderConsolidationPlanItem) -> float:
    return sum(float(row.received_quantity or 0) for row in _lines_for_item(db, it))


def item_has_damaged_receipt(db: Session, it: OrderConsolidationPlanItem) -> bool:
    for row in _lines_for_item(db, it):
        disp = stock_disposition_for_document_line(row)
        if disp != DEFAULT_STOCK_DISPOSITION:
            return True
        decision = (getattr(row, "return_decision", None) or "").strip().upper()
        if "DAMAGED" in decision:
            return True
        rd = (getattr(row, "return_disposition", None) or "").strip().upper()
        if "DAMAGED" in rd:
            return True
    return False


def sync_plan_item_from_mm(db: Session, it: OrderConsolidationPlanItem, plan: OrderConsolidationPlan) -> bool:
    """Apply shortage / damaged / received detection from linked MM document."""
    if int(it.source_warehouse_id) == int(it.target_warehouse_id):
        return False
    if it.stock_document_id is None:
        return False

    doc = db.query(StockDocument).filter(StockDocument.id == int(it.stock_document_id)).first()
    if doc is None:
        return False

    recv_status = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    lines = _lines_for_item(db, it)

    if not lines:
        if recv_status == "DONE":
            if str(it.status).upper() != ITEM_STATUS_RECEIVED:
                it.status = ITEM_STATUS_RECEIVED
                db.add(it)
                return True
        elif recv_status in ("NEW", "IN_PROGRESS") and str(it.status).upper() in (
            ITEM_STATUS_MM_CREATED,
            ITEM_STATUS_WAITING,
            ITEM_STATUS_IN_TRANSIT,
        ):
            if str(it.status).upper() != ITEM_STATUS_IN_TRANSIT:
                it.status = ITEM_STATUS_IN_TRANSIT
                db.add(it)
                return True
        return False

    expected = float(it.quantity)
    received = received_qty_for_plan_item(db, it)
    changed = False

    if item_has_damaged_receipt(db, it):
        if str(it.status).upper() != ITEM_STATUS_DAMAGED:
            it.status = ITEM_STATUS_DAMAGED
            changed = True
            db.add(it)
        create_consolidation_alert(
            db,
            plan_id=int(plan.id),
            plan_item_id=int(it.id),
            code=ALERT_CODE_DAMAGED_ITEM,
            message=(
                f"Uszkodzony towar przy przyjęciu MM (produkt #{it.product_id}, "
                f"oczekiwano {expected:g}, przyjęto {received:g})."
            ),
            severity=ALERT_SEVERITY_WARNING,
            dedupe_unresolved=True,
        )
        recompute_plan_exception_status(db, plan)
        return changed or True

    if recv_status == "DONE":
        if received + 1e-9 < expected:
            if str(it.status).upper() != ITEM_STATUS_SHORTAGE:
                it.status = ITEM_STATUS_SHORTAGE
                changed = True
                db.add(it)
            create_consolidation_alert(
                db,
                plan_id=int(plan.id),
                plan_item_id=int(it.id),
                code=ALERT_CODE_SHORTAGE,
                message=(
                    f"Brak przy przyjęciu MM (produkt #{it.product_id}): "
                    f"oczekiwano {expected:g}, przyjęto {received:g}."
                ),
                severity=ALERT_SEVERITY_WARNING,
                dedupe_unresolved=True,
            )
            recompute_plan_exception_status(db, plan)
            return changed or True
        if str(it.status).upper() != ITEM_STATUS_RECEIVED:
            it.status = ITEM_STATUS_RECEIVED
            changed = True
            db.add(it)
        return changed

    if recv_status in ("NEW", "IN_PROGRESS") and str(it.status).upper() in (
        ITEM_STATUS_MM_CREATED,
        ITEM_STATUS_WAITING,
        ITEM_STATUS_IN_TRANSIT,
    ):
        if str(it.status).upper() != ITEM_STATUS_IN_TRANSIT:
            it.status = ITEM_STATUS_IN_TRANSIT
            changed = True
            db.add(it)
    return changed
