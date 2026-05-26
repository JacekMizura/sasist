"""Virtual product bundles: composed of real products; no inventory rows for bundles."""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base


class Bundle(Base):
    __tablename__ = "bundles"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, nullable=True, index=True)
    ean = Column(String, nullable=True, index=True)
    sale_price = Column(Float, nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    image_url = Column(String, nullable=True)
    #: Archiwizacja — ukrycie z listy; pozycje z source_bundle_id zachowują odniesienie.
    deleted_at = Column(DateTime, nullable=True, index=True)

    tenant = relationship("Tenant", back_populates="bundles")
    items = relationship(
        "BundleItem",
        back_populates="bundle",
        cascade="all, delete-orphan",
    )


class BundleItem(Base):
    __tablename__ = "bundle_items"

    id = Column(Integer, primary_key=True)
    bundle_id = Column(Integer, ForeignKey("bundles.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    #: CSV import: dodatkowe identyfikatory / URL zdjęć składnika (JSON).
    metadata_json = Column(Text, nullable=True)

    bundle = relationship("Bundle", back_populates="items")
    product = relationship("Product", back_populates="bundle_items")
