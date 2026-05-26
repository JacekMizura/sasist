"""Packaging Intelligence — wspólny model propozycji (Smart + 3D + COMBINED)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

PackagingEngineSourceLiteral = Literal["SMART_MATCHING", "THREE_D_MATCHING", "COMBINED"]


class PackagingSuggestionOut(BaseModel):
    order_id: int = Field(..., ge=1)
    source_engine: PackagingEngineSourceLiteral
    suggested_package_id: str = Field(..., description="cartons.id (UUID)")
    package_name: str = ""
    package_dimensions: str = ""
    image_url: Optional[str] = None
    confidence_score: float = Field(..., ge=0, le=1)
    fill_percentage: Optional[float] = Field(None, ge=0, le=100, description="Szacunek objętościowy (3D)")
    reason: str = ""
    auto_assigned: bool = False
    overridden_by_user: bool = False
    assigned_by: Optional[str] = Field(None, description="Operator — gdy znany z audytu")
    assigned_at: Optional[datetime] = None


class PackagingIntelligenceDashboardOut(BaseModel):
    """Operacyjne KPI — rozszerzane o agregaty z tabel zdarzeń."""

    period_days: int = Field(default=7, ge=1, le=90)
    suggestions_total: int = Field(default=0, ge=0)
    override_rate_pct: Optional[float] = Field(None, ge=0, le=100, description="Udział ręcznych zmian vs propozycja")
    avg_confidence: Optional[float] = Field(None, ge=0, le=1)
    avg_fill_pct: Optional[float] = Field(None, ge=0, le=100)
    products_missing_dimensions: int = Field(default=0, ge=0)
    top_packages: list[dict] = Field(default_factory=list, description="[{carton_id, name, uses}]")
    failed_suggestions: int = Field(default=0, ge=0)
    note: str = Field(
        default="Szczegółowe agregaty wymagają tabeli audytu propozycji — endpoint zwraca szkielet KPI.",
    )
