"""Agent test page — diagnostic print job."""

from __future__ import annotations

import json
from datetime import datetime
from io import BytesIO

from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import (
    JOB_STATUS_PENDING,
    JOB_TYPE_PDF,
    PRINTER_TYPE_A4,
    SOURCE_MODULE_SETTINGS,
)
from ...models.printing.print_job import PrintJob
from ...models.printing.printer_agent import PrinterAgent
from .errors import AgentNotFoundError, PrintingError
from .file_service import save_job_pdf
from .queue_service import build_job_file_url
from .printer_service import get_printing_defaults


def _generate_test_page_pdf(
    *,
    agent: PrinterAgent,
    printer: AgentPrinter,
    tenant_name: str = "Tenant",
    warehouse_name: str = "—",
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


def _resolve_test_printer(db: Session, agent: PrinterAgent) -> AgentPrinter:
    defaults = get_printing_defaults(
        db,
        tenant_id=agent.tenant_id,
        warehouse_id=agent.warehouse_id,
    )
    default_id = defaults.get("a4_printer_id")
    if default_id:
        printer = (
            db.query(AgentPrinter)
            .filter(
                AgentPrinter.id == int(default_id),
                AgentPrinter.agent_id == agent.id,
                AgentPrinter.is_active.is_(True),
            )
            .first()
        )
        if printer:
            return printer

    printer = (
        db.query(AgentPrinter)
        .filter(
            AgentPrinter.agent_id == agent.id,
            AgentPrinter.is_active.is_(True),
            AgentPrinter.printer_type == PRINTER_TYPE_A4,
        )
        .order_by(AgentPrinter.is_default.desc(), AgentPrinter.id.asc())
        .first()
    )
    if printer:
        return printer

    printer = (
        db.query(AgentPrinter)
        .filter(AgentPrinter.agent_id == agent.id, AgentPrinter.is_active.is_(True))
        .order_by(AgentPrinter.id.asc())
        .first()
    )
    if printer is None:
        raise PrintingError("Agent has no active printers for test page", status_code=400)
    return printer


def create_agent_test_page_job(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int,
    api_base_url: str,
) -> PrintJob:
    agent = (
        db.query(PrinterAgent)
        .options(joinedload(PrinterAgent.printers))
        .filter(PrinterAgent.id == agent_id, PrinterAgent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise AgentNotFoundError("Printer agent not found")

    printer = _resolve_test_printer(db, agent)
    pdf_bytes = _generate_test_page_pdf(agent=agent, printer=printer)

    job = PrintJob(
        tenant_id=tenant_id,
        warehouse_id=agent.warehouse_id,
        printer_id=printer.id,
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
