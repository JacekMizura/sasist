"""Warehouse-level business reservation for sales orders (RZ) — no location_id."""

from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class OrderWarehouseReservation(Base, BaseModelMixin):
    """
    BUSINESS RESERVATION SSOT: tenant + warehouse + order + product + qty.

    Distinct from location-level ``stock_reservations`` (WMS / production / DS).
    """

    __tablename__ = "order_warehouse_reservations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "warehouse_id",
            "order_id",
            "product_id",
            name="uq_owr_tenant_wh_order_product",
        ),
    )

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    #: Remaining active claim (decreases on consume / partial release).
    quantity = Column(Float, nullable=False, default=0)
    #: Original reserved qty for audit (set on first reserve / increase).
    quantity_original = Column(Float, nullable=False, default=0)
    status = Column(
        String(32),
        nullable=False,
        default="RESERVED",
        server_default=text("'RESERVED'"),
        index=True,
    )
    stock_document_id = Column(
        Integer,
        ForeignKey("stock_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )
    created_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True)

    tenant = relationship("Tenant")
    warehouse = relationship("Warehouse")
    order = relationship("Order")
    product = relationship("Product")
    stock_document = relationship("StockDocument", foreign_keys=[stock_document_id])
