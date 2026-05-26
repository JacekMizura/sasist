"""Durable inventory movement ledger — audit source of truth alongside operational stock tables."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text

from ..database import Base


class WarehouseInventoryMovement(Base):
    __tablename__ = "warehouse_inventory_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)

    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    variant_id = Column(Integer, nullable=True, index=True)

    source_document_type = Column(String(32), nullable=True, index=True)
    source_document_id = Column(Integer, nullable=True, index=True)
    source_line_id = Column(Integer, nullable=True, index=True)

    movement_type = Column(String(32), nullable=False, index=True)
    quantity = Column(Float, nullable=False)

    from_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    to_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    from_carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True, index=True)
    to_carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True, index=True)

    lot_number = Column(String(128), nullable=True)
    serial_number = Column(String(128), nullable=True)
    expiry_date = Column(Date, nullable=True)

    inventory_bucket = Column(String(32), nullable=False, default="sellable", index=True)

    operator_admin_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    metadata_json = Column(Text, nullable=True)
