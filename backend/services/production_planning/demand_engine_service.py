"""Backward-compatible entry — delegates to PlanningService."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...schemas.production_planning import ProductionDemandPlanningRead
from .planning_service import get_production_demand_planning as get_production_demand_planning

__all__ = ["get_production_demand_planning"]
