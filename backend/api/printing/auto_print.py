"""Auto-print tenant settings (configuration only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.printing.release import PrintingAutoPrintRead, PrintingAutoPrintUpdate
from ...services.printing.auto_print_service import get_auto_print_settings, update_auto_print_settings

router = APIRouter()


@router.get("/auto-print", response_model=PrintingAutoPrintRead)
def read_auto_print_settings(
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_auto_print_settings(db, tenant_id=tenant_id)


@router.put("/auto-print", response_model=PrintingAutoPrintRead)
def write_auto_print_settings(
    payload: PrintingAutoPrintUpdate,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return update_auto_print_settings(db, tenant_id=tenant_id, payload=payload)
