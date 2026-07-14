from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import logging

from ..database import get_db
from ..models.printer_profile import PrinterProfile
from ..schemas.printer_profile import PrinterProfilePayload, PrinterProfileResponse

router = APIRouter(prefix="/printer-profiles", tags=["Printer Profiles"])

logger = logging.getLogger(__name__)

TENANT_ID = 1


def _profile_to_response(row: PrinterProfile) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "dpi": row.dpi,
        "offset_x_mm": float(row.offset_x_mm or 0),
        "offset_y_mm": float(row.offset_y_mm or 0),
        "scale": float(row.scale if row.scale is not None else 1.0),
        "agent_printer_id": row.agent_printer_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("", response_model=list[PrinterProfileResponse])
def list_profiles(
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """List printer profiles for the tenant."""
    rows = (
        db.query(PrinterProfile)
        .filter(PrinterProfile.tenant_id == tenant_id)
        .order_by(PrinterProfile.name.asc())
        .all()
    )
    logger.info("GET /printer-profiles tenant_id=%s -> %s profiles", tenant_id, len(rows))
    return [_profile_to_response(r) for r in rows]


@router.post("", response_model=PrinterProfileResponse)
def create_profile(
    payload: PrinterProfilePayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Create a printer profile."""
    row = PrinterProfile(
        tenant_id=tenant_id,
        name=payload.name.strip(),
        dpi=payload.dpi,
        offset_x_mm=payload.offset_x_mm,
        offset_y_mm=payload.offset_y_mm,
        scale=payload.scale,
        agent_printer_id=payload.agent_printer_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _profile_to_response(row)


@router.get("/{profile_id}", response_model=PrinterProfileResponse)
def get_profile(
    profile_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Get one printer profile."""
    row = db.query(PrinterProfile).filter(
        PrinterProfile.id == profile_id,
        PrinterProfile.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Printer profile not found")
    return _profile_to_response(row)


@router.put("/{profile_id}", response_model=PrinterProfileResponse)
def update_profile(
    profile_id: int,
    payload: PrinterProfilePayload,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Update a printer profile."""
    row = db.query(PrinterProfile).filter(
        PrinterProfile.id == profile_id,
        PrinterProfile.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Printer profile not found")
    row.name = payload.name.strip()
    row.dpi = payload.dpi
    row.offset_x_mm = payload.offset_x_mm
    row.offset_y_mm = payload.offset_y_mm
    row.scale = payload.scale
    row.agent_printer_id = payload.agent_printer_id
    db.commit()
    db.refresh(row)
    return _profile_to_response(row)


@router.delete("/{profile_id}")
def delete_profile(
    profile_id: int,
    tenant_id: int = TENANT_ID,
    db: Session = Depends(get_db),
):
    """Delete a printer profile."""
    row = db.query(PrinterProfile).filter(
        PrinterProfile.id == profile_id,
        PrinterProfile.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Printer profile not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
