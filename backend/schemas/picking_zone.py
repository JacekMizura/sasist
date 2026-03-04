from pydantic import BaseModel
from typing import List, Optional


class PickingZoneBase(BaseModel):
    name: str
    capacity_volume: float = 0
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    max_weight_kg: Optional[float] = None


class PickingZoneCreate(PickingZoneBase):
    tenant_id: int
    warehouse_id: int


class PickingZoneUpdate(BaseModel):
    name: Optional[str] = None
    capacity_volume: Optional[float] = None
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    max_weight_kg: Optional[float] = None


class PickingZoneOrderRef(BaseModel):
    order_id: int
    order_number: Optional[str] = None

    class Config:
        from_attributes = True


class PickingZoneRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    name: str
    capacity_volume: float
    used_volume: float
    occupancy_percent: float
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    max_weight_kg: Optional[float] = None
    orders: List[PickingZoneOrderRef] = []

    class Config:
        from_attributes = True


class AssignOrderToZone(BaseModel):
    order_id: int
    zone_id: int


class UnassignOrderFromZone(BaseModel):
    order_id: int
    zone_id: int
