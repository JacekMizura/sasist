"""WMS workstations API — physical workplaces + Sasist Agent pairing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user, require_permission
from ...database import get_db
from ...models.app_user import AppUser
from ...services.app_user_admin_service import workstation_ids_for_user
from ...services.wms_workstations import (
    WorkstationError,
    WorkstationNotFoundError,
    create_workstation,
    delete_workstation,
    disconnect_computer,
    get_printers_config,
    get_workstation_or_404,
    issue_pairing_code,
    list_devices_grouped,
    list_history,
    list_workstations,
    put_printer_mapping,
    update_workstation,
)
from ...services.wms_workstations.schemas import (
    DevicesGroupedResponse,
    HistoryResponse,
    PairingResponse,
    PrinterMappingPutBody,
    PrintersConfigResponse,
    WorkstationCreateBody,
    WorkstationDetail,
    WorkstationListItem,
    WorkstationListResponse,
    WorkstationPairingStatus,
    WorkstationUpdateBody,
)
from ...services.wms_workstations.serialize import serialize_workstation

router = APIRouter(prefix="/wms/workstations", tags=["WMS workstations"])

_admin_perm = require_permission("settings.users")


def _raise(exc: WorkstationError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/available-for-me", response_model=WorkstationListResponse)
def get_workstations_available_for_me(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Packing-allowed workstations for the logged-in operator."""
    allowed = set(workstation_ids_for_user(db, int(user.id)))
    if not allowed:
        return WorkstationListResponse(items=[])
    items = [
        WorkstationListItem(**row)
        for row in list_workstations(db, tenant_id=tenant_id, warehouse_id=None)
        if int(row["id"]) in allowed
    ]
    return WorkstationListResponse(items=items)


@router.get("", response_model=WorkstationListResponse)
def get_workstations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    items = [
        WorkstationListItem(**row)
        for row in list_workstations(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    ]
    return WorkstationListResponse(items=items)


@router.post("", response_model=WorkstationDetail)
def post_workstation(
    body: WorkstationCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        data = create_workstation(
            db,
            tenant_id=tenant_id,
            name=body.name,
            warehouse_id=body.warehouse_id,
            station_type=body.station_type,
            description=body.description,
            is_default=body.is_default,
            is_active=body.is_active,
            actor_user_id=getattr(user, "id", None),
        )
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return WorkstationDetail(**data)


@router.get("/{workstation_id}", response_model=WorkstationDetail)
def get_workstation(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
        return WorkstationDetail(**serialize_workstation(db, row, detail=True))
    except WorkstationError as exc:
        _raise(exc)


@router.get("/{workstation_id}/pairing-status", response_model=WorkstationPairingStatus)
def get_workstation_pairing_status(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    """Slim status for FE pairing poll — smaller than full detail."""
    try:
        row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
        data = serialize_workstation(db, row, detail=True)
        return WorkstationPairingStatus(
            id=data["id"],
            connection_status=data["connection_status"],
            pairing_active=bool(data.get("pairing_active")),
            pairing_expires_at=data.get("pairing_expires_at"),
            computer_name=data.get("computer_name"),
            agent=data.get("agent"),
        )
    except WorkstationError as exc:
        _raise(exc)


@router.patch("/{workstation_id}", response_model=WorkstationDetail)
def patch_workstation(
    workstation_id: int,
    body: WorkstationUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        data = update_workstation(
            db,
            tenant_id=tenant_id,
            workstation_id=workstation_id,
            patch=body.model_dump(exclude_unset=True),
            actor_user_id=getattr(user, "id", None),
        )
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return WorkstationDetail(**data)


@router.delete("/{workstation_id}")
def remove_workstation(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        delete_workstation(db, tenant_id=tenant_id, workstation_id=workstation_id)
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return {"ok": True}


@router.post("/{workstation_id}/pair", response_model=PairingResponse)
def pair_workstation(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        data = issue_pairing_code(
            db,
            tenant_id=tenant_id,
            workstation_id=workstation_id,
            actor_user_id=getattr(user, "id", None),
        )
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return PairingResponse(**data)


@router.post("/{workstation_id}/disconnect", response_model=WorkstationDetail)
def disconnect_workstation(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        data = disconnect_computer(
            db,
            tenant_id=tenant_id,
            workstation_id=workstation_id,
            actor_user_id=getattr(user, "id", None),
        )
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return WorkstationDetail(**data)


@router.post("/{workstation_id}/restart-agent")
def restart_workstation_agent(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    """Remote agent restart is not implemented — do not record a success event."""
    try:
        row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
        if row.printer_agent_id is None:
            raise WorkstationError("Brak podłączonego komputera")
    except WorkstationError as exc:
        _raise(exc)
    raise HTTPException(
        status_code=501,
        detail="Zdalny restart Agenta będzie dostępny w kolejnej wersji.",
    )


@router.get("/{workstation_id}/devices", response_model=DevicesGroupedResponse)
def get_workstation_devices(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        data = list_devices_grouped(db, tenant_id=tenant_id, workstation_id=workstation_id)
        # Persist edge→agent_printer materialization from self-heal.
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return DevicesGroupedResponse(**data)


@router.get("/{workstation_id}/printers", response_model=PrintersConfigResponse)
def get_workstation_printers(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        data = get_printers_config(db, tenant_id=tenant_id, workstation_id=workstation_id)
        # Persist edge→agent_printer materialization so mapping/print jobs stay consistent.
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return PrintersConfigResponse(**data)


@router.put("/{workstation_id}/printer-mapping", response_model=PrintersConfigResponse)
def put_workstation_printer_mapping(
    workstation_id: int,
    body: PrinterMappingPutBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    user: AppUser = Depends(_admin_perm),
):
    try:
        data = put_printer_mapping(
            db,
            tenant_id=tenant_id,
            workstation_id=workstation_id,
            mappings=body.mappings,
            actor_user_id=getattr(user, "id", None),
        )
        db.commit()
    except WorkstationError as exc:
        db.rollback()
        _raise(exc)
    return PrintersConfigResponse(**data)


@router.get("/{workstation_id}/history", response_model=HistoryResponse)
def get_workstation_history(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: AppUser = Depends(_admin_perm),
):
    try:
        items = list_history(
            db,
            tenant_id=tenant_id,
            workstation_id=workstation_id,
            limit=limit,
            offset=offset,
        )
    except WorkstationError as exc:
        _raise(exc)
    return HistoryResponse(items=items)
