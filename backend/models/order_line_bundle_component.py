"""Snapshot składników zestawu w momencie utworzenia linii zamówienia (P4.13)."""

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship

from ..database import Base


class OrderLineBundleComponent(Base):
    __tablename__ = "order_line_bundle_components"

    id = Column(Integer, primary_key=True)
    order_line_id = Column(
        Integer,
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bundle_id = Column(
        Integer,
        ForeignKey("bundles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_id = Column(
        Integer,
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name_snapshot = Column(String(512), nullable=False)
    sku_snapshot = Column(String(128), nullable=True)
    ean_snapshot = Column(String(64), nullable=True)
    quantity_per_bundle = Column(Integer, nullable=False)
    quantity_total = Column(Integer, nullable=False)
    purchase_price_net_snapshot = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order_line = relationship("OrderItem", back_populates="bundle_component_snapshots")
    bundle = relationship("Bundle", foreign_keys=[bundle_id])
    product = relationship("Product", foreign_keys=[product_id])
