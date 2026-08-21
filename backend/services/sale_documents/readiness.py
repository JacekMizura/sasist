"""Domain readiness for issuing a sale correction from a RETURN/RMZ."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.wms_order_return import WmsOrderReturn
from ...models.wms_rmz_line import RMZLine
from .errors import SaleCorrectionError


def assert_return_ready_for_sale_correction(db: Session, *, return_row: WmsOrderReturn) -> None:
    """
    Correction requires finalized warehouse commit (Z-PZ / warehouse_document_id).

    UI status names are ignored — only RMZ domain state.
    """
    if return_row is None:
        raise SaleCorrectionError("RETURN_MISSING", "Zwrot nie istnieje.")
    if not getattr(return_row, "warehouse_document_id", None):
        raise SaleCorrectionError(
            "RETURN_NOT_READY",
            "Korekta wymaga zakończonego przyjęcia magazynowego (warehouse commit / Z-PZ).",
        )
    lines = (
        db.query(RMZLine)
        .filter(RMZLine.rmz_id == int(return_row.id))
        .all()
    )
    if not lines:
        raise SaleCorrectionError("RETURN_NO_LINES", "Zwrot nie ma znormalizowanych linii RMZ.")
