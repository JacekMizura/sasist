"""WMS operational dashboard API."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.wms_dashboard import WmsDashboardSummaryOut, WmsTenantPanelCountersOut
from ..services.wms_dashboard_service import build_tenant_wms_panel_counters, build_wms_dashboard_summary

router = APIRouter(prefix="/wms", tags=["WMS dashboard"])
logger = logging.getLogger(__name__)


@router.get("/dashboard/summary", response_model=WmsDashboardSummaryOut)
def get_wms_dashboard_summary(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    try:
        return build_wms_dashboard_summary(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    except SQLAlchemyError:
        logger.exception("get_wms_dashboard_summary")
        return WmsDashboardSummaryOut(
            orders_today=0,
            orders_to_collect=0,
            packing_spakowane=0,
            packing_do_spakowania=0,
            packing_w_trakcie=0,
            packing_braki=0,
            picking_collected=0.0,
            picking_to_collect=0.0,
            packing_packed=0,
            packing_to_pack=0,
            alerts=[],
            top_picked_products=[],
        )


@router.get("/dashboard/tenant-panel-counters", response_model=WmsTenantPanelCountersOut)
def get_tenant_wms_panel_counters(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Tenant-wide Pilne/Opóźnione for ERP top bar (sum across warehouses)."""
    try:
        return build_tenant_wms_panel_counters(db, tenant_id=tenant_id)
    except SQLAlchemyError:
        logger.exception("get_tenant_wms_panel_counters")
        return WmsTenantPanelCountersOut(orders_delayed=0, packing_braki=0)
