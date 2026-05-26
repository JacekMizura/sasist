"""Per-unit serial tracking for WMS (1 serial = 1 physical piece)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base

# Lifecycle statuses
SERIAL_STATUS_IN_TRANSIT = "IN_TRANSIT"
SERIAL_STATUS_ON_HAND = "ON_HAND"
SERIAL_STATUS_PICKED = "PICKED"
SERIAL_STATUS_SHIPPED = "SHIPPED"
SERIAL_STATUS_RETURNED = "RETURNED"
SERIAL_STATUS_SCRAPPED = "SCRAPPED"


class InventorySerial(Base):
    """One row = one serialised unit at a warehouse location (qty always implied 1)."""

    __tablename__ = "inventory_serials"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", "serial_number", name="uq_inventory_serial_tenant_product_sn"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(128), nullable=False, index=True)
    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    status = Column(String(32), nullable=False, default=SERIAL_STATUS_ON_HAND, index=True)
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True, index=True)
    source_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True, index=True)
    document_line_id = Column(
        Integer, ForeignKey("stock_document_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    stock_operation_id = Column(Integer, ForeignKey("stock_operations.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", foreign_keys=[product_id])
    location = relationship("Location", foreign_keys=[location_id])
    carrier = relationship("WarehouseCarrier", foreign_keys=[carrier_id])
