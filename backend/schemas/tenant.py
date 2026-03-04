"""
SCHEMAS: Tenant

Warstwa Pydantic (API layer).
Brak logiki biznesowej.
"""

from pydantic import BaseModel, ConfigDict
from datetime import datetime


class TenantCreate(BaseModel):
    name: str


class TenantRead(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
