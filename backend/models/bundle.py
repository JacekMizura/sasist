"""Virtual product bundles: composed of real products; no inventory rows for bundles."""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, Numeric, String, Text
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
    extra_cost_packaging_net = Column(Numeric(12, 2), nullable=False, default=0)
    production_cost_net = Column(Numeric(12, 2), nullable=False, default=0)
    active = Column(Boolean, nullable=False, default=True)
    image_url = Column(String, nullable=True)
    #: Wymiary gotowego opakowania zestawu (mm / kg) — nie składników.
    length_mm = Column(Float, nullable=True)
    width_mm = Column(Float, nullable=True)
    height_mm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    #: Galeria zdjęć, etykieta itp. (JSON).
    metadata_json = Column(Text, nullable=True)
    #: assembly / manufacturing — legacy; synced from bundle_fulfillment_mode.
    fulfillment_mode = Column(String, nullable=False, default="assembly", server_default="assembly")
    #: virtual / physical — legacy; synced from bundle_fulfillment_mode.
    stock_mode = Column(String, nullable=False, default="virtual", server_default="virtual")
    #: ON_DEMAND_ASSEMBLY | STOCK_PRODUCTION — canonical operational mode (P4.11).
    bundle_fulfillment_mode = Column(
        String, nullable=False, default="ON_DEMAND_ASSEMBLY", server_default="ON_DEMAND_ASSEMBLY"
    )
    #: Produkt magazynowy powiązany z zestawem (produkcja / stan fizyczny).
    linked_product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
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
