"""Complaint physical receipt modes — warehouse vs service paths (no circular imports)."""

from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.stock_document import StockDocumentItem

PHYSICAL_RECEIPT_MODE_WAREHOUSE = "WAREHOUSE"
PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD = "SERVICE_FORWARD"
PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE = "DIRECT_SERVICE"

ALL_PHYSICAL_RECEIPT_MODES: frozenset[str] = frozenset(
    {
        PHYSICAL_RECEIPT_MODE_WAREHOUSE,
        PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD,
        PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE,
    }
)

LOGISTICS_FORWARDED_TO_SERVICE = "FORWARDED_TO_SERVICE"
LOGISTICS_SENT_DIRECTLY_TO_SERVICE = "SENT_DIRECTLY_TO_SERVICE"


def normalize_physical_receipt_mode(raw: Optional[object]) -> str:
    s = str(raw or "").strip().upper()
    if s in ALL_PHYSICAL_RECEIPT_MODES:
        return s
    return PHYSICAL_RECEIPT_MODE_WAREHOUSE


def physical_receipt_mode_requires_z_pz(mode: str) -> bool:
    m = normalize_physical_receipt_mode(mode)
    return m in (PHYSICAL_RECEIPT_MODE_WAREHOUSE, PHYSICAL_RECEIPT_MODE_SERVICE_FORWARD)


def physical_receipt_mode_requires_putaway(mode: str) -> bool:
    return normalize_physical_receipt_mode(mode) == PHYSICAL_RECEIPT_MODE_WAREHOUSE


def complaint_allows_warehouse_actions(complaint: Complaint) -> bool:
    return normalize_physical_receipt_mode(
        getattr(complaint, "physical_receipt_mode", None)
    ) != PHYSICAL_RECEIPT_MODE_DIRECT_SERVICE


def batch_complaint_physical_receipt_modes(
    db: Session,
    complaint_ids: Iterable[int],
) -> Dict[int, str]:
    ids = sorted({int(x) for x in complaint_ids if x is not None})
    if not ids:
        return {}
    rows = (
        db.query(Complaint.id, Complaint.physical_receipt_mode)
        .filter(Complaint.id.in_(ids))
        .all()
    )
    return {int(rid): normalize_physical_receipt_mode(mode) for rid, mode in rows}


def _complaint_ids_from_items(items: Iterable[StockDocumentItem]) -> Set[int]:
    out: Set[int] = set()
    for row in items:
        cid = getattr(row, "source_complaint_id", None)
        if cid is not None:
            out.add(int(cid))
    return out


def stock_document_item_requires_putaway(
    row: StockDocumentItem,
    *,
    complaint_modes: Optional[Dict[int, str]] = None,
    db: Optional[Session] = None,
) -> bool:
    """
    Whether this line must enter WMS putaway / DOCK staging.

    SSOT gate used by putaway queue, remaining qty, and completion.
    Explicit ``requires_putaway=False`` (purchase PZ crossdock) wins first;
    then complaint physical_receipt_mode for Z-PZ lines.
    """
    if getattr(row, "requires_putaway", True) is False:
        return False
    # SQLite / legacy may store 0/1
    raw_flag = getattr(row, "requires_putaway", None)
    if raw_flag is not None and not bool(raw_flag):
        return False

    cid = getattr(row, "source_complaint_id", None)
    if cid is None:
        return True
    if complaint_modes is not None:
        mode = complaint_modes.get(int(cid), PHYSICAL_RECEIPT_MODE_WAREHOUSE)
    elif db is not None:
        raw = (
            db.query(Complaint.physical_receipt_mode)
            .filter(Complaint.id == int(cid))
            .scalar()
        )
        mode = normalize_physical_receipt_mode(raw)
    else:
        mode = PHYSICAL_RECEIPT_MODE_WAREHOUSE
    return physical_receipt_mode_requires_putaway(mode)


def filter_putaway_eligible_lines(
    db: Session,
    lines: List[StockDocumentItem],
) -> List[StockDocumentItem]:
    if not lines:
        return []
    modes = batch_complaint_physical_receipt_modes(db, _complaint_ids_from_items(lines))
    return [ln for ln in lines if stock_document_item_requires_putaway(ln, complaint_modes=modes)]


def document_has_putaway_eligible_received_lines(
    db: Session,
    lines: List[StockDocumentItem],
    *,
    eps: float = 1e-5,
) -> bool:
    eligible = filter_putaway_eligible_lines(db, lines)
    return any(float(getattr(x, "received_quantity", 0) or 0) > eps for x in eligible)
