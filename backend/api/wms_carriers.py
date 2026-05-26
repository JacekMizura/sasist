"""HTTP API: WMS warehouse carriers."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..schemas.wms_carriers import (
    WarehouseCarrierAddItemsBody,
    WarehouseCarrierBulkCreate,
    WarehouseCarrierBulkCreateResult,
    WarehouseCarrierCreate,
    WarehouseCarrierDetailRead,
    WarehouseCarrierGroupCreate,
    WarehouseCarrierGroupRead,
    WarehouseCarrierLogRead,
    WarehouseCarrierMoveBody,
    WarehouseCarrierPatch,
    WarehouseCarrierRead,
    WarehouseCarrierRemoveItemsBody,
    WarehouseCarrierScanOut,
)
from ..services.wms_workforce_activity import MODULE_CARRIERS, log_wms_workforce_activity
from ..services.wms_carrier_service import (
    add_carrier_items,
    bulk_create_carriers,
    create_carrier,
    create_carrier_group,
    empty_carrier,
    get_carrier,
    list_carrier_groups,
    list_carrier_logs,
    list_carriers,
    move_carrier,
    patch_carrier,
    remove_carrier_items,
    scan_carrier_by_barcode,
    soft_delete_carrier,
)

router = APIRouter(prefix="/wms", tags=["WMS carriers"])


@router.get("/carrier-groups", response_model=List[WarehouseCarrierGroupRead])
def get_carrier_groups(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return list_carrier_groups(db, tenant_id)


@router.post("/carrier-groups", response_model=WarehouseCarrierGroupRead)
def post_carrier_group(
    body: WarehouseCarrierGroupCreate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    return create_carrier_group(db, tenant_id, body, current_user)


@router.get("/carriers/scan/{barcode}", response_model=WarehouseCarrierScanOut)
def get_carrier_scan(
    barcode: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    return scan_carrier_by_barcode(db, tenant_id, barcode)


@router.get("/carriers", response_model=List[WarehouseCarrierRead])
def get_carriers(
    tenant_id: int = Query(..., ge=1),
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
):
    return list_carriers(db, tenant_id, include_deleted=include_deleted)


@router.post("/carriers", response_model=WarehouseCarrierRead)
def post_carrier(
    body: WarehouseCarrierCreate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        row = create_carrier(db, tenant_id, body, current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_CARRIERS,
            action_type="carrier_create",
            entity_type="WarehouseCarrier",
            entity_id=row.id,
            metadata={"code": getattr(row, "code", None)},
        )
        db.commit()
        return row
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/carriers/bulk-create", response_model=WarehouseCarrierBulkCreateResult)
def post_carriers_bulk_create(
    body: WarehouseCarrierBulkCreate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        res = bulk_create_carriers(db, tenant_id, body, current_user)
        log_wms_workforce_activity(
            db,
            user=current_user,
            tenant_id=tenant_id,
            module=MODULE_CARRIERS,
            action_type="carrier_bulk_create",
            entity_type="WarehouseCarrier",
            entity_id=int(res.first_id),
            metadata={"quantity": body.quantity, "prefix": body.prefix},
        )
        db.commit()
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/carriers/{carrier_id}", response_model=WarehouseCarrierDetailRead)
def get_carrier_by_id(
    carrier_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        return get_carrier(db, tenant_id, carrier_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/carriers/{carrier_id}/logs", response_model=List[WarehouseCarrierLogRead])
def get_carrier_logs(
    carrier_id: int,
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return list_carrier_logs(db, tenant_id, carrier_id, limit=limit)


@router.patch("/carriers/{carrier_id}", response_model=WarehouseCarrierRead)
def patch_carrier_by_id(
    carrier_id: int,
    body: WarehouseCarrierPatch,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        return patch_carrier(db, tenant_id, carrier_id, body, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/carriers/{carrier_id}")
def delete_carrier_by_id(
    carrier_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        soft_delete_carrier(db, tenant_id, carrier_id, current_user)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/carriers/{carrier_id}/move", response_model=WarehouseCarrierRead)
def post_carrier_move(
    carrier_id: int,
    body: WarehouseCarrierMoveBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        return move_carrier(db, tenant_id, carrier_id, body, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/carriers/{carrier_id}/add-items", response_model=WarehouseCarrierRead)
def post_carrier_add_items(
    carrier_id: int,
    body: WarehouseCarrierAddItemsBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        return add_carrier_items(db, tenant_id, carrier_id, body, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/carriers/{carrier_id}/remove-items", response_model=WarehouseCarrierRead)
def post_carrier_remove_items(
    carrier_id: int,
    body: WarehouseCarrierRemoveItemsBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        return remove_carrier_items(db, tenant_id, carrier_id, body, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/carriers/{carrier_id}/empty", response_model=WarehouseCarrierRead)
def post_carrier_empty(
    carrier_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    try:
        return empty_carrier(db, tenant_id, carrier_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
