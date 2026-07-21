"""Purchase PZ putaway requirement (standard vs bez rozlokowania / crossdock).

Extends existing ``stock_document_item_requires_putaway`` gate — no parallel queue.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.stock_document import StockDocument, StockDocumentItem
from ..schemas.stock_document import StockDocumentRead
from .complaints.complaint_physical_receipt import stock_document_item_requires_putaway
from .stock_document_service import (
    build_stock_document_read,
    ensure_default_pz_receiving_location_if_missing,
    ensure_pz_document_warehouse_resolved,
    is_stock_document_item_wm_material,
    recalculate_wms_document_completion,
    recompute_putaway_status_for_document,
)
from .wms_receiving_activity import record_pz_activity

EVENT_PZ_PUTAWAY_HANDLING_CHANGED = "pz_putaway_handling_changed"
EVENT_PZ_PUTAWAY_CANCELLED = "pz_putaway_cancelled"

HANDLING_STANDARD = "STANDARD"
HANDLING_NO_PUTAWAY = "NO_PUTAWAY"

CANCEL_PARTIAL_MSG = (
    "Nie można anulować rozlokowania, ponieważ część towaru została już rozlokowana."
)
CANCEL_CODE = "PUTAWAY_ALREADY_STARTED"


class PutawayHandlingError(ValueError):
    def __init__(self, message: str, *, code: str):
        super().__init__(message)
        self.message = message
        self.code = code

    def to_detail(self) -> dict[str, str]:
        return {"message": self.message, "code": self.code}


def _line_putaway_qty(line: StockDocumentItem) -> float:
    return float(getattr(line, "quantity_putaway", 0) or 0)


def _assert_draft_or_putaway_open(doc: StockDocument) -> None:
    if str(getattr(doc, "document_type", "") or "").strip().upper() not in (
        "PZ",
        "Z_PZ",
        "PZ_RT",
        "RETURN_RECEIPT",
        "PW",
    ):
        raise ValueError("Ten typ dokumentu nie obsługuje tej operacji")
    if str(getattr(doc, "relocation_status", "") or "").strip().upper() == "DONE":
        raise ValueError("Rozlokowanie już zakończone — zmiana trybu zablokowana")


def _withdraw_dock_for_line(
    db: Session,
    *,
    tenant_id: int,
    doc: StockDocument,
    line: StockDocumentItem,
    performed_by: AppUser,
) -> float:
    """Remove remaining non-putaway qty from DOCK inventory (received − putaway)."""
    from .wms_receiving_service import _apply_dock_inventory_for_receipt

    rec = float(line.received_quantity or 0)
    put = _line_putaway_qty(line)
    dock_qty = max(0.0, rec - put)
    if dock_qty <= 1e-12:
        return 0.0
    prev = bool(getattr(line, "requires_putaway", True))
    line.requires_putaway = True
    wc_id = getattr(line, "warehouse_carrier_id", None)
    _apply_dock_inventory_for_receipt(
        db,
        tenant_id=int(tenant_id),
        doc=doc,
        line=line,
        add_qty=-dock_qty,
        warehouse_carrier_id=int(wc_id) if wc_id is not None else None,
        performed_by=performed_by,
    )
    line.requires_putaway = prev
    return dock_qty


def _materialize_dock_for_line(
    db: Session,
    *,
    tenant_id: int,
    doc: StockDocument,
    line: StockDocumentItem,
    performed_by: AppUser,
) -> float:
    """Add remaining qty to DOCK when switching back to standard putaway."""
    from .wms_receiving_service import _apply_dock_inventory_for_receipt

    rec = float(line.received_quantity or 0)
    put = _line_putaway_qty(line)
    dock_qty = max(0.0, rec - put)
    if dock_qty <= 1e-12:
        return 0.0
    wc_id = getattr(line, "warehouse_carrier_id", None)
    _apply_dock_inventory_for_receipt(
        db,
        tenant_id=int(tenant_id),
        doc=doc,
        line=line,
        add_qty=dock_qty,
        warehouse_carrier_id=int(wc_id) if wc_id is not None else None,
        performed_by=performed_by,
    )
    return dock_qty


def set_putaway_handling(
    db: Session,
    tenant_id: int,
    pz_id: int,
    *,
    requires_putaway: bool,
    item_ids: Optional[Iterable[int]] = None,
    performed_by: AppUser,
    apply_document_default: bool = True,
) -> StockDocumentRead:
    """
    Set STANDARD (requires_putaway=True) or NO_PUTAWAY on selected lines (or all product lines).

    NO_PUTAWAY with quantity_putaway>0 is rejected.
    Switching to NO_PUTAWAY withdraws remaining DOCK stock (no phantom putaway stock).
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .with_for_update()
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    _assert_draft_or_putaway_open(doc)
    ensure_pz_document_warehouse_resolved(db, doc)
    ensure_default_pz_receiving_location_if_missing(db, doc)

    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .order_by(StockDocumentItem.id)
        .with_for_update()
        .all()
    )
    id_filter = {int(x) for x in item_ids} if item_ids is not None else None
    targets = [
        ln
        for ln in rows
        if not is_stock_document_item_wm_material(ln)
        and (id_filter is None or int(ln.id) in id_filter)
    ]
    if not targets:
        raise ValueError("Brak pozycji do zmiany trybu rozlokowania")

    for ln in targets:
        if _line_putaway_qty(ln) > 1e-9 and not requires_putaway:
            raise PutawayHandlingError(CANCEL_PARTIAL_MSG, code=CANCEL_CODE)

    changed: list[dict] = []
    for ln in targets:
        old = bool(getattr(ln, "requires_putaway", True))
        new = bool(requires_putaway)
        if old == new:
            continue
        if old and not new:
            withdrawn = _withdraw_dock_for_line(
                db, tenant_id=tenant_id, doc=doc, line=ln, performed_by=performed_by
            )
            ln.requires_putaway = False
            changed.append(
                {
                    "item_id": int(ln.id),
                    "product_id": getattr(ln, "product_id", None),
                    "old": HANDLING_STANDARD,
                    "new": HANDLING_NO_PUTAWAY,
                    "withdrawn_dock_qty": withdrawn,
                }
            )
        elif not old and new:
            ln.requires_putaway = True
            added = _materialize_dock_for_line(
                db, tenant_id=tenant_id, doc=doc, line=ln, performed_by=performed_by
            )
            changed.append(
                {
                    "item_id": int(ln.id),
                    "product_id": getattr(ln, "product_id", None),
                    "old": HANDLING_NO_PUTAWAY,
                    "new": HANDLING_STANDARD,
                    "dock_qty_added": added,
                }
            )

    if apply_document_default:
        doc.default_requires_putaway = bool(requires_putaway)

    if changed:
        old_label = HANDLING_STANDARD if not requires_putaway else HANDLING_NO_PUTAWAY
        new_label = HANDLING_NO_PUTAWAY if not requires_putaway else HANDLING_STANDARD
        # Prefer human labels when all flipped the same way
        if requires_putaway:
            old_label, new_label = HANDLING_NO_PUTAWAY, HANDLING_STANDARD
        else:
            old_label, new_label = HANDLING_STANDARD, HANDLING_NO_PUTAWAY
        record_pz_activity(
            db,
            tenant_id=tenant_id,
            document_id=int(pz_id),
            warehouse_id=getattr(doc, "warehouse_id", None),
            event_code=EVENT_PZ_PUTAWAY_HANDLING_CHANGED,
            description=(
                f"Zmieniono sposób obsługi dostawy z: "
                f"{'STANDARDOWE ROZLOKOWANIE' if old_label == HANDLING_STANDARD else 'BEZ ROZLOKOWANIA'} "
                f"na: "
                f"{'STANDARDOWE ROZLOKOWANIE' if new_label == HANDLING_STANDARD else 'BEZ ROZLOKOWANIA'}."
            ),
            performed_by=performed_by,
            metadata={
                "old_handling": old_label,
                "new_handling": new_label,
                "lines": changed,
                "requires_putaway": bool(requires_putaway),
            },
        )

    doc.updated_at = datetime.utcnow()
    recompute_putaway_status_for_document(doc, rows, db)
    recalculate_wms_document_completion(db, tenant_id, int(pz_id))
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)


def cancel_putaway_obligation(
    db: Session,
    tenant_id: int,
    pz_id: int,
    *,
    performed_by: AppUser,
    mark_no_putaway: bool = True,
) -> StockDocumentRead:
    """
    Cancel mistaken putaway obligation when nothing has been put away yet (0/X).

    Partial putaway → reject. Default: mark lines NO_PUTAWAY and withdraw DOCK stock.
    """
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
        .with_for_update()
        .first()
    )
    if not doc:
        raise ValueError("Dokument nie znaleziony")
    _assert_draft_or_putaway_open(doc)

    rows = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(pz_id))
        .with_for_update()
        .all()
    )
    eligible = [
        ln
        for ln in rows
        if not is_stock_document_item_wm_material(ln)
        and float(ln.received_quantity or 0) > 1e-9
        and stock_document_item_requires_putaway(ln, db=db)
    ]
    if any(_line_putaway_qty(ln) > 1e-9 for ln in rows):
        raise PutawayHandlingError(CANCEL_PARTIAL_MSG, code=CANCEL_CODE)
    if not eligible and not mark_no_putaway:
        raise ValueError("Brak aktywnego obowiązku rozlokowania do anulowania")

    if mark_no_putaway:
        target_ids = [int(ln.id) for ln in eligible]
        result = set_putaway_handling(
            db,
            tenant_id,
            pz_id,
            requires_putaway=False,
            item_ids=target_ids if target_ids else None,
            performed_by=performed_by,
            apply_document_default=True,
        )
        # set_putaway_handling already commits; append cancel-specific audit.
        doc2 = (
            db.query(StockDocument)
            .filter(StockDocument.id == int(pz_id), StockDocument.tenant_id == int(tenant_id))
            .first()
        )
        if doc2 is not None:
            record_pz_activity(
                db,
                tenant_id=tenant_id,
                document_id=int(pz_id),
                warehouse_id=getattr(doc2, "warehouse_id", None),
                event_code=EVENT_PZ_PUTAWAY_CANCELLED,
                description=(
                    "Anulowano obowiązek rozlokowania (0/X) — oznaczono BEZ ROZLOKOWANIA."
                ),
                performed_by=performed_by,
                metadata={
                    "item_ids": target_ids,
                    "mark_no_putaway": True,
                },
            )
            db.commit()
        return result

    raise ValueError("Nieobsługiwany wariant anulowania")
