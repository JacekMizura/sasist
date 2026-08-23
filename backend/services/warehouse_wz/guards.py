"""Inventory movement guards for WZ settlement modes."""

from __future__ import annotations

from ...models.stock_document import StockDocument
from .constants import SETTLEMENT_WMS_PICK


class WzDocumentaryMovementError(ValueError):
    """Raised when code attempts inventory movement on a documentary WZ."""


def assert_wz_may_issue_inventory(doc: StockDocument) -> None:
    mode = str(getattr(doc, "settlement_mode", None) or "").strip().upper()
    if mode == SETTLEMENT_WMS_PICK:
        raise WzDocumentaryMovementError(
            "Documentary WZ (settlement_mode=WMS_PICK) must not execute inventory movement."
        )


def wz_performs_inventory_movement(doc: StockDocument) -> bool:
    mode = str(getattr(doc, "settlement_mode", None) or "").strip().upper()
    if mode == SETTLEMENT_WMS_PICK:
        return False
    return True
