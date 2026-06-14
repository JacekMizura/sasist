"""P4.17 — STOCK bundle as logistic unit (cart / carrier / pallet / location)."""

from __future__ import annotations

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin

BUNDLE_LOGISTIC_UNIT_STATUS = "bundle_logistic_unit"

PLACEMENT_CART = "cart"
PLACEMENT_CARRIER = "carrier"
PLACEMENT_PALLET = "pallet"
PLACEMENT_LOCATION = "location"


class BundleLogisticUnit(Base, BaseModelMixin):
    """STOCK bundle SKU tracked as single logistic entity on warehouse equipment."""

    __tablename__ = "bundle_logistic_units"

    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    bundle_id = Column(Integer, ForeignKey("bundles.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default=BUNDLE_LOGISTIC_UNIT_STATUS, index=True)
    placement_type = Column(String(16), nullable=False, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="SET NULL"), nullable=True, index=True)
    carrier_id = Column(Integer, ForeignKey("warehouse_carriers.id", ondelete="SET NULL"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity = Column(Float, nullable=False, default=1.0)

    bundle = relationship("Bundle", foreign_keys=[bundle_id])
    product = relationship("Product", foreign_keys=[linked_product_id])
    order = relationship("Order", foreign_keys=[order_id])
    cart = relationship("Cart", foreign_keys=[cart_id])
    location = relationship("Location", foreign_keys=[location_id])
