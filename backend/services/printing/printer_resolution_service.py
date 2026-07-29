"""Single source of truth for choosing an agent printer for a print job.

Priority (after explicit profile / request overrides in queue_service):
  1. WorkstationPrinterMapping for the resolved workstation
  2. Warehouse PrintingDefault (legacy fallback only for queue resolution)
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.printer_agent import PrinterAgent
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

# PrintMethodDialog kind → candidate workstation print_types (first match wins)
KIND_TO_PRINT_TYPES: dict[str, tuple[str, ...]] = {
    "label": (PRINT_TYPE_LABELS, PRINT_TYPE_SHIPPING_LABEL),
    "labels": (PRINT_TYPE_LABELS, PRINT_TYPE_SHIPPING_LABEL),
    "receipt": (PRINT_TYPE_OTHER,),
    "receipts": (PRINT_TYPE_OTHER,),
    "paragon": (PRINT_TYPE_OTHER,),
    "a4": (PRINT_TYPE_OTHER, PRINT_TYPE_INVOICE, PRINT_TYPE_ORDER),
}

NO_WORKSTATION_CODE = "NO_WORKSTATION"
NO_WORKSTATION_AGENT_CODE = "NO_WORKSTATION_AGENT"
NO_WORKSTATION_MAPPING_CODE = "NO_WORKSTATION_MAPPING"
STANOWISKA_HINT = "Ustawienia WMS → Stanowiska"


def document_type_to_print_type(document_type: str) -> str:
    key = (document_type or "").strip().lower()
    return DOCUMENT_TYPE_TO_PRINT_TYPE.get(key, PRINT_TYPE_OTHER)


def kind_to_print_types(kind: str) -> tuple[str, ...]:
    key = (kind or "a4").strip().lower()
    return KIND_TO_PRINT_TYPES.get(key, KIND_TO_PRINT_TYPES["a4"])


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


def resolve_workstation_mapped_printer_id_for_kind(
    db: Session,
    *,
    workstation: WmsWorkstation,
    kind: str,
) -> int | None:
    """First active mapped printer for any print_type matching the dialog kind."""
    for print_type in kind_to_print_types(kind):
        mapping = (
            db.query(WorkstationPrinterMapping)
            .filter(
                WorkstationPrinterMapping.workstation_id == workstation.id,
                WorkstationPrinterMapping.print_type == print_type,
            )
            .first()
        )
        if mapping is None:
            continue
        printer = (
            db.query(AgentPrinter)
            .filter(AgentPrinter.id == mapping.agent_printer_id)
            .first()
        )
        if printer is None or not printer.is_active:
            continue
        if printer.agent_id != workstation.printer_agent_id:
            continue
        return int(printer.id)
    return None


def assess_workstation_cloud_print_capability(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    kind: str,
    workstation_id: int | None,
    is_agent_online,
) -> dict[str, Any]:
    """
    Readiness for Sasist Agent print based on Stanowisko → Agent → mapping.
    Does not consult legacy PrintingDefault.
    """
    kind_norm = (kind or "a4").strip().lower()
    if kind_norm not in KIND_TO_PRINT_TYPES:
        kind_norm = "a4"

    base: dict[str, Any] = {
        "kind": kind_norm,
        "printer_id": None,
        "has_online_agent": False,
        "workstation_id": int(workstation_id) if workstation_id is not None else None,
        "message": None,
        "ready": False,
        "reason": None,
    }

    workstation = resolve_workstation_for_print(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        workstation_id=workstation_id,
    )
    if workstation is None:
        return {
            **base,
            "reason": NO_WORKSTATION_CODE,
            "message": (
                "Brak przypisanego stanowiska WMS. "
                f"Przypisz stanowisko użytkownikowi lub skonfiguruj je w {STANOWISKA_HINT}."
            ),
        }

    base["workstation_id"] = int(workstation.id)

    if workstation.printer_agent_id is None:
        return {
            **base,
            "reason": NO_WORKSTATION_AGENT_CODE,
            "message": (
                "Stanowisko nie ma przypisanego Sasist Agent. "
                f"Połącz komputer w {STANOWISKA_HINT}."
            ),
        }

    agent = db.query(PrinterAgent).filter(PrinterAgent.id == workstation.printer_agent_id).first()
    if agent is None:
        return {
            **base,
            "reason": NO_WORKSTATION_AGENT_CODE,
            "message": (
                "Stanowisko ma nieaktualne przypisanie Agenta. "
                f"Połącz ponownie komputer w {STANOWISKA_HINT}."
            ),
        }

    online = bool(is_agent_online(agent))
    base["has_online_agent"] = online

    printer_id = resolve_workstation_mapped_printer_id_for_kind(
        db, workstation=workstation, kind=kind_norm
    )
    if printer_id is None:
        return {
            **base,
            "reason": NO_WORKSTATION_MAPPING_CODE,
            "message": (
                "Brak mapowania drukarki na stanowisku. "
                f"Ustaw mapowanie urządzeń w {STANOWISKA_HINT}."
            ),
        }

    base["printer_id"] = printer_id

    if not online:
        return {
            **base,
            "reason": "AGENT_OFFLINE",
            "message": (
                "Sasist Agent przypisany do stanowiska jest offline. "
                "Uruchom Agenta na komputerze stanowiska."
            ),
        }

    return {
        **base,
        "ready": True,
        "reason": None,
        "message": None,
    }
