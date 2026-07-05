"""Production shortages & material substitutes API."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..auth.warehouse_deps import require_active_or_query_operable_warehouse
from ..database import get_db
from ..models.app_user import AppUser
from ..models.product import Product
from ..models.product_composition import ProductComposition
from ..schemas.production_shortage import (
    AcceptSubstituteBody,
    AddToPurchaseOrderBody,
    CreatePurchaseRequisitionBody,
    MaterialAnalysisRead,
    MaterialAnalysisRequest,
    MaterialPortfolioRowRead,
    MaterialSubstituteCreateBody,
    MaterialSubstituteRead,
    MaterialSubstituteUpdateBody,
    ProductionMaterialNeedRead,
    ProductionShortageQueueRowRead,
    PurchaseBridgeResultRead,
    RecipeVariantRead,
    SubstituteDecisionRead,
)
from ..services.production_shortages.analysis_service import analyze_composition_quantity
from ..services.production_shortages.bom_explosion_service import build_enriched_bom_tree, bom_node_to_dict, explode_composition_bom
from ..services.production_shortages.material_need_service import list_material_needs
from ..services.production_shortages.material_portfolio_service import build_material_portfolio
from ..services.production_shortages.purchase_bridge_service import (
    PurchaseBridgeError,
    add_to_purchase_order,
    create_draft_purchase_requisition,
)
from ..services.production_shortages.queue_service import build_production_shortages_queue
from ..services.production_shortages.recipe_variant_service import list_recipe_variants
from ..services.production_shortages.substitute_decision_service import SubstituteDecisionError, accept_substitute
from ..services.production_shortages.substitute_service import (
    SubstituteError,
    create_substitute,
    delete_substitute,
    list_all_substitutes,
    update_substitute,
)

router = APIRouter(prefix="/production", tags=["production-shortages"])


def _substitute_to_read(row) -> MaterialSubstituteRead:
    p = row.product
    sp = row.substitute_product
    return MaterialSubstituteRead(
        id=int(row.id),
        product_id=int(row.product_id),
        product_name=str(getattr(p, "name", None) or f"#{row.product_id}"),
        product_sku=getattr(p, "sku", None) or getattr(p, "symbol", None),
        substitute_product_id=int(row.substitute_product_id),
        substitute_product_name=str(getattr(sp, "name", None) or f"#{row.substitute_product_id}"),
        substitute_product_sku=getattr(sp, "sku", None) or getattr(sp, "symbol", None),
        priority=int(row.priority),
        conversion_ratio=float(row.conversion_ratio),
        is_active=bool(row.is_active),
        notes=row.notes,
    )


@router.post("/shortages/analyze", response_model=MaterialAnalysisRead)
def api_analyze_materials(
    body: MaterialAnalysisRequest,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    comp = (
        db.query(ProductComposition)
        .filter(ProductComposition.id == int(body.composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise HTTPException(status_code=404, detail="Receptura nie istnieje.")
    raw = analyze_composition_quantity(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        composition=comp,
        planned_quantity=float(body.planned_quantity),
        exclude_batch_id=body.batch_id,
        exclude_order_id=body.order_id,
        include_bom_explosion=body.include_bom_explosion,
        include_ai_context=body.include_ai_context,
    )
    return MaterialAnalysisRead(**raw)


@router.get("/material-needs", response_model=List[ProductionMaterialNeedRead])
def api_list_material_needs(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    status: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    rows = list_material_needs(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, status=status, limit=limit
    )
    return [ProductionMaterialNeedRead(**r) for r in rows]


@router.get("/material-analysis", response_model=List[MaterialPortfolioRowRead])
def api_material_portfolio(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    rows = build_material_portfolio(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return [MaterialPortfolioRowRead(**r) for r in rows]


@router.get("/shortages/bom-tree")
def api_bom_tree(
    composition_id: int = Query(..., ge=1),
    planned_quantity: float = Query(1.0, gt=0),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    comp = (
        db.query(ProductComposition)
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise HTTPException(status_code=404, detail="Receptura nie istnieje.")
    return build_enriched_bom_tree(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        composition=comp,
        planned_quantity=float(planned_quantity),
    )


@router.get("/shortages/explode-bom")
def api_explode_bom(
    composition_id: int = Query(..., ge=1),
    planned_quantity: float = Query(1.0, gt=0),
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    comp = (
        db.query(ProductComposition)
        .filter(ProductComposition.id == int(composition_id), ProductComposition.tenant_id == int(tenant_id))
        .first()
    )
    if comp is None:
        raise HTTPException(status_code=404, detail="Receptura nie istnieje.")
    tree = explode_composition_bom(db, tenant_id=tenant_id, composition=comp, planned_quantity=float(planned_quantity))
    return bom_node_to_dict(tree)


@router.get("/recipe-variants", response_model=List[RecipeVariantRead])
def api_list_recipe_variants(
    tenant_id: int = Query(..., ge=1),
    product_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    rows = list_recipe_variants(db, tenant_id=tenant_id, product_id=product_id)
    return [
        RecipeVariantRead(
            id=int(r.id),
            product_id=int(r.product_id),
            composition_id=int(r.composition_id),
            variant_code=str(r.variant_code),
            variant_label=str(r.variant_label),
            priority=int(r.priority),
            is_default=bool(r.is_default),
            is_active=bool(r.is_active),
            notes=r.notes,
        )
        for r in rows
    ]


@router.post("/shortages/accept-substitute", response_model=SubstituteDecisionRead, status_code=201)
def api_accept_substitute(
    body: AcceptSubstituteBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    try:
        row = accept_substitute(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            original_component_product_id=body.original_component_product_id,
            substitute_product_id=body.substitute_product_id,
            quantity_original=body.quantity_original,
            conversion_ratio=body.conversion_ratio,
            production_batch_id=body.batch_id,
            production_order_id=body.order_id,
            decided_by_user_id=int(user.id) if user else None,
            notes=body.notes,
        )
        db.commit()
        return SubstituteDecisionRead(
            id=int(row.id),
            original_component_product_id=int(row.original_component_product_id),
            substitute_product_id=int(row.substitute_product_id),
            conversion_ratio=float(row.conversion_ratio),
            quantity_original=float(row.quantity_original),
            quantity_substitute=float(row.quantity_substitute),
            status=str(row.status),
        )
    except SubstituteDecisionError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/shortages", response_model=List[ProductionShortageQueueRowRead])
def api_production_shortages_queue(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    rows = build_production_shortages_queue(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    return [ProductionShortageQueueRowRead(**r) for r in rows]


@router.get("/material-substitutes", response_model=List[MaterialSubstituteRead])
def api_list_material_substitutes(
    tenant_id: int = Query(..., ge=1),
    product_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    rows = list_all_substitutes(db, tenant_id=tenant_id, product_id=product_id)
    return [_substitute_to_read(r) for r in rows]


@router.post("/material-substitutes", response_model=MaterialSubstituteRead, status_code=201)
def api_create_material_substitute(
    body: MaterialSubstituteCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    try:
        row = create_substitute(
            db,
            tenant_id=tenant_id,
            product_id=body.product_id,
            substitute_product_id=body.substitute_product_id,
            priority=body.priority,
            conversion_ratio=body.conversion_ratio,
            is_active=body.is_active,
            notes=body.notes,
        )
        db.commit()
        db.refresh(row)
        rows = list_all_substitutes(db, tenant_id=tenant_id, product_id=body.product_id)
        match = next((r for r in rows if int(r.id) == int(row.id)), row)
        return _substitute_to_read(match)
    except SubstituteError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/material-substitutes/{substitute_id}", response_model=MaterialSubstituteRead)
def api_update_material_substitute(
    substitute_id: int,
    body: MaterialSubstituteUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    try:
        row = update_substitute(
            db,
            tenant_id=tenant_id,
            substitute_id=substitute_id,
            priority=body.priority,
            conversion_ratio=body.conversion_ratio,
            is_active=body.is_active,
            notes=body.notes,
        )
        db.commit()
        rows = list_all_substitutes(db, tenant_id=tenant_id, product_id=int(row.product_id))
        match = next((r for r in rows if int(r.id) == int(row.id)), row)
        return _substitute_to_read(match)
    except SubstituteError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/material-substitutes/{substitute_id}", status_code=204)
def api_delete_material_substitute(
    substitute_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    try:
        delete_substitute(db, tenant_id=tenant_id, substitute_id=substitute_id)
        db.commit()
    except SubstituteError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/shortages/purchase-requisition", response_model=PurchaseBridgeResultRead)
def api_create_purchase_requisition(
    body: CreatePurchaseRequisitionBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    try:
        result = create_draft_purchase_requisition(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            component_product_id=body.component_product_id,
            quantity=body.quantity,
            supplier_id=body.supplier_id,
            notes=body.notes,
            source_ref={"batch_id": body.batch_id, "order_id": body.order_id, "kind": "production_shortage"},
        )
        db.commit()
        return PurchaseBridgeResultRead(**result)
    except PurchaseBridgeError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/shortages/add-to-purchase-order", response_model=PurchaseBridgeResultRead)
def api_add_shortage_to_purchase_order(
    body: AddToPurchaseOrderBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_active_or_query_operable_warehouse),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    del user
    try:
        result = add_to_purchase_order(
            db,
            tenant_id=tenant_id,
            purchase_order_id=body.purchase_order_id,
            component_product_id=body.component_product_id,
            quantity=body.quantity,
            warehouse_id=warehouse_id,
            source_ref={"batch_id": body.batch_id, "order_id": body.order_id, "kind": "production_shortage"},
        )
        db.commit()
        return PurchaseBridgeResultRead(**result)
    except PurchaseBridgeError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
