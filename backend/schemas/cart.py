"""
SCHEMAS: CART
Dynamiczne koszyki dla MULTI.
Capacity strategy is independent of Cart.status lifecycle.
"""

from pydantic import BaseModel, Field, field_validator
from enum import Enum
from typing import List, Optional


class CartType(str, Enum):
    MULTI = "MULTI"
    BULK = "BULK"


class CapacityStrategy(str, Enum):
    LIMIT_ORDERS = "LIMIT_ORDERS"
    LIMIT_VOLUME = "LIMIT_VOLUME"
    HYBRID_STOP_FIRST = "HYBRID_STOP_FIRST"
    HYBRID_STOP_VOLUME = "HYBRID_STOP_VOLUME"
    BASKETS = "BASKETS"


class OccupancyState(str, Enum):
    AVAILABLE = "AVAILABLE"
    WARNING = "WARNING"
    FULL = "FULL"
    OVERFLOW = "OVERFLOW"


# ================================
# BASKET CREATE
# ================================

class BasketCreate(BaseModel):
    name: Optional[str] = None
    row: int = Field(gt=0)
    column: int = Field(gt=0)

    length: float = Field(gt=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)

    fill_ratio: float = Field(default=0.9, gt=0, le=1)


# ================================
# MULTI CREATE
# ================================

class CartMultiCreate(BaseModel):
    name: str
    tenant_id: int
    warehouse_id: int
    group_id: Optional[int] = None
    image_url: Optional[str] = None
    code: Optional[str] = Field(default=None, max_length=64, description="Opcjonalny unikalny kod (np. CART-0001); wygenerowany gdy brak")

    baskets: List[BasketCreate]

    @field_validator("code", mode="before")
    @classmethod
    def strip_code(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None

    capacity_strategy: Optional[CapacityStrategy] = CapacityStrategy.BASKETS
    capacity_orders: Optional[int] = None
    capacity_volume: Optional[float] = None


# ================================
# BULK CREATE
# ================================

class CartBulkCreate(BaseModel):
    name: str
    tenant_id: int
    warehouse_id: int
    group_id: Optional[int] = None
    image_url: Optional[str] = None
    code: Optional[str] = Field(default=None, max_length=64, description="Opcjonalny unikalny kod (np. CART-0001); wygenerowany gdy brak")

    length: float = Field(gt=0)

    @field_validator("code", mode="before")
    @classmethod
    def strip_code_bulk(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None
    width: float = Field(gt=0)
    height: float = Field(gt=0)

    capacity_strategy: Optional[CapacityStrategy] = CapacityStrategy.LIMIT_VOLUME
    capacity_orders: Optional[int] = None
    capacity_volume: Optional[float] = None


# ================================
# UPDATE
# ================================

class CartUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = Field(default=None, max_length=64)
    warehouse_id: Optional[int] = None
    group_id: Optional[int] = None
    image_url: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    baskets: Optional[List[BasketCreate]] = None
    total_volume_dm3: Optional[float] = None
    capacity_strategy: Optional[str] = None
    capacity_orders: Optional[int] = None
    capacity_volume: Optional[float] = None

    @field_validator("code", mode="before")
    @classmethod
    def strip_code_update(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s or None


# ================================
# CART GROUP CREATE
# ================================

class CartGroupCreate(BaseModel):
    cart_type: CartType
    name: str
    description: Optional[str] = None


class CartGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


# ================================
# READ
# ================================

class CartRead(BaseModel):
    id: int
    name: str
    type: CartType
    status: Optional[str]

    class Config:
        from_attributes = True
