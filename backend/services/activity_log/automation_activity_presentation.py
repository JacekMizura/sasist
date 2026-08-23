"""Automation → Order › Logi presentation helpers (no parallel storage).

Reads AutomationExecution SSOT (conditions_evaluation_json, effects, error, trigger)
and builds concise summaries / inline rows for Activity Log.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.automation import AutomationExecution, AutomationRule, StatusTransitionEvent

_BLOCKED_REASON_PL: dict[str, str] = {
    "blocked": "Reguła zablokowana przez kontrolę bezpieczeństwa.",
    "unsupported_condition": "Reguła zawiera nieobsługiwany warunek.",
    "invalid_condition": "Reguła zawiera niepoprawny warunek.",
    "unsupported_effect": "Reguła zawiera nieobsługiwany efekt.",
    "invalid_effect": "Reguła zawiera niepoprawny efekt.",
    "unsupported_entity_for_effect": "Efekt jest niezgodny z typem encji.",
    "effect_order_violation": "Kolejność efektów jest niebezpieczna (np. korekta przed zatwierdzeniem magazynowym).",
}


def humanize_automation_blocked_reason(code: Optional[str]) -> str:
    raw = str(code or "").strip()
    if not raw:
        return "Powód blokady nie został zapisany."
    if raw in _BLOCKED_REASON_PL:
        return _BLOCKED_REASON_PL[raw]
    # Prefer readable fragments already in Polish from preflight messages.
    if " " in raw and not raw.isupper():
        return raw
    return _BLOCKED_REASON_PL.get(raw.lower(), f"Kod blokady: {raw}.")


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


def build_automation_activity_presentation(
    db: Session,
    *,
    tenant_id: int,
    rule: AutomationRule,
    execution: AutomationExecution,
    trigger_event: StatusTransitionEvent | None = None,
) -> dict[str, Any]:
    """
    Compact snapshot stored on ActivityEvent.metadata (idempotent emit).
    Full tree remains on AutomationExecution + expand API.
    """
    from ..automation.execution_audit import (
        effect_type_summary,
        snapshot_conditions_evaluation,
    )
    from ..automation.store import _loads

    rule_name = str(rule.name or f"Reguła #{int(rule.id)}").strip()
    status = str(execution.status or "").strip().upper()

    trigger_summary = "Wejście w status (automatyzacja)"
    tev = trigger_event
    if tev is None and execution.trigger_event_id:
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
        trigger_summary = f"Zmiana statusu: {old_name or '—'} → {new_name or '—'}"

    raw_conds = getattr(execution, "conditions_evaluation_json", None)
    conditions: list[dict[str, Any]] = []
    if raw_conds:
        try:
            import json

            loaded = json.loads(raw_conds)
            conditions = snapshot_conditions_evaluation(loaded if isinstance(loaded, list) else [])
        except Exception:
            conditions = []

    matched_n = sum(1 for c in conditions if c.get("matched"))
    failed_n = sum(1 for c in conditions if not c.get("matched"))
    cond_lines: list[str] = []
    for c in conditions[:8]:
        label = str(c.get("label") or c.get("condition_type") or "Warunek").strip()
        op = str(c.get("operator_label") or c.get("operator") or "").strip()
        configured = c.get("configured_value")
        mark = "✓" if c.get("matched") else "✗"
        bit = f"{mark} {label}"
        if op:
            bit += f" — {op}"
        if configured is not None and str(configured).strip():
            bit += f" — {configured}"
        cond_lines.append(bit)

    effect_lines: list[str] = []
    for ee in sorted(execution.effect_executions or [], key=lambda x: (int(x.position), int(x.id or 0))):
        result = _loads(ee.result_json) if ee.result_json else {}
        if not isinstance(result, dict):
            result = {}
        summary = effect_type_summary(str(ee.effect_type), result)
        st = str(ee.status or "").upper()
        if st == "FAILED":
            effect_lines.append(f"✗ {summary}" + (f" — {ee.error}" if ee.error else ""))
        elif st == "SUCCEEDED":
            effect_lines.append(f"✓ {summary}")
        else:
            effect_lines.append(f"• {summary} ({st or '—'})")

    # Planned effects when blocked before run
    if not effect_lines and rule.effects:
        from ..automation.execution_audit import effect_type_summary as ets

        for eff in sorted(
            [e for e in (rule.effects or []) if bool(getattr(e, "enabled", True))],
            key=lambda e: (int(e.position), int(e.id or 0)),
        )[:8]:
            effect_lines.append(f"• {ets(str(eff.effect_type), None)} (nie uruchomiono)")

    blocked_reason = None
    if status == "BLOCKED":
        blocked_reason = humanize_automation_blocked_reason(getattr(execution, "error", None))
    elif status == "FAILED":
        blocked_reason = str(getattr(execution, "error", None) or "Błąd wykonania efektu.").strip()

    return {
        "rule_name": rule_name,
        "trigger_summary": trigger_summary,
        "conditions_matched": matched_n,
        "conditions_failed": failed_n,
        "conditions_lines": cond_lines,
        "effects_lines": effect_lines,
        "blocked_reason": blocked_reason,
        "execution_status": status,
    }


def format_automation_activity_summary(
    *,
    rule_name: str,
    status: str,
    presentation: dict[str, Any] | None = None,
) -> str:
    name = (rule_name or "Automatyzacja").strip()
    st = str(status or "").upper()
    pres = presentation or {}
    reason = str(pres.get("blocked_reason") or "").strip()
    trigger = str(pres.get("trigger_summary") or "").strip()

    if st == "SUCCEEDED":
        base = f"Automatyzacja „{name}” została wykonana."
    elif st == "FAILED":
        base = f"Automatyzacja „{name}” zakończyła się błędem."
        if reason:
            base = f"{base} {reason}"
    elif st == "BLOCKED":
        base = f"Automatyzacja „{name}” została zablokowana."
        if reason:
            base = f"{base} {reason}"
    else:
        base = f"Automatyzacja „{name}”."

    if trigger and st in ("BLOCKED", "FAILED", "SUCCEEDED"):
        base = f"{base}\nWyzwalacz: {trigger}"
    return base
