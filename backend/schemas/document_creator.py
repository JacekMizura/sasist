"""Creator metadata on stock / WMS documents."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DocumentCreatedByRead(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[int] = None
    login: Optional[str] = None
    full_name: str = Field(default="System", serialization_alias="fullName")
