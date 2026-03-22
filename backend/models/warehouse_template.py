"""
MODEL: WarehouseTemplate

Stores rack templates (Twórca szablonu) per tenant: name, color, dimensions,
rowId, sectionStartIndex, addressPattern, and per-bin storage types.
"""

from sqlalchemy import Column, String, Integer, Float, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


class WarehouseTemplate(Base, BaseModelMixin):
    """Rack template: dimensions, naming, color, and per-bin storage types. Scoped by tenant."""
    __tablename__ = "warehouse_templates"

    template_uid = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(32), nullable=False, default="#3b82f6")
    width_cm = Column(Float, nullable=False, default=120)
    depth_cm = Column(Float, nullable=False, default=80)
    height_cm = Column(Float, nullable=False, default=200)
    levels = Column(Integer, nullable=False, default=4)
    bins_per_level = Column(Integer, nullable=False, default=4)
    aisle_letter = Column(String(8), nullable=False, default="A")
    row_id = Column(String(32), nullable=True)
    section_start_index = Column(Integer, nullable=True, default=1)
    next_section_index = Column(Integer, nullable=True)
    address_pattern = Column(String(255), nullable=True)
    naming_pattern = Column(String(255), nullable=True)
    bin_naming_type = Column(String(16), nullable=False, default="numeric")
    auto_section_numbering = Column(Boolean, nullable=False, default=False)
    bin_type_map_json = Column(Text, nullable=True)
    reserve_bin_keys = Column(Text, nullable=True)
    """Maximum allowed load per rack level (kg). Used for level beam capacity visualization. Default 500."""
    level_max_load_kg = Column(Float, nullable=True, default=500)
