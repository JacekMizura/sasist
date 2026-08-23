"""Order-facing Activity Log writers (status / automation / documents).

Emits concise immutable summaries into ``activity_events`` with refs to domain SSOT.
Failures are soft (SAVEPOINT) — never break domain flows.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from .domain_activity import find_activity_by_correlation, record_domain_activity
from .order_event_codes import (
    AUTOMATION_BLOCKED,
    AUTOMATION_FAILED,
    AUTOMATION_SUCCEEDED,
    ORDER_EVENT_CATEGORY,
    ORDER_EVENT_TITLES_PL,
    ORDER_STATUS_CHANGED,
    SALE_DOCUMENT_CORRECTION_CREATED,
    SALE_DOCUMENT_CREATED,
    SALE_DOCUMENT_FAILED,
    ActorKind,
)

logger = logging.getLogger(__name__)


def _status_label(db: Session, *, tenant_id: int, status_key: Optional[str]) -> str:
    if status_key is None or str(status_key).strip() in ("", "null"):
        return "—"
    try:
        sid = int(status_key)
    except (TypeError, ValueError):
        return str(status_key)
    from ...models.order_ui_status import OrderUiStatus

    row = (
        db.query(OrderUiStatus)
        .filter(OrderUiStatus.id == sid, OrderUiStatus.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        return f"#{sid}"
    name = str(getattr(row, "name", None) or "").strip()
    return name or f"#{sid}"


def resolve_status_actor_kind(
    *,
    actor_user_id: Optional[int],
    automation_depth: int = 0,
    root_event_id: Optional[str] = None,
    transition_event_id: Optional[str] = None,
) -> ActorKind:
    """USER when human actor and not inside automation chain; AUTOMATION when nested; else SYSTEM."""
    depth = int(automation_depth) if automation_depth is not None else 0
    if depth > 0:
        return "AUTOMATION"
    root = str(root_event_id or "").strip()
    tid = str(transition_event_id or "").strip()
    if root and tid and root != tid:
        return "AUTOMATION"
    if actor_user_id is not None and int(actor_user_id) > 0:
        return "USER"
    return "SYSTEM"


def emit_order_status_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_status_key: Optional[str],
    new_status_key: str,
    status_transition_event_id: str,
    actor_user_id: Optional[int] = None,
    root_event_id: Optional[str] = None,
    automation_depth: int = 0,
    occurred_at: Optional[datetime] = None,
) -> Any:
    """One ActivityEvent per StatusTransitionEvent (idempotent via correlation_id)."""
    cid = f"order-status:{status_transition_event_id}"[:64]
    existing = find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id))
    if existing is not None:
        return existing

    actor_kind = resolve_status_actor_kind(
        actor_user_id=actor_user_id,
        automation_depth=automation_depth,
        root_event_id=root_event_id,
        transition_event_id=status_transition_event_id,
    )
    old_name = _status_label(db, tenant_id=int(tenant_id), status_key=old_status_key)
    new_name = _status_label(db, tenant_id=int(tenant_id), status_key=new_status_key)
    summary = f"Zmiana statusu zamówienia z „{old_name}” na „{new_name}”."

    meta: dict[str, Any] = {
        "ref_type": "status_transition_event",
        "ref_id": str(status_transition_event_id),
        "actor_kind": actor_kind,
        "old_status_key": old_status_key,
        "old_status_name": old_name,
        "new_status_key": str(new_status_key),
        "new_status_name": new_name,
        "status_transition_event_id": str(status_transition_event_id),
    }
    if root_event_id:
        meta["root_event_id"] = str(root_event_id)
    if actor_kind == "AUTOMATION":
        meta["actor_label"] = "Automatyzacja"
    elif actor_kind == "SYSTEM":
        meta["actor_label"] = "System"

    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_STATUS_CHANGED,
        description=summary,
        actor_user_id=actor_user_id if actor_kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_STATUS_CHANGED],
        source_module="order_status",
        occurred_at=occurred_at,
    )


def emit_automation_execution_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    entity_type: str,
    entity_id: int,
    rule_id: int,
    rule_name: str,
    execution_id: int,
    execution_status: str,
    trigger_event_id: Optional[str] = None,
    effects_count: int = 0,
    effects_succeeded: int = 0,
    effects_failed: int = 0,
    error: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    """
    Emit timeline row for SUCCEEDED / FAILED / BLOCKED (preflight).
    SKIPPED (conditions_not_matched) must NOT call this.
    """
    status = str(execution_status or "").strip().upper()
    if status == "SUCCEEDED":
        code = AUTOMATION_SUCCEEDED
        severity = "SUCCESS"
        summary = f"Automatyzacja „{rule_name}” została wykonana."
    elif status == "FAILED":
        code = AUTOMATION_FAILED
        severity = "ERROR"
        summary = f"Automatyzacja „{rule_name}” zakończyła się błędem."
    elif status == "BLOCKED":
        code = AUTOMATION_BLOCKED
        severity = "WARNING"
        summary = f"Automatyzacja „{rule_name}” została zablokowana."
    else:
        return None

    cid = f"automation-exec:{int(execution_id)}"[:64]
    existing = find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id))
    if existing is not None:
        return existing

    et = str(entity_type or "").upper()
    meta: dict[str, Any] = {
        "ref_type": "automation_execution",
        "ref_id": int(execution_id),
        "actor_kind": "AUTOMATION",
        "actor_label": "Automatyzacja",
        "automation_rule_id": int(rule_id),
        "automation_execution_id": int(execution_id),
        "rule_name": str(rule_name or "")[:255],
        "trigger_event_id": trigger_event_id,
        "execution_status": status,
        "effects_count": int(effects_count),
        "effects_succeeded": int(effects_succeeded),
        "effects_failed": int(effects_failed),
    }
    if error:
        meta["error"] = str(error)[:500]

    kwargs: dict[str, Any] = {
        "tenant_id": int(tenant_id),
        "warehouse_id": warehouse_id,
        "event_type": code,
        "description": summary,
        "actor_user_id": None,
        "metadata": meta,
        "correlation_id": cid,
        "severity": severity,
        "category": ORDER_EVENT_CATEGORY[code],
        "source_module": "automation",
        "occurred_at": occurred_at,
    }
    if et == "ORDER":
        kwargs["order_id"] = int(entity_id)
    elif et == "RETURN":
        kwargs["rmz_id"] = int(entity_id)
    elif et == "COMPLAINT":
        kwargs["complaint_id"] = int(entity_id)
    else:
        # other — still record if we can link something; skip without order/return/complaint
        logger.info(
            "automation activity skipped unsupported entity_type=%s id=%s",
            et,
            entity_id,
        )
        return None

    return record_domain_activity(db, **kwargs)


def emit_sale_document_created_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    sale_document_id: str,
    document_number: Optional[str],
    document_kind: Optional[str] = None,
    document_subtype: Optional[str] = None,
    panel_document_type: Optional[str] = None,
    source_document_id: Optional[str] = None,
    source_document_number: Optional[str] = None,
    document_generation_job_id: Optional[int] = None,
    is_correction: bool = False,
    actor_user_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"sale-doc:{sale_document_id}"[:64]
    existing = find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id))
    if existing is not None:
        return existing

    num = str(document_number or "").strip() or "—"
    if is_correction:
        code = SALE_DOCUMENT_CORRECTION_CREATED
        src = str(source_document_number or "").strip()
        if src:
            summary = f"Utworzono korektę {num} do dokumentu {src}."
        else:
            summary = f"Utworzono korektę {num}."
    else:
        code = SALE_DOCUMENT_CREATED
        kind_label = str(panel_document_type or document_subtype or "dokument").strip()
        if kind_label.upper() in ("INVOICE", "FV"):
            kind_label = "Faktura"
        elif kind_label.upper() in ("RECEIPT", "PARAGON"):
            kind_label = "Paragon"
        summary = f"Utworzono dokument {kind_label} {num}."

    meta: dict[str, Any] = {
        "ref_type": "sale_document",
        "ref_id": str(sale_document_id),
        "actor_kind": "USER" if actor_user_id else "SYSTEM",
        "sale_document_id": str(sale_document_id),
        "document_kind": document_kind,
        "document_subtype": document_subtype,
        "document_number": document_number,
        "panel_document_type": panel_document_type,
    }
    if source_document_id:
        meta["source_document_id"] = str(source_document_id)
    if source_document_number:
        meta["source_document_number"] = str(source_document_number)
    if document_generation_job_id is not None:
        meta["document_generation_job_id"] = int(document_generation_job_id)
    if not actor_user_id:
        meta["actor_label"] = "System"

    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=code,
        description=summary,
        actor_user_id=actor_user_id,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="SUCCESS",
        category=ORDER_EVENT_CATEGORY[code],
        source_module="sale_documents",
        document_label=num if num != "—" else None,
        occurred_at=occurred_at,
    )


def emit_sale_document_failed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    error_message: str,
    document_generation_job_id: Optional[int] = None,
    document_subtype: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    job_part = f":job:{int(document_generation_job_id)}" if document_generation_job_id else ""
    cid = f"sale-doc-fail:{int(order_id)}{job_part}"[:64]
    existing = find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id))
    if existing is not None:
        return existing

    err = str(error_message or "nieznany błąd").strip()[:200]
    subtype = str(document_subtype or "dokumentu").strip()
    summary = f"Nie udało się utworzyć dokumentu {subtype}: {err}"

    meta: dict[str, Any] = {
        "ref_type": "document_generation_job" if document_generation_job_id else "sale_document",
        "ref_id": int(document_generation_job_id) if document_generation_job_id else None,
        "actor_kind": "SYSTEM",
        "actor_label": "System",
        "error": err,
        "document_subtype": document_subtype,
    }
    if document_generation_job_id is not None:
        meta["document_generation_job_id"] = int(document_generation_job_id)

    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=SALE_DOCUMENT_FAILED,
        description=summary,
        actor_user_id=None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="ERROR",
        category=ORDER_EVENT_CATEGORY[SALE_DOCUMENT_FAILED],
        source_module="sale_documents",
        occurred_at=occurred_at,
    )


def order_event_display_title(event_code: str) -> str:
    return ORDER_EVENT_TITLES_PL.get(str(event_code or "").upper(), ORDER_EVENT_TITLES_PL.get(event_code, "Zdarzenie"))
