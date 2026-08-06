"""API: Product Family dictionary + product membership."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.product_family import (
    FamilyGenerateBody,
    FamilyGeneratePreview,
    FamilyGenerateResult,
    ProductFamilyAttachBody,
    ProductFamilyCreateBody,
    ProductFamilyListItem,
    ProductFamilyProductStateRead,
    ProductFamilyRead,
    ProductFamilyUpdateBody,
)
from ..services.activity_log import ActivityLinkSpec, record_activity
from ..services.product_families import (
    ProductFamilyError,
    attach_product_to_family,
    create_family,
    delete_family,
    generate_family_products,
    get_family,
    get_product_family_state,
    list_families,
    migrate_variants_to_families_for_tenant,
    preview_family_generate,
    serialize_family,
    update_family,
)

router = APIRouter(prefix="/product-families", tags=["ProductFamilies"])
product_family_membership_router = APIRouter(prefix="/products", tags=["ProductFamilies"])


def _http(err: ProductFamilyError) -> HTTPException:
    status = 404 if err.code in {"family_not_found", "product_not_found", "base_product_not_found"} else 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


def _log_family(
    db: Session,
    *,
    tenant_id: int,
    family_id: int,
    name: str,
    event_code: str,
    description: str,
    product_id: int | None = None,
) -> None:
    try:
        nested = db.begin_nested()
        try:
            links = [
                ActivityLinkSpec(
                    object_type="product_family",
                    object_id=int(family_id),
                    role="subject",
                    object_label=name,
                )
            ]
            if product_id is not None:
                links.append(
                    ActivityLinkSpec(
                        object_type="product",
                        object_id=int(product_id),
                        role="related",
                    )
                )
            record_activity(
                db,
                event_code=event_code,
                description=description,
                links=links,
                severity="INFO",
                category="catalog",
                tenant_id=int(tenant_id),
            )
            nested.commit()
        except Exception:
            nested.rollback()
            raise
    except Exception:
        pass

@router.get("", response_model=list[ProductFamilyListItem])
def api_list_product_families(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    return [ProductFamilyListItem.model_validate(x) for x in list_families(db, tenant_id, include_inactive=include_inactive)]


@router.post("/migrate-from-variants")
def api_migrate_variants_to_families(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Idempotent Variant → Product Family data migration for one tenant."""
    try:
        result = migrate_variants_to_families_for_tenant(db, tenant_id)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


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


@router.get("/{family_id}/generate/preview", response_model=FamilyGeneratePreview)
def api_preview_family_generate(
    family_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return FamilyGeneratePreview.model_validate(preview_family_generate(db, tenant_id, family_id))
    except ProductFamilyError as e:
        raise _http(e) from e


@router.post(
    "/{family_id}/generate",
    response_model=FamilyGenerateResult,
    status_code=201,
)
def api_generate_family_products(
    family_id: int,
    body: FamilyGenerateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        result = generate_family_products(
            db,
            tenant_id,
            family_id,
            mode=body.mode,
            value_keys=body.value_keys,
            only_missing=body.only_missing,
        )
        db.commit()
        created = int(result.get("created_count") or 0)
        fam = result.get("family") if isinstance(result.get("family"), dict) else None
        fname = str((fam or {}).get("name") or family_id)
        _log_family(
            db,
            tenant_id=tenant_id,
            family_id=int(family_id),
            name=fname,
            event_code="product_family_generated",
            description=f"Wygenerowano {created} produktów w rodzinie „{fname}”.",
        )
        db.commit()
        return FamilyGenerateResult.model_validate(result)
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
        prev = get_product_family_state(db, tenant_id, product_id)
        prev_fid = prev.get("product_family_id")
        prev_fam = prev.get("family") if isinstance(prev.get("family"), dict) else None
        state = attach_product_to_family(db, tenant_id, product_id, body.product_family_id)
        db.commit()
        fid = state.get("product_family_id")
        fam = state.get("family") if isinstance(state.get("family"), dict) else None
        if fid is not None:
            fname = str((fam or {}).get("name") or fid)
            _log_family(
                db,
                tenant_id=tenant_id,
                family_id=int(fid),
                name=fname,
                event_code="product_family_member_attached",
                description=f"Dodano produkt #{product_id} do rodziny „{fname}”.",
                product_id=int(product_id),
            )
            db.commit()
        elif prev_fid is not None:
            fname = str((prev_fam or {}).get("name") or prev_fid)
            _log_family(
                db,
                tenant_id=tenant_id,
                family_id=int(prev_fid),
                name=fname,
                event_code="product_family_member_detached",
                description=f"Usunięto produkt #{product_id} z rodziny „{fname}”.",
                product_id=int(product_id),
            )
            db.commit()
        return ProductFamilyProductStateRead.model_validate(state)
    except ProductFamilyError as e:
        db.rollback()
        raise _http(e) from e
    except Exception:
        db.rollback()
        raise
