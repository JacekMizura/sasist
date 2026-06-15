"""Inbound delivery warehouse_id — required at creation (fail before PZ)."""

from __future__ import annotations

ERR_INBOUND_DELIVERY_NO_WAREHOUSE = "Dostawa wymaga przypisanego magazynu (warehouse_id)."


class InboundDeliveryWarehouseRequiredError(ValueError):
    """Raised when InboundDelivery is persisted without warehouse_id."""


def validate_inbound_delivery_warehouse_id(
    warehouse_id: int | None,
    *,
    context: str = "inbound_delivery",
) -> int:
    if warehouse_id is None or int(warehouse_id) <= 0:
        raise InboundDeliveryWarehouseRequiredError(ERR_INBOUND_DELIVERY_NO_WAREHOUSE)
    return int(warehouse_id)


def register_inbound_delivery_warehouse_guard() -> None:
    """ORM hook: block new deliveries without warehouse_id."""
    from sqlalchemy import event

    from ..models.inbound_delivery import InboundDelivery

    @event.listens_for(InboundDelivery, "before_insert")
    def _require_warehouse_on_delivery_insert(_mapper, _connection, target: InboundDelivery) -> None:
        validate_inbound_delivery_warehouse_id(
            getattr(target, "warehouse_id", None),
            context="inbound_delivery_insert",
        )
