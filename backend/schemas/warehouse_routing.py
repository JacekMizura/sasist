"""Pydantic schemas for authored Warehouse Routing Graph."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RoutingNodeIn(BaseModel):
    uuid: str
    x: float
    y: float
    node_type: str = "junction"
    operational_type: Optional[str] = None
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingEdgeIn(BaseModel):
    uuid: str
    from_node_uuid: str
    to_node_uuid: str
    distance_m: Optional[float] = None
    direction: str = "BOTH"
    enabled: bool = True
    allowed_processes: list[str] = Field(default_factory=list)
    allowed_transport_types: list[str] = Field(default_factory=list)
    cost_multiplier: float = 1.0
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingAccessPointIn(BaseModel):
    uuid: str
    location_id: int
    node_uuid: str
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingGraphReplaceRequest(BaseModel):
    """Full graph replace (identity by UUID). Does not touch physical layout."""

    layout_id: Optional[int] = None
    """Client revision from last GET; omit only for first create. Mismatch → 409."""
    expected_revision: Optional[int] = None
    nodes: list[RoutingNodeIn] = Field(default_factory=list)
    edges: list[RoutingEdgeIn] = Field(default_factory=list)
    access_points: list[RoutingAccessPointIn] = Field(default_factory=list)


class RoutingNodeOut(BaseModel):
    uuid: str
    warehouse_id: int
    layout_id: Optional[int] = None
    x: float
    y: float
    node_type: str
    operational_type: Optional[str] = None
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingEdgeOut(BaseModel):
    uuid: str
    warehouse_id: int
    layout_id: Optional[int] = None
    from_node_uuid: str
    to_node_uuid: str
    distance_m: float
    direction: str
    enabled: bool
    allowed_processes: list[str] = Field(default_factory=list)
    allowed_transport_types: list[str] = Field(default_factory=list)
    cost_multiplier: float = 1.0
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingAccessPointOut(BaseModel):
    uuid: str
    warehouse_id: int
    location_id: int
    node_uuid: str
    label: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class RoutingGraphOut(BaseModel):
    warehouse_id: int
    layout_id: Optional[int] = None
    revision: int = 1
    nodes: list[RoutingNodeOut] = Field(default_factory=list)
    edges: list[RoutingEdgeOut] = Field(default_factory=list)
    access_points: list[RoutingAccessPointOut] = Field(default_factory=list)
    configured: bool = False


class RouteComputeRequest(BaseModel):
    start_node_uuid: str
    destination_node_uuid: str
    process_type: Optional[str] = None
    transport_type: Optional[str] = None


class RoutePathPoint(BaseModel):
    node_uuid: str
    x: float
    y: float


class RoutePathSegment(BaseModel):
    edge_uuid: str
    from_node_uuid: str
    to_node_uuid: str
    distance_m: float
    cost: float


class RouteComputeResponse(BaseModel):
    ok: bool
    error_code: Optional[str] = None
    message: Optional[str] = None
    nodes: list[RoutePathPoint] = Field(default_factory=list)
    path_segments: list[RoutePathSegment] = Field(default_factory=list)
    distance_m: Optional[float] = None
    cost: Optional[float] = None
    hop_count: int = 0


class ValidationIssue(BaseModel):
    code: str
    severity: str = "error"  # error | warning
    message: str
    ref_uuid: Optional[str] = None


class RoutingValidationResult(BaseModel):
    ok: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
