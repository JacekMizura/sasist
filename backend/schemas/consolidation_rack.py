from pydantic import BaseModel, Field
from typing import List, Optional


class RackSegmentCreate(BaseModel):
    segment_index: int
    order_id: Optional[int] = None
    fill_percent: float = 0
    slot_label: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None


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


class RackSegmentUpdate(BaseModel):
    slot_label: Optional[str] = Field(None, max_length=64, description="Custom slot name e.g. A1, TV-01")
    length_mm: Optional[float] = Field(None, ge=0)
    width_mm: Optional[float] = Field(None, ge=0)
    height_mm: Optional[float] = Field(None, ge=0)


class RackSegmentRead(BaseModel):
    id: int
    level_id: int
    segment_index: int
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    fill_percent: float
    slot_label: Optional[str] = None
    effective_slot_label: Optional[str] = None
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    capacity_dm3: Optional[float] = None

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
