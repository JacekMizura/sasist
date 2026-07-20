"""Cartons / boxes — logistics dimensions, optional link to many shipping methods."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Table, Text, text
from sqlalchemy.orm import relationship

from ..database import Base

carton_shipping_method_links = Table(
    "carton_shipping_method_links",
    Base.metadata,
    Column("carton_id", String(36), ForeignKey("cartons.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "shipping_method_id",
        String(36),
        ForeignKey("shipping_methods.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Carton(Base):
    __tablename__ = "cartons"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    image_url = Column(String(512), nullable=True)
    sku = Column(String(128), nullable=True)
    ean = Column(String(64), nullable=True)
    length_cm = Column(Float, nullable=False)
    width_cm = Column(Float, nullable=False)
    height_cm = Column(Float, nullable=False)
    #: Usable / internal content dimensions (fit SSOT). NULL → fallback to external + warning.
    internal_length_cm = Column(Float, nullable=True)
    internal_width_cm = Column(Float, nullable=True)
    internal_height_cm = Column(Float, nullable=True)
    #: Max payload weight for packing (content). Separate from tare weight_kg.
    max_payload_kg = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=False, default=0.0)
    #: e.g. corrugated, cardboard — display / filtering
    material_type = Column(String(128), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    notes = Column(Text, nullable=True)

    supplier_id = Column(Integer, ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True, index=True)
    producer_id = Column(Integer, ForeignKey("manufacturers.id", ondelete="SET NULL"), nullable=True, index=True)
    supplier_name_override = Column(String(256), nullable=True)
    lead_time_days = Column(Integer, nullable=True)
    moq = Column(Float, nullable=True)
    purchase_pack_qty = Column(Float, nullable=True)
    free_shipping_threshold_net = Column(Float, nullable=True)
    last_purchase_price_net = Column(Float, nullable=True)
    last_purchase_price_gross = Column(Float, nullable=True)
    last_purchased_at = Column(DateTime, nullable=True)
    supplier_sku = Column(String(128), nullable=True)
    stock = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    reserved_qty = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    location_label = Column(String(512), nullable=True)
    purchase_price = Column(Float, nullable=True)
    unit_cost = Column(Float, nullable=True)

    #: Default VAT % for package ↔ gross calculations (tiers inherit unless overridden per save path)
    vat_rate_pct = Column(Float, nullable=False, server_default=text("23"), default=23.0)
    #: Base commercial package (e.g. 20 pcs); tier rows may override per volume
    package_qty = Column(Float, nullable=True)
    package_net_total = Column(Float, nullable=True)
    package_gross_total = Column(Float, nullable=True)
    low_stock_threshold = Column(Float, nullable=True)
    reorder_qty = Column(Float, nullable=True)

    #: BDO / environmental reporting (kg per carton / pcs)
    plastic_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    paper_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    wood_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    glass_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    metal_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    packaging_type = Column(String(64), nullable=True)
    include_in_bdo = Column(Boolean, nullable=False, server_default=text("false"), default=False)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    producer = relationship("Manufacturer", foreign_keys=[producer_id])
    shipping_methods = relationship(
        "ShippingMethod",
        secondary=carton_shipping_method_links,
        lazy="selectin",
    )
    price_tiers = relationship(
        "WmPriceTier",
        back_populates="carton",
        cascade="all, delete-orphan",
        order_by="WmPriceTier.sort_index",
        lazy="selectin",
    )
