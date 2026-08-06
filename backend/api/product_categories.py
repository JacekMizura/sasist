"""Product categories API — hierarchical tree CRUD + product assignment."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.product_category import (
    ProductCategoryAssignmentBody,
    ProductCategoryAssignmentRead,
    ProductCategoryCreateBody,
    ProductCategoryMoveBody,
    ProductCategoryRead,
    ProductCategoryTreeNode,
    ProductCategoryTreeOut,
    ProductCategoryUpdateBody,
)
from ..services.product_categories import (
    build_tree_nodes,
    create_category,
    delete_category,
    get_category,
    get_product_assignment,
    list_categories_flat,
    move_category,
    product_counts_by_category,
    serialize_category,
    set_product_assignment,
    update_category,
)
from ..services.product_categories.errors import ProductCategoryError
from ..services.activity_log import ActivityLinkSpec, record_activity

router = APIRouter(prefix="/product-categories", tags=["ProductCategories"])
product_assignment_router = APIRouter(prefix="/products", tags=["ProductCategories"])


def _http(err: ProductCategoryError) -> HTTPException:
    status = 404 if err.code == "category_not_found" else 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


def _log_category(db: Session, *, tenant_id: int, category_id: int, name: str, event_code: str, description: str) -> None:
    try:
        nested = db.begin_nested()
        try:
            record_activity(
                db,
                event_code=event_code,
                description=description,
                links=[
                    ActivityLinkSpec(
                        object_type="product_category",
                        object_id=int(category_id),
                        role="subject",
                        object_label=name,
                    )
                ],
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


@router.get("/tree", response_model=ProductCategoryTreeOut)
def api_category_tree(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    nodes = build_tree_nodes(db, tenant_id, include_inactive=include_inactive)
    return ProductCategoryTreeOut(nodes=[ProductCategoryTreeNode.model_validate(n) for n in nodes])


@router.get("", response_model=list[ProductCategoryRead])
def api_list_categories(
    tenant_id: int = Query(..., ge=1),
    include_inactive: bool = Query(True),
    db: Session = Depends(get_db),
):
    rows = list_categories_flat(db, tenant_id, include_inactive=include_inactive)
    counts = product_counts_by_category(db, tenant_id, [int(r.id) for r in rows])
    return [ProductCategoryRead.model_validate(serialize_category(db, tenant_id, r, all_rows=rows, counts=counts)) for r in rows]


@router.get("/{category_id}", response_model=ProductCategoryRead)
def api_get_category(
    category_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = get_category(db, tenant_id, category_id)
        return ProductCategoryRead.model_validate(serialize_category(db, tenant_id, row))
    except ProductCategoryError as e:
        raise _http(e) from e


@router.post("", response_model=ProductCategoryRead, status_code=201)
def api_create_category(
    body: ProductCategoryCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        row = create_category(
            db,
            tenant_id,
            name=body.name,
            parent_id=body.parent_id,
            description=body.description,
            is_active=body.is_active,
            sort_order=body.sort_order,
            sku_code=body.sku_code,
            catalog_code=body.catalog_code,
            sku_template=body.sku_template,
            catalog_template=body.catalog_template,
        )
        db.commit()
        db.refresh(row)
        _log_category(
            db,
            tenant_id=tenant_id,
            category_id=int(row.id),
            name=row.name or "",
            event_code="product_category_created",
            description=f"Utworzono kategorię „{row.name}”.",
        )
        db.commit()
        return ProductCategoryRead.model_validate(serialize_category(db, tenant_id, row))
    except ProductCategoryError as e:
        db.rollback()
        raise _http(e) from e


@router.patch("/{category_id}", response_model=ProductCategoryRead)
def api_update_category(
    category_id: int,
    body: ProductCategoryUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    fields = getattr(body, "model_fields_set", set()) or set()
    try:
        row = update_category(
            db,
            tenant_id,
            category_id,
            name=body.name,
            parent_id=body.parent_id,
            clear_parent=bool(body.clear_parent),
            description=body.description,
            description_set="description" in fields,
            is_active=body.is_active,
            sort_order=body.sort_order,
            parent_set="parent_id" in fields or bool(body.clear_parent),
            sku_code=body.sku_code,
            sku_code_set="sku_code" in fields,
            catalog_code=body.catalog_code,
            catalog_code_set="catalog_code" in fields,
            sku_template=body.sku_template,
            sku_template_set="sku_template" in fields,
            catalog_template=body.catalog_template,
            catalog_template_set="catalog_template" in fields,
            default_vat_rate=None if body.clear_default_vat_rate else body.default_vat_rate,
            default_vat_rate_set="default_vat_rate" in fields or bool(body.clear_default_vat_rate),
            default_manufacturer_id=None
            if body.clear_default_manufacturer_id
            else body.default_manufacturer_id,
            default_manufacturer_id_set="default_manufacturer_id" in fields
            or bool(body.clear_default_manufacturer_id),
            default_label_template_id=None
            if body.clear_default_label_template_id
            else body.default_label_template_id,
            default_label_template_id_set="default_label_template_id" in fields
            or bool(body.clear_default_label_template_id),
            default_unit=body.default_unit,
            default_unit_set="default_unit" in fields,
            default_warehouse_id=body.default_warehouse_id,
            default_warehouse_id_set="default_warehouse_id" in fields,
            default_supplier_id=body.default_supplier_id,
            default_supplier_id_set="default_supplier_id" in fields,
            attributes_schema_json=body.attributes_schema_json,
            attributes_schema_set="attributes_schema_json" in fields,
            marketplace_mapping_json=body.marketplace_mapping_json,
            marketplace_mapping_set="marketplace_mapping_json" in fields,
        )
        db.commit()
        db.refresh(row)
        _log_category(
            db,
            tenant_id=tenant_id,
            category_id=int(row.id),
            name=row.name or "",
            event_code="product_category_updated",
            description=f"Zaktualizowano kategorię „{row.name}”.",
        )
        db.commit()
        return ProductCategoryRead.model_validate(serialize_category(db, tenant_id, row))
    except ProductCategoryError as e:
        db.rollback()
        raise _http(e) from e


@router.post("/{category_id}/move", response_model=ProductCategoryRead)
def api_move_category(
    category_id: int,
    body: ProductCategoryMoveBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Prepared for drag-and-drop reparent / reorder."""
    try:
        row = move_category(
            db,
            tenant_id,
            category_id,
            parent_id=body.parent_id,
            sort_order=body.sort_order,
            clear_parent=bool(body.clear_parent),
        )
        db.commit()
        db.refresh(row)
        return ProductCategoryRead.model_validate(serialize_category(db, tenant_id, row))
    except ProductCategoryError as e:
        db.rollback()
        raise _http(e) from e


@router.delete("/{category_id}", status_code=204)
def api_delete_category(
    category_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        delete_category(db, tenant_id, category_id)
        db.commit()
    except ProductCategoryError as e:
        db.rollback()
        raise _http(e) from e
    return None


@product_assignment_router.get("/{product_id}/category-assignment", response_model=ProductCategoryAssignmentRead)
def api_get_product_category_assignment(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        data = get_product_assignment(db, tenant_id, product_id)
        return ProductCategoryAssignmentRead.model_validate(data)
    except ProductCategoryError as e:
        raise _http(e) from e


@product_assignment_router.put("/{product_id}/category-assignment", response_model=ProductCategoryAssignmentRead)
def api_put_product_category_assignment(
    product_id: int,
    body: ProductCategoryAssignmentBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        data = set_product_assignment(
            db,
            tenant_id,
            product_id,
            primary_category_id=body.primary_category_id,
            additional_category_ids=body.additional_category_ids or [],
        )
        db.commit()
        return ProductCategoryAssignmentRead.model_validate(data)
    except ProductCategoryError as e:
        db.rollback()
        raise _http(e) from e
