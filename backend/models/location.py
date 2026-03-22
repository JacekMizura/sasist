"""
MODEL: Location

Logical location within a warehouse (pick | reserve | floor).
Warehouse hasMany Locations; Location belongsTo Warehouse.

Coordinates (x, y, z) and dimensions (width, depth, height) are stored in centimeters.
Locations represent real storage bins in the warehouse.
"""

from sqlalchemy import Column, String, Integer, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


class Location(Base, BaseModelMixin):
    __tablename__ = "locations"

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String, nullable=False)
    location_uuid = Column(String(64), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    type = Column(String(20), nullable=False, default="pick")  # pick | reserve | floor

    # Structural coordinates (optional). When set, avoid parsing name for ordering/labels. Backfill from Bin when available.
    rack_name = Column(String(50), nullable=True)
    level = Column(Integer, nullable=True)
    position = Column(Integer, nullable=True)
    bin = Column(String(20), nullable=True)
    width = Column(Float, nullable=True)
    depth = Column(Float, nullable=True)
    height = Column(Float, nullable=True)

    # Physical position in warehouse (for walking-cost, route simulation, heatmaps). Stored in centimeters.
    x = Column(Float, nullable=True)
    y = Column(Float, nullable=True)
    z = Column(Float, nullable=True)

    # location_type: NORMAL | PICK_START | PACKING | DOCK (standard storage, route start, packing station, shipping dock)
    location_type = Column(
        String(20),
        nullable=False,
        default="NORMAL",
        server_default="NORMAL",
    )

    # Nearest walking-graph node (aisle/intersection). Set by assign_locations_to_graph_nodes.
    graph_node_id = Column(
        Integer,
        ForeignKey("warehouse_nodes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Order along the warehouse picking path. Used to select pick location by path order (not nearest).
    pick_sequence = Column(Integer, nullable=True, index=True)

    warehouse = relationship("Warehouse", back_populates="locations")
    inventory = relationship(
        "Inventory",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    inventory_units = relationship(
        "InventoryUnit",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    picks = relationship(
        "Pick",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    stock = relationship(
        "Stock",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    stock_reservations = relationship(
        "StockReservation",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    pick_tasks = relationship(
        "PickTask",
        back_populates="location",
        cascade="all, delete-orphan",
    )
