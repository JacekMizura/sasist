"""Production / manufacturing API."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.production import (
    ProductionCompleteResultRead,
    ProductionOrderCompleteBody,
    ProductionOrderCreateBody,
    ProductionOrderRead,
    ProductionRecipeCreateBody,
    ProductionRecipeRead,
    ProductionRecipeUpdateBody,
    RecipeUsageRead,
)
from ..services.production_order_service import (
    ProductionOrderError,
    cancel_production_order,
    complete_production_order,
    create_production_order,
    get_production_order,
    list_production_orders,
    start_production_order,
)
from ..services.production_recipe_service import (
    ProductionRecipeError,
    clone_recipe_version,
    create_recipe,
    get_recipe,
    list_recipe_usages_for_component,
    list_recipes_for_product,
    set_recipe_active,
    update_recipe,
)

router = APIRouter(prefix="/production", tags=["Production"])


def _recipe_err(exc: ProductionRecipeError) -> HTTPException:
    code = 404 if exc.code == "not_found" else 400
    return HTTPException(status_code=code, detail={"message": exc.message, "code": exc.code})


def _order_err(exc: ProductionOrderError) -> HTTPException:
    if exc.code == "not_found":
        return HTTPException(status_code=404, detail={"message": exc.message, "code": exc.code})
    if exc.code == "insufficient_stock":
        return HTTPException(
            status_code=409,
            detail={"message": exc.message, "code": exc.code, "shortages": exc.shortages},
        )
    return HTTPException(status_code=400, detail={"message": exc.message, "code": exc.code})


@router.get("/recipes/by-product/{product_id}", response_model=List[ProductionRecipeRead])
def api_list_recipes_for_product(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return list_recipes_for_product(db, tenant_id=tenant_id, product_id=product_id)


@router.get("/recipes/{recipe_id}", response_model=ProductionRecipeRead)
def api_get_recipe(
    recipe_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_recipe(db, tenant_id=tenant_id, recipe_id=recipe_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Receptura nie istnieje.")
    return row


@router.post("/recipes", response_model=ProductionRecipeRead)
def api_create_recipe(
    body: ProductionRecipeCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = create_recipe(db, tenant_id=tenant_id, body=body)
        db.commit()
        return row
    except ProductionRecipeError as exc:
        db.rollback()
        raise _recipe_err(exc) from exc


@router.put("/recipes/{recipe_id}", response_model=ProductionRecipeRead)
def api_update_recipe(
    recipe_id: int,
    body: ProductionRecipeUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = update_recipe(db, tenant_id=tenant_id, recipe_id=recipe_id, body=body)
        db.commit()
        return row
    except ProductionRecipeError as exc:
        db.rollback()
        raise _recipe_err(exc) from exc


@router.post("/recipes/{recipe_id}/activate", response_model=ProductionRecipeRead)
def api_activate_recipe(
    recipe_id: int,
    tenant_id: int = Query(..., ge=1),
    active: bool = Query(True),
    db: Session = Depends(get_db),
):
    try:
        row = set_recipe_active(db, tenant_id=tenant_id, recipe_id=recipe_id, active=active)
        db.commit()
        return row
    except ProductionRecipeError as exc:
        db.rollback()
        raise _recipe_err(exc) from exc


@router.post("/recipes/{recipe_id}/clone", response_model=ProductionRecipeRead)
def api_clone_recipe(
    recipe_id: int,
    tenant_id: int = Query(..., ge=1),
    version: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    try:
        row = clone_recipe_version(db, tenant_id=tenant_id, recipe_id=recipe_id, new_version=version)
        db.commit()
        return row
    except ProductionRecipeError as exc:
        db.rollback()
        raise _recipe_err(exc) from exc


@router.get("/recipes/usages/by-product/{product_id}", response_model=List[RecipeUsageRead])
def api_recipe_usages(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return list_recipe_usages_for_component(db, tenant_id=tenant_id, product_id=product_id)


@router.get("/orders", response_model=List[ProductionOrderRead])
def api_list_orders(
    tenant_id: int = Query(..., ge=1),
    status: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    return list_production_orders(db, tenant_id=tenant_id, status=status, warehouse_id=warehouse_id)


@router.get("/orders/{order_id}", response_model=ProductionOrderRead)
def api_get_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_production_order(db, tenant_id=tenant_id, order_id=order_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Zlecenie nie istnieje.")
    return row


@router.post("/orders", response_model=ProductionOrderRead)
def api_create_order(
    body: ProductionOrderCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        uid = int(user.id) if user is not None else None
        row = create_production_order(db, tenant_id=tenant_id, body=body, created_by_user_id=uid)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/start", response_model=ProductionOrderRead)
def api_start_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = start_production_order(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/complete", response_model=ProductionCompleteResultRead)
def api_complete_order(
    order_id: int,
    body: ProductionOrderCompleteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    try:
        uid = int(user.id) if user is not None else None
        row = complete_production_order(
            db,
            tenant_id=tenant_id,
            order_id=order_id,
            body=body,
            performed_by_user_id=uid,
        )
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/cancel", response_model=ProductionOrderRead)
def api_cancel_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = cancel_production_order(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc
