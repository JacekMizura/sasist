"""Production / manufacturing API."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user, get_current_user
from ..auth.warehouse_deps import (
    load_production_order_for_active_warehouse,
    load_production_batch_for_active_warehouse,
    require_active_or_query_operable_warehouse,
)
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.production_batch import (
    BatchCollectionStateRead,
    BatchCollectionUpdateBody,
    BatchPutawayBody,
    BatchProductionProgressBody,
    ProductionBatchCompleteBody,
    ProductionBatchCompleteResultRead,
    ProductionBatchCreateBody,
    ProductionBatchPickPlanRead,
    ProductionBatchPreviewRead,
    ProductionBatchRead,
)
from ..schemas.production_recipe_card import ProductionDashboardRead, RecipeCardRead, RecipeDetailRead
from ..schemas.production import (
    ProductionCompleteResultRead,
    ProductionOrderCompleteBody,
    ProductionOrderCreateBody,
    ProductionOrderRead,
    ProductionOrderSummaryRead,
    ProductionPickPlanRead,
    ProductionRecipeCreateBody,
    ProductionRecipeRead,
    ProductionRecipeUpdateBody,
    RecipeCostEstimateRead,
    RecipeUsageRead,
    WarehouseLocationSearchRow,
)
from ..schemas.production_execution import (
    OrderCollectionStateRead,
    OrderProductionProgressBody,
    OrderPutawayBody,
    ProductionExecutionJobRead,
)
from ..services.production_execution.order_execution_service import (
    finish_order_collecting,
    finish_order_production,
    finish_order_putaway,
    get_order_collection_state,
    release_order_to_wms,
    start_order_collecting,
    update_order_collection_task,
    update_order_production_progress,
)
from ..services.production_execution.wms_queue_service import list_wms_execution_queue
from ..services.production_order_service import (
    ProductionOrderError,
    cancel_production_order,
    complete_production_order,
    create_production_order,
    get_production_order,
    list_production_orders,
    list_production_orders_for_product,
    start_production_order,
)
from ..services.production_batch_service import (
    ProductionBatchError,
    build_batch_pick_plan,
    cancel_batch,
    complete_batch,
    create_batch,
    finish_collecting,
    finish_production,
    finish_putaway,
    get_batch,
    get_collection_state,
    list_batches,
    preview_batch_demand,
    release_batch_to_wms,
    start_batch,
    start_collecting,
    update_collection_task,
    update_production_progress,
)
from ..services.production_recipe_card_service import (
    get_production_dashboard,
    get_recipe_detail,
    list_recipe_cards,
)
from ..services.production_pick_service import build_production_pick_plan, search_warehouse_locations
from ..services.production_recipe_service import (
    ProductionRecipeError,
    clone_recipe_version,
    create_recipe,
    estimate_recipe_cost,
    get_recipe,
    list_recipe_usages_for_component,
    list_recipes_for_product,
    set_recipe_active,
    update_recipe,
)

router = APIRouter(prefix="/production", tags=["Production"])
logger = logging.getLogger(__name__)


def _gate_production_order(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    order_id: int,
    warehouse_id: int,
) -> None:
    load_production_order_for_active_warehouse(
        db, user, tenant_id=tenant_id, order_id=order_id, active_warehouse_id=warehouse_id
    )


def _gate_production_batch(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    batch_id: int,
    warehouse_id: int,
) -> None:
    load_production_batch_for_active_warehouse(
        db, user, tenant_id=tenant_id, batch_id=batch_id, active_warehouse_id=warehouse_id
    )


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


@router.get("/recipes/composition/{composition_id}", response_model=RecipeDetailRead)
def api_recipe_detail_by_composition(
    composition_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    """ERP recipe detail by product_compositions.id (not legacy production_recipes.id)."""
    row = get_recipe_detail(
        db,
        tenant_id=tenant_id,
        composition_id=composition_id,
        warehouse_id=warehouse_id,
    )
    if row is None:
        logger.warning(
            "recipe composition detail not found tenant_id=%s composition_id=%s warehouse_id=%s",
            tenant_id,
            composition_id,
            warehouse_id,
        )
        raise HTTPException(
            status_code=404,
            detail="Receptura nie istnieje lub została usunięta.",
        )
    return row


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


@router.get("/recipes/{recipe_id}/cost-estimate", response_model=RecipeCostEstimateRead)
def api_recipe_cost_estimate(
    recipe_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return estimate_recipe_cost(db, tenant_id=tenant_id, recipe_id=recipe_id)
    except ProductionRecipeError as exc:
        raise _recipe_err(exc) from exc


@router.get("/locations/search", response_model=List[WarehouseLocationSearchRow])
def api_search_locations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    q: str = Query("", max_length=128),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    rows = search_warehouse_locations(db, warehouse_id=warehouse_id, query=q, limit=limit)
    return [WarehouseLocationSearchRow(**r) for r in rows]


@router.get("/orders/by-product/{product_id}", response_model=List[ProductionOrderSummaryRead])
def api_orders_by_product(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    try:
        return list_production_orders_for_product(
            db,
            tenant_id=tenant_id,
            product_id=product_id,
            limit=limit,
        )
    except Exception as exc:
        logger.exception(
            "orders/by-product failed tenant_id=%s product_id=%s limit=%s",
            tenant_id,
            product_id,
            limit,
        )
        return []


@router.get("/orders/{order_id}/pick-plan", response_model=ProductionPickPlanRead)
def api_pick_plan(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        return build_production_pick_plan(db, tenant_id=tenant_id, order_id=order_id)
    except ProductionOrderError as exc:
        raise _order_err(exc) from exc


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
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
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


@router.post("/orders/{order_id}/start", response_model=ProductionOrderRead, deprecated=True)
def api_start_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = start_production_order(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/complete", response_model=ProductionCompleteResultRead, deprecated=True)
def api_complete_order(
    order_id: int,
    body: ProductionOrderCompleteBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
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


@router.get("/dashboard", response_model=ProductionDashboardRead)
def api_production_dashboard(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    return get_production_dashboard(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.get("/recipes", response_model=List[RecipeCardRead])
def api_list_recipe_cards(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: Optional[int] = Query(None, ge=1),
    active_only: bool = Query(False, description="When true, return only active manufacturing recipes."),
    db: Session = Depends(get_db),
):
    return list_recipe_cards(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        active_only=active_only,
    )


def _batch_err(exc: ProductionBatchError) -> HTTPException:
    """Propagate exact business error text to the client (Network tab reads detail string)."""
    message = str(exc.message or exc).strip() or "Production batch error"
    if exc.code == "not_found":
        return HTTPException(status_code=404, detail=message)
    if exc.code == "insufficient_stock":
        return HTTPException(
            status_code=409,
            detail={"message": message, "code": exc.code, "shortages": exc.shortages},
        )
    if exc.code == "schema_unavailable":
        return HTTPException(status_code=503, detail=message)
    return HTTPException(status_code=400, detail=message)


@router.get("/batches", response_model=List[ProductionBatchRead])
def api_list_batches(
    tenant_id: int = Query(..., ge=1),
    status: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None, ge=1),
    wms_released: Optional[bool] = Query(
        None,
        description="When true, only batches released to WMS terminal. When false, only unreleased.",
    ),
    db: Session = Depends(get_db),
):
    try:
        return list_batches(
            db,
            tenant_id=tenant_id,
            status=status,
            warehouse_id=warehouse_id,
            wms_released=wms_released,
        )
    except Exception:
        logger.exception(
            "GET /production/batches failed tenant_id=%s status=%s warehouse_id=%s",
            tenant_id,
            status,
            warehouse_id,
        )
        return []


@router.get("/batches/{batch_id}", response_model=ProductionBatchRead)
def api_get_batch(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    row = get_batch(db, tenant_id=tenant_id, batch_id=batch_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Partia nie istnieje.")
    return row


@router.get("/batches/{batch_id}/pick-plan", response_model=ProductionBatchPickPlanRead)
def api_batch_pick_plan(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        return build_batch_pick_plan(db, tenant_id=tenant_id, batch_id=batch_id)
    except ProductionBatchError as exc:
        raise _batch_err(exc) from exc


@router.post("/batches/preview", response_model=ProductionBatchPreviewRead)
def api_preview_batch(
    body: ProductionBatchCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    line_summary = [
        {"product_id": ln.product_id, "composition_id": ln.composition_id, "planned_quantity": ln.planned_quantity}
        for ln in (body.lines or [])
    ]
    try:
        logger.info(
            "POST /production/batches/preview tenant_id=%s warehouse_id=%s lines=%s",
            tenant_id,
            body.warehouse_id,
            line_summary,
        )
        return preview_batch_demand(
            db,
            tenant_id=tenant_id,
            warehouse_id=int(body.warehouse_id),
            lines=body.lines,
        )
    except ProductionBatchError as exc:
        logger.warning(
            "batch preview rejected tenant_id=%s warehouse_id=%s code=%s message=%s",
            tenant_id,
            body.warehouse_id,
            exc.code,
            exc.message,
        )
        raise _batch_err(exc) from exc
    except Exception:
        logger.exception(
            "POST /production/batches/preview unexpected error tenant_id=%s warehouse_id=%s lines=%s",
            tenant_id,
            body.warehouse_id,
            line_summary,
        )
        raise HTTPException(
            status_code=400,
            detail={"message": "Nie udało się wygenerować podglądu partii.", "code": "preview_failed"},
        )


@router.post("/batches", response_model=ProductionBatchRead)
def api_create_batch(
    body: ProductionBatchCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser | None = Depends(get_optional_current_user),
):
    import json

    raw_body_dump = body.model_dump()
    line_summary = [
        {
            "product_id": ln.product_id,
            "composition_id": ln.composition_id,
            "planned_quantity": ln.planned_quantity,
        }
        for ln in (body.lines or [])
    ]
    logger.info(
        "CREATE_BATCH_BODY tenant_id=%s warehouse_id=%s status=%s lines=%s payload=%s",
        tenant_id,
        body.warehouse_id,
        body.status,
        line_summary,
        json.dumps(raw_body_dump, default=str),
    )
    print(
        f"CREATE_BATCH_BODY tenant_id={tenant_id} {json.dumps(raw_body_dump, default=str)}",
        flush=True,
    )
    logger.info(
        "CREATE_BATCH_DTO tenant_id=%s validated=%s",
        tenant_id,
        json.dumps(
            {
                "warehouse_id": body.warehouse_id,
                "status": body.status,
                "notes": body.notes,
                "lines": line_summary,
            },
            default=str,
        ),
    )
    logger.info(
        "CREATE_BATCH_WAREHOUSE tenant_id=%s warehouse_id=%s",
        tenant_id,
        body.warehouse_id,
    )
    logger.info("CREATE_BATCH_LINES tenant_id=%s lines=%s", tenant_id, json.dumps(line_summary, default=str))

    try:
        uid = int(user.id) if user is not None else None
        row = create_batch(db, tenant_id=tenant_id, body=body, created_by_user_id=uid)
        logger.info("CREATE_BATCH_COMMIT batch_id=%s tenant_id=%s", row.id, tenant_id)
        db.commit()
        logger.info("CREATE_BATCH_OK batch_id=%s number=%s", row.id, row.number)
        return row
    except HTTPException:
        db.rollback()
        raise
    except ProductionBatchError as exc:
        db.rollback()
        logger.warning(
            "CREATE_BATCH_REJECTED tenant_id=%s warehouse_id=%s code=%s reason=%s",
            tenant_id,
            body.warehouse_id,
            exc.code,
            exc.message,
        )
        raise _batch_err(exc) from exc
    except IntegrityError as exc:
        db.rollback()
        detail = str(getattr(exc, "orig", None) or exc)
        logger.exception("CREATE_BATCH_FATAL step=commit_integrity tenant_id=%s detail=%s", tenant_id, detail)
        raise HTTPException(status_code=400, detail=detail) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        detail = str(exc)
        logger.exception("CREATE_BATCH_FATAL step=commit_sql tenant_id=%s detail=%s", tenant_id, detail)
        raise HTTPException(status_code=400, detail=detail) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("CREATE_BATCH_FATAL tenant_id=%s warehouse_id=%s", tenant_id, body.warehouse_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/batches/{batch_id}/start", response_model=ProductionBatchRead, deprecated=True)
def api_start_batch(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = start_batch(db, tenant_id=tenant_id, batch_id=batch_id)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/complete", response_model=ProductionBatchCompleteResultRead, deprecated=True)
def api_complete_batch(
    batch_id: int,
    body: ProductionBatchCompleteBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = complete_batch(
            db,
            tenant_id=tenant_id,
            batch_id=batch_id,
            body=body,
            performed_by_user_id=uid,
        )
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/release-to-wms", response_model=ProductionBatchRead)
def api_release_batch_to_wms(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = release_batch_to_wms(
            db,
            tenant_id=tenant_id,
            batch_id=batch_id,
            released_by_user_id=uid,
        )
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/start-collecting", response_model=ProductionBatchRead)
def api_start_collecting(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = start_collecting(db, tenant_id=tenant_id, batch_id=batch_id)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.get("/batches/{batch_id}/collection", response_model=BatchCollectionStateRead)
def api_get_collection(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        return get_collection_state(db, tenant_id=tenant_id, batch_id=batch_id)
    except ProductionBatchError as exc:
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/collection/update", response_model=BatchCollectionStateRead)
def api_update_collection(
    batch_id: int,
    body: BatchCollectionUpdateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = update_collection_task(db, tenant_id=tenant_id, batch_id=batch_id, body=body)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/finish-collecting", response_model=ProductionBatchRead)
def api_finish_collecting(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = finish_collecting(db, tenant_id=tenant_id, batch_id=batch_id, performed_by_user_id=uid)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/production-progress", response_model=ProductionBatchRead)
def api_production_progress(
    batch_id: int,
    body: BatchProductionProgressBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = update_production_progress(db, tenant_id=tenant_id, batch_id=batch_id, body=body)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/finish-production", response_model=ProductionBatchRead)
def api_finish_production(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = finish_production(db, tenant_id=tenant_id, batch_id=batch_id)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/finish-putaway", response_model=ProductionBatchCompleteResultRead)
def api_finish_putaway(
    batch_id: int,
    body: BatchPutawayBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = finish_putaway(db, tenant_id=tenant_id, batch_id=batch_id, body=body, performed_by_user_id=uid)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/batches/{batch_id}/cancel", response_model=ProductionBatchRead)
def api_cancel_batch(
    batch_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_batch(
        db, user, tenant_id=tenant_id, batch_id=batch_id, warehouse_id=warehouse_id
    )
    try:
        row = cancel_batch(db, tenant_id=tenant_id, batch_id=batch_id)
        db.commit()
        return row
    except ProductionBatchError as exc:
        db.rollback()
        raise _batch_err(exc) from exc


@router.post("/orders/{order_id}/cancel", response_model=ProductionOrderRead)
def api_cancel_order(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = cancel_production_order(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


# --- MO WMS phased execution (Phase 1) ---


@router.get("/wms-queue", response_model=List[ProductionExecutionJobRead])
def api_wms_execution_queue(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    phase: str = Query(..., description="collecting | execute | putaway"),
    db: Session = Depends(get_db),
):
    phase_key = str(phase or "").strip().lower()
    if phase_key not in ("collecting", "execute", "putaway"):
        raise HTTPException(status_code=400, detail="Invalid phase — use collecting, execute, or putaway.")
    return list_wms_execution_queue(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        phase=phase_key,  # type: ignore[arg-type]
    )


@router.post("/orders/{order_id}/release-to-wms", response_model=ProductionOrderRead)
def api_release_order_to_wms(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = release_order_to_wms(
            db,
            tenant_id=tenant_id,
            order_id=order_id,
            released_by_user_id=uid,
        )
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/start-collecting", response_model=ProductionOrderRead)
def api_start_order_collecting(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = start_order_collecting(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.get("/orders/{order_id}/collection", response_model=OrderCollectionStateRead)
def api_get_order_collection(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        return get_order_collection_state(db, tenant_id=tenant_id, order_id=order_id)
    except ProductionOrderError as exc:
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/collection", response_model=OrderCollectionStateRead)
def api_update_order_collection(
    order_id: int,
    body: BatchCollectionUpdateBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = update_order_collection_task(
            db, tenant_id=tenant_id, order_id=order_id, body=body
        )
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/finish-collecting", response_model=ProductionOrderRead)
def api_finish_order_collecting(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = finish_order_collecting(
            db,
            tenant_id=tenant_id,
            order_id=order_id,
            performed_by_user_id=uid,
        )
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/production-progress", response_model=ProductionOrderRead)
def api_order_production_progress(
    order_id: int,
    body: OrderProductionProgressBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = update_order_production_progress(
            db, tenant_id=tenant_id, order_id=order_id, body=body
        )
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/finish-production", response_model=ProductionOrderRead)
def api_finish_order_production(
    order_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        row = finish_order_production(db, tenant_id=tenant_id, order_id=order_id)
        db.commit()
        return row
    except ProductionOrderError as exc:
        db.rollback()
        raise _order_err(exc) from exc


@router.post("/orders/{order_id}/finish-putaway", response_model=ProductionCompleteResultRead)
def api_finish_order_putaway(
    order_id: int,
    body: OrderPutawayBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _gate_production_order(
        db, user, tenant_id=tenant_id, order_id=order_id, warehouse_id=warehouse_id
    )
    try:
        uid = int(user.id) if user is not None else None
        row = finish_order_putaway(
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
