"""Queue print jobs from documents and labels (server-side PDF generation)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from ...models.printing.constants import (
    JOB_TYPE_LABEL,
    JOB_TYPE_PDF,
    SOURCE_MODULE_DOCUMENTS,
    SOURCE_MODULE_LABELS,
    SOURCE_MODULE_PRODUCTION,
    SOURCE_MODULE_WAREHOUSE,
)
from ...schemas.printing.job import PrintJobCreateRequest, PrintJobPayload
from ...schemas.printing.queue import QueuePrintRequest
from .assignment_service import ensure_queue_target_agent_online, log_print_queue
from .errors import PrintingError
from .file_service import save_job_pdf
from .job_service import create_print_job

logger = logging.getLogger(__name__)

SUPPORTED_DOCUMENT_TYPES = frozenset(
    {
        "stock_document",
        "sale_document",
        "label",
        "production_batch_card",
        "production_order_card",
    }
)

_DOCUMENT_META: dict[str, tuple[str, str]] = {
    "stock_document": (SOURCE_MODULE_WAREHOUSE, JOB_TYPE_PDF),
    "sale_document": (SOURCE_MODULE_DOCUMENTS, JOB_TYPE_PDF),
    "label": (SOURCE_MODULE_LABELS, JOB_TYPE_LABEL),
    "production_batch_card": (SOURCE_MODULE_PRODUCTION, JOB_TYPE_PDF),
    "production_order_card": (SOURCE_MODULE_PRODUCTION, JOB_TYPE_PDF),
}


def resolve_default_printer_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    document_type: str,
) -> int:
    """Legacy — unused by queue path. Kept for rare callers; raises always."""
    _ = (db, tenant_id, warehouse_id, document_type)
    raise PrintingError(
        "Brak mapowania drukarki na stanowisku. "
        "Skonfiguruj mapowanie w Ustawienia WMS → Stanowiska.",
        status_code=400,
        code="NO_WORKSTATION_MAPPING",
    )


@dataclass(frozen=True)
class QueuePrinterResolution:
    printer_id: int
    source: str
    requested_profile_id: int | None
    requested_printer_id: int | None
    workstation_id: int | None = None


def _extract_requested_profile_id(payload: QueuePrintRequest) -> int | None:
    if payload.printer_profile_id is not None:
        return int(payload.printer_profile_id)
    if payload.label is not None and payload.label.printer_profile_id is not None:
        return int(payload.label.printer_profile_id)
    return None


def resolve_queue_printer_id(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    document_type: str,
    requested_printer_id: int | None,
    requested_profile_id: int | None,
    workstation_id: int | None = None,
) -> QueuePrinterResolution:
    """
    Printer selection for the print queue.

    Order:
      1. Explicit printer_id on the request (rare / label tooling)
      2. WorkstationPrinterMapping for workstation_id (SSOT for packing)
    No warehouse PrintingDefault fallback.
    """
    from .printer_resolution_service import (
        resolve_workstation_for_print,
        resolve_workstation_mapped_printer_id,
    )

    # Profile override removed — not a user-printer assignment path.
    _ = requested_profile_id

    if requested_printer_id is not None:
        return QueuePrinterResolution(
            printer_id=int(requested_printer_id),
            source="request",
            requested_profile_id=None,
            requested_printer_id=requested_printer_id,
            workstation_id=workstation_id,
        )

    if workstation_id is None:
        raise PrintingError(
            "Brak stanowiska dla wydruku. Rozpocznij pakowanie i wybierz stanowisko.",
            status_code=400,
            code="NO_WORKSTATION",
        )

    workstation = resolve_workstation_for_print(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        workstation_id=workstation_id,
    )
    if workstation is None:
        raise PrintingError(
            "Stanowisko nie istnieje lub jest nieaktywne.",
            status_code=400,
            code="NO_WORKSTATION",
        )

    mapped_id = resolve_workstation_mapped_printer_id(
        db,
        workstation=workstation,
        document_type=document_type,
    )
    if mapped_id is None:
        raise PrintingError(
            "Brak mapowania drukarki na stanowisku. "
            "Skonfiguruj mapowanie w Ustawienia WMS → Stanowiska.",
            status_code=400,
            code="NO_WORKSTATION_MAPPING",
        )

    return QueuePrinterResolution(
        printer_id=mapped_id,
        source="workstation",
        requested_profile_id=None,
        requested_printer_id=requested_printer_id,
        workstation_id=workstation.id,
    )


def log_queue_printer_resolution(resolution: QueuePrinterResolution) -> None:
    logger.info(
        "[print-queue] requested_profile_id=%s requested_printer_id=%s "
        "resolved_printer_id=%s resolution_source=%s workstation_id=%s",
        resolution.requested_profile_id,
        resolution.requested_printer_id,
        resolution.printer_id,
        resolution.source,
        resolution.workstation_id,
    )


def _generate_stock_document_pdf(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    template_version_id: int | None,
) -> bytes:
    from ..document_print_service import PdfRendererUnavailable
    from ..stock_document_html_pdf_service import build_stock_document_html_pdf_bytes
    from ..stock_document_pdf_service import build_stock_document_pdf_bytes

    try:
        try:
            return build_stock_document_html_pdf_bytes(
                db,
                tenant_id=tenant_id,
                document_id=document_id,
                template_version_id=template_version_id,
            )
        except PdfRendererUnavailable:
            raise
        except (FileNotFoundError, RuntimeError, OSError):
            return build_stock_document_pdf_bytes(db, tenant_id, document_id)
    except ValueError as exc:
        raise PrintingError(str(exc), status_code=404) from exc


def _generate_sale_document_pdf(
    db: Session,
    *,
    tenant_id: int,
    document_id: str,
    template_version_id: int | None,
) -> bytes:
    from ..sale_document_pdf_service import build_sale_document_pdf_bytes

    try:
        return build_sale_document_pdf_bytes(
            db,
            tenant_id=tenant_id,
            document_id=document_id,
            template_version_id=template_version_id,
        )
    except ValueError as exc:
        raise PrintingError(str(exc), status_code=404) from exc


def _generate_label_pdf(
    db: Session,
    *,
    tenant_id: int,
    label_payload: dict[str, Any],
) -> bytes:
    from ..label_render_service import render_label_template
    from ..location_label_filters import apply_label_filters

    template_id = label_payload.get("template_id")
    records = label_payload.get("records") or []
    if template_id is None:
        raise PrintingError("label.template_id is required", status_code=400)
    if not records:
        raise PrintingError("label.records cannot be empty", status_code=400)

    exclude_floors = label_payload.get("exclude_floors")
    records_for_pdf = apply_label_filters(records, exclude_floors)
    if not records_for_pdf:
        raise PrintingError("Brak rekordów etykiet po filtrze.", status_code=400)

    calibration = None
    profile_id = label_payload.get("printer_profile_id")
    if profile_id is not None:
        from ...models.printer_profile import PrinterProfile

        profile = (
            db.query(PrinterProfile)
            .filter(PrinterProfile.id == int(profile_id), PrinterProfile.tenant_id == tenant_id)
            .first()
        )
        if profile:
            calibration = {
                "offset_x_mm": float(profile.offset_x_mm or 0),
                "offset_y_mm": float(profile.offset_y_mm or 0),
                "scale": float(profile.scale if profile.scale is not None else 1.0),
            }

    try:
        return render_label_template(
            db=db,
            template_id=int(template_id),
            data=records_for_pdf,
            tenant_id=tenant_id,
            calibration=calibration,
            override_template_json=label_payload.get("template_json"),
            print_mode=bool(label_payload.get("print_mode", False)),
            group_mode=bool(label_payload.get("group_mode", False)),
            group_by_rack=bool(label_payload.get("group_by_rack", False)),
            floor_sets=label_payload.get("floor_sets"),
        )
    except ValueError as exc:
        raise PrintingError(str(exc), status_code=400) from exc


def generate_pdf_bytes(db: Session, *, tenant_id: int, payload: QueuePrintRequest) -> bytes:
    document_type = payload.document_type.strip().lower()
    if document_type == "stock_document":
        if payload.document_id is None:
            raise PrintingError("document_id is required for stock_document", status_code=400)
        return _generate_stock_document_pdf(
            db,
            tenant_id=tenant_id,
            document_id=int(payload.document_id),
            template_version_id=payload.template_version_id,
        )
    if document_type == "sale_document":
        if not payload.document_id_str:
            raise PrintingError("document_id_str is required for sale_document", status_code=400)
        return _generate_sale_document_pdf(
            db,
            tenant_id=tenant_id,
            document_id=str(payload.document_id_str),
            template_version_id=payload.template_version_id,
        )
    if document_type == "label":
        if payload.label is None:
            raise PrintingError("label payload is required", status_code=400)
        return _generate_label_pdf(db, tenant_id=tenant_id, label_payload=payload.label.model_dump())
    if document_type == "production_batch_card":
        if payload.document_id is None:
            raise PrintingError("document_id is required for production_batch_card", status_code=400)
        from ..production_execution.production_card_pdf_service import (
            generate_batch_production_card_pdf_bytes,
        )

        return generate_batch_production_card_pdf_bytes(
            db, tenant_id=tenant_id, batch_id=int(payload.document_id)
        )
    if document_type == "production_order_card":
        if payload.document_id is None:
            raise PrintingError("document_id is required for production_order_card", status_code=400)
        from ..production_execution.production_card_pdf_service import (
            generate_order_production_card_pdf_bytes,
        )

        return generate_order_production_card_pdf_bytes(
            db, tenant_id=tenant_id, order_id=int(payload.document_id)
        )
    raise PrintingError(f"Unsupported document_type: {document_type}", status_code=400)


def build_job_file_url(*, api_base_url: str, job_id: int) -> str:
    base = api_base_url.rstrip("/")
    return f"{base}/api/printing/jobs/{job_id}/file"


def queue_print_job(
    db: Session,
    *,
    tenant_id: int,
    payload: QueuePrintRequest,
    api_base_url: str,
    created_by_user_id: int | None = None,
) -> Any:
    document_type = payload.document_type.strip().lower()
    if document_type not in SUPPORTED_DOCUMENT_TYPES:
        raise PrintingError(f"Unsupported document_type: {document_type}", status_code=400)

    warehouse_id = payload.warehouse_id
    requested_profile_id = _extract_requested_profile_id(payload)
    resolution = resolve_queue_printer_id(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        document_type=document_type,
        requested_printer_id=payload.printer_id,
        requested_profile_id=requested_profile_id,
        workstation_id=payload.workstation_id,
    )
    log_queue_printer_resolution(resolution)
    printer_id = resolution.printer_id
    target_printer, target_agent = ensure_queue_target_agent_online(
        db,
        tenant_id=tenant_id,
        printer_id=printer_id,
    )

    pdf_bytes = generate_pdf_bytes(db, tenant_id=tenant_id, payload=payload)
    copies = max(1, int(payload.copies or 1))

    document_id: int | None = None
    if document_type in {
        "stock_document",
        "production_batch_card",
        "production_order_card",
    } and payload.document_id is not None:
        document_id = int(payload.document_id)
    elif document_type == "sale_document" and payload.document_id_str:
        document_id = None

    source_module, job_type = _DOCUMENT_META.get(document_type, (SOURCE_MODULE_WAREHOUSE, JOB_TYPE_PDF))

    job_request = PrintJobCreateRequest(
        printer_id=printer_id,
        document_type=document_type,
        document_id=document_id,
        warehouse_id=warehouse_id,
        payload=PrintJobPayload(pdf_url="pending", copies=copies),
    )
    job = create_print_job(
        db,
        tenant_id=tenant_id,
        payload=job_request,
        copies=copies,
        source_module=source_module,
        job_type=job_type,
        workstation_id=resolution.workstation_id,
        created_by_user_id=created_by_user_id,
    )

    save_job_pdf(job.id, pdf_bytes)
    file_url = build_job_file_url(api_base_url=api_base_url, job_id=job.id)
    job.payload_json = json.dumps({"pdf_url": file_url, "copies": copies}, ensure_ascii=False)
    db.commit()
    db.refresh(job)

    log_print_queue(
        job_id=job.id,
        printer_id=target_printer.id,
        agent_id=target_agent.id,
        machine_id=target_agent.machine_id,
        warehouse_id=job.warehouse_id,
        requested_profile_id=resolution.requested_profile_id,
        requested_printer_id=resolution.requested_printer_id,
        resolution_source=resolution.source,
    )
    return job
