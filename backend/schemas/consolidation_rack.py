from pydantic import BaseModel
from typing import List, Optional


class RackSegmentCreate(BaseModel):
    segment_index: int
    order_id: Optional[int] = None
    fill_percent: float = 0


class RackLevelCreate(BaseModel):
    level_index: int
    name: Optional[str] = None
    is_segmented: bool = False
    segments: List[RackSegmentCreate] = []


class ConsolidationRackCreate(BaseModel):
    name: str
    tenant_id: int
    warehouse_id: int
    levels: List[RackLevelCreate] = []


class ConsolidationRackUpdate(BaseModel):
    name: Optional[str] = None


class RackSegmentRead(BaseModel):
    id: int
    level_id: int
    segment_index: int
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    fill_percent: float

    class Config:
        from_attributes = True


class RackLevelRead(BaseModel):
    id: int
    rack_id: int
    level_index: int
    name: Optional[str] = None
    is_segmented: bool
    segments: List[RackSegmentRead] = []

    class Config:
        from_attributes = True


class ConsolidationRackRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    levels: List[RackLevelRead] = []

    class Config:
        from_attributes = True


class AssignSegmentRequest(BaseModel):
    order_id: int
    fill_percent: float = 100
