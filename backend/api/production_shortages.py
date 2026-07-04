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
    AddToPurchaseOrderBody,
    CreatePurchaseRequisitionBody,
    MaterialAnalysisRead,
    MaterialAnalysisRequest,
    MaterialSubstituteCreateBody,
    MaterialSubstituteRead,
    MaterialSubstituteUpdateBody,
    ProductionShortageQueueRowRead,
    PurchaseBridgeResultRead,
)
from ..services.production_shortages.analysis_service import analyze_composition_quantity
from ..services.production_shortages.purchase_bridge_service import (
    PurchaseBridgeError,
    add_to_purchase_order,
    create_draft_purchase_requisition,
)
from ..services.production_shortages.queue_service import build_production_shortages_queue
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
    )
    return MaterialAnalysisRead(**raw)


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
