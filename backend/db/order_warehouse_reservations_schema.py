"""Ensure order_warehouse_reservations table (business RZ holds)."""

from __future__ import annotations

from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_table_from_orm


def ensure_order_warehouse_reservations_table(engine: Engine) -> None:
    from ..models.order_warehouse_reservation import OrderWarehouseReservation

    ensure_model_table_from_orm(
        engine,
        OrderWarehouseReservation,
        log_prefix="schema.order_warehouse_reservations",
    )
