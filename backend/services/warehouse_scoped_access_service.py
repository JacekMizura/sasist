"""P2.2 — warehouse context SSOT: entity warehouse must match active operator context."""

from __future__ import annotations

from fastapi import HTTPException


class WarehouseContextMismatchError(HTTPException):
    """Cross-warehouse access — treat as not found in active warehouse context."""

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(
            status_code=404,
            detail=detail or "Nie znaleziono w aktywnym magazynie.",
        )


def assert_entity_warehouse_matches_active(
    entity_warehouse_id: int | None,
    active_warehouse_id: int,
    *,
    missing_detail: str = "Obiekt nie ma przypisanego magazynu.",
) -> int:
    """
    P2.2 global rule: document.warehouse_id must equal active warehouse context.
    Returns resolved warehouse id on success.
    """
    if entity_warehouse_id is None:
        raise WarehouseContextMismatchError(missing_detail)
    entity_wh = int(entity_warehouse_id)
    active_wh = int(active_warehouse_id)
    if entity_wh != active_wh:
        raise WarehouseContextMismatchError()
    return entity_wh
