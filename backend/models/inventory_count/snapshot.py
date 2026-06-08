"""Point-in-time snapshots captured at inventory start."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, Index

from ...database import Base
from ..base import BaseModelMixin
from .constants import SNAPSHOT_KIND_STOCK


class InventorySnapshot(Base, BaseModelMixin):
    __tablename__ = "inventory_snapshots"

    inventory_document_id = Column(
        Integer,
        ForeignKey("inventory_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    snapshot_kind = Column(String(32), nullable=False, default=SNAPSHOT_KIND_STOCK, index=True)
    captured_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    row_count = Column(Integer, nullable=False, default=0)
    checksum = Column(String(128), nullable=True)
    metadata_json = Column(Text, nullable=True)


class InventorySnapshotStockLine(Base):
    __tablename__ = "inventory_snapshot_stock_lines"
    __table_args__ = (
        Index("ix_inv_snap_stock_snap_loc", "snapshot_id", "location_id"),
    )

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("inventory_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0.0)
    reserved_quantity = Column(Float, nullable=False, default=0.0)
    batch_number = Column(String(128), nullable=True)
    lot_id = Column(Integer, nullable=True)
    serial_number = Column(String(128), nullable=True)
    carrier_id = Column(Integer, nullable=True)
    stock_disposition = Column(String(32), nullable=True)
    metadata_json = Column(Text, nullable=True)


class InventorySnapshotReservationLine(Base):
    __tablename__ = "inventory_snapshot_reservation_lines"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("inventory_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    reservation_id = Column(Integer, nullable=True)
    order_id = Column(Integer, nullable=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=True)
    quantity = Column(Float, nullable=False, default=0.0)
    status = Column(String(32), nullable=True)
    metadata_json = Column(Text, nullable=True)


class InventorySnapshotSerialLine(Base):
    __tablename__ = "inventory_snapshot_serial_lines"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("inventory_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    serial_number = Column(String(128), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=True)
    status = Column(String(32), nullable=True)
    metadata_json = Column(Text, nullable=True)
