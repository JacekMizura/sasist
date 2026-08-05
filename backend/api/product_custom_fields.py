"""API: product custom field definitions + per-product values."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.product_custom_field import (
    PRODUCT_ATTACHMENT_KINDS,
    ProductCustomFieldRead,
    ProductCustomFieldValuesPutBody,
    ProductCustomFieldWithValueRead,
    ProductCustomFieldWrite,
    ProductCustomFieldsBulkDeleteBody,
)
from ..services.product_custom_fields import (
    ProductCustomFieldError,
    bulk_delete_fields,
    create_field,
    delete_field,
    get_field,
    get_product_fields_with_values,
    list_fields,
    put_product_field_values,
    save_product_custom_field_upload,
    serialize_field,
    update_field,
)

router = APIRouter(prefix="/product-custom-fields", tags=["ProductCustomFields"])
product_values_router = APIRouter(prefix="/products", tags=["ProductCustomFields"])


def _http(err: ProductCustomFieldError) -> HTTPException:
    status = 404 if err.code in {"field_not_found", "product_not_found"} else 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


@router.get("/attachment-kinds")
def api_attachment_kinds():
    return [{"value": k, "label": label} for k, label in PRODUCT_ATTACHMENT_KINDS]


@router.get("", response_model=List[ProductCustomFieldRead])
def api_list_fields(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    rows = list_fields(db, tenant_id, include_inactive=include_inactive)
    return [ProductCustomFieldRead.model_validate(serialize_field(r)) for r in rows]


@router.get("/{field_id}", response_model=ProductCustomFieldRead)
def api_get_field(
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return ProductCustomFieldRead.model_validate(serialize_field(get_field(db, tenant_id, field_id)))
    except ProductCustomFieldError as e:
        raise _http(e) from e


@router.post("", response_model=ProductCustomFieldRead, status_code=201)
def api_create_field(
    body: ProductCustomFieldWrite,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = create_field(
            db,
            tenant_id,
            name=body.name,
            type=body.type,
            slug=body.slug,
            settings_json=body.settings_json,
            sort_order=body.sort_order,
            is_active=body.is_active,
            options=[o.model_dump() for o in body.options],
        )
        db.commit()
        return ProductCustomFieldRead.model_validate(serialize_field(row))
    except ProductCustomFieldError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.put("/{field_id}", response_model=ProductCustomFieldRead)
def api_update_field(
    field_id: int,
    body: ProductCustomFieldWrite,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = update_field(
            db,
            tenant_id,
            field_id,
            name=body.name,
            type=body.type,
            slug=body.slug,
            settings_json=body.settings_json,
            sort_order=body.sort_order,
            is_active=body.is_active,
            options=[o.model_dump() for o in body.options],
        )
        db.commit()
        return ProductCustomFieldRead.model_validate(serialize_field(row))
    except ProductCustomFieldError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.delete("/{field_id}", status_code=204)
def api_delete_field(
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        delete_field(db, tenant_id, field_id)
        db.commit()
    except ProductCustomFieldError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@router.post("/bulk-delete")
def api_bulk_delete(
    body: ProductCustomFieldsBulkDeleteBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        n = bulk_delete_fields(db, tenant_id, body.ids)
        db.commit()
        return {"deleted": n}
    except Exception:
        db.rollback()
        raise


@product_values_router.get(
    "/{product_id}/custom-fields",
    response_model=List[ProductCustomFieldWithValueRead],
)
def api_get_product_custom_fields(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        rows = get_product_fields_with_values(db, tenant_id, product_id)
        return [ProductCustomFieldWithValueRead.model_validate(r) for r in rows]
    except ProductCustomFieldError as e:
        raise _http(e) from e


@product_values_router.put(
    "/{product_id}/custom-fields",
    response_model=List[ProductCustomFieldWithValueRead],
)
def api_put_product_custom_fields(
    product_id: int,
    body: ProductCustomFieldValuesPutBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        rows = put_product_field_values(
            db,
            tenant_id,
            product_id,
            [v.model_dump() for v in body.values],
        )
        db.commit()
        return [ProductCustomFieldWithValueRead.model_validate(r) for r in rows]
    except ProductCustomFieldError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise


@product_values_router.post("/{product_id}/custom-fields/{field_id}/files")
async def api_upload_product_custom_field_file(
    product_id: int,
    field_id: int,
    tenant_id: int = Query(..., ge=1),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    try:
        get_field(db, tenant_id, field_id)
        # ensure product exists via values helper path
        get_product_fields_with_values(db, tenant_id, product_id)
        meta = await save_product_custom_field_upload(
            product_id=product_id,
            field_id=field_id,
            upload=file,
        )
        return meta
    except ProductCustomFieldError as e:
        raise _http(e) from e
