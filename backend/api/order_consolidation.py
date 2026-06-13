"""P5 — order consolidation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.deps import require_any_permission
from ..database import get_db
from ..models.app_user import AppUser
from ..models.order import Order
from ..schemas.order_consolidation import (
    ConsolidationFeasibilityRead,
    ConsolidationPlanRead,
    GenerateConsolidationPlanResponse,
    GenerateMmDraftsResponse,
    WarehouseFeasibilityRead,
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
