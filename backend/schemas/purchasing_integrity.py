"""GET /purchasing/integrity-audit — data quality flags for purchasing + warehouse links."""

from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel, Field


class PurchasingIntegrityAuditOut(BaseModel):
    tenant_id: int
    issue_count: int = Field(..., description="Number of distinct issue categories with ≥1 hit.")
    issues: List[Dict[str, Any]] = Field(default_factory=list, description="Structured findings (codes + samples).")
