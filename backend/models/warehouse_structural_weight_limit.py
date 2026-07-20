"""Optional shared shelf/rack weight limits keyed by Location soft structure."""

from __future__ import annotations

from sqlalchemy import Column, Float, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base
from .base import BaseModelMixin


class WarehouseStructuralWeightLimit(Base, BaseModelMixin):
    """
    Shared physical weight budget for a rack or a rack level (shelf).

    - level IS NULL → whole-rack max weight
    - level IS NOT NULL → shelf/level max weight for that rack_name + level

    Matches Location.rack_name / Location.level within warehouse_id.
    """

    __tablename__ = "warehouse_structural_weight_limits"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_id",
            "rack_name",
            "level",
            name="uq_structural_weight_wh_rack_level",
        ),
    )

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rack_name = Column(String(50), nullable=False, index=True)
    #: NULL = whole rack; integer = shelf/level matching Location.level
    level = Column(Integer, nullable=True, index=True)
    max_weight_kg = Column(Float, nullable=False)
