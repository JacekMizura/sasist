"""Packaging Intelligence — dashboard i rozszerzenia API (WMS)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.packaging_intelligence import PackagingIntelligenceDashboardOut

router = APIRouter(prefix="/wms", tags=["Packaging Intelligence"])
logger = logging.getLogger(__name__)


@router.get("/packaging-intelligence/dashboard", response_model=PackagingIntelligenceDashboardOut)
def get_packaging_intelligence_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    period_days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """
    Operacyjne KPI dopasowania opakowań.

    Pełne agregaty (override rate, accuracy) wymagają tabeli zdarzeń silnika — obecnie zwracany jest szkielet.
    """
    _ = db  # rezerwacja na zapytania agregujące
    return PackagingIntelligenceDashboardOut(
        period_days=period_days,
        suggestions_total=0,
        override_rate_pct=None,
        avg_confidence=None,
        avg_fill_pct=None,
        products_missing_dimensions=0,
        top_packages=[],
        failed_suggestions=0,
        note="Podłącz tabele audytu propozycji (packaging_suggestion_events) aby wypełnić KPI.",
    )
