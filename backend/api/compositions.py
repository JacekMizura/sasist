"""Product composition engine API (bundle + manufacturing)."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.composition import (
    CompositionUsageRead,
    ProductCompositionCreateBody,
    ProductCompositionRead,
    ProductCompositionUpdateBody,
)
from ..services.composition_engine_service import (
    CompositionError,
    clone_composition_version,
    create_composition,
    estimate_composition_cost,
    get_composition,
    list_compositions_for_product,
    list_usages_for_component,
    set_composition_active,
    update_composition,
)

router = APIRouter(prefix="/compositions", tags=["Compositions"])


def _err(exc: CompositionError) -> HTTPException:
    return HTTPException(
        status_code=404 if exc.code == "not_found" else 400,
        detail={"message": exc.message, "code": exc.code},
    )


@router.get("/by-product/{product_id}", response_model=List[ProductCompositionRead])
def api_list_by_product(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    mode: Optional[str] = Query(None, description="bundle | manufacturing"),
    db: Session = Depends(get_db),
):
    return list_compositions_for_product(db, tenant_id=tenant_id, product_id=product_id, mode=mode)


@router.get("/{composition_id}", response_model=ProductCompositionRead)
def api_get(
    composition_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_composition(db, tenant_id=tenant_id, composition_id=composition_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Kompozycja nie istnieje.")
    return row


@router.post("", response_model=ProductCompositionRead)
def api_create(
    body: ProductCompositionCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = create_composition(db, tenant_id=tenant_id, body=body)
        db.commit()
        return row
    except CompositionError as exc:
        db.rollback()
        raise _err(exc) from exc


@router.put("/{composition_id}", response_model=ProductCompositionRead)
def api_update(
    composition_id: int,
    body: ProductCompositionUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = update_composition(db, tenant_id=tenant_id, composition_id=composition_id, body=body)
        db.commit()
        return row
    except CompositionError as exc:
        db.rollback()
        raise _err(exc) from exc


@router.post("/{composition_id}/activate", response_model=ProductCompositionRead)
def api_activate(
    composition_id: int,
    tenant_id: int = Query(..., ge=1),
    active: bool = Query(True),
    db: Session = Depends(get_db),
):
    try:
        row = set_composition_active(db, tenant_id=tenant_id, composition_id=composition_id, active=active)
        db.commit()
        return row
    except CompositionError as exc:
        db.rollback()
        raise _err(exc) from exc


@router.post("/{composition_id}/clone", response_model=ProductCompositionRead)
def api_clone_composition(
    composition_id: int,
    tenant_id: int = Query(..., ge=1),
    version: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    try:
        row = clone_composition_version(
            db,
            tenant_id=tenant_id,
            composition_id=composition_id,
            new_version=version,
        )
        db.commit()
        return row
    except CompositionError as exc:
        db.rollback()
        raise _err(exc) from exc


@router.get("/usages/by-product/{product_id}", response_model=List[CompositionUsageRead])
def api_usages(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return list_usages_for_component(db, tenant_id=tenant_id, product_id=product_id)


@router.get("/{composition_id}/cost-estimate")
def api_cost_estimate(
    composition_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return estimate_composition_cost(db, tenant_id=tenant_id, composition_id=composition_id)
    except CompositionError as exc:
        raise _err(exc) from exc
