"""Agent test page — diagnostic print job via workstation printer mapping."""

from __future__ import annotations

import json
from datetime import datetime
from io import BytesIO

from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import (
    JOB_STATUS_PENDING,
    JOB_TYPE_PDF,
    SOURCE_MODULE_SETTINGS,
)
from ...models.printing.print_job import PrintJob
from ...models.printing.printer_agent import PrinterAgent
from ...models.wms_workstations import WmsWorkstation
from ...models.wms_workstations.constants import PRINT_TYPE_INVOICE, PRINT_TYPE_OTHER
from .errors import AgentNotFoundError, PrintingError
from .file_service import save_job_pdf
from .printer_resolution_service import resolve_workstation_mapped_printer_id_for_kind
from .queue_service import build_job_file_url


def _generate_test_page_pdf(
    *,
    agent: PrinterAgent,
    printer: AgentPrinter,
    tenant_name: str = "Tenant",
    warehouse_name: str = "—",
    workstation_name: str = "—",
) -> bytes:
    from ..pdf_deps import raise_if_no_reportlab

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError:
        raise_if_no_reportlab(False)
        raise

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    lines = [
        "Sasist Printer Test Page",
        "",
        f"Data: {now_str}",
        f"Stanowisko: {workstation_name}",
        f"Agent: {agent.name} (#{agent.id})",
        f"Komputer: {agent.machine_id}",
        f"Drukarka: {printer.name} ({printer.system_name})",
        f"Tenant: {tenant_name}",
        f"Warehouse: {warehouse_name}",
    ]
    y = height - 72
    c.setFont("Helvetica-Bold", 18)
    c.drawString(72, y, lines[0])
    y -= 36
    c.setFont("Helvetica", 12)
    for line in lines[2:]:
        c.drawString(72, y, line)
        y -= 20

    c.showPage()
    c.save()
    return buffer.getvalue()


def _resolve_workstation_for_agent(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int,
    workstation_id: int | None,
) -> WmsWorkstation:
    if workstation_id is not None:
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
            raise PrintingError("Stanowisko nie istnieje lub jest nieaktywne.", status_code=400)
        if row.printer_agent_id != int(agent_id):
            raise PrintingError(
                "Wybrane stanowisko nie jest połączone z tym Agentem.",
                status_code=400,
            )
        return row

    row = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.tenant_id == tenant_id,
            WmsWorkstation.printer_agent_id == int(agent_id),
            WmsWorkstation.is_active.is_(True),
        )
        .order_by(WmsWorkstation.id.asc())
        .first()
    )
    if row is None:
        raise PrintingError(
            "Agent nie jest przypisany do żadnego stanowiska. "
            "Połącz komputer w Ustawienia WMS → Stanowiska.",
            status_code=400,
            code="NO_WORKSTATION_AGENT",
        )
    return row


def _resolve_test_printer(
    db: Session,
    *,
    workstation: WmsWorkstation,
) -> AgentPrinter:
    """Printer from WorkstationPrinterMapping (invoice → other). Never PrintingDefaults."""
    for kind in ("a4", "receipt"):
        printer_id = resolve_workstation_mapped_printer_id_for_kind(
            db, workstation=workstation, kind=kind
        )
        if printer_id is None:
            continue
        printer = (
            db.query(AgentPrinter)
            .filter(AgentPrinter.id == int(printer_id), AgentPrinter.is_active.is_(True))
            .first()
        )
        if printer is not None:
            return printer

    # Explicit mapping types as fallback labels for error message
    _ = (PRINT_TYPE_INVOICE, PRINT_TYPE_OTHER)
    raise PrintingError(
        "Brak mapowania drukarki na stanowisku (Faktury / Pozostałe dokumenty). "
        "Ustaw mapowanie w Ustawienia WMS → Stanowiska → Drukarki.",
        status_code=400,
        code="NO_WORKSTATION_MAPPING",
    )


def create_agent_test_page_job(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int,
    api_base_url: str,
    workstation_id: int | None = None,
    created_by_user_id: int | None = None,
) -> PrintJob:
    agent = (
        db.query(PrinterAgent)
        .options(joinedload(PrinterAgent.printers))
        .filter(PrinterAgent.id == agent_id, PrinterAgent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise AgentNotFoundError("Printer agent not found")

    workstation = _resolve_workstation_for_agent(
        db,
        tenant_id=tenant_id,
        agent_id=agent.id,
        workstation_id=workstation_id,
    )
    printer = _resolve_test_printer(db, workstation=workstation)
    pdf_bytes = _generate_test_page_pdf(
        agent=agent,
        printer=printer,
        workstation_name=workstation.name,
    )

    job = PrintJob(
        tenant_id=tenant_id,
        warehouse_id=agent.warehouse_id,
        printer_id=printer.id,
        workstation_id=int(workstation.id),
        created_by_user_id=int(created_by_user_id) if created_by_user_id is not None else None,
        document_type="test_page",
        document_id=None,
        payload_json=json.dumps({"pdf_url": "pending", "copies": 1}, ensure_ascii=False),
        status=JOB_STATUS_PENDING,
        copies=1,
        retry_number=0,
        source_module=SOURCE_MODULE_SETTINGS,
        job_type=JOB_TYPE_PDF,
        created_at=datetime.utcnow(),
    )
    db.add(job)
    db.flush()

    save_job_pdf(job.id, pdf_bytes)
    file_url = build_job_file_url(api_base_url=api_base_url, job_id=job.id)
    job.payload_json = json.dumps({"pdf_url": file_url, "copies": 1}, ensure_ascii=False)
    db.commit()
    db.refresh(job)
    return job
