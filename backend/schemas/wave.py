from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class WaveCreate(BaseModel):
    """Body for creating a wave (optional overrides)."""
    wave_size: Optional[int] = 80
    algorithm: Optional[str] = "fifo"  # fifo | location_clustering
    max_orders_per_wave: Optional[int] = None  # for location_clustering, default 8


class WaveRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    created_at: Optional[datetime] = None
    status: str
    orders_count: int
    locations_count: Optional[int] = None
    estimated_distance: Optional[float] = None
    estimated_picking_time: Optional[float] = None

    class Config:
        from_attributes = True


class WaveListRead(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    status: str
    orders_count: int
    carts_count: Optional[int] = None
    locations_count: Optional[int] = None
    estimated_distance: Optional[float] = None
    estimated_picking_time: Optional[float] = None

    class Config:
        from_attributes = True
