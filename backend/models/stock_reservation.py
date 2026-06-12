"""
MODEL: StockReservation

Reserved quantity for an order. status: reserved | released | picked.
Pick: decrease stock.quantity and set status to picked.
"""

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Integer, Float, ForeignKey, String, text
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class StockReservation(Base, BaseModelMixin):
    __tablename__ = "stock_reservations"

    tenant_id = Column(
        Integer,
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(Float, nullable=False)
    status = Column(String(20), nullable=False, default="reserved")  # reserved | released | picked
    batch_number = Column(String(128), nullable=False, default="")
    expiry_date = Column(Date, nullable=False, default=date(9999, 12, 31))
    expires_at = Column(DateTime, nullable=True, index=True)
    direct_sale_session_id = Column(
        Integer,
        ForeignKey("direct_sale_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reservation_kind = Column(String(24), nullable=True)
    stock_disposition = Column(
        String(32),
        nullable=False,
        default="SALEABLE",
        server_default=text("'SALEABLE'"),
        index=True,
    )

    tenant = relationship("Tenant", back_populates="stock_reservations")
    order = relationship("Order", back_populates="stock_reservations")
    product = relationship("Product", back_populates="stock_reservations")
    location = relationship("Location", back_populates="stock_reservations")
