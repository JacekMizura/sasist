from pydantic import BaseModel
from typing import List, Optional, Any, Literal


class BinSchema(BaseModel):
    id: Optional[int] = None
    label: str
    level_index: int
    segment_index: int
    volume_dm3: float = 0
    current_load_dm3: float = 0
    storage_type: Optional[str] = None  # "primary" | "reserve"; frontend sends these


class InternalLocationSchema(BaseModel):
    """Width in cm for one bin/location on a level."""
    width_cm: float = 40


class InternalLevelSchema(BaseModel):
    """Level (shelf) with height and list of locations (bins) by width."""
    height_cm: float = 50
    locations: List[InternalLocationSchema] = []


class InternalStructureSchema(BaseModel):
    """Nested structure: levels with heights, each level divided into locations by width_cm."""
    levels: List[InternalLevelSchema] = []


class RackSchema(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    x: int = 0   # in 10cm units
    y: int = 0   # in 10cm units
    width: int = 1
    height: int = 1
    orientation: str = "vertical"
    levels: int = 4
    bins_per_level: int = 4
    length_cm: float = 100
    width_cm: float = 80
    height_cm: float = 200
    aisle_letter: str = "A"
    rack_index: int = 1
    bins: List[BinSchema] = []
    internal_structure: Optional[Any] = None  # JSON: InternalStructureSchema serialized
    color: Optional[str] = None  # hex e.g. #eab308 for editor display; must be in schema or Pydantic strips it
    templateId: Optional[str] = None  # custom template UUID; frontend sends camelCase
    show_label: Optional[bool] = None


class AisleSchema(BaseModel):
    id: Optional[int] = None
    name: Optional[str] = None
    x: int = 0
    y: int = 0
    width: int = 1
    height: int = 1
    two_way: bool = True


class WallElementSchema(BaseModel):
    id: str
    type: Literal["door", "gate"]
    wall: Literal["north", "south", "east", "west"]
    position_cm: float
    width_cm: float
    gateType: Optional[Literal["courier", "supplier", "both"]] = None


class WarehouseLayoutPayload(BaseModel):
    name: str = "Layout 1"
    grid_cols: int = 24
    grid_rows: int = 16
    width_m: float = 24.0
    length_m: float = 16.0
    building_width_m: Optional[float] = None
    building_depth_m: Optional[float] = None
    building_height_m: Optional[float] = None
    racks: List[RackSchema] = []
    aisles: List[AisleSchema] = []
    row_containers: Optional[List[Any]] = None  # Empty row slots; [{ id, rowPrefix?, slots: [{ x,y,w,h, rackId? }] }]
    wall_elements: Optional[List[WallElementSchema]] = None
