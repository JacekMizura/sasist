"""STATUS_ACTION helpers — projection + disable on status delete."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from ...models.automation import AutomationExecution, AutomationRule
from .constants import SOURCE_STATUS_ACTION, TRIGGER_ENTITY_STATUS_ENTERED
from .effects import parse_config
from .store import rule_to_dict


def list_status_action_rules(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> list[AutomationRule]:
    et = str(entity_type).strip().upper()
    sid = str(int(status_id))
    q = (
        db.query(AutomationRule)
        .options(joinedload(AutomationRule.effects))
        .filter(
            AutomationRule.tenant_id == int(tenant_id),
            AutomationRule.entity_type == et,
            AutomationRule.source == SOURCE_STATUS_ACTION,
            AutomationRule.trigger_type == TRIGGER_ENTITY_STATUS_ENTERED,
        )
    )
    if warehouse_id is not None:
        q = q.filter(
            (AutomationRule.warehouse_id.is_(None)) | (AutomationRule.warehouse_id == int(warehouse_id))
        )
    out: list[AutomationRule] = []
    for rule in q.order_by(AutomationRule.id.asc()).all():
        cfg = parse_config(rule.trigger_config_json)
        ids = cfg.get("status_ids")
        if ids is None and cfg.get("status_id") is not None:
            ids = [cfg.get("status_id")]
        if not ids:
            continue
        try:
            wanted = {str(int(x)) for x in ids if x is not None}
        except (TypeError, ValueError):
            wanted = {str(x) for x in ids}
        if sid in wanted:
            out.append(rule)
    return out


def latest_execution_for_rule(db: Session, rule_id: int) -> Optional[AutomationExecution]:
    return (
        db.query(AutomationExecution)
        .filter(AutomationExecution.rule_id == int(rule_id))
        .order_by(AutomationExecution.id.desc())
        .first()
    )


def status_action_projection(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> list[dict[str, Any]]:
    rows = list_status_action_rules(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        status_id=status_id,
        warehouse_id=warehouse_id,
    )
    result: list[dict[str, Any]] = []
    for rule in rows:
        d = rule_to_dict(rule)
        last = latest_execution_for_rule(db, int(rule.id))
        d["last_execution_status"] = last.status if last else None
        d["last_run_at"] = last.completed_at.isoformat() if last and last.completed_at else (
            last.started_at.isoformat() if last and last.started_at else None
        )
        result.append(d)
    return result


def disable_status_action_rules_for_status(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    status_id: int,
    warehouse_id: Optional[int] = None,
) -> int:
    """Disable STATUS_ACTION rules triggered by this status. Keeps audit/history."""
    rows = list_status_action_rules(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        status_id=status_id,
        warehouse_id=warehouse_id,
    )
    n = 0
    now = datetime.utcnow()
    for rule in rows:
        if rule.enabled:
            rule.enabled = False
            rule.updated_at = now
            db.add(rule)
            n += 1
    db.flush()
    return n
