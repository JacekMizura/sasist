"""API: Product Family dictionary + product membership."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.product_family import (
    ProductFamilyAttachBody,
    ProductFamilyCreateBody,
    ProductFamilyListItem,
    ProductFamilyProductStateRead,
    ProductFamilyRead,
    ProductFamilyUpdateBody,
)
from ..services.product_families import (
    ProductFamilyError,
    attach_product_to_family,
    create_family,
    delete_family,
    get_family,
    get_product_family_state,
    list_families,
    serialize_family,
    update_family,
)

router = APIRouter(prefix="/product-families", tags=["ProductFamilies"])
product_family_membership_router = APIRouter(prefix="/products", tags=["ProductFamilies"])


def _http(err: ProductFamilyError) -> HTTPException:
    status = 404 if err.code in {"family_not_found", "product_not_found", "base_product_not_found"} else 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


@router.get("", response_model=list[ProductFamilyListItem])
def api_list_product_families(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    return [ProductFamilyListItem.model_validate(x) for x in list_families(db, tenant_id, include_inactive=include_inactive)]


@router.get("/{family_id}", response_model=ProductFamilyRead)
def api_get_product_family(
    family_id: int,
    tenant_id: int = Query(..., ge=1),
    include_members: bool = Query(True),
    db: Session = Depends(get_db),
):
    try:
        family = get_family(db, tenant_id, family_id)
        return ProductFamilyRead.model_validate(
            serialize_family(db, family, include_members=include_members)
        )
    except ProductFamilyError as e:
        raise _http(e) from e


@router.post("", response_model=ProductFamilyRead, status_code=201)
def api_create_product_family(
    body: ProductFamilyCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        family = create_family(
            db,
            tenant_id,
            name=body.name,
            is_active=body.is_active,
            base_product_id=body.base_product_id,
            attributes=[a.model_dump() for a in body.attributes],
        )
        db.commit()
        return ProductFamilyRead.model_validate(serialize_family(db, family, include_members=True))
    except ProductFamilyError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.put("/{family_id}", response_model=ProductFamilyRead)
def api_update_product_family(
    family_id: int,
    body: ProductFamilyUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        family = update_family(
            db,
            tenant_id,
            family_id,
            name=body.name,
            is_active=body.is_active,
            base_product_id=body.base_product_id,
            attributes=[a.model_dump() for a in body.attributes],
        )
        db.commit()
        return ProductFamilyRead.model_validate(serialize_family(db, family, include_members=True))
    except ProductFamilyError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.delete("/{family_id}", status_code=204)
def api_delete_product_family(
    family_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        delete_family(db, tenant_id, family_id)
        db.commit()
    except ProductFamilyError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_family_membership_router.get(
    "/{product_id}/family",
    response_model=ProductFamilyProductStateRead,
)
def api_get_product_family_state(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return ProductFamilyProductStateRead.model_validate(get_product_family_state(db, tenant_id, product_id))
    except ProductFamilyError as e:
        raise _http(e) from e


@product_family_membership_router.put(
    "/{product_id}/family",
    response_model=ProductFamilyProductStateRead,
)
def api_attach_product_family(
    product_id: int,
    body: ProductFamilyAttachBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        state = attach_product_to_family(db, tenant_id, product_id, body.product_family_id)
        db.commit()
        return ProductFamilyProductStateRead.model_validate(state)
    except ProductFamilyError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise
