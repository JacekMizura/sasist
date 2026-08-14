"""Emit domain Activity Log milestones for production MO/BAT."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import (
    PRODUCTION_COLLECTION_COMPLETED,
    PRODUCTION_COLLECTION_STARTED,
    PRODUCTION_COMPLETED,
    PRODUCTION_PROGRESS_REPORTED,
    PRODUCTION_PUTAWAY_COMPLETED,
    PRODUCTION_PW_CREATED,
    PRODUCTION_RELEASED,
    PRODUCTION_RW_CREATED,
    PRODUCTION_STARTED,
)


def _mo_label(order: Any) -> str:
    num = getattr(order, "number", None) or getattr(order, "document_number", None)
    oid = getattr(order, "id", None)
    return str(num).strip() if num else (f"MO-{oid}" if oid else "MO")


def _batch_label(batch: Any) -> str:
    num = getattr(batch, "number", None) or getattr(batch, "batch_number", None)
    bid = getattr(batch, "id", None)
    return str(num).strip() if num else (f"BAT-{bid}" if bid else "BAT")


def emit_production_released(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    order_ids: Optional[list[int]] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:released" if mo else f"batch:{bat}:released"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    # link first sales order if provided
    first_order = order_ids[0] if order_ids else None
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_RELEASED,
        description=f"Wydano do WMS: {lbl}",
        actor_user_id=actor_user_id,
        order_id=first_order,
        production_order_id=mo,
        batch_id=bat,
        correlation_id=key,
        source_module="production",
        category="status",
        production_label=lbl,
        metadata={"mo_number": lbl if mo else None, "batch_number": lbl if bat and not mo else None},
    )


def emit_production_collection_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:collection-started" if mo else f"batch:{bat}:collection-started"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COLLECTION_STARTED,
        description=f"Rozpoczęto pobieranie komponentów: {lbl}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        correlation_id=key,
        source_module="production",
        category="picking",
        production_label=lbl,
        metadata={"mo_number": lbl if mo else None, "batch_number": lbl if bat and not mo else None},
    )


def emit_production_collection_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:collection-completed" if mo else f"batch:{bat}:collection-completed"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COLLECTION_COMPLETED,
        description=f"Zakończono pobieranie komponentów: {lbl}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        correlation_id=key,
        source_module="production",
        category="picking",
        severity="SUCCESS",
        production_label=lbl,
        metadata={"mo_number": lbl if mo else None, "batch_number": lbl if bat and not mo else None},
    )


def emit_production_rw_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:rw:{doc_id}" if mo else f"batch:{bat}:rw:{doc_id}"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    doc_no = document_number or f"RW#{doc_id}"
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_RW_CREATED,
        description=f"Utworzono {doc_no} (komponenty produkcji)",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=doc_id,
        correlation_id=key,
        source_module="production",
        category="status",
        severity="SUCCESS",
        production_label=lbl,
        document_label=doc_no,
        metadata={
            "mo_number": lbl if mo else None,
            "batch_number": lbl if bat and not mo else None,
            "document_number": doc_no,
        },
    )


def emit_production_started(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:started" if mo else f"batch:{bat}:started"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_STARTED,
        description=f"Rozpoczęto produkcję: {lbl}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        correlation_id=key,
        source_module="production",
        category="status",
        production_label=lbl,
        metadata={"mo_number": lbl if mo else None, "batch_number": lbl if bat and not mo else None},
    )


def emit_production_progress_reported(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    qty: Optional[float] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
    correlation_suffix: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    suffix = correlation_suffix or (f"qty:{qty}" if qty is not None else "tick")
    key = f"mo:{mo}:progress:{suffix}" if mo else f"batch:{bat}:progress:{suffix}"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    qtxt = f" (+{qty:g})" if qty is not None else ""
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PROGRESS_REPORTED,
        description=f"Zraportowano postęp produkcji: {lbl}{qtxt}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        correlation_id=key,
        source_module="production",
        category="status",
        production_label=lbl,
        metadata={
            "mo_number": lbl if mo else None,
            "batch_number": lbl if bat and not mo else None,
            "quantity": qty,
        },
    )


def emit_production_pw_created(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:pw:{doc_id}" if mo else f"batch:{bat}:pw:{doc_id}"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    doc_no = document_number or f"PW#{doc_id}"
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PW_CREATED,
        description=f"Utworzono {doc_no} (produkt gotowy)",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=doc_id,
        correlation_id=key,
        source_module="production",
        category="status",
        severity="SUCCESS",
        production_label=lbl,
        document_label=doc_no,
        metadata={
            "mo_number": lbl if mo else None,
            "batch_number": lbl if bat and not mo else None,
            "document_number": doc_no,
        },
    )


def emit_production_putaway_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    stock_document_id: int,
    document_number: Optional[str] = None,
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    product_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    doc_id = int(stock_document_id)
    key = f"mo:{mo}:pw:{doc_id}:putaway-done" if mo else f"batch:{bat}:pw:{doc_id}:putaway-done"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    doc_no = document_number or f"PW#{doc_id}"
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_PUTAWAY_COMPLETED,
        description=f"Rozlokowano FG z {doc_no}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        product_id=product_id,
        stock_document_id=doc_id,
        correlation_id=key,
        source_module="production",
        category="status",
        severity="SUCCESS",
        production_label=lbl,
        document_label=doc_no,
        metadata={
            "mo_number": lbl if mo else None,
            "batch_number": lbl if bat and not mo else None,
            "document_number": doc_no,
        },
    )


def emit_production_completed(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    production_order_id: Optional[int] = None,
    batch_id: Optional[int] = None,
    actor_user_id: Optional[int] = None,
    label: Optional[str] = None,
) -> None:
    mo = int(production_order_id) if production_order_id else None
    bat = int(batch_id) if batch_id else None
    key = f"mo:{mo}:completed" if mo else f"batch:{bat}:completed"
    lbl = label or (f"MO-{mo}" if mo else f"BAT-{bat}")
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=PRODUCTION_COMPLETED,
        description=f"Zakończono produkcję: {lbl}",
        actor_user_id=actor_user_id,
        production_order_id=mo,
        batch_id=bat,
        correlation_id=key,
        source_module="production",
        category="status",
        severity="SUCCESS",
        production_label=lbl,
        metadata={"mo_number": lbl if mo else None, "batch_number": lbl if bat and not mo else None},
    )
