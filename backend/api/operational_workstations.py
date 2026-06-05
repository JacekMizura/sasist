"""Operational workstation registry API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.commerce_operational import OperationalWorkstation
from ..schemas.operational_workstation import OperationalWorkstationRead

router = APIRouter(prefix="/operational-workstations", tags=["Operational workstations"])


@router.get("", response_model=list[OperationalWorkstationRead])
def list_workstations(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    q = db.query(OperationalWorkstation).filter(
        OperationalWorkstation.tenant_id == int(tenant_id),
        OperationalWorkstation.warehouse_id == int(warehouse_id),
    )
    if active_only:
        q = q.filter(OperationalWorkstation.is_active != 0)
    rows = q.order_by(OperationalWorkstation.code.asc()).all()
    return [
        OperationalWorkstationRead(
            id=int(r.id),
            tenant_id=int(r.tenant_id),
            warehouse_id=int(r.warehouse_id),
            code=str(r.code or ""),
            name=str(r.name or ""),
            device_type=r.device_type,
            operational_zone_id=int(r.operational_zone_id) if r.operational_zone_id else None,
            printer_id=int(r.printer_id) if getattr(r, "printer_id", None) else None,
            scanner_type=getattr(r, "scanner_type", None),
            fiscal_terminal_id=int(r.fiscal_terminal_id) if getattr(r, "fiscal_terminal_id", None) else None,
            zone_id=int(r.zone_id) if getattr(r, "zone_id", None) else None,
            is_active=bool(r.is_active),
        )
        for r in rows
    ]


@router.get("/{workstation_id}", response_model=OperationalWorkstationRead)
def get_workstation(
    workstation_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = (
        db.query(OperationalWorkstation)
        .filter(
            OperationalWorkstation.id == int(workstation_id),
            OperationalWorkstation.tenant_id == int(tenant_id),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Workstation not found.")
    return OperationalWorkstationRead(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        warehouse_id=int(row.warehouse_id),
        code=str(row.code or ""),
        name=str(row.name or ""),
        device_type=row.device_type,
        operational_zone_id=int(row.operational_zone_id) if row.operational_zone_id else None,
        printer_id=int(row.printer_id) if getattr(row, "printer_id", None) else None,
        scanner_type=getattr(row, "scanner_type", None),
        fiscal_terminal_id=int(row.fiscal_terminal_id) if getattr(row, "fiscal_terminal_id", None) else None,
        zone_id=int(row.zone_id) if getattr(row, "zone_id", None) else None,
        is_active=bool(row.is_active),
    )
