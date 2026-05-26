"""Append-only audit row for product-level WMS warehouse operations (who / when / type / locations / packaging)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String

from ..database import Base


class WmsProductWarehouseOperation(Base):
    __tablename__ = "wms_product_warehouse_operations"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    movement_type = Column(String(32), nullable=False, index=True)
    source_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    target_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)

    quantity = Column(Float, nullable=False)
    packaging_type = Column(String(24), nullable=False, default="UNIT")
    packaging_quantity = Column(Float, nullable=True)

    admin_id = Column(Integer, ForeignKey("app_users.id", ondelete="RESTRICT"), nullable=False, index=True)
    admin_login = Column(String(128), nullable=False)
    admin_first_name = Column(String(128), nullable=True)
    admin_last_name = Column(String(128), nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    reference_document = Column(String(160), nullable=True)
    stock_document_id = Column(Integer, ForeignKey("stock_documents.id", ondelete="SET NULL"), nullable=True, index=True)
    replenishment_task_id = Column(
        Integer,
        ForeignKey("replenishment_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    wms_mode = Column(String(64), nullable=True)
    batch_number = Column(String(128), nullable=True)
    expiry_date = Column(Date, nullable=True)
    pick_id = Column(Integer, ForeignKey("picks.id", ondelete="SET NULL"), nullable=True, index=True)
