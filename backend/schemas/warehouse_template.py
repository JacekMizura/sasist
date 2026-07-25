from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class TemplatePassageDefaultSchema(BaseModel):
    """Config-only passage default on a rack template (not runtime SSOT)."""

    offset_along_cm: float = 0
    width_cm: float = 100
    clearance_height_cm: Optional[float] = None
    enabled: bool = True


class WarehouseTemplatePayload(BaseModel):
    id: str
    name: str
    color: str = "#3b82f6"
    width_cm: float = 120
    depth_cm: float = 80
    height_cm: float = 200
    levels: int = 4
    bins_per_level: int = 4
    aisle_letter: str = "A"
    rowId: Optional[str] = None
    sectionStartIndex: Optional[int] = 1
    nextSectionIndex: Optional[int] = None
    addressPattern: Optional[str] = None
    naming_pattern: Optional[str] = None
    binNamingType: str = "numeric"
    autoSectionNumbering: bool = False
    bin_type_map: Optional[Dict[str, str]] = None
    reserve_bin_keys: Optional[List[str]] = None
    level_max_load_kg: Optional[float] = None
    default_passages: Optional[List[TemplatePassageDefaultSchema]] = Field(default=None)


class WarehouseTemplateResponse(BaseModel):
    id: str
    name: str
    color: str
    width_cm: float
    depth_cm: float
    height_cm: float
    levels: int
    bins_per_level: int
    aisle_letter: str
    rowId: Optional[str] = None
    sectionStartIndex: Optional[int] = None
    nextSectionIndex: Optional[int] = None
    addressPattern: Optional[str] = None
    naming_pattern: Optional[str] = None
    binNamingType: str
    autoSectionNumbering: bool
    bin_type_map: Optional[Dict[str, str]] = None
    reserve_bin_keys: Optional[List[str]] = None
    level_max_load_kg: Optional[float] = None
    default_passages: Optional[List[TemplatePassageDefaultSchema]] = None

    class Config:
        from_attributes = True
