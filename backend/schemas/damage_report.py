from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


DamageType = Literal["mechanical", "missing_parts", "flood", "other"]
DamageReportStatus = Literal["draft", "confirmed"]
DamageEntryStatus = Literal["NEW", "REVIEWED", "INCLUDED_IN_REPORT"]
DamageDecision = Literal["SELLABLE", "REPAIR", "RETURN_TO_SUPPLIER", "DISPOSE"]


class DamageReportItemCreate(BaseModel):
    product_id: int
    location_uuid: str
    quantity: float = Field(gt=0)
    damage_type: DamageType = "other"
    description: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)


class DamageReportCreate(BaseModel):
    tenant_id: int
    warehouse_id: int
    created_by: Optional[str] = None
    items: List[DamageReportItemCreate] = Field(default_factory=list)
    entry_ids: List[int] = Field(default_factory=list)


class DamageEntryCreate(BaseModel):
    """Operational damage record (product + qty + evidence). Not an inventory movement or stock transfer."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: int
    warehouse_id: int
    product_id: int
    quantity: float = Field(gt=0)
    # Server paths under /uploads/… only; persisted `photo_url` is derived on save.
    photo_urls: List[str] = Field(default_factory=list, max_length=15)
    damage_type: str = Field(default="other", max_length=512)
    created_by: Optional[str] = None
    # Optional UI snapshot only; omit for returns before putaway — POST does not require it (no inventory check).
    location_uuid: Optional[str] = None


class DamageEntryReview(BaseModel):
    damage_type: DamageType
    description: Optional[str] = None
    decision: DamageDecision
    reviewed_by: Optional[str] = None


class DamageReportItemRead(BaseModel):
    id: int
    product_id: Optional[int] = None
    product_name: str
    sku: Optional[str] = None
    location_uuid: str
    location_label: Optional[str] = None
    quantity: float
    purchase_price: float
    total_value: float
    damage_type: DamageType
    description: Optional[str] = None
    decision: Optional[DamageDecision] = None
    image_urls: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class DamageReportRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    warehouse_name: Optional[str] = None
    report_number: str
    created_at: datetime
    created_by: Optional[str] = None
    status: DamageReportStatus
    total_value: float
    items: List[DamageReportItemRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


class DamageEntryRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    product_id: Optional[int] = None
    product_name: str
    sku: Optional[str] = None
    location_uuid: str  # may be "" when not tied to a bin
    location_label: Optional[str] = None
    quantity: float
    photo_url: str
    photo_urls: List[str] = Field(default_factory=list)
    created_at: datetime
    created_by: Optional[str] = None
    status: DamageEntryStatus
    damage_type: Optional[DamageType] = None
    description: Optional[str] = None
    decision: Optional[DamageDecision] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    purchase_price: float
    total_value: float

    class Config:
        from_attributes = True

