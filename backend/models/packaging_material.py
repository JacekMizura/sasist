"""Consumable packaging supplies — master data for warehouse materials + BDO."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.orm import relationship

from ..database import Base


class PackagingMaterial(Base):
    __tablename__ = "packaging_materials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False, index=True)

    name = Column(String(256), nullable=False)
    #: stretch_foil | packing_tape | paper_filler | bubble_wrap | courier_envelope | label_roll | other
    #: Legacy rows may still store tape | foil | filler
    material_type = Column(String(32), nullable=False, index=True)
    #: roll | kg | pcs — primary stock unit
    unit = Column(String(32), nullable=False)

    image_url = Column(String(512), nullable=True)
    sku = Column(String(128), nullable=True)

    stock = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    reserved_qty = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    is_active = Column(Boolean, nullable=False, server_default=text("1"), default=True)

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
    location_label = Column(String(512), nullable=True)
    purchase_price = Column(Float, nullable=True)
    unit_cost = Column(Float, nullable=True)

    vat_rate_pct = Column(Float, nullable=False, server_default=text("23"), default=23.0)
    package_qty = Column(Float, nullable=True)
    package_net_total = Column(Float, nullable=True)
    package_gross_total = Column(Float, nullable=True)
    low_stock_threshold = Column(Float, nullable=True)
    reorder_qty = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    #: Shared numeric attributes (interpretation depends on material_type)
    width_mm = Column(Float, nullable=True)
    length_m = Column(Float, nullable=True)
    thickness_micron = Column(Float, nullable=True)
    color = Column(String(64), nullable=True)

    #: Stretch foil
    net_weight_foil_kg = Column(Float, nullable=True)
    tube_weight_kg = Column(Float, nullable=True)
    stretch_percent = Column(Float, nullable=True)
    tube_diameter_mm = Column(Float, nullable=True)

    #: Tape
    adhesive_type = Column(String(64), nullable=True)
    tape_weight_kg = Column(Float, nullable=True)
    core_paper_weight_kg = Column(Float, nullable=True)

    #: Paper filler
    roll_diameter_mm = Column(Float, nullable=True)
    grammage_gsm = Column(Float, nullable=True)
    paper_type = Column(String(128), nullable=True)
    roll_weight_kg = Column(Float, nullable=True)

    #: Bubble wrap
    bubble_width_cm = Column(Float, nullable=True)
    bubble_diameter_mm = Column(Float, nullable=True)
    tolerance_percent = Column(Float, nullable=True)
    bubble_weight_kg = Column(Float, nullable=True)

    #: BDO / environmental reporting (kg per inventory unit — roll, kg, pcs as in ``unit``)
    plastic_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    paper_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    wood_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    glass_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    metal_kg_per_unit = Column(Float, nullable=False, server_default=text("0"), default=0.0)
    packaging_type = Column(String(64), nullable=True)
    include_in_bdo = Column(Boolean, nullable=False, server_default=text("0"), default=False)

    created_at = Column(DateTime, nullable=True, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, default=datetime.utcnow, onupdate=datetime.utcnow)

    supplier = relationship("Supplier", foreign_keys=[supplier_id])
    producer = relationship("Manufacturer", foreign_keys=[producer_id])
    price_tiers = relationship(
        "WmPriceTier",
        back_populates="packaging_material",
        cascade="all, delete-orphan",
        order_by="WmPriceTier.sort_index",
        lazy="selectin",
    )
