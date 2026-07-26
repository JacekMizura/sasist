"""
MODEL: WarehouseSpecialPlacement

Map presence of special warehouse roles (START / PACKING / DOCK).
Operational identity lives on ``locations``; this table owns map geometry only.
"""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..database import Base
from .base import BaseModelMixin


SPECIAL_PLACEMENT_ROLES = ("PICK_START", "PACKING", "DOCK")


class WarehouseSpecialPlacement(Base, BaseModelMixin):
    __tablename__ = "warehouse_special_placements"
    __table_args__ = (
        UniqueConstraint("warehouse_id", "role", name="uq_warehouse_special_placements_wh_role"),
    )

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: PICK_START | PACKING | DOCK
    role = Column(String(20), nullable=False, index=True)
    x_cm = Column(Float, nullable=False, default=0.0)
    y_cm = Column(Float, nullable=False, default=0.0)
    rotation = Column(Float, nullable=False, default=0.0, server_default="0")
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    metadata_json = Column(Text, nullable=True)

    warehouse = relationship("Warehouse")
    location = relationship("Location")
