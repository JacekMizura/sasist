"""
SCHEMAS: CART
Dynamiczne koszyki dla MULTI.
"""

from pydantic import BaseModel, Field
from enum import Enum
from typing import List, Optional


class CartType(str, Enum):
    MULTI = "MULTI"
    BULK = "BULK"


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

    baskets: List[BasketCreate]


# ================================
# BULK CREATE
# ================================

class CartBulkCreate(BaseModel):
    name: str
    tenant_id: int
    warehouse_id: int
    group_id: Optional[int] = None
    image_url: Optional[str] = None

    length: float = Field(gt=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


# ================================
# UPDATE
# ================================

class CartUpdate(BaseModel):
    name: Optional[str] = None
    warehouse_id: Optional[int] = None
    group_id: Optional[int] = None
    image_url: Optional[str] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    baskets: Optional[List[BasketCreate]] = None
    total_volume_dm3: Optional[float] = None


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