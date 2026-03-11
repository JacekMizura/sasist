from pydantic import BaseModel
from typing import Any, Optional


class ScanRequest(BaseModel):
    barcode: str


class ScanResponse(BaseModel):
    type: Optional[str] = None  # product | location | cart | basket | order | pallet
    id: Optional[int] = None
    additional_data: dict[str, Any] = {}
