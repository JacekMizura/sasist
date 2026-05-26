from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class DamageReport(Base, BaseModelMixin):
    __tablename__ = "damage_reports"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    report_number = Column(String(32), nullable=False, unique=True, index=True)
    created_by = Column(String(128), nullable=True)
    status = Column(String(16), nullable=False, default="draft", index=True)  # draft | confirmed
    total_value = Column(Float, nullable=False, default=0)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    items = relationship("DamageReportItem", back_populates="report", cascade="all, delete-orphan")


class DamageEntry(Base, BaseModelMixin):
    __tablename__ = "damage_entries"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    product_name = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    location_uuid = Column(String(64), nullable=False, index=True)
    location_label = Column(String, nullable=True)
    quantity = Column(Float, nullable=False, default=0)
    # Canonical list is photo_urls (JSON). photo_url duplicates index 0 for legacy NOT NULL / single-thumb UIs.
    photo_url = Column(String, nullable=False)
    photo_urls = Column(JSON, nullable=True)
    created_by = Column(String(128), nullable=True)
    status = Column(String(24), nullable=False, default="NEW", index=True)  # NEW | REVIEWED | INCLUDED_IN_REPORT
    damage_type = Column(String(32), nullable=True, default="other")
    description = Column(String, nullable=True)
    decision = Column(String(32), nullable=True)  # SELLABLE | REPAIR | RETURN_TO_SUPPLIER | DISPOSE
    reviewed_by = Column(String(128), nullable=True)
    reviewed_at = Column(String(64), nullable=True)
    purchase_price = Column(Float, nullable=False, default=0)
    total_value = Column(Float, nullable=False, default=0)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    product = relationship("Product")


class DamageReportItem(Base, BaseModelMixin):
    __tablename__ = "damage_report_items"

    report_id = Column(Integer, ForeignKey("damage_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    damage_entry_id = Column(Integer, ForeignKey("damage_entries.id", ondelete="SET NULL"), nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    product_name = Column(String, nullable=False)
    sku = Column(String, nullable=True)
    location_uuid = Column(String(64), nullable=False, index=True)
    location_label = Column(String, nullable=True)
    quantity = Column(Float, nullable=False, default=0)
    purchase_price = Column(Float, nullable=False, default=0)
    total_value = Column(Float, nullable=False, default=0)
    damage_type = Column(String(32), nullable=False, default="other")  # mechanical | missing_parts | flood | other
    description = Column(String, nullable=True)
    decision = Column(String(32), nullable=True)

    report = relationship("DamageReport", back_populates="items")
    damage_entry = relationship("DamageEntry")
    product = relationship("Product")
    images = relationship("DamageReportImage", back_populates="report_item", cascade="all, delete-orphan")


class DamageReportImage(Base, BaseModelMixin):
    __tablename__ = "damage_report_images"

    report_item_id = Column(Integer, ForeignKey("damage_report_items.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(String, nullable=False)

    report_item = relationship("DamageReportItem", back_populates="images")
