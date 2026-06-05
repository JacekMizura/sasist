from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class OperationalAlertRead(BaseModel):
    id: int
    alert_type: str
    severity: str
    status: str
    title: str
    message: str | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    payload: dict[str, Any] | None = None
    created_at: datetime | None = None
