"""
MODEL: Warehouse

Warehouse: tenant's warehouse (hall).
WarehouseLayout: name and dimensions of the hall (grid-based layout).
Rack: linked to layout, X/Y coordinates, orientation, number of levels.
Bin: smallest unit (location); label (e.g. A-01-01), volume, current load.
"""

from sqlalchemy import Column, String, ForeignKey, Integer, Float, Text, Boolean
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


# Grid: 1 unit = 10 cm. x, y on Rack are in 10cm units.
GRID_UNIT_CM = 10


class Warehouse(Base, BaseModelMixin):
    __tablename__ = "warehouses"

    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    type = Column(String(20), nullable=True, default="own")  # own | fulfilment

    # Optional legacy/primary tenant; access control is via tenant_warehouses (many-to-many).
    tenant_id = Column(
        ForeignKey("tenants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Picking start position (packing station / picker start). Used for walking-cost simulation.
    start_x = Column(Float, nullable=True, default=0)
    start_y = Column(Float, nullable=True, default=0)

    # P2.5C: True = WMS with DOCK-IN + putaway; False = simple warehouse (receive → STOCK).
    requires_putaway = Column(Boolean, nullable=False, default=True, server_default="1")

    tenant_warehouses = relationship(
        "TenantWarehouse",
        back_populates="warehouse",
        cascade="all, delete-orphan",
        foreign_keys="TenantWarehouse.warehouse_id",
    )

    carts = relationship(
        "Cart",
        back_populates="warehouse",
        cascade="all, delete"
    )

    storage_units = relationship(
        "StorageUnit",
        back_populates="warehouse",
        cascade="all, delete"
    )

    layouts = relationship(
        "WarehouseLayout",
        back_populates="warehouse",
        cascade="all, delete"
    )

    locations = relationship(
        "Location",
        back_populates="warehouse",
        cascade="all, delete-orphan",
        foreign_keys="Location.warehouse_id",
    )

    inventory = relationship(
        "Inventory",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )

    inventory_units = relationship(
        "InventoryUnit",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )

    pick_waves = relationship(
        "PickWave",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )

    picks = relationship(
        "Pick",
        back_populates="warehouse",
    )

    stock = relationship(
        "Stock",
        back_populates="warehouse",
        cascade="all, delete-orphan",
    )


class WarehouseLayout(Base, BaseModelMixin):
    """Stores the name and dimensions of the hall (grid-based: each cell e.g. 1 m × 1 m)."""
    __tablename__ = "warehouse_layouts"

    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False, default="Layout 1")
    width_m = Column(Float, nullable=False, default=24.0)
    length_m = Column(Float, nullable=False, default=16.0)
    grid_cols = Column(Integer, nullable=False, default=24)
    grid_rows = Column(Integer, nullable=False, default=16)
    row_containers_json = Column(Text, nullable=True)  # JSON: list of row containers (empty slots)
    visual_elements_json = Column(Text, nullable=True)  # JSON: list of visual canvas elements
    wall_elements_json = Column(Text, nullable=True)  # JSON: list of WallElement (doors/gates on perimeter)
    building_width_m = Column(Float, nullable=True)
    building_depth_m = Column(Float, nullable=True)
    building_height_m = Column(Float, nullable=True)

    warehouse = relationship("Warehouse", back_populates="layouts")
    racks = relationship("Rack", back_populates="layout", cascade="all, delete-orphan")
    aisles = relationship("Aisle", back_populates="layout", cascade="all, delete-orphan")


class Rack(Base, BaseModelMixin):
    """Linked to layout; X, Y in 10cm units; orientation; dimensions in cm; levels and bins; internal_structure JSON."""
    __tablename__ = "warehouse_layout_racks"

    layout_id = Column(Integer, ForeignKey("warehouse_layouts.id", ondelete="CASCADE"), nullable=False)
    uuid = Column(String(64), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    rack_type = Column(String(32), nullable=False, default="warehouse")
    name = Column(String, nullable=True)
    x = Column(Integer, nullable=False)  # in 10cm units
    y = Column(Integer, nullable=False)  # in 10cm units
    width = Column(Integer, nullable=False, default=1)   # grid cells (10cm each) along one axis
    height = Column(Integer, nullable=False, default=1)  # grid cells along the other
    orientation = Column(String, nullable=False, default="vertical")
    levels = Column(Integer, nullable=False, default=4)
    bins_per_level = Column(Integer, nullable=False, default=4)
    length_cm = Column(Float, nullable=False, default=100.0)
    width_cm = Column(Float, nullable=False, default=80.0)
    height_cm = Column(Float, nullable=False, default=200.0)
    aisle_letter = Column(String, nullable=False, default="A")
    rack_index = Column(Integer, nullable=False, default=1)
    internal_structure = Column(Text, nullable=True)  # JSON: { "levels": [ { "height_cm": 50, "locations": [ { "width_cm": 40 } ] } ] }
    color = Column(String(32), nullable=True)  # e.g. "#3b82f6" for editor display
    template_id = Column(String(64), nullable=True)  # custom template UUID from frontend

    layout = relationship("WarehouseLayout", back_populates="racks")
    bins = relationship("Bin", back_populates="rack", cascade="all, delete-orphan")


class Aisle(Base, BaseModelMixin):
    """Aisle (alejka): area between racks. Two-way or one-way for pathfinding."""
    __tablename__ = "warehouse_aisles"

    layout_id = Column(Integer, ForeignKey("warehouse_layouts.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=True)
    x = Column(Integer, nullable=False)
    y = Column(Integer, nullable=False)
    width = Column(Integer, nullable=False, default=1)
    height = Column(Integer, nullable=False, default=1)
    two_way = Column(Integer, nullable=False, default=1)  # 1 = two-way, 0 = one-way

    layout = relationship("WarehouseLayout", back_populates="aisles")


class Bin(Base, BaseModelMixin):
    """The smallest unit (location). Label e.g. A-01-01, volume (max), current load. storage_type is a free-form string normalized by the service layer."""
    __tablename__ = "warehouse_bins"

    rack_id = Column(Integer, ForeignKey("warehouse_layout_racks.id", ondelete="CASCADE"), nullable=False)
    location_uuid = Column(String(64), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    label = Column(String, nullable=False)
    barcode = Column(String(64), unique=True, nullable=True, index=True)  # LOC-{rack}-{level}-{bin} e.g. LOC-A01-03-02
    #: Wewnętrzny kod skanowania lokalizacji (ESP:sh:id); unikat globalnie — indeks w schema_upgrade.
    scan_code = Column(String(80), nullable=True, index=True)
    level_index = Column(Integer, nullable=False)
    segment_index = Column(Integer, nullable=False)
    volume_dm3 = Column(Float, nullable=False, default=0)
    current_load_dm3 = Column(Float, nullable=False, default=0)
    storage_type = Column(String(32), nullable=True, default="primary")  # normalized: primary | pick | buffer | reserve | damaged | unknown

    rack = relationship("Rack", back_populates="bins")


class StorageLocation(Base, BaseModelMixin):
    """Physical coordinates for each bin; synced when layout is saved. x_cm, y_cm, z_cm in warehouse space."""
    __tablename__ = "storage_locations"

    warehouse_id = Column(Integer, ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)
    rack_id = Column(Integer, ForeignKey("warehouse_layout_racks.id", ondelete="CASCADE"), nullable=False)
    bin_id = Column(Integer, ForeignKey("warehouse_bins.id", ondelete="CASCADE"), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    x_cm = Column(Float, nullable=False, default=0)
    y_cm = Column(Float, nullable=False, default=0)
    z_cm = Column(Float, nullable=False, default=0)
