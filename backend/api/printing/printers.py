"""Agent printer listing and configuration."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.printing.printer import AgentPrinterPatch, AgentPrinterRead
from ...services.printing.assignment_service import agent_printer_status_fields
from ...services.printing.errors import PrintingError
from ...services.printing.printer_service import (
    list_agent_printers,
    list_system_printer_names,
    patch_agent_printer,
)
from ._helpers import raise_printing_error

router = APIRouter()
logger = logging.getLogger(__name__)


def _serialize_printer(row: Any) -> dict[str, Any]:
    agent = row.agent
    status = agent_printer_status_fields(agent)
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
        **status,
    }


@router.get("/printers/system", response_model=list[str])
def get_system_printer_names(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    online_only: bool = Query(default=False),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    names = list_system_printer_names(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        online_only=online_only,
    )
    logger.info(
        "GET /printing/printers/system tenant_id=%s warehouse_id=%s online_only=%s -> %s names",
        tenant_id,
        warehouse_id,
        online_only,
        len(names),
    )
    return names


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
    active_count = sum(1 for row in rows if row.is_active)
    logger.info(
        "GET /printing/printers tenant_id=%s warehouse_id=%s agent_id=%s -> %s printers (%s active)",
        tenant_id,
        warehouse_id,
        agent_id,
        len(rows),
        active_count,
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
