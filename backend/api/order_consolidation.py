"""P5 — order consolidation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..schemas.order_consolidation import (
    CancelConsolidationRequest,
    ChangeTargetWarehouseRequest,
    ConsolidationActionResponse,
    ConsolidationAlertListOut,
    ConsolidationAlertRead,
    ConsolidationFeasibilityRead,
    ConsolidationPlanRead,
    GenerateConsolidationPlanResponse,
    GenerateMmDraftsResponse,
    RecoveryActionRequest,
    StageItemResponse,
    StartStagingResponse,
    WarehouseFeasibilityRead,
)
from ..services.order_consolidation.alert_service import (
    ConsolidationAlertError,
    apply_recovery_action,
    cancel_consolidation_plan,
    change_consolidation_target_warehouse,
)
from ..services.order_consolidation.feasibility_service import (
    OrderConsolidationFeasibilityError,
    analyze_order_consolidation_feasibility,
)
from ..services.order_consolidation.plan_service import (
    OrderConsolidationPlanError,
    generate_consolidation_plan,
    generate_mm_drafts_for_plan,
    get_order_consolidation_plan_read,
)
from ..services.order_consolidation.staging_service import (
    ConsolidationNoFreeShelfError,
    ConsolidationStagingError,
    stage_plan_item,
    start_consolidation_staging,
)
from ..models.order_consolidation_plan import OrderConsolidationPlan

router = APIRouter(tags=["Order consolidation"])

_orders_perm = require_any_permission("orders.read", "orders.write", "warehouse.operations")


def _assert_order_access(order: Order | None, tenant_id: int | None = None) -> Order:
    if order is None:
        raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
    if tenant_id is not None and int(order.tenant_id) != int(tenant_id):
        raise HTTPException(status_code=404, detail="Zamówienie nie istnieje.")
    return order


@router.get("/orders/{order_id}/consolidation-feasibility", response_model=ConsolidationFeasibilityRead)
def get_order_consolidation_feasibility(
    order_id: int,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    order = _assert_order_access(db.query(Order).filter(Order.id == int(order_id)).first())
    try:
        result = analyze_order_consolidation_feasibility(db, int(order.id))
    except OrderConsolidationFeasibilityError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConsolidationFeasibilityRead(
        order_id=result.order_id,
        tenant_id=result.tenant_id,
        warehouses=[WarehouseFeasibilityRead(**r.__dict__) for r in result.warehouses],
        best_consolidation_candidate=result.best_consolidation_candidate,
        best_consolidation_candidate_name=result.best_consolidation_candidate_name,
        single_warehouse_fulfillment_id=result.single_warehouse_fulfillment_id,
        single_warehouse_fulfillment_name=result.single_warehouse_fulfillment_name,
        manual_review_required=result.manual_review_required,
        message=result.message,
    )


@router.post("/orders/{order_id}/generate-consolidation-plan", response_model=GenerateConsolidationPlanResponse)
def post_generate_consolidation_plan(
    order_id: int,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    order = _assert_order_access(db.query(Order).filter(Order.id == int(order_id)).first())
    try:
        result = generate_consolidation_plan(db, int(order.id))
        db.commit()
    except OrderConsolidationPlanError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GenerateConsolidationPlanResponse(
        outcome=result.outcome,
        message=result.message,
        plan_id=result.plan_id,
        target_warehouse_id=result.target_warehouse_id,
        target_warehouse_name=result.target_warehouse_name,
        feasibility=result.feasibility,
    )


@router.get("/orders/{order_id}/consolidation-plan", response_model=ConsolidationPlanRead | None)
def get_order_consolidation_plan(
    order_id: int,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    order = _assert_order_access(db.query(Order).filter(Order.id == int(order_id)).first())
    payload = get_order_consolidation_plan_read(db, int(order.id))
    if payload is None:
        return None
    db.commit()
    return ConsolidationPlanRead(**payload)


consolidation_plans_router = APIRouter(prefix="/consolidation-plans", tags=["Order consolidation"])


@consolidation_plans_router.post("/{plan_id}/generate-mm-drafts", response_model=GenerateMmDraftsResponse)
def post_generate_mm_drafts(
    plan_id: int,
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        result = generate_mm_drafts_for_plan(db, int(plan_id))
        db.commit()
    except OrderConsolidationPlanError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GenerateMmDraftsResponse(
        plan_id=result.plan_id,
        documents_created=result.documents_created,
        items_updated=result.items_updated,
    )


@consolidation_plans_router.post("/{plan_id}/change-target-warehouse", response_model=ConsolidationActionResponse)
def post_change_target_warehouse(
    plan_id: int,
    body: ChangeTargetWarehouseRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        plan = change_consolidation_target_warehouse(
            db,
            plan_id=int(plan_id),
            tenant_id=int(tenant_id),
            warehouse_id=int(body.warehouse_id),
            reason=body.reason,
        )
        db.commit()
    except ConsolidationAlertError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConsolidationActionResponse(
        plan_id=int(plan.id),
        status=str(plan.status),
        message="Zmieniono magazyn docelowy.",
    )


@consolidation_plans_router.post("/{plan_id}/cancel", response_model=ConsolidationActionResponse)
def post_cancel_consolidation(
    plan_id: int,
    body: CancelConsolidationRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        plan = cancel_consolidation_plan(
            db,
            plan_id=int(plan_id),
            tenant_id=int(tenant_id),
            reason=body.reason,
        )
        db.commit()
    except ConsolidationAlertError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConsolidationActionResponse(
        plan_id=int(plan.id),
        status=str(plan.status),
        message="Anulowano plan konsolidacji.",
    )


@consolidation_plans_router.post(
    "/{plan_id}/items/{plan_item_id}/recovery",
    response_model=ConsolidationActionResponse,
)
def post_recovery_action(
    plan_id: int,
    plan_item_id: int,
    body: RecoveryActionRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        alert = apply_recovery_action(
            db,
            plan_id=int(plan_id),
            plan_item_id=int(plan_item_id),
            tenant_id=int(tenant_id),
            action=body.action,
            note=body.note,
        )
        plan = db.query(OrderConsolidationPlan).filter(OrderConsolidationPlan.id == int(plan_id)).first()
        db.commit()
    except ConsolidationAlertError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConsolidationActionResponse(
        plan_id=int(plan_id),
        status=str(plan.status) if plan else "UNKNOWN",
        message=str(alert.message),
    )


@consolidation_plans_router.post("/{plan_id}/start-staging", response_model=StartStagingResponse)
def post_start_consolidation_staging(
    plan_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        payload = start_consolidation_staging(db, plan_id=int(plan_id), tenant_id=int(tenant_id))
        db.commit()
    except ConsolidationNoFreeShelfError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail={"code": exc.code, "error": str(exc)},
        ) from exc
    except ConsolidationStagingError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StartStagingResponse(**payload)


@consolidation_plans_router.post(
    "/{plan_id}/items/{plan_item_id}/stage",
    response_model=StageItemResponse,
)
def post_stage_consolidation_item(
    plan_id: int,
    plan_item_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_orders_perm),
):
    try:
        payload = stage_plan_item(
            db,
            plan_id=int(plan_id),
            plan_item_id=int(plan_item_id),
            tenant_id=int(tenant_id),
        )
        db.commit()
    except ConsolidationStagingError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StageItemResponse(**payload)
