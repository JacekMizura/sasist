"""Manual / test execution for Automation Engine."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.automation import AutomationEffectExecution, AutomationExecution, AutomationRule
from .conditions import evaluate_conditions
from .constants import (
    EXEC_BLOCKED,
    EXEC_FAILED,
    EXEC_RUNNING,
    EXEC_SKIPPED,
    EXEC_SUCCEEDED,
    RUN_KIND_MANUAL,
    RUN_KIND_TEST,
)
from .effects import get_adapter, parse_config
from .events import create_status_transition_event
from .preflight import validate_automation_runtime
from .store import _loads, _loads_list, rule_to_dict, update_rule

logger = logging.getLogger(__name__)


def _bump_stats(db: Session, rule: AutomationRule) -> None:
    meta = _loads(getattr(rule, "metadata_json", None) or "{}")
    stats = meta.get("stats") if isinstance(meta.get("stats"), dict) else {}
    stats = {
        "lastRunAt": datetime.utcnow().isoformat() + "Z",
        "runCount": int(stats.get("runCount") or 0) + 1,
    }
    update_rule(db, rule, metadata={"stats": stats}, merge_metadata=True)


def _is_automatic_enabled(rule: AutomationRule) -> bool:
    meta = _loads(getattr(rule, "metadata_json", None) or "{}")
    execution = meta.get("execution") if isinstance(meta.get("execution"), dict) else {}
    if "automatic" in execution:
        return bool(execution.get("automatic"))
    return True


def rule_allows_status_enter_auto(rule: AutomationRule) -> bool:
    """STATUS_ACTION always auto; USER rules honor metadata.execution.automatic."""
    if str(rule.source or "").upper() == "STATUS_ACTION":
        return True
    return _is_automatic_enabled(rule)


def run_rule_on_entity(
    db: Session,
    *,
    rule: AutomationRule,
    entity_type: str,
    entity_id: int,
    actor_user_id: Optional[int] = None,
    run_kind: str = RUN_KIND_MANUAL,
    dry_run: bool = False,
    check_conditions: bool = True,
    ignore_unevaluable_conditions: bool = False,
) -> dict[str, Any]:
    """
    Execute (or dry-run) a rule against an entity using the same effect adapters.

    Preflight runs first: unsupported condition/effect → BLOCKED, 0 effects.
    """
    del ignore_unevaluable_conditions  # never skip unsupported
    et = str(entity_type).upper()
    eid = int(entity_id)

    pf = validate_automation_runtime(rule, entity_type=et)
    if not pf.ok:
        return {
            "rule_id": int(rule.id),
            "status": EXEC_BLOCKED,
            "run_kind": run_kind,
            "dry_run": dry_run,
            "blocked_code": pf.blocked_code or "unsupported_condition",
            "validation_issues": [i.to_dict() for i in pf.issues],
            "effects_executed": 0,
            "rule": rule_to_dict(rule),
        }

    conditions = _loads_list(getattr(rule, "conditions_json", None) or "[]")
    cond_result = None
    if check_conditions and conditions:
        cond_result = evaluate_conditions(
            db,
            conditions=conditions,
            entity_type=et,
            entity_id=eid,
            tenant_id=int(rule.tenant_id),
        )
        if cond_result.blocked:
            return {
                "rule_id": int(rule.id),
                "status": EXEC_BLOCKED,
                "run_kind": run_kind,
                "dry_run": dry_run,
                "blocked_code": cond_result.blocked_code or "unsupported_condition",
                "unsupported_condition_keys": cond_result.unsupported_keys,
                "conditions": cond_result.details,
                "effects_executed": 0,
            }
        if not cond_result.matched:
            return {
                "rule_id": int(rule.id),
                "status": EXEC_SKIPPED,
                "run_kind": run_kind,
                "dry_run": dry_run,
                "reason": "conditions_not_matched",
                "conditions": cond_result.details,
                "effects_executed": 0,
            }

    effects = sorted(
        [e for e in (rule.effects or []) if bool(e.enabled)],
        key=lambda e: (int(e.position), int(e.id or 0)),
    )
    planned = [
        {"position": int(e.position), "effect_type": e.effect_type, "config": parse_config(e.config_json)}
        for e in effects
    ]

    if dry_run:
        return {
            "rule_id": int(rule.id),
            "status": "DRY_RUN",
            "run_kind": run_kind,
            "dry_run": True,
            "conditions": cond_result.details if cond_result else [],
            "planned_effects": planned,
            "rule": rule_to_dict(rule),
        }

    # Synthetic transition event for audit chain (nullable FK allowed for TEST without entity change).
    event = create_status_transition_event(
        db,
        tenant_id=int(rule.tenant_id),
        warehouse_id=int(rule.warehouse_id) if rule.warehouse_id is not None else None,
        entity_type=et,
        entity_id=eid,
        old_status_key=None,
        new_status_key=f"__{run_kind.lower()}__",
        actor_user_id=actor_user_id,
    )

    key = f"{int(rule.id)}:{et}:{eid}:{run_kind}:{event.id}"
    execution = AutomationExecution(
        rule_id=int(rule.id),
        entity_type=et,
        entity_id=eid,
        trigger_event_id=str(event.id),
        run_kind=str(run_kind),
        idempotency_key=key,
        status=EXEC_RUNNING,
        started_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(execution)
    db.flush()

    # Build a minimal event-like object for adapters
    class _Evt:
        pass

    evt = _Evt()
    evt.entity_type = et
    evt.entity_id = eid
    evt.tenant_id = int(rule.tenant_id)
    evt.warehouse_id = rule.warehouse_id
    evt.id = event.id
    evt.new_status_key = event.new_status_key
    evt.old_status_key = event.old_status_key

    for effect in effects:
        ee = AutomationEffectExecution(
            execution_id=int(execution.id),
            effect_id=int(effect.id) if effect.id is not None else None,
            position=int(effect.position),
            effect_type=str(effect.effect_type),
            status=EXEC_RUNNING,
            started_at=datetime.utcnow(),
        )
        db.add(ee)
        db.flush()
        adapter = get_adapter(str(effect.effect_type))
        result = adapter.execute(
            db,
            config=parse_config(effect.config_json),
            event=evt,  # type: ignore[arg-type]
            actor_user_id=actor_user_id,
            execution_id=int(execution.id),
            effect_id=int(effect.id) if effect.id is not None else None,
        )
        ee.completed_at = datetime.utcnow()
        if result.ok:
            ee.status = EXEC_SUCCEEDED
            ee.result_json = __import__("json").dumps(result.data or {}, ensure_ascii=False)
            db.add(ee)
        else:
            ee.status = EXEC_FAILED
            ee.error = result.message
            execution.status = EXEC_FAILED
            execution.error = result.message
            execution.completed_at = datetime.utcnow()
            db.add(ee)
            db.add(execution)
            db.flush()
            _bump_stats(db, rule)
            return {
                "rule_id": int(rule.id),
                "execution_id": int(execution.id),
                "status": EXEC_FAILED,
                "run_kind": run_kind,
                "error": result.message,
                "conditions": cond_result.details if cond_result else [],
            }

    execution.status = EXEC_SUCCEEDED
    execution.completed_at = datetime.utcnow()
    db.add(execution)
    db.flush()
    _bump_stats(db, rule)
    return {
        "rule_id": int(rule.id),
        "execution_id": int(execution.id),
        "status": EXEC_SUCCEEDED,
        "run_kind": run_kind,
        "conditions": cond_result.details if cond_result else [],
        "planned_effects": planned,
    }


def import_legacy_fe_rules(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    rules: list[dict[str, Any]],
    entity_type: str = "ORDER",
) -> dict[str, Any]:
    """Idempotent import of FE OrderAutomationRule payloads. Keyed by metadata.legacy_fe_id."""
    from .store import create_rule, find_rule_by_legacy_fe_id

    created = 0
    skipped = 0
    errors: list[str] = []
    ids: list[int] = []

    for raw in rules:
        if not isinstance(raw, dict):
            continue
        legacy_id = str(raw.get("id") or "").strip()
        if not legacy_id:
            errors.append("rule missing id")
            continue
        existing = find_rule_by_legacy_fe_id(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, legacy_fe_id=legacy_id
        )
        if existing is not None:
            skipped += 1
            ids.append(int(existing.id))
            continue
        try:
            effects_in = []
            for i, eff in enumerate(raw.get("effects") or []):
                if not isinstance(eff, dict):
                    continue
                kind = str(eff.get("kind") or eff.get("effect_type") or "").strip()
                payload = eff.get("payload") if isinstance(eff.get("payload"), dict) else {}
                config = dict(payload)
                if kind == "change_status":
                    sid = config.get("status_id") or config.get("order_ui_status_id")
                    if sid is not None:
                        config["status_id"] = int(sid)
                        config["order_ui_status_id"] = int(sid)
                effects_in.append(
                    {
                        "position": i,
                        "effect_type": kind,
                        "config": config,
                        "enabled": True,
                    }
                )
            # Derive status_ids trigger from order_status conditions when present
            status_ids: list[int] = []
            for cond in raw.get("conditions") or []:
                if not isinstance(cond, dict):
                    continue
                if str(cond.get("fieldKey") or "") == "order_status" and str(cond.get("operator") or "") in (
                    "in",
                    "eq",
                ):
                    for v in cond.get("value") or []:
                        try:
                            status_ids.append(int(v))
                        except (TypeError, ValueError):
                            pass
            trigger_config: dict[str, Any] = {}
            if status_ids:
                trigger_config["status_ids"] = sorted(set(status_ids))

            meta = {
                "legacy_fe_id": legacy_id,
                "publicId": raw.get("publicId"),
                "manualTrigger": raw.get("manualTrigger") or {},
                "execution": raw.get("execution") or {},
                "delayMinutes": raw.get("delayMinutes") or 0,
                "stats": raw.get("stats") or {"lastRunAt": None, "runCount": 0},
            }
            row = create_rule(
                db,
                tenant_id=tenant_id,
                warehouse_id=warehouse_id,
                entity_type=entity_type,
                name=str(raw.get("name") or "Bez nazwy"),
                enabled=bool(raw.get("enabled", True)),
                trigger_type="entity_status_entered",
                trigger_config=trigger_config,
                source="USER_AUTOMATION",
                effects=effects_in,
                group=str(raw.get("group") or "Ogólne"),
                conditions=list(raw.get("conditions") or []),
                metadata=meta,
            )
            created += 1
            ids.append(int(row.id))
        except Exception as exc:
            errors.append(f"{legacy_id}: {exc}")

    return {"created": created, "skipped": skipped, "errors": errors, "rule_ids": ids}
