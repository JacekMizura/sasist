from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional


class ProductInOrder(BaseModel):
    id: int
    name: Optional[str] = None
    ean: Optional[str] = None
    symbol: Optional[str] = None
    weight: Optional[float] = None
    volume: Optional[float] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    image_url: Optional[str] = None

    class Config:
        from_attributes = True


class OrderItemRead(BaseModel):
    id: int
    quantity: int
    product: ProductInOrder
    unit_volume_dm3: Optional[float] = None
    line_total_weight: Optional[float] = None

    class Config:
        from_attributes = True


class OrderRead(BaseModel):
    id: int
    number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None
    items: List[OrderItemRead]
    total_volume: Optional[float] = None
    is_multi_item: bool = False

    class Config:
        from_attributes = True


class OrderListRead(BaseModel):
    id: int
    number: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None
    order_date: Optional[datetime] = None
    value: Optional[float] = None
    created_at: Optional[datetime] = None
    source: Optional[str] = None
    shipping_method: Optional[str] = None
    currency: Optional[str] = None
    total_volume: Optional[float] = None
    is_multi_item: bool = False
    total_items: int = 0  # suma quantity (sztuk)
    position_count: int = 0  # liczba pozycji (unikalnych SKU)

    class Config:
        from_attributes = True