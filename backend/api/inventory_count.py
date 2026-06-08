"""ERP inventory count management API."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.inventory_count import (
    InventoryDashboardRead,
    InventoryDocumentCreateBody,
    InventoryDocumentRead,
    InventoryDocumentWizardUpdateBody,
    InventoryGenerateTasksBody,
    InventoryReportsCatalogRead,
    InventoryReportKindRead,
)
from ..services.inventory_count import (
    InventoryCountError,
    build_inventory_dashboard,
    create_inventory_document,
    generate_inventory_tasks,
    get_inventory_document,
    list_inventory_documents,
    plan_inventory_document,
    start_inventory_document,
    update_inventory_document_wizard,
)

router = APIRouter(prefix="/inventory-count", tags=["Inventory Count"])
logger = logging.getLogger(__name__)


def _map_inventory_error(exc: InventoryCountError) -> HTTPException:
    status = 404 if "not_found" in exc.code else 400
    return HTTPException(status_code=status, detail={"code": exc.code, "message": str(exc)})


@router.get("/dashboard", response_model=InventoryDashboardRead)
def inventory_count_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    return build_inventory_dashboard(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.get("/documents", response_model=List[InventoryDocumentRead])
def inventory_count_list_documents(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return list_inventory_documents(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status=status,
        limit=limit,
    )


@router.get("/documents/{document_id}", response_model=InventoryDocumentRead)
def inventory_count_get_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_inventory_document(db, tenant_id=tenant_id, document_id=document_id)
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents", response_model=InventoryDocumentRead)
def inventory_count_create_document(
    body: InventoryDocumentCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    return create_inventory_document(
        db,
        tenant_id=tenant_id,
        warehouse_id=body.warehouse_id,
        inventory_type=body.inventory_type,
        user_id=user.id if user else None,
        notes=body.notes,
    )


@router.patch("/documents/{document_id}/wizard", response_model=InventoryDocumentRead)
def inventory_count_wizard_update(
    document_id: int,
    body: InventoryDocumentWizardUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return update_inventory_document_wizard(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            inventory_type=body.inventory_type,
            filters=body.filters.model_dump() if body.filters else None,
            count_mode=body.count_mode,
            lock_mode=body.lock_mode,
            recount_required=body.recount_required,
            scan_mode=body.scan_mode,
            strategy=body.strategy.model_dump() if body.strategy else None,
            notes=body.notes,
            planned_start_at=body.planned_start_at,
            planned_end_at=body.planned_end_at,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/plan", response_model=InventoryDocumentRead)
def inventory_count_plan_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return plan_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/start", response_model=InventoryDocumentRead)
def inventory_count_start_document(
    document_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return start_inventory_document(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.post("/documents/{document_id}/generate-tasks")
def inventory_count_generate_tasks(
    document_id: int,
    body: InventoryGenerateTasksBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        return generate_inventory_tasks(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user.id if user else None,
            location_ids=body.location_ids,
        )
    except InventoryCountError as exc:
        raise _map_inventory_error(exc) from exc


@router.get("/reports/catalog", response_model=InventoryReportsCatalogRead)
def inventory_count_reports_catalog():
    """Report engine placeholder — PDF/XLSX generation in phase 2."""
    reports = [
        InventoryReportKindRead(kind="counting_sheet", label="Arkusz inwentaryzacji", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="differences", label="Różnice inwentaryzacyjne", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="missing_stock", label="Braki", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="excess_stock", label="Nadwyżki", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="adjustments", label="Korekty magazynowe", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="user_activity", label="Aktywność operatorów", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="empty_locations", label="Puste lokalizacje", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="problematic_locations", label="Problematyczne lokalizacje", formats=["pdf", "xlsx"]),
        InventoryReportKindRead(kind="valuation", label="Wycena inwentaryzacji", formats=["pdf", "xlsx"]),
    ]
    return InventoryReportsCatalogRead(reports=reports)
