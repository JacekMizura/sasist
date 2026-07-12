"""Tenant default printer selection."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.printing.defaults import PrintingDefaultsRead, PrintingDefaultsUpdate
from ...services.printing.errors import PrintingError
from ...services.printing.printer_service import get_printing_defaults, upsert_printing_defaults
from ._helpers import raise_printing_error

router = APIRouter()


@router.get("/defaults", response_model=PrintingDefaultsRead)
def read_printing_defaults(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_printing_defaults(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.put("/defaults", response_model=PrintingDefaultsRead)
def update_printing_defaults(
    payload: PrintingDefaultsUpdate,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.warehouse_id is not None:
        warehouse_id = payload.warehouse_id
    merged = payload.model_copy(update={"warehouse_id": warehouse_id})
    try:
        return upsert_printing_defaults(db, tenant_id=tenant_id, payload=merged)
    except PrintingError as exc:
        raise_printing_error(exc)
