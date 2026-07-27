"""GET/POST /agent/devices* — registry + delta sync."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.agent.devices import (
    DeviceSyncRequest,
    DeviceSyncResponse,
    EdgeDeviceRead,
    UpdateDeviceConfigurationRequest,
)
from ...services.agent.device_registry_service import (
    get_edge_device,
    list_edge_devices,
    sync_devices_from_agent,
    update_device_configuration,
)
from ...services.agent.security import (
    assert_user_may_enqueue_action,
    enforce_agent_rate_limit,
    validate_configuration_payload,
    validate_replay_headers,
)
from ...services.printing.agent_auth_service import get_current_agent

router = APIRouter()


@router.get("/devices", response_model=list[EdgeDeviceRead])
def get_agent_devices(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    agent_id: int | None = Query(default=None, ge=1),
    type: str | None = Query(default=None),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_edge_devices(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        agent_id=agent_id,
        device_type=type,
    )


@router.post("/devices/sync", response_model=DeviceSyncResponse)
def sync_agent_devices(
    payload: DeviceSyncRequest,
    request: Request,
    agent: PrinterAgent = Depends(get_current_agent),
    _: None = Depends(validate_replay_headers),
    db: Session = Depends(get_db),
):
    enforce_agent_rate_limit(request, f"agent:{agent.id}")
    result = sync_devices_from_agent(db, agent, payload)
    db.commit()
    return result


@router.get("/device/{device_id}", response_model=EdgeDeviceRead)
def get_agent_device(
    device_id: str,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = get_edge_device(db, tenant_id=tenant_id, device_id=device_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return row


@router.put("/device/{device_id}/configuration", response_model=EdgeDeviceRead)
def put_device_configuration(
    device_id: str,
    payload: UpdateDeviceConfigurationRequest,
    tenant_id: int = Query(..., ge=1),
    agent_id: int | None = Query(default=None, ge=1),
    user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_user_may_enqueue_action(db, user, "UpdateDeviceConfiguration")
    validate_configuration_payload(payload.values)
    try:
        row = update_device_configuration(
            db,
            tenant_id=tenant_id,
            device_id=device_id,
            agent_id=agent_id,
            payload=payload,
        )
        db.commit()
        return row
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
