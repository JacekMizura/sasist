"""WMS warehouse carriers (palety, skrzynki) — osobna warstwa logistyczna; stan magazynowy w ``inventory.carrier_id``."""

from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base


class WarehouseCarrierGroup(Base):
    __tablename__ = "warehouse_carrier_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False, default="")
    code = Column(String(32), nullable=False, default="", index=True)
    color = Column(String(32), nullable=True)
    default_weight = Column(Float, nullable=True)
    default_width = Column(Float, nullable=True)
    default_height = Column(Float, nullable=True)
    default_depth = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    carriers = relationship("WarehouseCarrier", back_populates="carrier_group")


class WarehouseCarrier(Base):
    __tablename__ = "warehouse_carriers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(64), nullable=False, default="", index=True)
    barcode = Column(String(96), nullable=False, unique=True, index=True)
    name = Column(String(256), nullable=True)
    carrier_group_id = Column(
        Integer,
        ForeignKey("warehouse_carrier_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    current_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    #: Bieżący magazyn (pozycja nośnika) — mobile; nie „właściciel” stały.
    current_warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(24), nullable=False, default="ACTIVE", index=True)
    is_mixed = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    weight = Column(Float, nullable=True)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    depth = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    locked_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    locked_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, index=True)

    carrier_group = relationship("WarehouseCarrierGroup", back_populates="carriers")
    current_location = relationship("Location", foreign_keys=[current_location_id])
    current_warehouse = relationship("Warehouse", foreign_keys=[current_warehouse_id])
    items = relationship("WarehouseCarrierItem", back_populates="carrier", cascade="all, delete-orphan")
    logs = relationship("WarehouseCarrierLog", back_populates="carrier", cascade="all, delete-orphan")


class WarehouseCarrierItem(Base):
    __tablename__ = "warehouse_carrier_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_stock_id = Column(Integer, ForeignKey("inventory.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id = Column(Integer, nullable=True)
    expiry_date = Column(Date, nullable=True)
    quantity = Column(Float, nullable=False, default=0)
    reserved_quantity = Column(Float, nullable=False, default=0, server_default=text("0"))
    source_document_type = Column(String(32), nullable=True)
    source_document_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    carrier = relationship("WarehouseCarrier", back_populates="items")


class WarehouseCarrierLog(Base):
    __tablename__ = "warehouse_carrier_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="CASCADE"), nullable=False, index=True)
    operation_type = Column(String(64), nullable=False, index=True)
    performed_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    performed_by_name = Column(String(256), nullable=False, default="")
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    carrier = relationship("WarehouseCarrier", back_populates="logs")
