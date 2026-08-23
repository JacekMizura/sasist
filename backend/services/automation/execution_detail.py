"""Structured automation execution detail for Order › Logi expand."""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.automation import AutomationExecution, AutomationRule, StatusTransitionEvent
from .execution_audit import (
    condition_field_label,
    condition_operator_label,
    effect_type_summary,
    snapshot_conditions_evaluation,
)
from .store import _loads


def _status_name(db: Session, *, tenant_id: int, status_key: Optional[str]) -> Optional[str]:
    if status_key is None or str(status_key).strip() in ("", "null"):
        return None
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
    return str(getattr(row, "name", None) or f"#{sid}")


def build_execution_expand_detail(
    db: Session,
    *,
    execution: AutomationExecution,
    tenant_id: int,
) -> dict[str, Any]:
    rule = (
        db.query(AutomationRule)
        .filter(AutomationRule.id == int(execution.rule_id), AutomationRule.tenant_id == int(tenant_id))
        .first()
    )
    rule_name = str(rule.name) if rule is not None else f"Reguła #{int(execution.rule_id)}"

    trigger: dict[str, Any] = {
        "type": "entity_status_entered",
        "timestamp": execution.started_at.isoformat() if execution.started_at else None,
        "trigger_event_id": execution.trigger_event_id,
    }
    if execution.trigger_event_id:
        tev = (
            db.query(StatusTransitionEvent)
            .filter(
                StatusTransitionEvent.id == str(execution.trigger_event_id),
                StatusTransitionEvent.tenant_id == int(tenant_id),
            )
            .first()
        )
        if tev is not None:
            old_name = _status_name(db, tenant_id=tenant_id, status_key=tev.old_status_key)
            new_name = _status_name(db, tenant_id=tenant_id, status_key=tev.new_status_key)
            trigger.update(
                {
                    "timestamp": tev.occurred_at.isoformat() if tev.occurred_at else trigger["timestamp"],
                    "old_status_key": tev.old_status_key,
                    "new_status_key": tev.new_status_key,
                    "old_status_name": old_name,
                    "new_status_name": new_name,
                    "summary": (
                        f"Zmiana statusu: {old_name or '—'} → {new_name or '—'}"
                        if (old_name or new_name)
                        else "Zmiana statusu"
                    ),
                }
            )

    raw_conds = getattr(execution, "conditions_evaluation_json", None)
    if raw_conds:
        try:
            loaded = json.loads(raw_conds)
            conditions = snapshot_conditions_evaluation(loaded if isinstance(loaded, list) else [])
        except Exception:
            conditions = []
    else:
        conditions = []

    # Ensure labels for UI
    for c in conditions:
        if not c.get("label"):
            c["label"] = condition_field_label(str(c.get("condition_type") or ""))
        if not c.get("operator_label"):
            c["operator_label"] = condition_operator_label(str(c.get("operator") or ""))

    effects_out: list[dict[str, Any]] = []
    for ee in sorted(execution.effect_executions or [], key=lambda x: (int(x.position), int(x.id or 0))):
        result = _loads(ee.result_json) if ee.result_json else {}
        if not isinstance(result, dict):
            result = {}
        effects_out.append(
            {
                "position": int(ee.position),
                "effect_type": ee.effect_type,
                "summary": effect_type_summary(str(ee.effect_type), result),
                "status": ee.status,
                "result": result,
                "error": ee.error,
            }
        )

    return {
        "id": int(execution.id),
        "status": execution.status,
        "error": execution.error,
        "started_at": execution.started_at.isoformat() if execution.started_at else None,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
        "rule": {
            "id": int(execution.rule_id),
            "name": rule_name,
        },
        "entity_type": execution.entity_type,
        "entity_id": int(execution.entity_id),
        "trigger": trigger,
        "conditions": conditions,
        "effects": effects_out,
    }


def get_execution_for_tenant(
    db: Session,
    *,
    execution_id: int,
    tenant_id: int,
) -> Optional[AutomationExecution]:
    ex = (
        db.query(AutomationExecution)
        .options(joinedload(AutomationExecution.effect_executions))
        .filter(AutomationExecution.id == int(execution_id))
        .first()
    )
    if ex is None:
        return None
    rule = (
        db.query(AutomationRule)
        .filter(AutomationRule.id == int(ex.rule_id), AutomationRule.tenant_id == int(tenant_id))
        .first()
    )
    if rule is None:
        return None
    return ex
