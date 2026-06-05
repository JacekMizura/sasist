"""Bezpieczna normalizacja kart kolejki Braki — nigdy nie ukrywaj zadania OPEN."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_issue_task import OrderIssueTask
from ..schemas.order_issue_task import (
    BrakiActiveOperations,
    BrakiOperationalState,
    BrakiWorkstreams,
    OrderIssueOrderContext,
    OrderIssueTaskListItem,
)

logger = logging.getLogger(__name__)


def _safe_customer_name(o: Order | None) -> str:
    if o is None:
        return "—"
    try:
        from .order_issue_task_service import order_customer_display_name
        from .braki_order_state_service import build_order_issue_customer_fields

        fields = build_order_issue_customer_fields(o)
        name = (fields.get("customer_name") or "").strip() or order_customer_display_name(o)
        return (name or "—").strip() or "—"
    except Exception:
        return "—"


def _counts_from_workstreams(ws: dict[str, Any] | BrakiWorkstreams | None) -> dict[str, int]:
    if ws is None:
        return {
            "picked_count": 0,
            "recovery_count": 0,
            "relocation_count": 0,
            "ready_to_pack_count": 0,
            "missing_count": 0,
        }
    data = ws.model_dump() if hasattr(ws, "model_dump") else dict(ws)
    return {
        "picked_count": int(data.get("collected_line_count") or 0),
        "recovery_count": int(data.get("pick_line_count") or 0),
        "relocation_count": int(data.get("relocation_line_count") or 0),
        "ready_to_pack_count": int(data.get("packing_ready_line_count") or 0),
        "missing_count": int(data.get("oms_line_count") or 0),
    }


def normalize_braki_queue_card_fields(
    item: OrderIssueTaskListItem,
    *,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """Ujednolicone pola liczników + ostrzeżeń dla UI."""
    ws = item.braki_workstreams
    counts = _counts_from_workstreams(ws)
    out_warnings = list(warnings or [])
    if item.partial_data and "Niepełne dane operacyjne" not in " ".join(out_warnings):
        out_warnings.append("Niepełne dane operacyjne")
    logger.info(
        "[braki.queue.normalize] task_id=%s order_id=%s partial=%s warnings=%s counts=%s",
        int(item.id),
        int(item.order_id),
        bool(item.partial_data),
        out_warnings,
        counts,
    )
    return {
        "workflow_stage": (item.braki_workflow_status_label or item.braki_workflow_status or "awaiting").strip(),
        **counts,
        "warnings": out_warnings,
    }


def build_fallback_braki_queue_card(
    db: Session,
    t: OrderIssueTask,
    o: Order | None,
    *,
    warnings: list[str],
    u_short: int = 0,
    r_pend: int = 0,
    workflow_status: str = "awaiting",
) -> OrderIssueTaskListItem:
    """
    Minimalna karta kolejki gdy pełna serializacja się nie powiodła.
    Zadanie OPEN pozostaje widoczne dla operatora.
    """
    from ..services.braki_workflow_service import braki_workflow_status_label

    try:
        missing = json.loads(t.missing_items or "[]")
    except json.JSONDecodeError:
        missing = []
    try:
        picked = json.loads(t.picked_items or "[]")
    except json.JSONDecodeError:
        picked = []
    if not isinstance(missing, list):
        missing = []
    if not isinstance(picked, list):
        picked = []
    created = t.created_at.isoformat() + "Z" if isinstance(t.created_at, datetime) else str(t.created_at or "")
    workflow_label = braki_workflow_status_label(workflow_status)
    cust_name = _safe_customer_name(o)
    order_number = str(getattr(o, "number", None) or f"#{t.order_id}") if o else f"#{t.order_id}"

    merged_warnings = list(warnings)
    if "Niepełne dane operacyjne" not in " ".join(merged_warnings):
        merged_warnings.append("Niepełne dane operacyjne")

    ws = BrakiWorkstreams()
    op_state = BrakiOperationalState(
        workflow_stage=workflow_label or "Braki — wymaga obsługi",
        queue_stage=workflow_status,
        operational_mode="SINGLE",
        can_remove_from_braki=False,
        can_close_shortage=False,
        active_operations=BrakiActiveOperations(),
        braki_workstreams=ws,
        warnings=merged_warnings,
    )

    logger.warning(
        "[braki.queue.render_fallback] task_id=%s order_id=%s workflow=%s warnings=%s",
        int(t.id),
        int(t.order_id),
        workflow_status,
        merged_warnings,
    )

    return OrderIssueTaskListItem(
        id=int(t.id),
        order_id=int(t.order_id),
        order_number=order_number,
        order_status=str(getattr(o, "status", None) or "") if o else "",
        customer_name=cust_name,
        delivery_name="—",
        customer_phone="—",
        customer_email="—",
        customer_address="—",
        unresolved_shortage_count=max(0, int(u_short)),
        replacement_pick_pending_count=max(0, int(r_pend)),
        issue_queue_summary_line=workflow_label or "Braki — wymaga obsługi",
        issue_queue_status_label=workflow_label or "Wymaga obsługi",
        substitute_product_id=0,
        substitute_product_name="",
        order_ui_status_name=None,
        task_type=str(t.type or "MIXED"),
        recommended_action="MIXED",
        ui_decision="PARTIAL",
        new_product_lines=[],
        shortage_lines=[],
        order_context=OrderIssueOrderContext(),
        status=str(t.status or "OPEN"),
        missing_items=missing if isinstance(missing, list) else [],
        picked_items=picked if isinstance(picked, list) else [],
        missing_skus_label="",
        logs=[],
        created_at=created,
        last_shortage_at=created,
        braki_queue_bucket="awaiting_oms",
        braki_workflow_status=workflow_status,
        braki_workflow_status_label=workflow_label,
        braki_operational_state=op_state,
        recovery_packing_allowed=False,
        recovery_active_lines=0,
        recovery_unresolved_lines=0,
        recovery_has_relocation_work=False,
        relocation_task_id=None,
        can_close_shortage=False,
        recovery_state_hash="",
        braki_workstreams=ws,
        partial_data=True,
        queue_warnings=merged_warnings,
    )


def safe_recovery_fields_for_list_card(
    db: Session,
    o: Order,
    t: OrderIssueTask,
    *,
    last_shortage_at: str,
) -> tuple[dict[str, Any], list[str]]:
    """Resolver fields for list card — never raises."""
    warnings: list[str] = []
    try:
        from ..services.recovery_workflow_service import (
            recovery_state_for_braki_task,
            resolve_order_recovery_state,
        )
        from ..services.recovery_intelligence import priority_fields_for_braki_task

        rec_st = resolve_order_recovery_state(db, o, log=False)
        fields: dict[str, Any] = {
            **recovery_state_for_braki_task(db, o, rec_state=rec_st, skip_repair=True),
            **priority_fields_for_braki_task(db, o, rec_st, task=t, last_shortage_at=last_shortage_at),
        }
        return fields, warnings
    except Exception as exc:
        warnings.append(f"Resolver: {type(exc).__name__}")
        logger.warning(
            "[braki.queue.partial] order_id=%s task_id=%s recovery_fields_failed err=%s",
            int(o.id),
            int(t.id),
            exc,
            exc_info=True,
        )
        return {}, warnings
