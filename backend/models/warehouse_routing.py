"""
Authored Warehouse Routing Graph — NEW SSOT for physical warehouse network.

Independent from legacy WarehouseNode / WarehouseEdge / LocationNode (auto-generated).
IDs are stable UUIDs; save_layout must NOT rebuild this graph.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
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


class WarehouseRoutingNode(Base, BaseModelMixin):
    """Authored routing graph vertex (junction, operational point, etc.)."""

    __tablename__ = "warehouse_routing_nodes"
    __table_args__ = (
        UniqueConstraint("uuid", name="uq_warehouse_routing_nodes_uuid"),
    )

    uuid = Column(String(36), nullable=False, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    layout_id = Column(Integer, nullable=True, index=True)
    # Coordinates in layout physical system (cm; same as layout / GRID_UNIT_CM=10).
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    # junction | operational | access
    node_type = Column(String(32), nullable=False, default="junction")
    # picking_start | packing | receiving_dock | receiving_buffer | putaway_buffer |
    # cart_parking | consolidation | end_point | null for non-operational
    operational_type = Column(String(64), nullable=True)
    label = Column(String(255), nullable=True)
    meta_json = Column(Text, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])


class WarehouseRoutingEdge(Base, BaseModelMixin):
    """Authored walkable connection between two routing nodes."""

    __tablename__ = "warehouse_routing_edges"
    __table_args__ = (
        UniqueConstraint("uuid", name="uq_warehouse_routing_edges_uuid"),
    )

    uuid = Column(String(36), nullable=False, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    layout_id = Column(Integer, nullable=True, index=True)
    from_node_uuid = Column(String(36), nullable=False, index=True)
    to_node_uuid = Column(String(36), nullable=False, index=True)
    # meters (computed from cm coordinates unless overridden)
    distance_m = Column(Float, nullable=False, default=0.0)
    # BOTH | FORWARD | BACKWARD  (FORWARD = from→to only)
    direction = Column(String(16), nullable=False, default="BOTH")
    enabled = Column(Boolean, nullable=False, default=True)
    # JSON arrays of process / transport codes; empty / null = allow all
    allowed_processes_json = Column(Text, nullable=True)
    allowed_transport_types_json = Column(Text, nullable=True)
    cost_multiplier = Column(Float, nullable=False, default=1.0)
    label = Column(String(255), nullable=True)
    meta_json = Column(Text, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])


class WarehouseRoutingAccessPoint(Base, BaseModelMixin):
    """
    Manual link: warehouse Location → routing access node.
    Cardinality: one location may have 1..N access points (e.g. both sides of a rack).
    Unique per (warehouse, location, node) — not 1:1 location→node.
    """

    __tablename__ = "warehouse_routing_access_points"
    __table_args__ = (
        UniqueConstraint("uuid", name="uq_warehouse_routing_access_points_uuid"),
        UniqueConstraint(
            "warehouse_id",
            "location_id",
            "node_uuid",
            name="uq_warehouse_routing_access_points_wh_loc_node",
        ),
    )

    uuid = Column(String(36), nullable=False, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    location_id = Column(
        Integer,
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_uuid = Column(String(36), nullable=False, index=True)
    label = Column(String(255), nullable=True)
    meta_json = Column(Text, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id])
    location = relationship("Location", foreign_keys=[location_id])


class WarehouseRoutingGraphMeta(Base):
    """Optimistic concurrency token for authored routing graph (per warehouse)."""

    __tablename__ = "warehouse_routing_graph_meta"

    warehouse_id = Column(
        Integer,
        ForeignKey("warehouses.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )
    revision = Column(Integer, nullable=False, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
