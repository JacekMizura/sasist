from pydantic import BaseModel
from typing import List, Optional, Any, Dict


class WarehouseMapBase(BaseModel):
    name: str = "Layout 1"
    grid_cols: int = 20
    grid_rows: int = 15


class WarehouseMapCreate(WarehouseMapBase):
    tenant_id: int
    warehouse_id: int


class WarehouseMapUpdate(BaseModel):
    name: Optional[str] = None
    grid_cols: Optional[int] = None
    grid_rows: Optional[int] = None


class MapElementBase(BaseModel):
    type: str  # rack | zone | aisle | workstation
    x: int = 0
    y: int = 0
    width: int = 1
    height: int = 1
    props: Optional[Dict[str, Any]] = None


class MapElementCreate(MapElementBase):
    map_id: Optional[int] = None  # can come from URL


class MapElementUpdate(BaseModel):
    type: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    props: Optional[Dict[str, Any]] = None


class MapElementRead(BaseModel):
    id: int
    map_id: int
    type: str
    x: int
    y: int
    width: int
    height: int
    props: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class StorageBinRead(BaseModel):
    id: int
    element_id: int
    level_index: int
    bin_index: int
    address: str
    max_volume_dm3: float
    current_volume_dm3: float
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None

    class Config:
        from_attributes = True


class WarehouseMapRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    grid_cols: int
    grid_rows: int
    elements: List[MapElementRead] = []

    class Config:
        from_attributes = True


class PathRequest(BaseModel):
    map_id: int
    start_x: float
    start_y: float
    end_x: float
    end_y: float


class PathResponse(BaseModel):
    path: List[Dict[str, float]]
    distance: float
