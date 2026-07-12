from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

import logging

from ..database import get_db
from ..models.printer import Printer
from ..models.printer_profile import PrinterProfile
from ..schemas.printer import PrinterPayload, PrinterResponse

router = APIRouter(prefix="/printers", tags=["Printers"])

logger = logging.getLogger(__name__)

TENANT_ID = 1


def _profile_to_nested(profile: PrinterProfile | None) -> dict | None:
    if not profile:
        return None
    return {
        "id": profile.id,
        "name": profile.name,
        "offset_x_mm": float(profile.offset_x_mm or 0),
        "offset_y_mm": float(profile.offset_y_mm or 0),
        "scale": float(profile.scale if profile.scale is not None else 1.0),
        "dpi": profile.dpi,
    }


def _printer_to_response(row: Printer) -> dict:
    profile = row.profile
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "profile_id": row.profile_id,
        "profile": _profile_to_nested(profile),
        "warehouse_id": row.warehouse_id,
        "connection_type": row.connection_type,
        "description": row.description,
        "provider": row.provider,
        "system_printer_name": row.system_printer_name,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("", response_model=list[PrinterResponse])
def list_printers(
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """List printers for the tenant (with nested profile)."""
    rows = (
        db.query(Printer)
        .options(joinedload(Printer.profile))
        .filter(Printer.tenant_id == tenant_id)
        .order_by(Printer.name.asc())
        .all()
    )
    logger.info("GET /printers tenant_id=%s -> %s legacy printers", tenant_id, len(rows))
    return [_printer_to_response(r) for r in rows]


@router.post("", response_model=PrinterResponse)
def create_printer(
    payload: PrinterPayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Create a printer."""
    row = Printer(
        tenant_id=tenant_id,
        name=payload.name.strip(),
        profile_id=payload.profile_id,
        warehouse_id=payload.warehouse_id,
        connection_type=payload.connection_type.strip() if payload.connection_type else None,
        description=payload.description.strip() if payload.description else None,
        provider=payload.provider.strip() if (payload.provider and payload.provider.strip()) else None,
        system_printer_name=payload.system_printer_name.strip() if (payload.system_printer_name and payload.system_printer_name.strip()) else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _printer_to_response(row)


@router.get("/{printer_id}", response_model=PrinterResponse)
def get_printer(
    printer_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Get one printer with profile."""
    row = (
        db.query(Printer)
        .options(joinedload(Printer.profile))
        .filter(Printer.id == printer_id, Printer.tenant_id == tenant_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Printer not found")
    return _printer_to_response(row)


@router.put("/{printer_id}", response_model=PrinterResponse)
def update_printer(
    printer_id: int,
    payload: PrinterPayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Update a printer."""
    row = db.query(Printer).filter(
        Printer.id == printer_id,
        Printer.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Printer not found")
    row.name = payload.name.strip()
    row.profile_id = payload.profile_id
    row.warehouse_id = payload.warehouse_id
    row.connection_type = payload.connection_type.strip() if payload.connection_type else None
    row.description = payload.description.strip() if payload.description else None
    row.provider = payload.provider.strip() if (payload.provider and payload.provider.strip()) else None
    row.system_printer_name = payload.system_printer_name.strip() if (payload.system_printer_name and payload.system_printer_name.strip()) else None
    db.commit()
    db.refresh(row)
    return _printer_to_response(row)


@router.delete("/{printer_id}")
def delete_printer(
    printer_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Delete a printer."""
    row = db.query(Printer).filter(
        Printer.id == printer_id,
        Printer.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Printer not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
