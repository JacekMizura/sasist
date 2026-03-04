"""
Warehouse Designer – physical layout engine.

WarehouseMap: one grid per warehouse (rows × cols).
MapElement: racks, zones (gabaryty), aisles, workstations – each has (x, y, width, height).
StorageBin: each bin in a rack linked to a location; capacity tracking for bin packing.
"""

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.orm import relationship
from ..database import Base

# Rack types for bin packing and UI
RACK_TYPE_PICKING = "picking"
RACK_TYPE_PALLET = "pallet"
RACK_TYPE_CONSOLIDATION = "consolidation"

ELEMENT_TYPE_RACK = "rack"
ELEMENT_TYPE_ZONE = "zone"
ELEMENT_TYPE_AISLE = "aisle"
ELEMENT_TYPE_WORKSTATION = "workstation"


class WarehouseMap(Base):
    __tablename__ = "warehouse_maps"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    name = Column(String, nullable=False, default="Layout 1")
    grid_cols = Column(Integer, nullable=False, default=20)
    grid_rows = Column(Integer, nullable=False, default=15)

    elements = relationship("MapElement", back_populates="map", cascade="all, delete-orphan")


class MapElement(Base):
    __tablename__ = "map_elements"

    id = Column(Integer, primary_key=True)
    map_id = Column(Integer, ForeignKey("warehouse_maps.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)  # rack | zone | aisle | workstation
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False, default=1)
    height = Column(Integer, nullable=False, default=1)
    # JSON: rack = {levels, bins_per_level, depth_cm, width_cm, height_cm, rack_type, aisle_letter}
    #       zone = {}, workstation = {}, aisle = {in_out_points: [[x,y],...]}
    props = Column(Text, nullable=True)

    map = relationship("WarehouseMap", back_populates="elements")
    bins = relationship("StorageBin", back_populates="element", cascade="all, delete-orphan")


class StorageBin(Base):
    __tablename__ = "storage_bins"

    id = Column(Integer, primary_key=True)
    element_id = Column(Integer, ForeignKey("map_elements.id", ondelete="CASCADE"), nullable=False)
    level_index = Column(Integer, nullable=False)
    bin_index = Column(Integer, nullable=False)
    address = Column(String, nullable=False)  # A-01-04 (Aisle-Rack-Level-Bin)
    max_volume_dm3 = Column(Float, nullable=False, default=0)
    current_volume_dm3 = Column(Float, nullable=False, default=0)
    pos_x = Column(Float, nullable=True)  # physical center for pathfinding
    pos_y = Column(Float, nullable=True)

    element = relationship("MapElement", back_populates="bins")
