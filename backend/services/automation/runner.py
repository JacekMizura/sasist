"""Automation runner — status-enter matching, idempotent sequential effects."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ...models.automation import (
    AutomationEffect,
    AutomationEffectExecution,
    AutomationExecution,
    AutomationRule,
    StatusTransitionEvent,
)
from .constants import (
    EXEC_BLOCKED,
    EXEC_FAILED,
    EXEC_PENDING,
    EXEC_RUNNING,
    EXEC_SKIPPED,
    EXEC_SUCCEEDED,
    MAX_AUTOMATION_DEPTH,
    TRIGGER_ENTITY_STATUS_ENTERED,
)
from .effects import get_adapter, parse_config
from .events import (
    automation_depth_var,
    automation_root_event_var,
    can_enter_automation_depth,
    set_root_event_if_needed,
)

logger = logging.getLogger(__name__)


def idempotency_key(rule_id: int, entity_type: str, entity_id: int, trigger_event_id: str) -> str:
    return f"{int(rule_id)}:{str(entity_type).upper()}:{int(entity_id)}:{trigger_event_id}"


def _trigger_matches(rule: AutomationRule, event: StatusTransitionEvent) -> bool:
    if str(rule.trigger_type or "") != TRIGGER_ENTITY_STATUS_ENTERED:
        return False
    if str(rule.entity_type or "").upper() != str(event.entity_type or "").upper():
        return False
    if rule.warehouse_id is not None:
        if event.warehouse_id is None or int(rule.warehouse_id) != int(event.warehouse_id):
            return False
    cfg = parse_config(rule.trigger_config_json)
    # Match entered status: status_id / status_ids / status_key / status_keys
    new_key = str(event.new_status_key or "")
    status_ids = cfg.get("status_ids")
    if status_ids is None and cfg.get("status_id") is not None:
        status_ids = [cfg.get("status_id")]
    status_keys = cfg.get("status_keys")
    if status_keys is None and cfg.get("status_key") is not None:
        status_keys = [cfg.get("status_key")]

    if status_ids:
        try:
            wanted = {str(int(x)) for x in status_ids if x is not None and str(x).strip() != ""}
        except (TypeError, ValueError):
            wanted = {str(x) for x in status_ids}
        if new_key not in wanted:
            return False
    if status_keys:
        keys = {str(x) for x in status_keys}
        if new_key not in keys:
            return False
    # Empty filter → match any enter for this entity_type (+ warehouse)
    return True


def find_matching_rules(db: Session, event: StatusTransitionEvent) -> list[AutomationRule]:
    q = (
        db.query(AutomationRule)
        .options(joinedload(AutomationRule.effects))
        .filter(
            AutomationRule.tenant_id == int(event.tenant_id),
            AutomationRule.enabled.is_(True),
            AutomationRule.entity_type == str(event.entity_type).upper(),
            AutomationRule.trigger_type == TRIGGER_ENTITY_STATUS_ENTERED,
        )
    )
    rules = q.order_by(AutomationRule.id.asc()).all()
    matched: list[AutomationRule] = []
    for r in rules:
        if not _trigger_matches(r, event):
            continue
        from .manual_run import rule_allows_status_enter_auto

        if not rule_allows_status_enter_auto(r):
            continue
        # Conditions + preflight happen in _run_or_resume_rule (audit BLOCKED/SKIPPED).
        matched.append(r)
    return matched


def run_automations_for_status_entered(
    db: Session,
    *,
    event: StatusTransitionEvent,
) -> list[dict[str, Any]]:
    """
    Match enabled rules and run each at most once per (rule, entity, event).

    Soft-fail outer: individual rule failures are recorded; caller is not blocked.
    """
    if not can_enter_automation_depth():
        logger.warning(
            "automation depth limit (%s) reached; skip event_id=%s entity=%s/%s",
            MAX_AUTOMATION_DEPTH,
            event.id,
            event.entity_type,
            event.entity_id,
        )
        return [{"skipped": "max_depth", "event_id": event.id}]

    set_root_event_if_needed(str(event.id))
    token_depth = automation_depth_var.set(automation_depth_var.get() + 1)
    results: list[dict[str, Any]] = []
    try:
        rules = find_matching_rules(db, event)
        for rule in rules:
            try:
                results.append(_run_or_resume_rule(db, rule=rule, event=event))
            except Exception as exc:
                logger.exception(
                    "automation rule failed rule_id=%s event_id=%s", rule.id, event.id
                )
                results.append(
                    {
                        "rule_id": int(rule.id),
                        "status": EXEC_FAILED,
                        "error": str(exc),
                    }
                )
    finally:
        automation_depth_var.reset(token_depth)
    return results


def _get_or_create_execution(
    db: Session,
    *,
    rule: AutomationRule,
    event: StatusTransitionEvent,
) -> tuple[AutomationExecution, bool]:
    """Returns (execution, created_new). Uses SAVEPOINT so races do not abort outer txn."""
    key = idempotency_key(int(rule.id), event.entity_type, int(event.entity_id), str(event.id))
    existing = (
        db.query(AutomationExecution)
        .options(joinedload(AutomationExecution.effect_executions))
        .filter(AutomationExecution.idempotency_key == key)
        .first()
    )
    if existing is not None:
        return existing, False

    row = AutomationExecution(
        rule_id=int(rule.id),
        entity_type=str(event.entity_type).upper(),
        entity_id=int(event.entity_id),
        trigger_event_id=str(event.id),
        run_kind="AUTO",
        idempotency_key=key,
        status=EXEC_PENDING,
        created_at=datetime.utcnow(),
    )
    nested = db.begin_nested()
    try:
        db.add(row)
        db.flush()
        nested.commit()
        return row, True
    except IntegrityError:
        nested.rollback()
        existing = (
            db.query(AutomationExecution)
            .options(joinedload(AutomationExecution.effect_executions))
            .filter(AutomationExecution.idempotency_key == key)
            .first()
        )
        if existing is None:
            raise
        return existing, False


def _effect_counts(execution: AutomationExecution) -> tuple[int, int, int]:
    rows = list(execution.effect_executions or [])
    total = len(rows)
    ok = sum(1 for ee in rows if str(ee.status).upper() == EXEC_SUCCEEDED)
    fail = sum(1 for ee in rows if str(ee.status).upper() == EXEC_FAILED)
    return total, ok, fail


def _emit_execution_activity(
    db: Session,
    *,
    rule: AutomationRule,
    event: StatusTransitionEvent,
    execution: AutomationExecution,
) -> None:
    status = str(execution.status or "").upper()
    if status not in (EXEC_SUCCEEDED, EXEC_FAILED, EXEC_BLOCKED):
        return
    # Do not emit for conditions_not_matched (SKIPPED) — caller must not invoke for that path.
    if status == EXEC_SKIPPED or str(execution.error or "") == "conditions_not_matched":
        return
    total, ok, fail = _effect_counts(execution)
    try:
        from ..activity_log.order_activity import emit_automation_execution_activity

        emit_automation_execution_activity(
            db,
            tenant_id=int(event.tenant_id),
            warehouse_id=int(event.warehouse_id) if event.warehouse_id is not None else None,
            entity_type=str(event.entity_type),
            entity_id=int(event.entity_id),
            rule_id=int(rule.id),
            rule_name=str(rule.name or f"Reguła #{int(rule.id)}"),
            execution_id=int(execution.id),
            execution_status=status,
            trigger_event_id=str(execution.trigger_event_id) if execution.trigger_event_id else str(event.id),
            effects_count=total,
            effects_succeeded=ok,
            effects_failed=fail,
            error=execution.error,
            occurred_at=execution.completed_at or datetime.utcnow(),
        )
    except Exception:
        logger.exception(
            "automation activity emit failed execution_id=%s rule_id=%s",
            execution.id,
            rule.id,
        )


def _persist_conditions_snapshot(execution: AutomationExecution, details: list[dict] | None) -> None:
    from .execution_audit import dump_conditions_evaluation

    raw = dump_conditions_evaluation(details)
    if raw:
        execution.conditions_evaluation_json = raw


def _run_or_resume_rule(
    db: Session,
    *,
    rule: AutomationRule,
    event: StatusTransitionEvent,
) -> dict[str, Any]:
    execution, _created = _get_or_create_execution(db, rule=rule, event=event)

    if execution.status == EXEC_SUCCEEDED:
        # Idempotent retry — ensure Activity exists once (correlation_id dedupe).
        _emit_execution_activity(db, rule=rule, event=event, execution=execution)
        return {
            "rule_id": int(rule.id),
            "execution_id": int(execution.id),
            "status": EXEC_SUCCEEDED,
            "resumed": False,
            "duplicate": True,
        }
    if execution.status in (EXEC_SKIPPED, EXEC_BLOCKED):
        if execution.status == EXEC_BLOCKED:
            _emit_execution_activity(db, rule=rule, event=event, execution=execution)
        return {
            "rule_id": int(rule.id),
            "execution_id": int(execution.id),
            "status": execution.status,
            "duplicate": True,
        }

    from .preflight import validate_automation_runtime
    from .conditions import evaluate_conditions
    from .store import _loads_list

    pf = validate_automation_runtime(rule, entity_type=str(event.entity_type))
    if not pf.ok:
        execution.status = EXEC_BLOCKED
        execution.error = pf.blocked_code or "blocked"
        if execution.started_at is None:
            execution.started_at = datetime.utcnow()
        execution.completed_at = datetime.utcnow()
        db.add(execution)
        db.flush()
        _emit_execution_activity(db, rule=rule, event=event, execution=execution)
        return {
            "rule_id": int(rule.id),
            "execution_id": int(execution.id),
            "status": EXEC_BLOCKED,
            "blocked_code": pf.blocked_code,
            "validation_issues": [i.to_dict() for i in pf.issues],
            "effects_executed": 0,
        }

    conds = _loads_list(getattr(rule, "conditions_json", None) or "[]")
    if conds:
        cond_result = evaluate_conditions(
            db,
            conditions=conds,
            entity_type=str(event.entity_type),
            entity_id=int(event.entity_id),
            tenant_id=int(event.tenant_id),
        )
        _persist_conditions_snapshot(execution, cond_result.details)
        if cond_result.blocked:
            execution.status = EXEC_BLOCKED
            execution.error = cond_result.blocked_code or "unsupported_condition"
            if execution.started_at is None:
                execution.started_at = datetime.utcnow()
            execution.completed_at = datetime.utcnow()
            db.add(execution)
            db.flush()
            _emit_execution_activity(db, rule=rule, event=event, execution=execution)
            return {
                "rule_id": int(rule.id),
                "execution_id": int(execution.id),
                "status": EXEC_BLOCKED,
                "blocked_code": cond_result.blocked_code,
                "unsupported_condition_keys": cond_result.unsupported_keys,
                "effects_executed": 0,
            }
        if not cond_result.matched:
            execution.status = EXEC_SKIPPED
            execution.error = "conditions_not_matched"
            if execution.started_at is None:
                execution.started_at = datetime.utcnow()
            execution.completed_at = datetime.utcnow()
            db.add(execution)
            db.flush()
            # No Activity Log for not-matched rules.
            return {
                "rule_id": int(rule.id),
                "execution_id": int(execution.id),
                "status": EXEC_SKIPPED,
                "reason": "conditions_not_matched",
                "effects_executed": 0,
            }
    else:
        _persist_conditions_snapshot(execution, [])

    # Resume FAILED / PENDING / RUNNING — skip completed effects
    execution.status = EXEC_RUNNING
    if execution.started_at is None:
        execution.started_at = datetime.utcnow()
    execution.error = None
    db.add(execution)
    db.flush()

    effects = sorted(
        [e for e in (rule.effects or []) if bool(e.enabled)],
        key=lambda e: (int(e.position), int(e.id or 0)),
    )
    done_positions = {
        int(ee.position)
        for ee in (execution.effect_executions or [])
        if ee.status == EXEC_SUCCEEDED
    }

    for effect in effects:
        if int(effect.position) in done_positions:
            continue
        ok = _execute_one_effect(db, execution=execution, effect=effect, event=event)
        if not ok:
            execution.status = EXEC_FAILED
            execution.completed_at = datetime.utcnow()
            db.add(execution)
            db.flush()
            _emit_execution_activity(db, rule=rule, event=event, execution=execution)
            return {
                "rule_id": int(rule.id),
                "execution_id": int(execution.id),
                "status": EXEC_FAILED,
                "error": execution.error,
            }

    execution.status = EXEC_SUCCEEDED
    execution.completed_at = datetime.utcnow()
    execution.error = None
    db.add(execution)
    db.flush()
    _emit_execution_activity(db, rule=rule, event=event, execution=execution)
    return {
        "rule_id": int(rule.id),
        "execution_id": int(execution.id),
        "status": EXEC_SUCCEEDED,
        "duplicate": False,
    }


def _execute_one_effect(
    db: Session,
    *,
    execution: AutomationExecution,
    effect: AutomationEffect,
    event: StatusTransitionEvent,
) -> bool:
    ee = AutomationEffectExecution(
        execution_id=int(execution.id),
        effect_id=int(effect.id),
        position=int(effect.position),
        effect_type=str(effect.effect_type),
        status=EXEC_RUNNING,
        started_at=datetime.utcnow(),
    )
    db.add(ee)
    db.flush()

    adapter = get_adapter(effect.effect_type)
    config = parse_config(effect.config_json)
    try:
        result = adapter.execute(
            db,
            config=config,
            event=event,
            actor_user_id=event.actor_user_id,
            execution_id=int(execution.id),
            effect_id=int(effect.id) if effect.id is not None else None,
        )
    except Exception as exc:
        logger.exception(
            "effect crashed execution_id=%s effect_id=%s type=%s",
            execution.id,
            effect.id,
            effect.effect_type,
        )
        ee.status = EXEC_FAILED
        ee.completed_at = datetime.utcnow()
        ee.error = str(exc)
        execution.error = str(exc)
        db.add(ee)
        db.add(execution)
        db.flush()
        return False

    ee.completed_at = datetime.utcnow()
    ee.result_json = json.dumps(result.data or {}, ensure_ascii=False)
    if result.ok:
        ee.status = EXEC_SUCCEEDED
        ee.error = None
        db.add(ee)
        db.flush()
        return True

    ee.status = EXEC_FAILED
    ee.error = result.message
    execution.error = result.message
    db.add(ee)
    db.add(execution)
    db.flush()
    return False


def emit_entity_status_entered_and_run(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    tenant_id: int,
    warehouse_id: Optional[int],
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    actor_user_id: Optional[int] = None,
) -> Optional[StatusTransitionEvent]:
    """
    Create transition event when old != new and run matching automations.
    Soft-fail: never raises to caller.
    """
    if previous_status_id == new_status_id:
        return None
    new_key = "null" if new_status_id is None else str(int(new_status_id))
    old_key = str(int(previous_status_id)) if previous_status_id is not None else None

    try:
        from .events import create_status_transition_event, automation_depth_var

        event = create_status_transition_event(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
            entity_type=str(entity_type).strip().upper(),
            entity_id=int(entity_id),
            old_status_key=old_key,
            new_status_key=new_key,
            actor_user_id=actor_user_id,
        )
        # Order-facing timeline (Activity Log) — one event per transition identity.
        if str(entity_type).strip().upper() == "ORDER":
            try:
                from ..activity_log.order_activity import emit_order_status_changed_activity

                emit_order_status_changed_activity(
                    db,
                    tenant_id=int(tenant_id),
                    warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
                    order_id=int(entity_id),
                    old_status_key=old_key,
                    new_status_key=new_key,
                    status_transition_event_id=str(event.id),
                    actor_user_id=actor_user_id,
                    root_event_id=getattr(event, "root_event_id", None),
                    automation_depth=(
                        int(event.depth)
                        if getattr(event, "depth", None) is not None
                        else int(automation_depth_var.get() or 0)
                    ),
                    occurred_at=getattr(event, "occurred_at", None),
                )
            except Exception:
                logger.exception(
                    "order status activity emit failed order_id=%s event_id=%s",
                    entity_id,
                    event.id,
                )
        run_automations_for_status_entered(db, event=event)
        return event
    except Exception:
        logger.exception(
            "automation emit failed entity=%s/%s prev=%s new=%s",
            entity_type,
            entity_id,
            previous_status_id,
            new_status_id,
        )
        return None


def emit_order_status_entered_and_run(
    db: Session,
    *,
    order,
    previous_status_id: Optional[int],
    new_status_id: Optional[int],
    actor_user_id: Optional[int] = None,
) -> Optional[StatusTransitionEvent]:
    from .constants import ENTITY_ORDER

    return emit_entity_status_entered_and_run(
        db,
        entity_type=ENTITY_ORDER,
        entity_id=int(order.id),
        tenant_id=int(order.tenant_id),
        warehouse_id=int(order.warehouse_id) if getattr(order, "warehouse_id", None) else None,
        previous_status_id=previous_status_id,
        new_status_id=new_status_id,
        actor_user_id=actor_user_id,
    )
