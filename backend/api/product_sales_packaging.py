"""PPWR stage 3A — ProductSalesPackaging CRUD (not inventory)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db, engine
from ..db.schema_upgrade import ensure_ppwr_stage_3a_schema
from ..models.app_user import AppUser
from ..models.product import Product
from ..models.product_sales_packaging import ProductSalesPackaging
from ..services.packaging_materials.ppwr_constants import (
    PPWR_STATUS_NOT_ASSESSED,
    compute_ppwr_readiness,
    normalize_ppwr_level,
    normalize_ppwr_status,
    validate_pct_0_100,
)

router = APIRouter(prefix="/products", tags=["Product sales packaging (PPWR)"])


def _ensure_schema() -> None:
    try:
        ensure_ppwr_stage_3a_schema(engine)
    except Exception:
        pass


class ProductSalesPackagingRead(BaseModel):
    id: str
    product_id: int
    name: str
    level: str
    ppwr_format: Optional[str] = None
    material_category: Optional[str] = None
    mass_g: Optional[float] = None
    recyclable_pct: Optional[float] = None
    recycled_content_pct: Optional[float] = None
    is_reusable: Optional[bool] = None
    ppwr_status: str = PPWR_STATUS_NOT_ASSESSED
    is_active: bool = True
    sort_order: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductSalesPackagingWrite(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    level: str = Field(default="PRIMARY", max_length=16)
    ppwr_format: Optional[str] = Field(None, max_length=64)
    material_category: Optional[str] = Field(None, max_length=128)
    mass_g: Optional[float] = Field(None, ge=0)
    recyclable_pct: Optional[float] = None
    recycled_content_pct: Optional[float] = None
    is_reusable: Optional[bool] = None
    ppwr_status: Optional[str] = None
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)

    @field_validator("recyclable_pct", "recycled_content_pct", mode="before")
    @classmethod
    def _pct(cls, v: object, info) -> object:  # type: ignore[no-untyped-def]
        if v is None or v == "":
            return None
        return validate_pct_0_100(v, field=str(info.field_name))


class ProductSalesPackagingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    level: Optional[str] = Field(None, max_length=16)
    ppwr_format: Optional[str] = Field(None, max_length=64)
    material_category: Optional[str] = Field(None, max_length=128)
    mass_g: Optional[float] = Field(None, ge=0)
    recyclable_pct: Optional[float] = None
    recycled_content_pct: Optional[float] = None
    is_reusable: Optional[bool] = None
    ppwr_status: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator("recyclable_pct", "recycled_content_pct", mode="before")
    @classmethod
    def _pct(cls, v: object, info) -> object:  # type: ignore[no-untyped-def]
        if v is None or v == "":
            return None
        return validate_pct_0_100(v, field=str(info.field_name))


def _to_read(row: ProductSalesPackaging) -> ProductSalesPackagingRead:
    return ProductSalesPackagingRead(
        id=str(row.id),
        product_id=int(row.product_id),
        name=str(row.name or ""),
        level=str(row.level or "PRIMARY"),
        ppwr_format=(str(row.ppwr_format).strip() if row.ppwr_format else None) or None,
        material_category=(str(row.material_category).strip() if row.material_category else None) or None,
        mass_g=float(row.mass_g) if row.mass_g is not None else None,
        recyclable_pct=float(row.recyclable_pct) if row.recyclable_pct is not None else None,
        recycled_content_pct=float(row.recycled_content_pct) if row.recycled_content_pct is not None else None,
        is_reusable=bool(row.is_reusable) if row.is_reusable is not None else None,
        ppwr_status=str(row.ppwr_status or PPWR_STATUS_NOT_ASSESSED),
        is_active=bool(row.is_active),
        sort_order=int(row.sort_order or 0),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_product(db: Session, product_id: int, tenant_id: int) -> Product:
    p = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produkt nie znaleziony")
    return p


def _apply_status(row: ProductSalesPackaging) -> None:
    has_assessment_inputs = bool(
        (row.ppwr_format or "").strip()
        or row.recyclable_pct is not None
        or row.recycled_content_pct is not None
        or row.is_reusable is not None
    )
    row.ppwr_status = compute_ppwr_readiness(
        ppwr_function="SALES" if has_assessment_inputs else None,
        ppwr_format=row.ppwr_format,
        recyclable_pct=float(row.recyclable_pct) if row.recyclable_pct is not None else None,
        recycled_content_pct=float(row.recycled_content_pct) if row.recycled_content_pct is not None else None,
        is_reusable=bool(row.is_reusable) if row.is_reusable is not None else None,
        explicit_status=str(row.ppwr_status or PPWR_STATUS_NOT_ASSESSED),
    )


@router.get("/{product_id}/sales-packaging", response_model=List[ProductSalesPackagingRead])
def list_product_sales_packaging(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    _ensure_schema()
    _get_product(db, product_id, tenant_id)
    rows = (
        db.query(ProductSalesPackaging)
        .filter(ProductSalesPackaging.product_id == int(product_id))
        .order_by(ProductSalesPackaging.sort_order.asc(), ProductSalesPackaging.id.asc())
        .all()
    )
    return [_to_read(r) for r in rows]


@router.post("/{product_id}/sales-packaging", response_model=ProductSalesPackagingRead, status_code=201)
def create_product_sales_packaging(
    product_id: int,
    body: ProductSalesPackagingWrite,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    _ensure_schema()
    _get_product(db, product_id, tenant_id)
    try:
        level = normalize_ppwr_level(body.level)
        status = normalize_ppwr_status(body.ppwr_status) if body.ppwr_status is not None else PPWR_STATUS_NOT_ASSESSED
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = ProductSalesPackaging(
        id=str(uuid.uuid4()),
        product_id=int(product_id),
        name=body.name.strip(),
        level=level,
        ppwr_format=(body.ppwr_format or "").strip() or None,
        material_category=(body.material_category or "").strip() or None,
        mass_g=body.mass_g,
        recyclable_pct=body.recyclable_pct,
        recycled_content_pct=body.recycled_content_pct,
        is_reusable=body.is_reusable,
        ppwr_status=status,
        is_active=bool(body.is_active),
        sort_order=int(body.sort_order or 0),
    )
    _apply_status(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_read(row)


@router.put("/{product_id}/sales-packaging/{packaging_id}", response_model=ProductSalesPackagingRead)
def update_product_sales_packaging(
    product_id: int,
    packaging_id: str,
    body: ProductSalesPackagingUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    _ensure_schema()
    _get_product(db, product_id, tenant_id)
    row = (
        db.query(ProductSalesPackaging)
        .filter(
            ProductSalesPackaging.id == packaging_id.strip(),
            ProductSalesPackaging.product_id == int(product_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Opakowanie produktu nie znalezione")
    data = body.model_dump(exclude_unset=True)
    try:
        if "level" in data and data["level"] is not None:
            row.level = normalize_ppwr_level(data["level"])
        if "ppwr_status" in data:
            row.ppwr_status = normalize_ppwr_status(data["ppwr_status"])
        if "name" in data and data["name"] is not None:
            row.name = str(data["name"]).strip()
        if "ppwr_format" in data:
            row.ppwr_format = (str(data["ppwr_format"]).strip() if data["ppwr_format"] else None) or None
        if "material_category" in data:
            row.material_category = (
                str(data["material_category"]).strip() if data["material_category"] else None
            ) or None
        if "mass_g" in data:
            row.mass_g = data["mass_g"]
        if "recyclable_pct" in data:
            row.recyclable_pct = validate_pct_0_100(data["recyclable_pct"], field="recyclable_pct")
        if "recycled_content_pct" in data:
            row.recycled_content_pct = validate_pct_0_100(
                data["recycled_content_pct"], field="recycled_content_pct"
            )
        if "is_reusable" in data:
            row.is_reusable = data["is_reusable"]
        if "is_active" in data and data["is_active"] is not None:
            row.is_active = bool(data["is_active"])
        if "sort_order" in data and data["sort_order"] is not None:
            row.sort_order = int(data["sort_order"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _apply_status(row)
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _to_read(row)


@router.delete("/{product_id}/sales-packaging/{packaging_id}", status_code=204)
def delete_product_sales_packaging(
    product_id: int,
    packaging_id: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    _ = user
    _ensure_schema()
    _get_product(db, product_id, tenant_id)
    row = (
        db.query(ProductSalesPackaging)
        .filter(
            ProductSalesPackaging.id == packaging_id.strip(),
            ProductSalesPackaging.product_id == int(product_id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Opakowanie produktu nie znalezione")
    db.delete(row)
    db.commit()
    return None
