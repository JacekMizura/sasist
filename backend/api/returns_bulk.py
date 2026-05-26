"""Panel bulk actions for RMZ (returns) — office triage."""

from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.return_ui_status import ReturnUiStatus
from ..models.wms_order_return import WmsOrderReturn
from ..schemas.bulk_panel import BulkPanelStatusPayload
from ..schemas.entity_delete import EntityBulkDeleteResult, entity_bulk_delete_result_from_service_dict
from ..services.delete_service import archive_wms_returns_bulk
from .office_return_ui import office_return_ui_warehouse_id

router = APIRouter(prefix="/returns", tags=["Returns Panel"])


class ReturnsPanelBulkDeleteBody(BaseModel):
    """POST /returns/bulk-delete — magazyn z kontekstu panelu (query / default), tylko lista id."""

    ids: List[int] = Field(..., min_length=1)


def _warehouse_id_for_return_mutation(
    db: Session,
    return_id: int,
    tenant_id: int,
    warehouse_id: Optional[int] = None,
) -> int:
    row_scope = (
        db.query(WmsOrderReturn)
        .filter(WmsOrderReturn.id == return_id, WmsOrderReturn.tenant_id == tenant_id)
        .first()
    )
    if not row_scope:
        raise HTTPException(status_code=404, detail="Return not found")
    wh_id = int(row_scope.warehouse_id)
    if warehouse_id is not None and int(warehouse_id) != wh_id:
        raise HTTPException(status_code=400, detail="warehouse_id does not match return warehouse")
    return wh_id


@router.post("/bulk-status")
def returns_bulk_panel_status(
    body: BulkPanelStatusPayload,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    """Set the same panel ``return_ui_status`` on many RMZ rows (does not change workflow ``ReturnStatus``)."""
    raw_ids: List[int] = []
    for x in body.ids:
        s = str(x).strip()
        if s.isdigit():
            raw_ids.append(int(s))
    unique_ids: List[int] = list(dict.fromkeys(raw_ids))
    if not unique_ids:
        raise HTTPException(status_code=400, detail="No valid return ids")
    sid: Optional[int] = None
    st = (body.status or "").strip()
    if st != "":
        try:
            sid = int(st)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Invalid status id") from e
        us = (
            db.query(ReturnUiStatus)
            .filter(
                ReturnUiStatus.id == sid,
                ReturnUiStatus.tenant_id == tenant_id,
                ReturnUiStatus.warehouse_id == warehouse_id,
            )
            .first()
        )
        if not us:
            raise HTTPException(status_code=400, detail="Unknown panel sub-status for this warehouse")
    all_rows = (
        db.query(WmsOrderReturn)
        .filter(
            WmsOrderReturn.tenant_id == tenant_id,
            WmsOrderReturn.warehouse_id == warehouse_id,
            WmsOrderReturn.id.in_(unique_ids),
        )
        .all()
    )
    found_all: Set[int] = {int(r.id) for r in all_rows}
    if found_all != set(unique_ids):
        raise HTTPException(status_code=400, detail="Some return ids were not found in this warehouse")
    if any(getattr(r, "deleted_at", None) is not None for r in all_rows):
        raise HTTPException(status_code=400, detail="Nie można zmienić statusu dla zarchiwizowanych zwrotów")
    rows = all_rows
    for row in rows:
        row.ui_status_id = sid
    db.commit()
    return {"updated": len(rows)}


@router.post("/bulk-delete", response_model=EntityBulkDeleteResult)
def returns_bulk_delete(
    body: ReturnsPanelBulkDeleteBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    """Archiwizacja wielu zwrotów RMZ (panel — te same reguły co ``/wms/returns/bulk-archive``)."""
    result = archive_wms_returns_bulk(db, tenant_id, warehouse_id, body.ids)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.delete("/{return_id}", response_model=EntityBulkDeleteResult)
def returns_delete_one(
    return_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(office_return_ui_warehouse_id),
    db: Session = Depends(get_db),
):
    """Archiwizacja pojedynczego zwrotu z panelu listy."""
    wh_id = _warehouse_id_for_return_mutation(db, return_id, tenant_id, warehouse_id)
    result = archive_wms_returns_bulk(db, tenant_id, wh_id, [return_id])
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)
