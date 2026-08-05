"""API: variant groups dictionary + product variant SKU management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.product_variant import (
    ProductVariantAttachBody,
    ProductVariantGenerateBody,
    ProductVariantGenerateResult,
    ProductVariantsStateRead,
    ProductVariantSkuPatchBody,
    ProductVariantSkuRead,
    VariantGroupCreateBody,
    VariantGroupListItem,
    VariantGroupRead,
    VariantGroupUpdateBody,
)
from ..services.product_variants import (
    ProductVariantError,
    attach_variant_group,
    create_group,
    delete_group,
    delete_variant_sku,
    generate_variant_skus,
    get_group,
    get_product_variants_state,
    list_groups,
    patch_variant_sku,
    serialize_group,
    update_group,
)

router = APIRouter(prefix="/variant-groups", tags=["VariantGroups"])
product_variants_router = APIRouter(prefix="/products", tags=["ProductVariants"])


def _http(err: ProductVariantError) -> HTTPException:
    status = 404 if err.code in {"group_not_found", "product_not_found", "sku_not_found"} else 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


@router.get("", response_model=list[VariantGroupListItem])
def api_list_variant_groups(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    return [VariantGroupListItem.model_validate(x) for x in list_groups(db, tenant_id, include_inactive=include_inactive)]


@router.get("/{group_id}", response_model=VariantGroupRead)
def api_get_variant_group(
    group_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        group = get_group(db, tenant_id, group_id)
        return VariantGroupRead.model_validate(serialize_group(group))
    except ProductVariantError as e:
        raise _http(e) from e


@router.post("", response_model=VariantGroupRead, status_code=201)
def api_create_variant_group(
    body: VariantGroupCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        group = create_group(
            db,
            tenant_id,
            name=body.name,
            is_active=body.is_active,
            axes=[a.model_dump() for a in body.axes],
        )
        db.commit()
        return VariantGroupRead.model_validate(serialize_group(group))
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.put("/{group_id}", response_model=VariantGroupRead)
def api_update_variant_group(
    group_id: int,
    body: VariantGroupUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        group = update_group(
            db,
            tenant_id,
            group_id,
            name=body.name,
            is_active=body.is_active,
            axes=[a.model_dump() for a in body.axes],
        )
        db.commit()
        return VariantGroupRead.model_validate(serialize_group(group))
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.delete("/{group_id}", status_code=204)
def api_delete_variant_group(
    group_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        delete_group(db, tenant_id, group_id)
        db.commit()
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_variants_router.get("/{product_id}/variants", response_model=ProductVariantsStateRead)
def api_get_product_variants(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return ProductVariantsStateRead.model_validate(get_product_variants_state(db, tenant_id, product_id))
    except ProductVariantError as e:
        raise _http(e) from e


@product_variants_router.put("/{product_id}/variants/group", response_model=ProductVariantsStateRead)
def api_attach_product_variant_group(
    product_id: int,
    body: ProductVariantAttachBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        state = attach_variant_group(db, tenant_id, product_id, body.variant_group_id)
        db.commit()
        return ProductVariantsStateRead.model_validate(state)
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_variants_router.post(
    "/{product_id}/variants/generate",
    response_model=ProductVariantGenerateResult,
    status_code=201,
)
def api_generate_product_variants(
    product_id: int,
    body: ProductVariantGenerateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        result = generate_variant_skus(db, tenant_id, product_id, only_missing=body.only_missing)
        db.commit()
        return ProductVariantGenerateResult.model_validate(result)
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_variants_router.patch(
    "/{product_id}/variants/skus/{child_id}",
    response_model=ProductVariantSkuRead,
)
def api_patch_product_variant_sku(
    product_id: int,
    child_id: int,
    body: ProductVariantSkuPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        sku = patch_variant_sku(
            db,
            tenant_id,
            product_id,
            child_id,
            name=body.name,
            sku=body.sku,
            ean=body.ean,
            sale_price=body.sale_price,
        )
        db.commit()
        return ProductVariantSkuRead.model_validate(sku)
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_variants_router.delete("/{product_id}/variants/skus/{child_id}", status_code=204)
def api_delete_product_variant_sku(
    product_id: int,
    child_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        delete_variant_sku(db, tenant_id, product_id, child_id)
        db.commit()
    except ProductVariantError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise
