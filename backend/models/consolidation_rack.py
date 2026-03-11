"""
ConsolidationRack – regał kompletacyjny (tylko dla zamówień wieloelementowych).
Poziomy (Level) mogą być jednym segmentem lub podzielone na segmenty.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from ..database import Base


class ConsolidationRack(Base):
    __tablename__ = "consolidation_racks"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    name = Column(String, nullable=False)

    levels = relationship("ConsolidationRackLevel", back_populates="rack", cascade="all, delete-orphan")


class ConsolidationRackLevel(Base):
    __tablename__ = "consolidation_rack_levels"

    id = Column(Integer, primary_key=True)
    rack_id = Column(Integer, ForeignKey("consolidation_racks.id", ondelete="CASCADE"), nullable=False)
    level_index = Column(Integer, nullable=False)
    name = Column(String, nullable=True)
    is_segmented = Column(Boolean, default=False)  # True = poziom podzielony na segmenty

    rack = relationship("ConsolidationRack", back_populates="levels")
    segments = relationship("RackSegment", back_populates="level", cascade="all, delete-orphan")


class RackSegment(Base):
    __tablename__ = "rack_segments"

    id = Column(Integer, primary_key=True)
    level_id = Column(Integer, ForeignKey("consolidation_rack_levels.id", ondelete="CASCADE"), nullable=False)
    segment_index = Column(Integer, nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    fill_percent = Column(Float, default=0)  # 0–100

    level = relationship("ConsolidationRackLevel", back_populates="segments")
