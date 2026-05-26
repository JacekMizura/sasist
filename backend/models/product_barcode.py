"""Alternate EANs per product (e.g. carton / multipack) with quantity multiplier."""

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from ..database import Base


class ProductBarcode(Base):
    __tablename__ = "product_barcodes"
    __table_args__ = (UniqueConstraint("product_id", "ean", name="uq_product_barcodes_product_ean"),)

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    ean = Column(String(64), nullable=False, index=True)
    multiplier = Column(Integer, nullable=False, default=1)

    product = relationship("Product", back_populates="extra_barcodes")
