"""Purchase order warehouse_id — required at creation (P2.3 SSOT)."""

from __future__ import annotations

ERR_PURCHASE_ORDER_NO_WAREHOUSE = "Zamówienie zakupu wymaga przypisanego magazynu."


class PurchaseOrderWarehouseRequiredError(ValueError):
    """Raised when PurchaseOrder is persisted without warehouse_id."""


def validate_purchase_order_warehouse_id(
    warehouse_id: int | None,
    *,
    context: str = "purchase_order",
) -> int:
    if warehouse_id is None or int(warehouse_id) <= 0:
        raise PurchaseOrderWarehouseRequiredError(ERR_PURCHASE_ORDER_NO_WAREHOUSE)
    return int(warehouse_id)


def register_purchase_order_warehouse_guard() -> None:
    """ORM hook: block new purchase orders without warehouse_id."""
    from sqlalchemy import event

    from ..models.purchase_order import PurchaseOrder

    @event.listens_for(PurchaseOrder, "before_insert")
    def _require_warehouse_on_po_insert(_mapper, _connection, target: PurchaseOrder) -> None:
        validate_purchase_order_warehouse_id(
            getattr(target, "warehouse_id", None),
            context="purchase_order_insert",
        )
