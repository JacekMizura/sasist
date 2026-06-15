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
from ..services.warehouse_scoped_access_service import (
    WarehouseContextMismatchError,
    assert_entity_warehouse_matches_active,
)
from .deps import get_current_user
from .warehouse_access_config import wms_warehouse_access_hard_enforcement

_logger = logging.getLogger(__name__)


def assert_warehouse_scoped_entity_access(
    db: Session,
    user: AppUser,
    entity_warehouse_id: int | None,
    active_warehouse_id: int,
) -> int:
    """P2.2 SSOT: active WH context + user operability on entity warehouse."""
    wid = assert_entity_warehouse_matches_active(entity_warehouse_id, active_warehouse_id)
    enforce_warehouse_access(db, user, wid)
    return wid


def load_stock_document_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    document_id: int,
    active_warehouse_id: int,
):
    """Load StockDocument or 404; enforce P2.2 warehouse scope."""
    from ..models.stock_document import StockDocument

    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(document_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Document not found")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(doc, "warehouse_id", None), active_warehouse_id
    )
    return doc


def load_stock_document_item_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    item_id: int,
    active_warehouse_id: int,
):
    """Load StockDocumentItem + parent doc; enforce P2.2 warehouse scope on document."""
    from ..models.stock_document import StockDocument, StockDocumentItem

    row = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == int(item_id))
        .first()
    )
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Pozycja nie znaleziona")
    doc = (
        db.query(StockDocument)
        .filter(
            StockDocument.id == int(row.document_id),
            StockDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if doc is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Document not found")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(doc, "warehouse_id", None), active_warehouse_id
    )
    return row, doc


def load_inventory_document_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    document_id: int,
    active_warehouse_id: int,
):
    from ..models.inventory_count.document import InventoryDocument

    doc = (
        db.query(InventoryDocument)
        .filter(
            InventoryDocument.id == int(document_id),
            InventoryDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if doc is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Inventory document not found")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(doc, "warehouse_id", None), active_warehouse_id
    )
    return doc


def load_production_order_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    order_id: int,
    active_warehouse_id: int,
):
    from ..models.production import ProductionOrder

    row = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.id == int(order_id), ProductionOrder.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Zlecenie nie istnieje.")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(row, "warehouse_id", None), active_warehouse_id
    )
    return row


def load_production_batch_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    batch_id: int,
    active_warehouse_id: int,
):
    from ..models.product_composition import ProductionBatch

    row = (
        db.query(ProductionBatch)
        .filter(ProductionBatch.id == int(batch_id), ProductionBatch.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Partia nie istnieje.")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(row, "warehouse_id", None), active_warehouse_id
    )
    return row


def load_inventory_task_for_active_warehouse(
    db: Session,
    user: AppUser,
    *,
    tenant_id: int,
    task_id: int,
    active_warehouse_id: int,
):
    from ..models.inventory_count.task import InventoryTask

    row = (
        db.query(InventoryTask)
        .filter(InventoryTask.id == int(task_id), InventoryTask.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Inventory task not found")
    assert_warehouse_scoped_entity_access(
        db, user, getattr(row, "warehouse_id", None), active_warehouse_id
    )
    return row


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
