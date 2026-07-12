"""Agent printer listing and configuration."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.printing.printer import AgentPrinterPatch, AgentPrinterRead
from ...services.printing.errors import PrintingError
from ...services.printing.printer_service import list_agent_printers, patch_agent_printer
from ._helpers import raise_printing_error

router = APIRouter()


def _serialize_printer(row: Any) -> dict[str, Any]:
    agent = row.agent
    return {
        "id": row.id,
        "agent_id": row.agent_id,
        "name": row.name,
        "system_name": row.system_name,
        "printer_type": row.printer_type,
        "is_default": row.is_default,
        "capabilities_json": row.capabilities_json,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "agent_name": agent.name if agent else None,
        "machine_id": agent.machine_id if agent else None,
    }


@router.get("/printers", response_model=list[AgentPrinterRead])
def get_agent_printers(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    agent_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = list_agent_printers(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        agent_id=agent_id,
    )
    return [_serialize_printer(row) for row in rows]


@router.patch("/printers/{printer_id}", response_model=AgentPrinterRead)
def patch_agent_printer_endpoint(
    printer_id: int,
    payload: AgentPrinterPatch,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        row = patch_agent_printer(
            db,
            tenant_id=tenant_id,
            printer_id=printer_id,
            patch=payload,
        )
    except PrintingError as exc:
        raise_printing_error(exc)
    return _serialize_printer(row)
