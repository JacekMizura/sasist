"""Central product SKU / catalog number generation API."""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.product_codes import preview_or_allocate
from ..services.product_codes.errors import ProductCodeError

router = APIRouter(prefix="/product-codes", tags=["ProductCodes"])


class ProductCodeRequest(BaseModel):
    kind: Literal["sku", "catalog"]
    category_id: Optional[int] = Field(None, ge=1)
    product_id: Optional[int] = Field(None, ge=1)


class ProductCodeResult(BaseModel):
    kind: str
    category_id: int
    code: str
    template: str
    sequence_key: str
    sequence_n: int
    value: str
    allocated: bool


def _http(err: ProductCodeError) -> HTTPException:
    status = 400
    return HTTPException(status_code=status, detail={"message": err.message, "code": err.code})


@router.post("/preview", response_model=ProductCodeResult)
def api_preview_product_code(
    body: ProductCodeRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """Next value without consuming the counter — for UI preview under Generuj."""
    try:
        data = preview_or_allocate(
            db,
            tenant_id,
            kind=body.kind,
            category_id=body.category_id,
            product_id=body.product_id,
            allocate=False,
        )
        return ProductCodeResult.model_validate(data)
    except ProductCodeError as e:
        raise _http(e) from e


@router.post("/allocate", response_model=ProductCodeResult)
def api_allocate_product_code(
    body: ProductCodeRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Consume next sequence number and return the generated code.
    Does not write to the product row — client fills the form field.
    """
    try:
        data = preview_or_allocate(
            db,
            tenant_id,
            kind=body.kind,
            category_id=body.category_id,
            product_id=body.product_id,
            allocate=True,
        )
        db.commit()
        return ProductCodeResult.model_validate(data)
    except ProductCodeError as e:
        db.rollback()
        raise _http(e) from e
