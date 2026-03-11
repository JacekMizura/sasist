"""
MODEL: Warehouse graph (navigation)

WarehouseNode: graph vertices (intersections, aisle entries, packing stations).
WarehouseEdge: walkable paths between nodes (distance_m).
LocationNode: links each storage Location to the nearest graph node.

Used for: walking distance, optimal picking routes, workload simulation, slotting.
"""

from sqlalchemy import Column, Integer, Float, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base
from .base import BaseModelMixin


# Node type values for WarehouseNode.type
NODE_TYPE_INTERSECTION = "intersection"
NODE_TYPE_AISLE_ENTRY = "aisle_entry"
NODE_TYPE_PACKING = "packing"
NODE_TYPE_CHARGING = "charging"
NODE_TYPE_OTHER = "other"


class WarehouseNode(Base, BaseModelMixin):
    """Graph node: intersection, aisle entry, packing station, etc."""
    __tablename__ = "warehouse_nodes"

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    type = Column(String(32), nullable=False, default=NODE_TYPE_INTERSECTION)
    # type: intersection | aisle_entry | packing | charging | other

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    edges_from = relationship(
        "WarehouseEdge",
        foreign_keys="WarehouseEdge.node_from_id",
        back_populates="node_from",
        cascade="all, delete-orphan",
    )
    edges_to = relationship(
        "WarehouseEdge",
        foreign_keys="WarehouseEdge.node_to_id",
        back_populates="node_to",
        cascade="all, delete-orphan",
    )
    location_nodes = relationship(
        "LocationNode",
        back_populates="node",
        cascade="all, delete-orphan",
    )


class WarehouseEdge(Base, BaseModelMixin):
    """Walkable path between two nodes. distance_m in meters."""
    __tablename__ = "warehouse_edges"

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_from_id = Column(
        Integer,
        ForeignKey("warehouse_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_to_id = Column(
        Integer,
        ForeignKey("warehouse_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    distance_m = Column(Float, nullable=False)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    node_from = relationship("WarehouseNode", foreign_keys=[node_from_id], back_populates="edges_from")
    node_to = relationship("WarehouseNode", foreign_keys=[node_to_id], back_populates="edges_to")


class LocationNode(Base, BaseModelMixin):
    """Attaches a storage Location to the nearest graph node."""
    __tablename__ = "location_nodes"

    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id = Column(
        Integer,
        ForeignKey("warehouse_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    __table_args__ = (UniqueConstraint("location_id", name="uq_location_nodes_location_id"),)

    location = relationship("Location", foreign_keys=[location_id])
    node = relationship("WarehouseNode", back_populates="location_nodes")
