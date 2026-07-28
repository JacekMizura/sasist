"""Single source of truth for choosing an agent printer for a print job.

Priority (after explicit profile / request overrides in queue_service):
  1. WorkstationPrinterMapping for the resolved workstation
  2. Warehouse PrintingDefault (legacy fallback)
"""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.wms_workstations import WmsWorkstation, WorkstationPrinterMapping
from ...models.wms_workstations.constants import (
    PRINT_TYPE_INVOICE,
    PRINT_TYPE_LABELS,
    PRINT_TYPE_ORDER,
    PRINT_TYPE_OTHER,
    PRINT_TYPE_SHIPPING_LABEL,
)

# Queue / document_type → workstation business print_type
DOCUMENT_TYPE_TO_PRINT_TYPE: dict[str, str] = {
    "label": PRINT_TYPE_LABELS,
    "sale_document": PRINT_TYPE_INVOICE,
    "stock_document": PRINT_TYPE_OTHER,
    "production_batch_card": PRINT_TYPE_OTHER,
    "production_order_card": PRINT_TYPE_ORDER,
    "receipt": PRINT_TYPE_OTHER,
    # Aliases used by some callers / future queue kinds
    "shipping_label": PRINT_TYPE_SHIPPING_LABEL,
    "invoice": PRINT_TYPE_INVOICE,
    "order": PRINT_TYPE_ORDER,
}


def document_type_to_print_type(document_type: str) -> str:
    key = (document_type or "").strip().lower()
    return DOCUMENT_TYPE_TO_PRINT_TYPE.get(key, PRINT_TYPE_OTHER)


def resolve_workstation_for_print(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    workstation_id: int | None,
) -> WmsWorkstation | None:
    """
    Resolve workstation only when the caller passes an explicit workstation_id.
    Do not invent a default/first station — that silently misroutes multi-station warehouses.
    warehouse_id is used as an extra scope check when provided.
    """
    bind = db.get_bind()
    try:
        from sqlalchemy import inspect as sa_inspect

        if not sa_inspect(bind).has_table("wms_workstations"):
            return None
    except Exception:
        return None

    if workstation_id is None:
        return None

    row = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.id == int(workstation_id),
            WmsWorkstation.tenant_id == tenant_id,
            WmsWorkstation.is_active.is_(True),
        )
        .first()
    )
    if row is None:
        return None
    if warehouse_id is not None and int(row.warehouse_id) != int(warehouse_id):
        return None
    return row


def resolve_workstation_mapped_printer_id(
    db: Session,
    *,
    workstation: WmsWorkstation,
    document_type: str,
) -> int | None:
    """
    Return agent_printer_id from WorkstationPrinterMapping when:
    - mapping exists for the document's print_type
    - printer is active and belongs to the workstation's assigned agent
    Otherwise None → caller falls back to PrintingDefault.
    """
    if workstation.printer_agent_id is None:
        return None

    print_type = document_type_to_print_type(document_type)
    mapping = (
        db.query(WorkstationPrinterMapping)
        .filter(
            WorkstationPrinterMapping.workstation_id == workstation.id,
            WorkstationPrinterMapping.print_type == print_type,
        )
        .first()
    )
    if mapping is None:
        return None

    printer = (
        db.query(AgentPrinter)
        .options(joinedload(AgentPrinter.agent))
        .filter(AgentPrinter.id == mapping.agent_printer_id)
        .first()
    )
    if printer is None or not printer.is_active:
        return None
    if printer.agent_id != workstation.printer_agent_id:
        return None
    return int(printer.id)
