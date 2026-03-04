"""
Pydantic schemas dla StorageUnit (rack / zone).
"""

from pydantic import BaseModel, Field
from typing import List


# =============================
# INPUT
# =============================

class LevelInput(BaseModel):
    length: float
    width: float
    height: float


class SlotInput(BaseModel):
    length: float
    width: float
    height: float


class RackCreate(BaseModel):
    name: str
    levels: List[LevelInput] = Field(default_factory=list)


class ZoneCreate(BaseModel):
    name: str
    slots: List[SlotInput] = Field(default_factory=list)


# =============================
# OUTPUT
# =============================

class RackLevelRead(BaseModel):
    id: int
    level_number: int
    length: float
    width: float
    height: float
    volume: float

    class Config:
        from_attributes = True


class ZoneSlotRead(BaseModel):
    id: int
    slot_number: int
    length: float
    width: float
    height: float
    volume: float

    class Config:
        from_attributes = True


class StorageUnitRead(BaseModel):
    id: int
    name: str
    type: str

    levels: List[RackLevelRead] = []
    slots: List[ZoneSlotRead] = []

    class Config:
        from_attributes = True
