"""Packaging Intelligence — wspólny model propozycji (Smart + 3D + COMBINED)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

PackagingEngineSourceLiteral = Literal["SMART_MATCHING", "THREE_D_MATCHING", "COMBINED"]
FitStatusLiteral = Literal["ELIGIBLE", "REJECTED", "ESTIMATED", "UNKNOWN"]


class PackagingPlanItemOut(BaseModel):
    product_id: int
    quantity: int
    label: str = ""


class PackagingPlanCartonOut(BaseModel):
    carton_id: str
    carton_name: str = ""
    usable_dimensions: Optional[dict[str, float]] = None
    items: List[PackagingPlanItemOut] = Field(default_factory=list)
    placements: List[dict[str, Any]] = Field(default_factory=list)
    weight: Optional[float] = None
    volume_utilization: Optional[float] = None
    confidence: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class PackagingFitPlanOut(BaseModel):
    """Read-only multi-carton / recommendation plan from fit_engine (not persisted as multi-select)."""

    fits: bool = False
    recommended_packaging: Optional[str] = None
    carton_count: int = 0
    method: str = ""
    confidence: str = "UNKNOWN"
    explanation: str = ""
    warnings: List[str] = Field(default_factory=list)
    plan: List[PackagingPlanCartonOut] = Field(default_factory=list)
    multi_carton_required: bool = False
    multi_carton_persistence: str = Field(
        default="SINGLE_SELECTED_CARTON_ONLY",
        description="Order stores one selected_carton_id — plan is recommendation UX only until multi-persist exists.",
    )


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
    #: Enriched fit fields (optional — backward compatible)
    fit_status: Optional[FitStatusLiteral] = None
    fit_confidence: Optional[str] = None
    usable_dimensions: Optional[str] = None
    total_weight_kg: Optional[float] = None
    max_payload_kg: Optional[float] = None
    reject_reason_code: Optional[str] = None
    reject_reason_label: Optional[str] = None
    why_selected: Optional[str] = None
    is_recommended: bool = False


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
