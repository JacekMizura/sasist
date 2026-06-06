"""Enqueue document generation jobs — decoupled from complete endpoint."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.document_generation_job import (
    JOB_PENDING,
    DocumentGenerationJob,
)
from ...models.order import Order
from ..document_number_service import resolve_default_document_series
from ..document_series_seed_service import ensure_default_document_series
from .series_resolution_service import (
    SeriesResolutionContext,
    resolve_document_series,
    series_context_from_order,
)
from ..direct_sale.errors import DirectSaleError
from ..operational_observability import log_document_pipeline
from ..operational_sales_events import emit_operational_sales_event

logger = logging.getLogger(__name__)


@dataclass
class DocumentJobEnqueueResult:
    job_id: int
    status: str
    series_id: str | None


def enqueue_document_job(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    session_id: int | None = None,
    document_type: str = "SALE",
    document_subtype: str = "RECEIPT",
    order: Order | None = None,
    fiscal_profile: str | None = None,
    operational_zone: str | None = None,
    performed_by_user_id: int | None = None,
    device_id: int | None = None,
    max_attempts: int = 3,
) -> DocumentJobEnqueueResult:
    if order is None:
        order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        raise DirectSaleError("Zamówienie nie istnieje.", code="order_not_found", http_status=404)

    sub = str(document_subtype or "RECEIPT").strip().upper()
    try:
        ensure_default_document_series(db, int(tenant_id), int(warehouse_id))
    except Exception:
        logger.exception(
            "[document.pipeline] ensure_default_document_series failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
    ctx = series_context_from_order(
        db,
        order,
        document_type=document_type,
        document_subtype=sub,
        fiscal_profile=fiscal_profile,
        operational_zone=operational_zone,
    )
    series = resolve_document_series(db, ctx)
    if series is None:
        series = resolve_default_document_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            series_type="SALE",
            subtype=sub,
        )
    series_id = str(series.id) if series else None
    if series is None:
        logger.warning(
            "[document.pipeline] no SALE series tenant_id=%s warehouse_id=%s subtype=%s order_id=%s",
            tenant_id,
            warehouse_id,
            sub,
            order_id,
        )

    payload = {
        "document_type": document_type,
        "document_subtype": document_subtype,
        "series_id": series_id,
        "resolution": {
            "order_channel": ctx.order_channel,
            "fulfillment_mode": ctx.fulfillment_mode,
            "fiscal_profile": fiscal_profile,
            "operational_zone": operational_zone,
        },
    }
    job = DocumentGenerationJob(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        session_id=int(session_id) if session_id else None,
        document_type=str(document_type).upper(),
        document_subtype=str(document_subtype).upper(),
        series_id=series_id,
        status=JOB_PENDING,
        max_attempts=int(max_attempts),
        payload_json=json.dumps(payload, ensure_ascii=False),
        created_at=datetime.utcnow(),
    )
    db.add(job)
    db.flush()

    emit_operational_sales_event(
        db,
        "document.requested",
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=int(order_id),
        session_id=session_id,
        source="document_pipeline",
        performed_by_user_id=performed_by_user_id,
        device_id=device_id,
        extra={"job_id": int(job.id), "series_id": series_id, "subtype": document_subtype},
    )
    log_document_pipeline(
        action="enqueue",
        job_id=int(job.id),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
        session_id=session_id,
        status=JOB_PENDING,
        series_id=series_id,
    )
    return DocumentJobEnqueueResult(int(job.id), JOB_PENDING, series_id)
