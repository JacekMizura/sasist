"""Fiscal dispatch boundary — KSeF/printer hooks (async-ready stub)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...models.document_generation_job import DocumentGenerationJob
from ...models.sale_document import SaleDocument
from ..operational_observability import log_document_pipeline
from ..operational_sales_events import emit_operational_sales_event

logger = logging.getLogger(__name__)

FISCAL_SKIPPED = "SKIPPED"
FISCAL_PENDING = "PENDING"
FISCAL_DISPATCHED = "DISPATCHED"


@dataclass
class FiscalDispatchResult:
    status: str
    fiscal_ref: str | None


def dispatch_fiscal_for_document(
    db: Session,
    *,
    job: DocumentGenerationJob,
    sale_document: SaleDocument,
    performed_by_user_id: int | None = None,
) -> FiscalDispatchResult:
    """
    Phase 3 boundary — no inline fiscal printer calls.

    Later: enqueue to fiscal worker / KSeF adapter.
    """
    fiscal_profile = None
    try:
        import json

        payload = json.loads(job.payload_json or "{}")
        fiscal_profile = (payload.get("resolution") or {}).get("fiscal_profile")
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass

    if not fiscal_profile or str(fiscal_profile).upper() in ("NONE", "SKIP", ""):
        log_document_pipeline(
            action="fiscal_skip",
            job_id=int(job.id),
            tenant_id=int(job.tenant_id),
            warehouse_id=int(job.warehouse_id),
            order_id=int(job.order_id) if job.order_id else None,
            status=FISCAL_SKIPPED,
        )
        return FiscalDispatchResult(FISCAL_SKIPPED, None)

    job.fiscal_status = FISCAL_PENDING
    ref = f"fiscal-pending:{sale_document.id}"
    job.fiscal_ref = ref
    emit_operational_sales_event(
        db,
        "document.fiscalized",
        tenant_id=int(job.tenant_id),
        warehouse_id=int(job.warehouse_id),
        order_id=int(job.order_id) if job.order_id else None,
        session_id=int(job.session_id) if job.session_id else None,
        source="document_pipeline",
        performed_by_user_id=performed_by_user_id,
        extra={"job_id": int(job.id), "sale_document_id": str(sale_document.id), "fiscal_ref": ref},
    )
    log_document_pipeline(
        action="fiscal_dispatch",
        job_id=int(job.id),
        tenant_id=int(job.tenant_id),
        warehouse_id=int(job.warehouse_id),
        order_id=int(job.order_id) if job.order_id else None,
        status=FISCAL_PENDING,
        fiscal_ref=ref,
    )
    return FiscalDispatchResult(FISCAL_PENDING, ref)
