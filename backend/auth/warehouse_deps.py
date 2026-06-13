"""FastAPI dependencies — operable warehouse scope for WMS (P1)."""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.app_user import AppUser
from ..services.user_warehouse_context_service import (
    UserWarehouseAccessError,
    assert_user_can_operate_warehouse,
    resolve_active_warehouse_id,
    user_can_operate_warehouse,
)
from .deps import get_current_user
from .warehouse_access_config import wms_warehouse_access_hard_enforcement

_logger = logging.getLogger(__name__)


def enforce_warehouse_access(db: Session, user: AppUser, warehouse_id: int) -> None:
    """SSOT gate: ``assert_user_can_operate_warehouse`` (+ log-only mode)."""
    wid = int(warehouse_id)
    if user_can_operate_warehouse(db, user, wid):
        return
    detail = f"Brak dostępu do magazynu id={wid}."
    if wms_warehouse_access_hard_enforcement():
        assert_user_can_operate_warehouse(db, user, wid)
        return
    _logger.warning(
        "[wms_warehouse_access] would deny user_id=%s warehouse_id=%s (log-only mode)",
        user.id,
        wid,
    )


def assert_resource_warehouse(db: Session, user: AppUser, resource: Any, *, attr: str = "warehouse_id") -> int:
    """After loading an entity, verify user may operate on its warehouse."""
    wid = getattr(resource, attr, None)
    if wid is None:
        raise UserWarehouseAccessError("Obiekt nie ma przypisanego magazynu.")
    enforce_warehouse_access(db, user, int(wid))
    return int(wid)


def assert_stock_document_warehouse(db: Session, user: AppUser, doc: Any) -> int:
    return assert_resource_warehouse(db, user, doc, attr="warehouse_id")


def require_operable_warehouse(
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int:
    enforce_warehouse_access(db, user, warehouse_id)
    return int(warehouse_id)


def require_operable_warehouse_optional(
    warehouse_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int | None:
    if warehouse_id is None:
        return None
    enforce_warehouse_access(db, user, warehouse_id)
    return int(warehouse_id)


def require_active_operable_warehouse(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int:
    """Operator work context — active warehouse from profile."""
    wid = resolve_active_warehouse_id(db, user)
    if wid is None:
        raise UserWarehouseAccessError("Brak aktywnego magazynu — przypisz magazyn w profilu WMS.")
    enforce_warehouse_access(db, user, int(wid))
    return int(wid)


def require_active_or_query_operable_warehouse(
    warehouse_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
) -> int:
    """Explicit warehouse_id when provided; otherwise active warehouse."""
    if warehouse_id is not None:
        enforce_warehouse_access(db, user, warehouse_id)
        return int(warehouse_id)
    return require_active_operable_warehouse(db=db, user=user)


OperableWarehouseId = Annotated[int, Depends(require_operable_warehouse)]
OperableWarehouseIdOptional = Annotated[int | None, Depends(require_operable_warehouse_optional)]
ActiveOperableWarehouseId = Annotated[int, Depends(require_active_operable_warehouse)]
ActiveOrQueryOperableWarehouseId = Annotated[int, Depends(require_active_or_query_operable_warehouse)]
